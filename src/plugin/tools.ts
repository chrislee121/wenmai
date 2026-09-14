import { WENMAI_TOOLS } from '../ops/catalog.js'
import { inputFromToolArgs } from '../ops/input.js'
import { runOp, type OpsRuntime } from '../ops/index.js'
import { fail, registerTool, throwIfAborted } from './register.js'
import type { PluginRuntime } from './types.js'

function asRuntime(runtime: PluginRuntime): OpsRuntime {
  return {
    root: runtime.root,
    pluginRoots: runtime.pluginRoots,
    ingestAdapters: runtime.ingestAdapters,
    research: runtime.research,
    refreshOrient: runtime.refreshOrient,
  }
}

export function registerWenmaiTools(runtime: PluginRuntime): void {
  const ops = asRuntime(runtime)
  for (const tool of WENMAI_TOOLS) {
    registerTool(runtime.ctx, {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      async execute(args, exec) {
        throwIfAborted(exec.signal)
        try {
          const workspace = exec.agent?.session?.cwd ?? exec.agent?.session?.header?.cwd
          return await runOp(ops, inputFromToolArgs(tool.op, args, workspace))
        } catch (error) {
          return fail(error)
        }
      },
    })
  }
}
