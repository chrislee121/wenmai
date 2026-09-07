import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  paneIsCollapsed,
  resolvePaneTrack,
  WENMAI_PANE_DEFAULT,
} from '../ui/pane.js'
import { installCenterSplit } from './layout.js'
import { WenmaiTab } from './tab.js'

const WIDTH_KEY = 'wenmai.paneWidth'
const OPEN_KEY = 'wenmai.paneOpen'

function readPreferred(): number {
  if (typeof localStorage === 'undefined') return WENMAI_PANE_DEFAULT
  const raw = Number(localStorage.getItem(WIDTH_KEY))
  return Number.isFinite(raw) && raw > 0 ? raw : WENMAI_PANE_DEFAULT
}

function readOpen(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(OPEN_KEY) !== '0'
}

function SplitHandle(props: {
  onDrag: (width: number) => void
  onCommit: (width: number) => void
}): React.ReactElement {
  const origin = React.useRef(0)
  const base = React.useRef(0)
  const latest = React.useRef(0)

  return React.createElement('div', {
    className: 'wenmai-split',
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': '调整文脉栏宽度',
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      const pane = event.currentTarget.parentElement
      if (pane === null) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      origin.current = event.clientX
      latest.current = event.clientX
      base.current = pane.getBoundingClientRect().width
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      latest.current = event.clientX
      props.onDrag(base.current + (latest.current - origin.current))
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      event.currentTarget.releasePointerCapture(event.pointerId)
      props.onCommit(base.current + (event.clientX - origin.current))
    },
  })
}

export function WenmaiDock(props: { cwd?: string }): React.ReactElement | null {
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  const [open, setOpen] = React.useState(readOpen)
  const [preferred, setPreferred] = React.useState(readPreferred)
  const [centerWidth, setCenterWidth] = React.useState(1200)

  React.useLayoutEffect(() => installCenterSplit(setHost), [])

  const track = resolvePaneTrack(centerWidth, preferred, open)
  const collapsed = paneIsCollapsed(track)

  React.useEffect(() => {
    const parent = host?.parentElement
    if (!host || !parent) return
    const apply = (): void => {
      const width = parent.getBoundingClientRect().width
      setCenterWidth(width)
      const next = resolvePaneTrack(width, preferred, open)
      parent.style.setProperty('--wenmai-pane-track', `${next}px`)
      host.dataset.collapsed = paneIsCollapsed(next) ? 'true' : 'false'
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [host, open, preferred])

  const persistOpen = (next: boolean): void => {
    setOpen(next)
    localStorage.setItem(OPEN_KEY, next ? '1' : '0')
  }

  const persistWidth = (width: number): void => {
    const next = resolvePaneTrack(centerWidth, width, true)
    setPreferred(next)
    localStorage.setItem(WIDTH_KEY, String(next))
  }

  if (!host) return null

  const body = collapsed
    ? React.createElement(
        'button',
        {
          type: 'button',
          className: 'wenmai-rail',
          title: '展开文脉',
          onClick: () => persistOpen(true),
        },
        '文脉',
      )
    : React.createElement(
        'div',
        { className: 'wenmai-pane' },
        React.createElement(WenmaiTab, {
          cwd: props.cwd,
          onCollapse: () => persistOpen(false),
        }),
        React.createElement(SplitHandle, {
          onDrag: (width) => setPreferred(width),
          onCommit: persistWidth,
        }),
      )

  return createPortal(body, host)
}
