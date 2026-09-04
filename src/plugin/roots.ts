import {
  mergeSourceRoots,
  readAgentSourceRoots,
  sessionWorkspaceCwd,
  type SourceRootRef,
} from '../source-roots.js'
import type { AgentLike } from './types.js'

export async function effectiveRoots(vaultRoot: string, pluginRoots: string[], agent?: AgentLike): Promise<SourceRootRef[]> {
  const extras = await readAgentSourceRoots(vaultRoot)
  return mergeSourceRoots({
    workspace: sessionWorkspaceCwd(agent),
    plugin: pluginRoots,
    agent: extras,
  })
}

export function rootPaths(refs: SourceRootRef[]): string[] {
  return refs.map((item) => item.path)
}
