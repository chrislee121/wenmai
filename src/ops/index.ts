import { spawn } from 'node:child_process'
import { ingestDirectory } from '../ingest-dir.js'
import { loadVaultPack } from '../pack/index.js'
import { writeGraphHtml } from '../graph.js'
import { lintVault } from '../lint.js'
import { PathEscapeError } from '../paths.js'
import { refactorVault } from '../refactor/index.js'
import { reviewVault } from '../review/index.js'
import {
  addAgentSourceRoot,
  removeAgentSourceRoot,
  sessionWorkspaceCwd,
  writeAgentSourceRoots,
} from '../source-roots.js'
import { researchVault } from '../research/index.js'
import { initVault, readPage, status, writePage } from '../store.js'
import { runTasks, TASK_OPS, type TaskOp } from '../tasks/index.js'
import { checkWritten } from '../written.js'
import { searchVault } from '../search.js'
import { ingestFromArgs, normalizeKind } from '../plugin/ingest-args.js'
import { effectiveRoots, rootPaths } from '../plugin/roots.js'
import type { AgentLike } from '../plugin/types.js'
import type { OpName } from './catalog.js'

export type OpsRuntime = {
  root: string
  pluginRoots: string[]
  ingestAdapters: boolean
  research: boolean
  refreshOrient: () => Promise<void>
}

export type OpInput = {
  op?: string
  query?: string
  dir?: string
  kind?: string
  domain?: string
  workspace?: string
  pack?: string
  filePath?: string
  content?: string
  contentB?: string
  title?: string
  dryRun?: boolean
  limit?: number
  offset?: number
  path?: string
  log?: string
  updateIndex?: boolean
  finding?: string
  includeDismissed?: boolean
  ttlDays?: number
  duplicateThreshold?: number
  ack?: string
  snooze?: string
  wontfix?: string
  snoozeDays?: number
  id?: string
  priority?: string
  taskOp?: string
  source?: string
  target?: string
  undo?: boolean
  add?: string
  remove?: string
  set?: string
  focus?: string
  depth?: number
  includeTags?: boolean
  includeSources?: boolean
  includeMissing?: boolean
  includeArticles?: boolean
  open?: boolean
  adopt?: boolean
  refactorOp?: string
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) return 20
  return Math.min(100, Math.max(1, Math.floor(limit)))
}

const CORE_OPS = new Set<OpName>([
  'status',
  'init',
  'ingest',
  'written',
  'search',
  'read',
  'write',
  'lint',
  'review',
  'tasks',
  'research',
  'refactor',
  'config',
  'graph',
])

function agentFrom(input: OpInput): AgentLike | undefined {
  if (typeof input.workspace === 'string' && input.workspace.trim()) {
    return { session: { cwd: input.workspace.trim() } }
  }
  return undefined
}

function asOp(raw: string): OpName | 'ingest-preview' | 'ingest-confirm' | 'source-add' {
  const op = raw.trim()
  if (CORE_OPS.has(op as OpName)) return op as OpName
  if (op === 'ingest-preview' || op === 'ingest-confirm' || op === 'source-add') return op
  throw new Error('unknown op')
}

function canAdoptSourceDir(error: unknown): boolean {
  if (!(error instanceof PathEscapeError)) return false
  const message = error.message
  if (message.includes('home directory') || message.includes('too broad')) return false
  return message.includes('inside') || message.includes('pick a workspace')
}

function requiredDir(input: OpInput): string {
  const dir = typeof input.dir === 'string' ? input.dir.trim() : ''
  if (!dir) throw new Error('dir is required')
  return dir
}

function openLocalFile(file: string): void {
  if (process.platform !== 'darwin') return
  spawn('open', [file], { detached: true, stdio: 'ignore' }).unref()
}

async function runIngest(runtime: OpsRuntime, input: OpInput, agent: AgentLike | undefined): Promise<unknown> {
  const roots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
  const paths = rootPaths(roots)
  const workspaceCwd = sessionWorkspaceCwd(agent)
  const dir = typeof input.dir === 'string' ? input.dir.trim() : ''
  const hasFile = Boolean(typeof input.filePath === 'string' && input.filePath.trim())
  const hasContent = Boolean(typeof input.content === 'string' && input.content.trim())
  if (dir && (hasFile || hasContent)) {
    throw new Error('dir cannot be combined with filePath or content')
  }
  const dryRun = input.dryRun !== false
  const adopt = input.adopt === true
  if (dir) {
    const pack = await loadVaultPack(runtime.root)
    const run = async () => {
      const nextRoots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
      return ingestDirectory(runtime.root, dir, {
        allowedRoots: rootPaths(nextRoots),
        kind: normalizeKind(typeof input.kind === 'string' ? input.kind : undefined, pack.rawKinds),
        dryRun,
        workspaceCwd,
        adapters: runtime.ingestAdapters,
      })
    }
    try {
      const ingested = await run()
      if (!ingested.dryRun) await runtime.refreshOrient()
      return ingested
    } catch (error) {
      if (dryRun && adopt && canAdoptSourceDir(error)) {
        await addAgentSourceRoot(runtime.root, dir)
        const ingested = await run()
        if (!ingested.dryRun) await runtime.refreshOrient()
        return ingested
      }
      throw error
    }
  }
  const ingested = await ingestFromArgs(runtime.root, paths, workspaceCwd, {
    filePath: typeof input.filePath === 'string' ? input.filePath : undefined,
    content: typeof input.content === 'string' ? input.content : undefined,
    title: typeof input.title === 'string' ? input.title : undefined,
    kind: typeof input.kind === 'string' ? input.kind : undefined,
    adapters: runtime.ingestAdapters,
  })
  await runtime.refreshOrient()
  return ingested
}

export async function runOp(runtime: OpsRuntime, input: OpInput): Promise<unknown> {
  const raw = typeof input.op === 'string' ? input.op.trim() : ''
  const mapped = asOp(raw)
  const agent = agentFrom(input)
  const next: OpInput =
    mapped === 'ingest-preview'
      ? { ...input, op: 'ingest', dryRun: true, adopt: true }
      : mapped === 'ingest-confirm'
        ? { ...input, op: 'ingest', dryRun: false, adopt: false }
        : mapped === 'source-add'
          ? { ...input, op: 'config', add: requiredDir(input) }
          : input
  const op = (typeof next.op === 'string' ? next.op.trim() : mapped) as OpName

  if (op === 'status') {
    return await status(runtime.root, await effectiveRoots(runtime.root, runtime.pluginRoots, agent))
  }
  if (op === 'init') {
    const result = await initVault(runtime.root, String(next.domain ?? ''), {
      pack: typeof next.pack === 'string' ? next.pack : undefined,
    })
    await runtime.refreshOrient()
    return result
  }
  if (op === 'ingest') {
    return await runIngest(runtime, next, agent)
  }
  if (op === 'written') {
    const query = typeof next.query === 'string' ? next.query : ''
    const roots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
    return await checkWritten(runtime.root, rootPaths(roots), query, clampLimit(next.limit), {
      research: runtime.research === true,
    })
  }
  if (op === 'search') {
    const query = String(next.query ?? '')
    const hits = await searchVault(runtime.root, query, clampLimit(next.limit))
    return { ok: true, query, count: hits.length, hits }
  }
  if (op === 'read') {
    return await readPage(
      runtime.root,
      String(next.path ?? ''),
      typeof next.offset === 'number' ? next.offset : undefined,
      typeof next.limit === 'number' ? next.limit : undefined,
    )
  }
  if (op === 'write') {
    const result = await writePage(runtime.root, String(next.path ?? ''), String(next.content ?? ''), {
      log: typeof next.log === 'string' ? next.log : undefined,
      updateIndex: next.updateIndex === true,
      finding: typeof next.finding === 'string' ? next.finding : undefined,
    })
    await runtime.refreshOrient()
    return result
  }
  if (op === 'lint') {
    return await lintVault(runtime.root)
  }
  if (op === 'review') {
    return await reviewVault(runtime.root, {
      includeDismissed: next.includeDismissed === true,
      ttlDays: typeof next.ttlDays === 'number' ? next.ttlDays : undefined,
      duplicateThreshold: typeof next.duplicateThreshold === 'number' ? next.duplicateThreshold : undefined,
      ack: typeof next.ack === 'string' ? [next.ack] : undefined,
      snooze: typeof next.snooze === 'string' ? [next.snooze] : undefined,
      snoozeDays: typeof next.snoozeDays === 'number' ? next.snoozeDays : undefined,
      wontfix: typeof next.wontfix === 'string' ? [next.wontfix] : undefined,
    })
  }
  if (op === 'tasks') {
    const opRaw = typeof next.taskOp === 'string' && next.taskOp.trim() ? next.taskOp.trim() : 'list'
    if (!(TASK_OPS as readonly string[]).includes(opRaw || 'list')) {
      throw new Error(`unknown tasks op: ${opRaw}`)
    }
    return await runTasks(runtime.root, {
      op: (opRaw || 'list') as TaskOp,
      id: typeof next.id === 'string' ? next.id : undefined,
      priority: typeof next.priority === 'string' ? next.priority : undefined,
      snoozeDays: typeof next.snoozeDays === 'number' ? next.snoozeDays : undefined,
      includeDismissed: next.includeDismissed === true,
      research: runtime.research === true,
    })
  }
  if (op === 'research') {
    const roots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
    return await researchVault(runtime.root, {
      findingId: typeof next.id === 'string' ? next.id : undefined,
      enabled: runtime.research === true,
      sourceRoots: rootPaths(roots),
    })
  }
  if (op === 'refactor') {
    const result = await refactorVault(runtime.root, {
      op: typeof next.refactorOp === 'string' ? next.refactorOp : undefined,
      dryRun: next.dryRun !== false,
      source: typeof next.source === 'string' ? next.source : undefined,
      target: typeof next.target === 'string' ? next.target : undefined,
      title: typeof next.title === 'string' ? next.title : undefined,
      content: typeof next.content === 'string' ? next.content : undefined,
      contentB: typeof next.contentB === 'string' ? next.contentB : undefined,
      finding: typeof next.finding === 'string' ? next.finding : undefined,
      undo: next.undo === true,
    })
    if (result.applied || result.undone) await runtime.refreshOrient()
    return result
  }
  if (op === 'config') {
    if (typeof next.set === 'string') {
      const items = next.set
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      await writeAgentSourceRoots(runtime.root, items)
    } else if (typeof next.add === 'string' && next.add.trim()) {
      await addAgentSourceRoot(runtime.root, next.add)
    } else if (typeof next.remove === 'string' && next.remove.trim()) {
      await removeAgentSourceRoot(runtime.root, next.remove)
    }
    return await status(runtime.root, await effectiveRoots(runtime.root, runtime.pluginRoots, agent))
  }
  if (op === 'graph') {
    const result = await writeGraphHtml(runtime.root, {
      focus: typeof next.focus === 'string' ? next.focus : undefined,
      depth: typeof next.depth === 'number' ? next.depth : undefined,
      includeTags: typeof next.includeTags === 'boolean' ? next.includeTags : undefined,
      includeSources: typeof next.includeSources === 'boolean' ? next.includeSources : undefined,
      includeMissing: typeof next.includeMissing === 'boolean' ? next.includeMissing : undefined,
      includeArticles: typeof next.includeArticles === 'boolean' ? next.includeArticles : undefined,
      sourceRoots: rootPaths(await effectiveRoots(runtime.root, runtime.pluginRoots, agent)),
    })
    if (next.open === true) openLocalFile(result.htmlPath)
    return result
  }
  throw new Error('unknown op')
}
