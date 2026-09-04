import type { Context } from '@deepseek-ai/cordis'
import type { SourceRootRef } from '../source-roots.js'

export type ToolArgs = Record<string, string | number | boolean | undefined>

export type AgentLike = { session?: { header?: { cwd?: string }; cwd?: string } }

export interface PluginRuntime {
  ctx: Context
  root: string
  pluginRoots: string[]
  ingestAdapters: boolean
  refreshOrient: () => Promise<void>
  getOrientText: () => string
}

export type { SourceRootRef }
