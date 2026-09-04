import type { Context } from '@deepseek-ai/cordis'
import { Config, type Config as WenmaiConfig } from './config.js'
import { buildOrient } from './orient.js'
import { resolveRoot } from './paths.js'
import { SYSTEM_PROMPT_LINES } from './plugin/prompt.js'
import { registerWenmaiCommands } from './plugin/commands.js'
import { registerWenmaiTools } from './plugin/tools.js'
import type { PluginRuntime } from './plugin/types.js'

export { Config }
export type { WenmaiConfig as ConfigType }

export const name = 'wenmai'
export const inject = ['tools', 'commands', 'systemPrompt']

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
    text: SYSTEM_PROMPT_LINES.join('\n'),
  })

  ctx.systemPrompt.context({
    name: 'tool:wenmai-orient',
    order: 117,
    text: () => orientText,
  })

  const runtime: PluginRuntime = {
    ctx,
    root,
    pluginRoots,
    refreshOrient,
    getOrientText: () => orientText,
  }
  registerWenmaiTools(runtime)
  registerWenmaiCommands(runtime)
}
