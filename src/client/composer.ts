import { findConversationRoot } from './layout.js'

function isWenmaiUi(el: HTMLElement): boolean {
  return Boolean(el.closest('.wenmai-tab, .wenmai-card, .wenmai-dock, .wenmai-pane, .wenmai-search, .wenmai-inline-form'))
}

function elIsVisible(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement && el.disabled) return false
  if (el instanceof HTMLTextAreaElement && el.disabled) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  const box = el.getBoundingClientRect()
  return box.width > 0 && box.height > 0
}

function collectComposers(root: ParentNode): HTMLElement[] {
  const acc: HTMLElement[] = []
  const walk = (node: ParentNode): void => {
    const matches = node.querySelectorAll('textarea, [contenteditable="true"]')
    for (const item of matches) {
      if (!(item instanceof HTMLElement) || isWenmaiUi(item) || !elIsVisible(item)) continue
      if (item instanceof HTMLTextAreaElement) {
        acc.push(item)
        continue
      }
      if (item.getAttribute('contenteditable') !== 'true') continue
      const box = item.getBoundingClientRect()
      if (box.width < 160 || box.height < 36) continue
      acc.push(item)
    }
    for (const item of node.querySelectorAll('*')) {
      if (item instanceof HTMLElement && item.shadowRoot) walk(item.shadowRoot)
    }
  }
  walk(root)
  return acc
}

export function findComposer(root: ParentNode | null | undefined): HTMLElement | null {
  if (!root) return null
  const found = collectComposers(root)
  if (found.length === 0) return null
  found.sort((left, right) => {
    const a = left.getBoundingClientRect()
    const b = right.getBoundingClientRect()
    return b.width * b.height - a.width * a.height
  })
  return found[0] ?? null
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function visibleText(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function writeDraft(el: HTMLElement, text: string): boolean {
  const wanted = text.replace(/\s+/g, ' ').trim()
  if (!wanted) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.focus()
    setNativeValue(el, text)
    return el.value.includes(text)
  }
  if (visibleText(el) === wanted) return true
  el.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(el)
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.execCommand('insertText', false, text)
  const after = visibleText(el)
  const copies = after.split(wanted).length - 1
  return copies === 1
}

function draftLanded(text: string): boolean {
  const wanted = text.replace(/\s+/g, ' ').trim()
  if (!wanted) return false
  const roots = [findConversationRoot(), typeof document === 'undefined' ? null : document.body]
  for (const root of roots) {
    if (!root) continue
    for (const node of collectComposers(root)) {
      const copies = visibleText(node).split(wanted).length - 1
      if (copies === 1) return true
    }
  }
  return false
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

export async function fillConversationDraft(text: string): Promise<boolean> {
  if (typeof document === 'undefined' || !text.trim()) return false
  const scoped = findComposer(findConversationRoot())
  const el = scoped ?? findComposer(document.body)
  if (el) writeDraft(el, text)
  if (draftLanded(text)) return true
  await waitFrame()
  if (draftLanded(text)) return true
  await new Promise((resolve) => setTimeout(resolve, 50))
  return draftLanded(text)
}

export async function fillOrCopyDraft(text: string): Promise<'filled' | 'copied' | 'failed'> {
  if (await fillConversationDraft(text)) return 'filled'
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    return 'failed'
  }
  return 'failed'
}
