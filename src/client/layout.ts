const SPLIT_ATTR = 'data-wenmai-split'
const HOST_ATTR = 'data-wenmai-pane-host'

export function findConversationRoot(): HTMLElement | null {
  const found = document.querySelector('[style*="--dsh-conversation-column-width"]')
  return found instanceof HTMLElement ? found : null
}

function findFrame(): HTMLElement | null {
  for (const el of document.querySelectorAll('[style*="grid-template-columns"]')) {
    if (!(el instanceof HTMLElement)) continue
    const columns = inFlowColumns(el)
    if (columns.length >= 2) return el
  }
  return null
}

function inFlowColumns(frame: HTMLElement): HTMLElement[] {
  return Array.from(frame.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement)) return false
    return getComputedStyle(child).position !== 'absolute'
  })
}

export function findCenterColumn(): HTMLElement | null {
  const conversation = findConversationRoot()
  if (conversation?.parentElement instanceof HTMLElement) return conversation.parentElement
  const frame = findFrame()
  if (!frame) return null
  return inFlowColumns(frame)[1] ?? null
}

function teardown(center: HTMLElement, host: HTMLElement): void {
  host.remove()
  if (center.getAttribute(SPLIT_ATTR) === 'true') center.removeAttribute(SPLIT_ATTR)
  center.style.removeProperty('--wenmai-pane-track')
}

/** 把文脉面板插进 Harness 中间栏，让对话留在右侧。 */
export function installCenterSplit(onHost: (host: HTMLElement | null) => void): () => void {
  if (typeof document === 'undefined') return () => {}

  let disposed = false
  let center: HTMLElement | null = null
  let host: HTMLElement | null = null
  let raf = 0

  const attach = (next: HTMLElement): void => {
    if (center === next && host?.isConnected) return
    if (center && host) teardown(center, host)
    center = next
    host = document.createElement('div')
    host.setAttribute(HOST_ATTR, 'true')
    host.className = 'wenmai-pane-host'
    center.setAttribute(SPLIT_ATTR, 'true')
    center.prepend(host)
    onHost(host)
  }

  const ensure = (): void => {
    if (disposed) return
    if (host?.isConnected && center?.isConnected) return
    const next = findCenterColumn()
    if (!next) {
      if (host) {
        if (center) teardown(center, host)
        center = null
        host = null
        onHost(null)
      }
      return
    }
    attach(next)
  }

  const schedule = (): void => {
    if (disposed || raf !== 0) return
    raf = requestAnimationFrame(() => {
      raf = 0
      ensure()
    })
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  ensure()

  return () => {
    disposed = true
    observer.disconnect()
    if (raf !== 0) cancelAnimationFrame(raf)
    if (center && host) teardown(center, host)
    center = null
    host = null
    onHost(null)
  }
}
