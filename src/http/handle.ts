import { ingestDirectory } from '../ingest-dir.js'
import { loadVaultPack } from '../pack/index.js'
import { PathEscapeError } from '../paths.js'
import { effectiveRoots, rootPaths } from '../plugin/roots.js'
import { clampLimit } from '../plugin/register.js'
import { normalizeKind } from '../plugin/ingest-args.js'
import type { PluginRuntime } from '../plugin/types.js'
import { addAgentSourceRoot } from '../source-roots.js'
import { researchVault } from '../research/index.js'
import { initVault, status } from '../store.js'
import { runTasks, TASK_OPS, type TaskOp } from '../tasks/index.js'
import { DEFAULT_WRITER_DOMAIN } from '../ui/defaults.js'
import { checkWritten } from '../written.js'
import type { UiRequestBody } from './protocol.js'

export type UiHandleRuntime = Pick<
  PluginRuntime,
  'root' | 'pluginRoots' | 'ingestAdapters' | 'research' | 'refreshOrient'
>

function withResearchFlag<T extends object>(report: T, research: boolean): T & { research: boolean } {
  return { ...report, research }
}

function agentFromWorkspace(workspace: string | undefined): { session: { cwd: string } } | undefined {
  if (typeof workspace !== 'string' || !workspace.trim()) return undefined
  return { session: { cwd: workspace.trim() } }
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

function requiredDir(body: UiRequestBody): string {
  const dir = typeof body.dir === 'string' ? body.dir.trim() : ''
  if (!dir) throw new Error('dir is required')
  return dir
}

function canAdoptSourceDir(error: unknown): boolean {
  if (!(error instanceof PathEscapeError)) return false
  const message = error.message
  if (message.includes('home directory') || message.includes('too broad')) return false
  return message.includes('inside') || message.includes('pick a workspace')
}

async function ingestUi(
  runtime: UiHandleRuntime,
  body: UiRequestBody,
  options: { dryRun: boolean; adopt?: boolean },
): Promise<unknown> {
  const dir = requiredDir(body)
  const agent = agentFromWorkspace(body.workspace)
  const run = async () => {
    const roots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
    const pack = await loadVaultPack(runtime.root)
    return ingestDirectory(runtime.root, dir, {
      allowedRoots: rootPaths(roots),
      kind: normalizeKind(typeof body.kind === 'string' ? body.kind : undefined, pack.rawKinds),
      dryRun: options.dryRun,
      workspaceCwd: agent?.session.cwd,
      adapters: runtime.ingestAdapters,
    })
  }
  try {
    const ingested = await run()
    if (!options.dryRun) await runtime.refreshOrient()
    return ingested
  } catch (error) {
    if (options.dryRun && options.adopt && canAdoptSourceDir(error)) {
      await addAgentSourceRoot(runtime.root, dir)
      return await run()
    }
    throw error
  }
}

export async function handleUiRequest(runtime: UiHandleRuntime, body: UiRequestBody): Promise<unknown> {
  const op = typeof body.op === 'string' ? body.op.trim() : ''
  const agent = agentFromWorkspace(body.workspace)
  try {
    if (op === 'status') {
      return withResearchFlag(
        await status(runtime.root, await effectiveRoots(runtime.root, runtime.pluginRoots, agent)),
        runtime.research === true,
      )
    }
    if (op === 'written') {
      const query = typeof body.query === 'string' ? body.query : ''
      const roots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
      return await checkWritten(runtime.root, rootPaths(roots), query, clampLimit(undefined), {
        research: runtime.research === true,
      })
    }
    if (op === 'init') {
      const domain =
        typeof body.domain === 'string' && body.domain.trim()
          ? body.domain.trim()
          : DEFAULT_WRITER_DOMAIN
      await initVault(runtime.root, domain, { pack: 'writer' })
      await runtime.refreshOrient()
      return withResearchFlag(
        await status(runtime.root, await effectiveRoots(runtime.root, runtime.pluginRoots, agent)),
        runtime.research === true,
      )
    }
    if (op === 'source-add') {
      await addAgentSourceRoot(runtime.root, requiredDir(body))
      return withResearchFlag(
        await status(runtime.root, await effectiveRoots(runtime.root, runtime.pluginRoots, agent)),
        runtime.research === true,
      )
    }
    if (op === 'ingest-preview') {
      return await ingestUi(runtime, body, { dryRun: true, adopt: true })
    }
    if (op === 'ingest-confirm') {
      return await ingestUi(runtime, body, { dryRun: false })
    }
    if (op === 'tasks') {
      const opRaw = typeof body.taskOp === 'string' && body.taskOp.trim() ? body.taskOp.trim() : 'list'
      if (!(TASK_OPS as readonly string[]).includes(opRaw)) {
        throw new Error(`unknown tasks op: ${opRaw}`)
      }
      return await runTasks(runtime.root, {
        op: opRaw as TaskOp,
        id: typeof body.id === 'string' ? body.id : undefined,
        snoozeDays: typeof body.snoozeDays === 'number' ? body.snoozeDays : undefined,
        research: runtime.research === true,
      })
    }
    if (op === 'research') {
      const roots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
      return await researchVault(runtime.root, {
        findingId: typeof body.id === 'string' ? body.id : undefined,
        enabled: runtime.research === true,
        sourceRoots: rootPaths(roots),
      })
    }
    throw new Error('unknown op')
  } catch (error) {
    return fail(error)
  }
}
