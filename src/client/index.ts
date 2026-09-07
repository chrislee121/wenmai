import { IngestCard, StatusCard, TasksCard, WrittenCard } from './cards.js'
import { installWenmaiStyles } from './styles.js'
import { WenmaiTab } from './tab.js'

type SlotsLike = {
  inject: (name: string, factory: () => unknown) => unknown
  register: (options: Record<string, unknown>, component: unknown) => () => void
}

type ClientCtx = {
  slots?: SlotsLike
  get?: (name: string) => unknown
  effect: (factory: () => void | (() => void), name?: string) => void
  inject?: (deps: string[], callback: (ctx: ClientCtx) => void) => void
}

function slotsOf(ctx: ClientCtx): SlotsLike | undefined {
  const found = ctx.slots ?? (typeof ctx.get === 'function' ? ctx.get('slots') : undefined)
  if (!found || typeof found !== 'object') return undefined
  const slots = found as SlotsLike
  if (typeof slots.inject !== 'function' || typeof slots.register !== 'function') return undefined
  return slots
}

function mountUi(ctx: ClientCtx): () => void {
  const slots = slotsOf(ctx)
  const stopStyles = installWenmaiStyles()
  if (!slots) {
    console.warn('[wenmai] slots unavailable; chat cards skipped')
    return stopStyles
  }
  const stopTools = slots.inject('tool.call.toolview', function* () {
    yield slots.register({ name: 'tool.call.toolview', key: 'wenmai_written' }, WrittenCard)
    yield slots.register({ name: 'tool.call.toolview', key: 'wenmai_ingest' }, IngestCard)
    yield slots.register({ name: 'tool.call.toolview', key: 'wenmai_status' }, StatusCard)
    yield slots.register({ name: 'tool.call.toolview', key: 'wenmai_tasks' }, TasksCard)
  })
  const stopTab = slots.inject('conversation.view', () =>
    slots.register(
      {
        name: 'conversation.view',
        id: 'wenmai',
        order: 20,
        label: () => '文脉',
      },
      WenmaiTab,
    ),
  )
  return () => {
    if (typeof stopTools === 'function') stopTools()
    if (typeof stopTab === 'function') stopTab()
    stopStyles()
  }
}

/** 故意不声明 inject：缺 slots 时跳过 UI，不要卡住整页 Loading plugins。 */
export const inject: string[] = []

export function apply(ctx: ClientCtx): void {
  ctx.effect(() => {
    try {
      return mountUi(ctx)
    } catch (error) {
      console.error('[wenmai] client UI failed to mount', error)
      return () => {}
    }
  }, 'wenmai: client ui')
}
