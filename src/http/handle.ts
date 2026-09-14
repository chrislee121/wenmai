import { PathEscapeError } from '../paths.js'
import { runOp } from '../ops/index.js'
import type { PluginRuntime } from '../plugin/types.js'
import { DEFAULT_WRITER_DOMAIN } from '../ui/defaults.js'
import type { UiRequestBody } from './protocol.js'

export type UiHandleRuntime = Pick<
  PluginRuntime,
  'root' | 'pluginRoots' | 'ingestAdapters' | 'research' | 'refreshOrient'
>

function withResearchFlag<T extends object>(report: T, research: boolean): T & { research: boolean } {
  return { ...report, research }
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

export async function handleUiRequest(runtime: UiHandleRuntime, body: UiRequestBody): Promise<unknown> {
  const op = typeof body.op === 'string' ? body.op.trim() : ''
  try {
    if (op === 'init') {
      const domain =
        typeof body.domain === 'string' && body.domain.trim()
          ? body.domain.trim()
          : DEFAULT_WRITER_DOMAIN
      await runOp(runtime, { op: 'init', domain, pack: 'writer', workspace: body.workspace })
      const report = await runOp(runtime, { op: 'status', workspace: body.workspace })
      return withResearchFlag(report as object, runtime.research === true)
    }
    if (op === 'status' || op === 'source-add') {
      const report = await runOp(runtime, { ...body, op })
      return withResearchFlag(report as object, runtime.research === true)
    }
    return await runOp(runtime, { ...body, op })
  } catch (error) {
    if (error instanceof PathEscapeError) return fail(error)
    return fail(error)
  }
}
