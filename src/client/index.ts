import { IngestCard, StatusCard, TasksCard, WrittenCard } from './cards.js'
import { WenmaiDock } from './dock.js'
import { installWenmaiStyles } from './styles.js'

type SlotsLike = {
  inject: (name: string, factory: () => unknown) => unknown
  register: (options: Record<string, unknown>, component: unknown) => () => void
}

type ClientCtx = {
  slots?: SlotsLike
  get?: (name: string) => unknown
  effect: (factory: () => void | (() => void), name?: string) => void
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
    console.warn('[wenmai] slots unavailable; client UI skipped')
    return stopStyles
  }
  const stopTools = slots.inject('tool.call.toolview', function* () {
    yield slots.register({ name: 'tool.call.toolview', key: 'wenmai_written' }, WrittenCard)
    yield slots.register({ name: 'tool.call.toolview', key: 'wenmai_ingest' }, IngestCard)
    yield slots.register({ name: 'tool.call.toolview', key: 'wenmai_status' }, StatusCard)
    yield slots.register({ name: 'tool.call.toolview', key: 'wenmai_tasks' }, TasksCard)
  })
  const stopDock = slots.inject('shell.overlay', () =>
    slots.register(
      {
        name: 'shell.overlay',
        id: 'wenmai',
        order: 10,
      },
      WenmaiDock,
    ),
  )
  return () => {
    if (typeof stopTools === 'function') stopTools()
    if (typeof stopDock === 'function') stopDock()
    stopStyles()
  }
}

/** 等 slots 就绪再加载，避免整页卡在 Loading plugins；宿主模块表只有 react。 */
export const inject = ['slots']

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
