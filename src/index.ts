import type { Context } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Config, type Config as WenmaiConfig } from './config.js'
import { parseFrontmatter } from './frontmatter.js'
import { writeGraphHtml } from './graph.js'
import { RAW_KINDS, type RawKind } from './layout.js'
import { lintVault } from './lint.js'
import { buildOrient } from './orient.js'
import { expandHome, isUnderRoot, PathEscapeError, resolveRoot } from './paths.js'
import { searchVault } from './search.js'
import {
  addAgentSourceRoot,
  mergeSourceRoots,
  readAgentSourceRoots,
  removeAgentSourceRoot,
  sessionWorkspaceCwd,
  writeAgentSourceRoots,
  type SourceRootRef,
} from './source-roots.js'
import { ingestText, initVault, readPage, status, writePage } from './store.js'
import { OBJECT_OUTPUT, parametersSchema } from './tool-def.js'
import { findWritten } from './written.js'

export { Config }
export type { WenmaiConfig as ConfigType }

export const name = 'wenmai'
export const inject = ['tools', 'commands', 'systemPrompt']

type ToolArgs = Record<string, string | number | boolean | undefined>

function registerTool(
  ctx: Context,
  def: {
    name: string
    description: string
    parameters: Parameters<typeof parametersSchema>[0]
    execute: (args: ToolArgs, exec: { signal: AbortSignal; agent?: AgentLike }) => Promise<unknown>
  },
): void {
  ctx.tools.register({
    name: def.name,
    description: def.description,
    parameters: parametersSchema(def.parameters),
    output: OBJECT_OUTPUT,
    execute: def.execute,
  })
}

function fail(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal) return
  if (typeof (signal as AbortSignal & { throwIfAborted?: () => void }).throwIfAborted === 'function') {
    ;(signal as AbortSignal & { throwIfAborted: () => void }).throwIfAborted()
    return
  }
  if (signal.aborted) throw new Error('aborted')
}

type AgentLike = { session?: { header?: { cwd?: string }; cwd?: string } }

async function effectiveRoots(vaultRoot: string, pluginRoots: string[], agent?: AgentLike): Promise<SourceRootRef[]> {
  const extras = await readAgentSourceRoots(vaultRoot)
  return mergeSourceRoots({
    workspace: sessionWorkspaceCwd(agent),
    plugin: pluginRoots,
    agent: extras,
  })
}

function rootPaths(refs: SourceRootRef[]): string[] {
  return refs.map((item) => item.path)
}

export function apply(ctx: Context, rawConfig: WenmaiConfig = { root: '~/wenmai', sourceRoots: [], orientBudgetChars: 8000 }): void {
  const parsed = Config['~standard'].validate(rawConfig ?? {})
  if ('issues' in parsed) {
    throw new Error(parsed.issues.map((issue) => issue.message).join('; '))
  }
  const config = parsed.value
  const root = resolveRoot(config.root)
  const pluginRoots = config.sourceRoots ?? []
  let orientText = '文脉插件已加载，正在读取开局定向…'

  const refreshOrient = async (): Promise<void> => {
    try {
      orientText = await buildOrient(root, config.orientBudgetChars)
    } catch (error) {
      orientText = `文脉定向读取失败：${error instanceof Error ? error.message : String(error)}`
    }
  }

  ctx.effect(() => {
    void refreshOrient()
    console.log(`[wenmai] plugin loaded, root: ${root}`)
    return () => {}
  })

  ctx.systemPrompt.section({
    name: 'tool:wenmai',
    order: 116,
    text: [
      '文脉 Wenmai 是文字工作者的编译型知识库：raw/ 保存原文（文章、脚本、文案、文档等），entities/concepts 是编译后的页面。',
      '- 先 wenmai_status / 阅读开局定向，再 ingest、query 或 lint。',
      '- 查「我写过没有」用 wenmai_written，不要凭记忆回答。',
      '- 看页面关联用 wenmai_graph，会扫描文脉编译页和当前工作区文章，写出可在浏览器打开的 graph.html。',
      '- 原文扫描默认用当前会话工作区；额外目录用 wenmai_config 添加，或写在插件 sourceRoots。',
      '- wenmai_ingest 只落 raw/；用 wenmai_write 写编译页，并交叉链接、更新 index 与 log。',
      '- 禁止修改 raw/。lint 只报告，不自动修复。',
    ].join('\n'),
  })

  ctx.systemPrompt.context({
    name: 'tool:wenmai-orient',
    order: 117,
    text: () => orientText,
  })

  registerTool(ctx, {
      name: 'wenmai_status',
      description: 'Report whether 文脉 is initialized, page/raw counts, and sourceRoots readability.',
      parameters: {},
      async execute(_args, exec) {
        throwIfAborted(exec.signal)
        try {
          return await status(root, await effectiveRoots(root, pluginRoots, exec.agent))
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_init',
      description: 'Create the 文脉 directory tree, SCHEMA.md, index.md, and log.md for a domain.',
      parameters: {
        domain: { type: 'string', required: true, description: 'What this 文脉 covers, e.g. articles, video scripts, copy, and work docs' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const result = await initVault(root, String(args.domain ?? ''))
          await refreshOrient()
          return result
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_ingest',
      description: 'Copy one source into raw/ (immutable). Provide filePath and/or pasted content. Compilation is a later wenmai_write step.',
      parameters: {
        filePath: { type: 'string', description: 'Absolute or relative path to a local markdown/text file' },
        content: { type: 'string', description: 'Pasted source text when not ingesting a file' },
        title: { type: 'string', description: 'Source title; defaults to filename or first heading' },
        kind: {
          type: 'string',
          description: 'raw/ subdirectory: articles | scripts | docs | papers | workspace | transcripts | assets',
        },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const roots = await effectiveRoots(root, pluginRoots, exec.agent)
          const ingested = await ingestFromArgs(root, rootPaths(roots), sessionWorkspaceCwd(exec.agent), {
            filePath: typeof args.filePath === 'string' ? args.filePath : undefined,
            content: typeof args.content === 'string' ? args.content : undefined,
            title: typeof args.title === 'string' ? args.title : undefined,
            kind: typeof args.kind === 'string' ? args.kind : undefined,
          })
          await refreshOrient()
          return ingested
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_written',
      description: 'Check whether a topic was already written: search compiled 文脉 pages and configured sourceRoots filenames/titles.',
      parameters: {
        query: { type: 'string', required: true, description: 'Topic, product, or title fragment' },
        limit: { type: 'number', description: 'Max hits, default 20' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const roots = await effectiveRoots(root, pluginRoots, exec.agent)
          const hits = await findWritten(root, rootPaths(roots), String(args.query ?? ''), clampLimit(typeof args.limit === 'number' ? args.limit : undefined))
          return { ok: true, query: String(args.query ?? ''), count: hits.length, hits }
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_search',
      description: 'Lexical search over 文脉 markdown (compiled pages and raw sources).',
      parameters: {
        query: { type: 'string', required: true, description: 'Search query' },
        limit: { type: 'number', description: 'Max hits, default 20' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const hits = await searchVault(root, String(args.query ?? ''), clampLimit(typeof args.limit === 'number' ? args.limit : undefined))
          return { ok: true, query: String(args.query ?? ''), count: hits.length, hits }
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_read',
      description: 'Read a file under the 文脉 root by relative path, e.g. concepts/deepseek-harness.md.',
      parameters: {
        path: { type: 'string', required: true, description: 'Relative path under 文脉 root' },
        offset: { type: 'number', description: 'Start line (0-based)' },
        limit: { type: 'number', description: 'Max lines to return' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          return await readPage(root, String(args.path ?? ''), typeof args.offset === 'number' ? args.offset : undefined, typeof args.limit === 'number' ? args.limit : undefined)
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_write',
      description: 'Write a compiled page under 文脉 root. Refuses raw/. Optional log entry and index update.',
      parameters: {
        path: { type: 'string', required: true, description: 'Relative path such as concepts/foo.md' },
        content: { type: 'string', required: true, description: 'Full markdown including YAML frontmatter' },
        log: { type: 'string', description: 'Optional log.md entry, e.g. "write | foo"' },
        updateIndex: { type: 'boolean', description: 'If true, add [[slug]] to index.md' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const result = await writePage(root, String(args.path ?? ''), String(args.content ?? ''), {
            log: typeof args.log === 'string' ? args.log : undefined,
            updateIndex: args.updateIndex === true,
          })
          await refreshOrient()
          return result
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_lint',
      description: 'Read-only health check: orphans, broken wikilinks, missing frontmatter, raw sha256 drift.',
      parameters: {},
      async execute(_args, exec) {
        throwIfAborted(exec.signal)
        try {
          return await lintVault(root)
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_config',
      description:
        'Show or update extra sourceRoots. The current session workspace is always included by default. Use add/remove/set for additional directories (persisted in the 文脉 vault).',
      parameters: {
        add: { type: 'string', description: 'Add one extra source directory (absolute or ~/path)' },
        remove: { type: 'string', description: 'Remove one extra source directory previously added by this tool' },
        set: { type: 'string', description: 'Replace extra source directories; comma-separated paths. Empty string clears extras.' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          if (typeof args.set === 'string') {
            const items = args.set
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
            await writeAgentSourceRoots(root, items)
          } else if (typeof args.add === 'string' && args.add.trim()) {
            await addAgentSourceRoot(root, args.add)
          } else if (typeof args.remove === 'string' && args.remove.trim()) {
            await removeAgentSourceRoot(root, args.remove)
          }
          return await status(root, await effectiveRoots(root, pluginRoots, exec.agent))
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_graph',
      description:
        'Build an Obsidian-style knowledge graph from compiled pages plus markdown in the current workspace / sourceRoots. Writes graph.html under the 文脉 root.',
      parameters: {
        focus: { type: 'string', description: 'Optional page slug or title for a local graph' },
        depth: { type: 'number', description: 'Local graph hop depth, default 2' },
        includeTags: { type: 'boolean', description: 'Include tag nodes, default true' },
        includeSources: { type: 'boolean', description: 'Include raw source nodes, default true' },
        includeMissing: { type: 'boolean', description: 'Include unresolved [[wikilinks]], default true' },
        includeArticles: { type: 'boolean', description: 'Include markdown files from the session workspace and extra sourceRoots, default true' },
        open: { type: 'boolean', description: 'Open graph.html in the default browser (macOS open)' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const includeTags = args.includeTags
          const includeSources = args.includeSources
          const includeMissing = args.includeMissing
          const includeArticles = args.includeArticles
          const result = await writeGraphHtml(root, {
            focus: typeof args.focus === 'string' ? args.focus : undefined,
            depth: typeof args.depth === 'number' ? args.depth : undefined,
            includeTags: typeof includeTags === 'boolean' ? includeTags : undefined,
            includeSources: typeof includeSources === 'boolean' ? includeSources : undefined,
            includeMissing: typeof includeMissing === 'boolean' ? includeMissing : undefined,
            includeArticles: typeof includeArticles === 'boolean' ? includeArticles : undefined,
            sourceRoots: rootPaths(await effectiveRoots(root, pluginRoots, exec.agent)),
          })
          if (args.open === true) openLocalFile(result.htmlPath)
          return result
        } catch (error) {
          return fail(error)
        }
      },
  })

  ctx.commands.register({
    name: 'wenmai',
    description: '文脉: status | lint | orient | graph',
    input: { hint: 'status|lint|orient|graph' },
    handler: async ({ rawInput, signal, agent }) => {
      throwIfAborted(signal)
      const sub = rawInput.trim() || 'status'
      console.log(`[wenmai] /wenmai ${sub}`)
      try {
        if (sub === 'status') {
          const report = await status(root, await effectiveRoots(root, pluginRoots, agent))
          return { kind: 'success', text: formatStatus(report) }
        }
        if (sub === 'lint') {
          const report = await lintVault(root)
          return { kind: 'success', text: formatLint(report) }
        }
        if (sub === 'orient') {
          await refreshOrient()
          return { kind: 'success', text: orientText }
        }
        if (sub === 'graph' || sub.startsWith('graph ')) {
          const focus = sub.slice('graph'.length).trim() || undefined
          const result = await writeGraphHtml(root, {
            focus,
            sourceRoots: rootPaths(await effectiveRoots(root, pluginRoots, agent)),
          })
          openLocalFile(result.htmlPath)
          return { kind: 'success', text: formatGraph(result) }
        }
        return { kind: 'error', text: 'Usage: /wenmai [status|lint|orient|graph]' }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) return 20
  return Math.min(100, Math.max(1, Math.floor(limit)))
}

async function ingestFromArgs(
  root: string,
  sourceRoots: string[],
  workspaceCwd: string | undefined,
  args: { filePath?: string; content?: string; title?: string; kind?: string },
) {
  let body = args.content?.trim() ?? ''
  let sourcePath: string | undefined
  if (args.filePath?.trim()) {
    const rawPath = args.filePath.trim()
    const expanded = expandHome(rawPath)
    const abs = path.isAbsolute(expanded)
      ? path.resolve(expanded)
      : path.resolve(workspaceCwd ?? process.cwd(), expanded)
    if (sourceRoots.length > 0 && !sourceRoots.some((item) => isUnderRoot(item, abs))) {
      throw new PathEscapeError('filePath must be inside the session workspace or a configured sourceRoots directory')
    }
    body = await readFile(abs, 'utf8')
    sourcePath = abs
  }
  if (!body) throw new Error('provide filePath or content')
  const parsed = parseFrontmatter(body)
  const heading = parsed.body.match(/^#\s+(.+)$/m)?.[1]
  const title =
    args.title?.trim() ||
    (typeof parsed.frontmatter.title === 'string' ? parsed.frontmatter.title : '') ||
    heading ||
    (sourcePath ? path.basename(sourcePath, path.extname(sourcePath)) : 'untitled')
  const kind = normalizeKind(args.kind) ?? (sourcePath ? 'workspace' : 'articles')
  return ingestText(root, { title, body, kind, sourcePath })
}

function normalizeKind(kind: string | undefined): RawKind | undefined {
  if (!kind) return undefined
  if ((RAW_KINDS as readonly string[]).includes(kind)) return kind as RawKind
  throw new Error(`kind must be ${RAW_KINDS.join(' | ')}`)
}

function formatStatus(report: Awaited<ReturnType<typeof status>>): string {
  const roots =
    report.sourceRoots
      .map((item) => `${item.readable ? 'ok' : 'missing'} [${item.origin}] ${item.path}`)
      .join('\n') || '(none — pick a workspace, or add extras with wenmai_config)'
  return [
    '文脉 status',
    `Root: ${report.root}`,
    `Initialized: ${report.initialized ? 'yes' : 'no'}`,
    `Pages: ${report.pageCount}`,
    `Raw sources: ${report.rawCount}`,
    `Index updated: ${report.indexUpdated ?? 'n/a'}`,
    'sourceRoots:',
    roots,
  ].join('\n')
}

function formatLint(report: Awaited<ReturnType<typeof lintVault>>): string {
  const lines = [
    `文脉 lint: ${report.errorCount} errors, ${report.warningCount} warnings, ${report.filesExamined} files.`,
    ...report.diagnostics.slice(0, 20).map((item) => `- ${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}`),
  ]
  if (report.diagnostics.length > 20) lines.push(`... ${report.diagnostics.length - 20} more omitted`)
  return lines.join('\n')
}

function formatGraph(report: Awaited<ReturnType<typeof writeGraphHtml>>): string {
  const hubs = report.hubs.map((item) => `- ${item.label} (${item.degree})`).join('\n') || '(none)'
  return [
    '文脉 graph',
    `File: ${report.htmlPath}`,
    `Compiled pages: ${report.pageCount}, workspace articles: ${report.articleCount}`,
    `Nodes: ${report.nodeCount}, edges: ${report.edgeCount}${report.truncated ? ' (article scan capped at 600)' : ''}`,
    'Hubs:',
    hubs,
    'Open the HTML file in a browser for the interactive map.',
  ].join('\n')
}

function openLocalFile(file: string): void {
  if (process.platform !== 'darwin') return
  spawn('open', [file], { detached: true, stdio: 'ignore' }).unref()
}
