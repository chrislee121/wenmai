import type { Context } from '@deepseek-ai/cordis'
import { OBJECT_OUTPUT, parametersSchema } from '../tool-def.js'
import type { ToolArgs } from './types.js'

export function registerTool(
  ctx: Context,
  def: {
    name: string
    description: string
    parameters: Parameters<typeof parametersSchema>[0]
    execute: (args: ToolArgs, exec: { signal: AbortSignal; agent?: import('./types.js').AgentLike }) => Promise<unknown>
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

export function fail(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal) return
  if (typeof (signal as AbortSignal & { throwIfAborted?: () => void }).throwIfAborted === 'function') {
    ;(signal as AbortSignal & { throwIfAborted: () => void }).throwIfAborted()
    return
  }
  if (signal.aborted) throw new Error('aborted')
}

export function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) return 20
  return Math.min(100, Math.max(1, Math.floor(limit)))
}
