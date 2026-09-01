import type { Context } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Config, type Config as WenmaiConfig } from './config.js'
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
import { ingestDirectory } from './ingest-dir.js'
import { ingestText, initVault, readPage, status, titleFromMarkdown, writePage } from './store.js'
import { OBJECT_OUTPUT, parametersSchema } from './tool-def.js'
import { reviewVault } from './review/index.js'
import { refactorVault } from './refactor/index.js'
import { checkWritten } from './written.js'

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
      '文脉 Wenmai 是文字工作者的编译型知识库：raw/ 保存原文，entities/concepts 是编译页。',
      '用户用自然语言说目标即可，不必说出工具名。由你根据意图选工具，不要反过来让用户记 wenmai_*。',
      '意图对照（即使用户没点名也要调用）：',
      '- 写过没有 / 会不会撞稿 / 这个选题做过吗 → wenmai_written（禁止凭记忆或闲聊印象回答）',
      '- 库在不在 / 有多少页 / 文脉状态 → wenmai_status',
      '- 初始化 / 建库 / 第一次用 → wenmai_init',
      '- 收录这篇 / 存进文脉 / 吃掉这份稿 / 扫这个目录 → wenmai_ingest（目录默认 dry-run，用户确认后再写入；只落 raw/，不要整批自动编译）',
      '- 文脉里搜 / 查某个概念 / 读那一页 → wenmai_search 再 wenmai_read',
      '- 写成概念页 / 更新编译页 / 记进目录 → wenmai_write（禁止写 raw/；补 frontmatter、wikilinks、index、log）',
      '- 体检 / 断链 / 缺字段 → wenmai_lint（只报告不自动修）',
      '- 重复、过期、冲突、知识库乱不乱 → wenmai_review（只报告；ack/snooze 写入 review-state.json）',
      '- 合并这两页 / 改名 / 搬家 / 归档 / 拆开 / 补一条链接 / 按这份正文重写编译页 → wenmai_refactor（默认 dry-run，用户确认后再写入；禁止改 raw/）',
      '- 关联图 / 知识图谱 → wenmai_graph（不要每轮都跑）',
      '- 再扫一个文件夹（工作区之外）→ wenmai_config（须用户确认路径；禁止扫家目录）',
      '硬规则：不修改 raw/；不编造 sources；不负责抓网页或解析 PDF。written 为 NEW/REVIEW/DUPLICATE 三态，换词重写可能漏检。',
    ].join('\n'),
  })

  ctx.systemPrompt.context({
    name: 'tool:wenmai-orient',
    order: 117,
    text: () => orientText,
  })

  registerTool(ctx, {
      name: 'wenmai_status',
      description: '文脉是否已初始化、页数、原文数。用户说「文脉状态 / 库在不在 / 有多少页」时调用，不必等他们说出本工具名。',
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
      description: '按领域创建文脉目录与 SCHEMA / index / log。用户说「初始化 / 建库 / 第一次用文脉」时调用。',
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
      description:
        '把成稿复制进 raw/（之后不可改）。用户说「收录 / 存进文脉 / 吃掉这篇 / 扫这个目录」时调用。单篇给 filePath 或 content；目录给 dir，默认 dry-run，确认后再写入。不要整批自动编译。',
      parameters: {
        filePath: { type: 'string', description: 'Absolute or relative path to a local markdown/text file' },
        content: { type: 'string', description: 'Pasted source text when not ingesting a file' },
        dir: {
          type: 'string',
          description: 'Directory to ingest (workspace or sourceRoots only). Defaults to dry-run; set dryRun false after the user confirms the file list.',
        },
        dryRun: {
          type: 'boolean',
          description: 'Directory ingest only. Default true: list files, write nothing. false: copy into raw/.',
        },
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
          const paths = rootPaths(roots)
          const workspaceCwd = sessionWorkspaceCwd(exec.agent)
          const dir = typeof args.dir === 'string' ? args.dir.trim() : ''
          const hasFile = Boolean(typeof args.filePath === 'string' && args.filePath.trim())
          const hasContent = Boolean(typeof args.content === 'string' && args.content.trim())
          if (dir && (hasFile || hasContent)) {
            throw new Error('dir cannot be combined with filePath or content')
          }
          if (dir) {
            const ingested = await ingestDirectory(root, dir, {
              allowedRoots: paths,
              kind: normalizeKind(typeof args.kind === 'string' ? args.kind : undefined),
              dryRun: args.dryRun !== false,
              workspaceCwd,
            })
            if (!ingested.dryRun) await refreshOrient()
            return ingested
          }
          const ingested = await ingestFromArgs(root, paths, workspaceCwd, {
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
      description:
        '选题防撞：这篇是不是已经写过。用户说「写过没有 / 会不会撞稿 / 这个选题做过吗」时必须调用，禁止凭记忆回答。返回 NEW / REVIEW / DUPLICATE。词法查重，换词重写可能漏。',
      parameters: {
        query: { type: 'string', required: true, description: 'Topic, product, or title fragment' },
        limit: { type: 'number', description: 'Max hits, default 20' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const roots = await effectiveRoots(root, pluginRoots, exec.agent)
          return await checkWritten(
            root,
            rootPaths(roots),
            String(args.query ?? ''),
            clampLimit(typeof args.limit === 'number' ? args.limit : undefined),
          )
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_search',
      description: '在文脉编译页和 raw/ 里做词法搜索。用户说「文脉里搜 / 查一下某某概念」时调用。',
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
      description: '按相对路径读文脉里的文件。搜到路径后，用户要看正文时调用。',
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
      description: '写或更新编译页（概念/实体）。用户说「写成概念页 / 更新这一页 / 记进目录」时调用。禁止写入 raw/。',
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
      description: '只读体检：断链、缺 frontmatter、raw 哈希漂移。用户说「体检 / 断链 / 页面乱不乱」时调用。不自动修复。',
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
      name: 'wenmai_review',
      description:
        '只读审视：原文变更是否传到编译页、重复、冲突候选、结构问题。用户说「有没有重复 / 过期 / 冲突 / 知识库健康吗」时调用。不改页面。',
      parameters: {
        includeDismissed: { type: 'boolean', description: 'Include ack/snooze/wontfix findings, default false' },
        ttlDays: { type: 'number', description: 'updated TTL in days, default 180' },
        duplicateThreshold: { type: 'number', description: 'Jaccard threshold for duplicates, default 0.5' },
        ack: { type: 'string', description: 'Comma-separated finding ids to acknowledge' },
        snooze: { type: 'string', description: 'Comma-separated finding ids to snooze' },
        snoozeDays: { type: 'number', description: 'Snooze duration in days, default 30' },
        wontfix: { type: 'string', description: 'Comma-separated finding ids to ignore' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          return await reviewVault(root, {
            includeDismissed: args.includeDismissed === true,
            ttlDays: typeof args.ttlDays === 'number' ? args.ttlDays : undefined,
            duplicateThreshold: typeof args.duplicateThreshold === 'number' ? args.duplicateThreshold : undefined,
            ack: typeof args.ack === 'string' ? [args.ack] : undefined,
            snooze: typeof args.snooze === 'string' ? [args.snooze] : undefined,
            snoozeDays: typeof args.snoozeDays === 'number' ? args.snoozeDays : undefined,
            wontfix: typeof args.wontfix === 'string' ? [args.wontfix] : undefined,
          })
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_refactor',
      description:
        '重构编译页：合并、拆分、改名、搬家、补链接、重写、归档。用户说「合并这两页 / 改名 / 归档 / 拆开」时调用。默认 dry-run，确认后再写入。禁止改 raw/。不生成正文。',
      parameters: {
        op: {
          type: 'string',
          description: 'rename | move | link | archive | merge | split | rewrite',
        },
        dryRun: { type: 'boolean', description: 'Default true: preview only. false: write compiled pages after the user confirms.' },
        source: { type: 'string', description: 'Source compiled page path or slug' },
        target: { type: 'string', description: 'Target path, slug, or folder (entities/concepts/...) depending on op' },
        title: { type: 'string', description: 'New title for rename/split' },
        content: { type: 'string', description: 'Agent-provided markdown for rewrite, merge result, or split remaining page' },
        contentB: { type: 'string', description: 'Split only: markdown for the new page' },
        finding: { type: 'string', description: 'Optional review finding id to ack after a successful apply' },
        undo: { type: 'boolean', description: 'Restore the last refactor apply. Do not combine with op.' },
      },
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const result = await refactorVault(root, {
            op: typeof args.op === 'string' ? args.op : undefined,
            dryRun: args.dryRun !== false,
            source: typeof args.source === 'string' ? args.source : undefined,
            target: typeof args.target === 'string' ? args.target : undefined,
            title: typeof args.title === 'string' ? args.title : undefined,
            content: typeof args.content === 'string' ? args.content : undefined,
            contentB: typeof args.contentB === 'string' ? args.contentB : undefined,
            finding: typeof args.finding === 'string' ? args.finding : undefined,
            undo: args.undo === true,
          })
          if (result.applied || result.undone) await refreshOrient()
          return result
        } catch (error) {
          return fail(error)
        }
      },
  })

  registerTool(ctx, {
      name: 'wenmai_config',
      description:
        '查看或增减额外原文目录。用户说「再扫这个文件夹 / 加上我的脚本目录」且已确认路径时调用。默认已含当前工作区；禁止扫家目录。',
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
        '生成知识关联图 graph.html。用户说「关联图 / 知识图谱 / 打开关系图」时调用。不要每轮都跑。',
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
    description: '文脉: status | lint | orient | graph | review | refactor',
    input: { hint: 'status|lint|orient|graph|review|refactor' },
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
        if (sub === 'review') {
          const report = await reviewVault(root)
          return { kind: 'success', text: formatReview(report) }
        }
        if (sub === 'refactor') {
          return {
            kind: 'success',
            text: '文脉 refactor 默认 dry-run。请用对话说明要合并/改名/归档/拆开哪些页，确认影响面后再写入。禁止改 raw/。',
          }
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
        return { kind: 'error', text: 'Usage: /wenmai [status|lint|orient|graph|review|refactor]' }
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
  if (!body) throw new Error('provide filePath, content, or dir')
  const title =
    args.title?.trim() ||
    titleFromMarkdown(body, sourcePath ? path.basename(sourcePath, path.extname(sourcePath)) : 'untitled')
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

function formatReview(report: Awaited<ReturnType<typeof reviewVault>>): string {
  const lines = [
    `文脉 review: ${report.findingCount} findings, pages ${report.metrics.pageCount}, raw ${report.metrics.rawCount}.`,
    `duplicates ${report.metrics.duplicatePairs}, stale ${report.metrics.stalePageCount}, expired ${report.metrics.expiredPageCount}, orphans ${report.metrics.orphanRatio.toFixed(2)}.`,
    `blindSpot: ${report.blindSpot}`,
  ]
  if (report.truncationNote) lines.push(report.truncationNote)
  for (const item of report.findings.slice(0, 20)) {
    lines.push(`- ${item.severity.toUpperCase()} ${item.kind} ${item.id} ${item.paths.join(' | ')}: ${item.reason}`)
  }
  if (report.findings.length > 20) lines.push(`... ${report.findings.length - 20} more omitted`)
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
