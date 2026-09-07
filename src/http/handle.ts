import { ingestDirectory } from '../ingest-dir.js'
import { loadVaultPack } from '../pack/index.js'
import { effectiveRoots, rootPaths } from '../plugin/roots.js'
import { clampLimit } from '../plugin/register.js'
import { normalizeKind } from '../plugin/ingest-args.js'
import type { PluginRuntime } from '../plugin/types.js'
import { status } from '../store.js'
import { runTasks, TASK_OPS, type TaskOp } from '../tasks/index.js'
import { checkWritten } from '../written.js'
import type { UiRequestBody } from './protocol.js'

export type UiHandleRuntime = Pick<PluginRuntime, 'root' | 'pluginRoots' | 'ingestAdapters' | 'refreshOrient'>

function agentFromWorkspace(workspace: string | undefined): { session: { cwd: string } } | undefined {
  if (typeof workspace !== 'string' || !workspace.trim()) return undefined
  return { session: { cwd: workspace.trim() } }
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

export async function handleUiRequest(runtime: UiHandleRuntime, body: UiRequestBody): Promise<unknown> {
  const op = typeof body.op === 'string' ? body.op.trim() : ''
  const agent = agentFromWorkspace(body.workspace)
  try {
    if (op === 'status') {
      return await status(runtime.root, await effectiveRoots(runtime.root, runtime.pluginRoots, agent))
    }
    if (op === 'written') {
      const query = typeof body.query === 'string' ? body.query : ''
      const roots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
      return await checkWritten(runtime.root, rootPaths(roots), query, clampLimit(undefined))
    }
    if (op === 'ingest-confirm') {
      const dir = typeof body.dir === 'string' ? body.dir.trim() : ''
      if (!dir) throw new Error('dir is required')
      const roots = await effectiveRoots(runtime.root, runtime.pluginRoots, agent)
      const pack = await loadVaultPack(runtime.root)
      const ingested = await ingestDirectory(runtime.root, dir, {
        allowedRoots: rootPaths(roots),
        kind: normalizeKind(typeof body.kind === 'string' ? body.kind : undefined, pack.rawKinds),
        dryRun: false,
        workspaceCwd: agent?.session.cwd,
        adapters: runtime.ingestAdapters,
      })
      await runtime.refreshOrient()
      return ingested
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
      })
    }
    throw new Error('unknown op')
  } catch (error) {
    return fail(error)
  }
}
