import { findConversationRoot } from './layout.js'

function isComposer(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'search' || el.type === '')) return true
  if (el.getAttribute('contenteditable') === 'true') return true
  if (el.getAttribute('role') === 'textbox') return true
  return false
}

export function findComposer(root: ParentNode | null | undefined): HTMLElement | null {
  if (!root) return null
  const nodes = root.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"]')
  for (const node of nodes) {
    if (isComposer(node) && elIsVisible(elOf(node))) return elOf(node)
  }
  return null
}

function elOf(node: Element): HTMLElement {
  return node as HTMLElement
}

function elIsVisible(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement && el.disabled) return false
  if (el instanceof HTMLTextAreaElement && el.disabled) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  return true
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function writeDraft(el: HTMLElement, text: string): boolean {
  el.focus()
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    setNativeValue(el, text)
    return el.value === text || el.value.includes(text)
  }
  try {
    const selected = document.execCommand('selectAll', false)
    const inserted = document.execCommand('insertText', false, text)
    if (selected && inserted) return true
  } catch {
    // fall through
  }
  el.textContent = text
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }))
  return (el.innerText ?? el.textContent ?? '').includes(text)
}

export function fillConversationDraft(text: string): boolean {
  if (typeof document === 'undefined' || !text.trim()) return false
  const scoped = findComposer(findConversationRoot())
  const el = scoped ?? findComposer(document.body)
  if (!el) return false
  return writeDraft(el, text)
}

export async function fillOrCopyDraft(text: string): Promise<'filled' | 'copied' | 'failed'> {
  if (fillConversationDraft(text)) return 'filled'
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
