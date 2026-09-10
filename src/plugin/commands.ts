import { writeGraphHtml } from '../graph.js'
import { lintVault } from '../lint.js'
import { runOp, type OpsRuntime } from '../ops/index.js'
import { reviewVault } from '../review/index.js'
import { status } from '../store.js'
import { formatGraph, formatLint, formatReview, formatStatus } from './format.js'
import { throwIfAborted } from './register.js'
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

export function registerWenmaiCommands(runtime: PluginRuntime): void {
  const { ctx, refreshOrient, getOrientText } = runtime
  const ops = asRuntime(runtime)

  ctx.commands.register({
    name: 'wenmai',
    description: '文脉: status | lint | orient | graph | review | tasks | refactor',
    input: { hint: 'status|lint|orient|graph|review|tasks|refactor' },
    handler: async ({ rawInput, signal, agent }) => {
      throwIfAborted(signal)
      const sub = rawInput.trim() || 'status'
      console.log(`[wenmai] /wenmai ${sub}`)
      const workspace = agent?.session?.cwd ?? agent?.session?.header?.cwd
      try {
        if (sub === 'status') {
          const report = await runOp(ops, { op: 'status', workspace })
          return { kind: 'success', text: formatStatus(report as Awaited<ReturnType<typeof status>>) }
        }
        if (sub === 'lint') {
          const report = await runOp(ops, { op: 'lint', workspace })
          return { kind: 'success', text: formatLint(report as Awaited<ReturnType<typeof lintVault>>) }
        }
        if (sub === 'orient') {
          await refreshOrient()
          return { kind: 'success', text: getOrientText() }
        }
        if (sub === 'review') {
          const report = await runOp(ops, { op: 'review', workspace })
          return { kind: 'success', text: formatReview(report as Awaited<ReturnType<typeof reviewVault>>) }
        }
        if (sub === 'tasks') {
          return {
            kind: 'success',
            text: '文脉任务队列来自 review finding，没有 finding 就没有任务。请用对话问「今天该修什么」；修某一条仍走重构（默认先预览）。',
          }
        }
        if (sub === 'refactor') {
          return {
            kind: 'success',
            text: '文脉 refactor 默认 dry-run。请用对话说明要合并/改名/归档/拆开哪些页，确认影响面后再写入。禁止改 raw/。',
          }
        }
        if (sub === 'graph' || sub.startsWith('graph ')) {
          const focus = sub.slice('graph'.length).trim() || undefined
          const result = await runOp(ops, { op: 'graph', focus, open: true, workspace })
          return { kind: 'success', text: formatGraph(result as Awaited<ReturnType<typeof writeGraphHtml>>) }
        }
        return { kind: 'error', text: 'Usage: /wenmai [status|lint|orient|graph|review|tasks|refactor]' }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
