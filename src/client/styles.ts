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
.wenmai-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--dsw-alias-fg-muted, color-mix(in srgb, currentColor 55%, transparent));
}
.wenmai-mark {
  width: 16px;
  height: 16px;
  flex: none;
  display: block;
}
.wenmai-brand-name {
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.02em;
}
.wenmai-brand-en {
  letter-spacing: 0.14em;
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
.wenmai-phrases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
.wenmai-phrase {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--wenmai-ink) 35%, transparent);
  color: var(--dsw-alias-fg-secondary, color-mix(in srgb, currentColor 78%, transparent));
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
[data-wenmai-split] {
  display: grid !important;
  grid-template-columns: var(--wenmai-pane-track, 360px) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
}
[data-wenmai-split] > * {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.wenmai-pane-host {
  background: transparent;
}
.wenmai-dock {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base, var(--dsw-alias-bg-default, transparent));
  border-right: 1px solid var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 12%, transparent));
}
.wenmai-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.wenmai-rail {
  appearance: none;
  flex: 1;
  margin: 0;
  border: 0;
  padding: 16px 0;
  writing-mode: vertical-rl;
  letter-spacing: 0.18em;
  font: inherit;
  font-size: 12px;
  color: var(--dsw-alias-fg-muted, color-mix(in srgb, currentColor 58%, transparent));
  background: transparent;
  cursor: pointer;
}
.wenmai-split {
  position: absolute;
  top: 0;
  right: -5px;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  z-index: 1;
  touch-action: none;
}
.wenmai-search,
.wenmai-inline-form,
.wenmai-tab-head {
  position: relative;
  z-index: 2;
}
.wenmai-search .wenmai-btn,
.wenmai-search input,
.wenmai-inline-form .wenmai-btn,
.wenmai-inline-form input {
  pointer-events: auto;
}
.wenmai-tab {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 22px 32px;
  display: grid;
  gap: 16px;
  align-content: start;
}
.wenmai-tab-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.wenmai-tab-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.wenmai-tab-title {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.wenmai-search,
.wenmai-inline-form {
  display: flex;
  gap: 8px;
}
.wenmai-search input,
.wenmai-field {
  flex: 1;
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  background: transparent;
  color: inherit;
}
.wenmai-field {
  width: 100%;
  box-sizing: border-box;
}
.wenmai-search input:disabled {
  opacity: 0.55;
}
.wenmai-empty {
  font-size: 13px;
  color: var(--dsw-alias-fg-muted, color-mix(in srgb, currentColor 58%, transparent));
}
.wenmai-status-foot {
  font-size: 12px;
  line-height: 1.45;
  color: var(--dsw-alias-fg-muted, color-mix(in srgb, currentColor 58%, transparent));
  padding-top: 8px;
}
.wenmai-ingest-result {
  display: grid;
  gap: 10px;
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
