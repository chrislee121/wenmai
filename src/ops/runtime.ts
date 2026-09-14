import { resolveRoot } from '../paths.js'
import type { OpsRuntime } from './index.js'

export function makeOpsRuntime(options: {
  root: string
  pluginRoots?: string[]
  ingestAdapters?: boolean
  research?: boolean
}): OpsRuntime {
  return {
    root: resolveRoot(options.root),
    pluginRoots: options.pluginRoots ?? [],
    ingestAdapters: options.ingestAdapters === true,
    research: options.research === true,
    refreshOrient: async () => {},
  }
}
