import { spawn } from 'node:child_process'
import { writeGraphHtml } from '../graph.js'
import { lintVault } from '../lint.js'
import { reviewVault } from '../review/index.js'
import { status } from '../store.js'
import { formatGraph, formatLint, formatReview, formatStatus } from './format.js'
import { throwIfAborted } from './register.js'
import { effectiveRoots, rootPaths } from './roots.js'
import type { PluginRuntime } from './types.js'

function openLocalFile(file: string): void {
  if (process.platform !== 'darwin') return
  spawn('open', [file], { detached: true, stdio: 'ignore' }).unref()
}

export function registerWenmaiCommands(runtime: PluginRuntime): void {
  const { ctx, root, pluginRoots, refreshOrient, getOrientText } = runtime

  ctx.commands.register({
    name: 'wenmai',
    description: '文脉: status | lint | orient | graph | review | tasks | refactor',
    input: { hint: 'status|lint|orient|graph|review|tasks|refactor' },
    handler: async ({ rawInput, signal, agent }) => {
      throwIfAborted(signal)
      const sub = rawInput.trim() || 'status'
      console.log(`[wenmai] /wenmai ${sub}`)
      try {
        if (sub === 'status') {
          const report = await status(root, await effectiveRoots(root, pluginRoots, agent))
          return { kind: 'success', text: formatStatus(report) }
        }
        if (sub === 'lint') {
          const report = await lintVault(root)
          return { kind: 'success', text: formatLint(report) }
        }
        if (sub === 'orient') {
          await refreshOrient()
          return { kind: 'success', text: getOrientText() }
        }
        if (sub === 'review') {
          const report = await reviewVault(root)
          return { kind: 'success', text: formatReview(report) }
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
          const result = await writeGraphHtml(root, {
            focus,
            sourceRoots: rootPaths(await effectiveRoots(root, pluginRoots, agent)),
          })
          openLocalFile(result.htmlPath)
          return { kind: 'success', text: formatGraph(result) }
        }
        return { kind: 'error', text: 'Usage: /wenmai [status|lint|orient|graph|review|tasks|refactor]' }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
