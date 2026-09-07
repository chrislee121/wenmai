/**
 * Design read: Harness 里的写作者伴侣面板，给自己要动笔的人看。
 * 编辑台/纸稿，不是驾驶舱。VARIANCE 5 / MOTION 2 / DENSITY 4。
 * 字跟宿主；点缀只用 logo 墨青与暖赭。禁止紫渐变、玻璃拟态、统计条。
 */
export const WENMAI_CSS = `
.wenmai-card {
  --wenmai-ink: #3aa6a1;
  --wenmai-rust: #d36a4a;
  font: inherit;
  color: var(--dsw-alias-fg-default, inherit);
  display: grid;
  gap: 10px;
  padding: 12px 14px 14px;
  border: 1px solid var(--dsw-alias-stroke-default, color-mix(in srgb, currentColor 14%, transparent));
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-bg-default, transparent) 88%, transparent);
  animation: wenmai-in 160ms ease-out;
}
@keyframes wenmai-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .wenmai-card { animation: none; }
}
.wenmai-kicker {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dsw-alias-fg-muted, color-mix(in srgb, currentColor 55%, transparent));
}
.wenmai-verdict {
  font-size: 22px;
  line-height: 1.2;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.wenmai-card[data-tone="new"] .wenmai-verdict { color: var(--wenmai-ink); }
.wenmai-card[data-tone="review"] .wenmai-verdict { color: var(--dsw-alias-state-warn-label, #c9a227); }
.wenmai-card[data-tone="duplicate"] .wenmai-verdict { color: var(--wenmai-rust); }
.wenmai-reason,
.wenmai-meta {
  font-size: 13px;
  line-height: 1.55;
  color: var(--dsw-alias-fg-secondary, color-mix(in srgb, currentColor 78%, transparent));
}
.wenmai-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.wenmai-item {
  display: grid;
  gap: 2px;
  padding: 8px 0 0;
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}
.wenmai-item-title {
  font-size: 13px;
  font-weight: 600;
}
.wenmai-item-path,
.wenmai-item-snip {
  font-size: 12px;
  line-height: 1.45;
  color: var(--dsw-alias-fg-muted, color-mix(in srgb, currentColor 58%, transparent));
}
.wenmai-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.wenmai-btn {
  appearance: none;
  font: inherit;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.wenmai-btn[data-primary="true"] {
  background: color-mix(in srgb, var(--wenmai-ink) 18%, transparent);
  border-color: color-mix(in srgb, var(--wenmai-ink) 45%, transparent);
}
.wenmai-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.wenmai-tab {
  height: 100%;
  overflow: auto;
  padding: 20px 22px 32px;
  display: grid;
  gap: 16px;
  align-content: start;
}
.wenmai-tab-head {
  display: grid;
  gap: 4px;
}
.wenmai-tab-title {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.wenmai-search {
  display: flex;
  gap: 8px;
}
.wenmai-search input {
  flex: 1;
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  background: transparent;
  color: inherit;
}
.wenmai-empty {
  font-size: 13px;
  color: var(--dsw-alias-fg-muted, color-mix(in srgb, currentColor 58%, transparent));
}
`

export function installWenmaiStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const id = 'wenmai-ui-css'
  if (document.getElementById(id)) return () => {}
  const el = document.createElement('style')
  el.id = id
  el.textContent = WENMAI_CSS
  document.head.append(el)
  return () => {
    el.remove()
  }
}
