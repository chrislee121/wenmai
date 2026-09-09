import type { Context } from '@deepseek-ai/cordis'
import { Config, type Config as WenmaiConfig } from './config.js'
import { makeWenmaiRoutes } from './http/routes.js'
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

export function apply(ctx: Context, rawConfig: WenmaiConfig = { root: '~/wenmai', sourceRoots: [], orientBudgetChars: 8000, ingestAdapters: false, research: false }): void {
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
    ingestAdapters: config.ingestAdapters === true,
    research: config.research === true,
    refreshOrient,
    getOrientText: () => orientText,
  }
  registerWenmaiTools(runtime)
  registerWenmaiCommands(runtime)
  registerWenmaiUiRoutes(ctx, runtime)
}

function registerWenmaiUiRoutes(ctx: Context, runtime: PluginRuntime): void {
  const mount = (host: Context): void => {
    const server = host.webServer ?? (typeof host.get === 'function' ? (host.get('webServer') as Context['webServer']) : undefined)
    if (!server?.register) return
    const disposers = makeWenmaiRoutes(runtime).map((route) => server.register(route))
    host.effect(() => () => {
      for (const dispose of disposers) dispose()
    }, 'wenmai: ui routes')
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], mount)
    return
  }
  mount(ctx)
}
