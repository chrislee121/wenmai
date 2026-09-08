/** 中间栏文脉面板的宽度约定。单位 px。 */

export const WENMAI_PANE_MIN = 280
export const WENMAI_PANE_MAX = 460
export const WENMAI_PANE_DEFAULT = 360
export const WENMAI_PANE_RAIL = 44
export const WENMAI_CHAT_MIN = 400

export function resolvePaneTrack(centerWidth: number, preferred: number, open: boolean): number {
  if (!open) return WENMAI_PANE_RAIL
  const chatFloor = centerWidth < 720 ? 240 : WENMAI_CHAT_MIN
  const max = Math.min(WENMAI_PANE_MAX, centerWidth - chatFloor)
  if (max < 180) return WENMAI_PANE_RAIL
  const min = Math.min(WENMAI_PANE_MIN, max)
  const wanted = Number.isFinite(preferred) && preferred > 0 ? preferred : WENMAI_PANE_DEFAULT
  return Math.round(Math.min(max, Math.max(min, wanted)))
}

export function paneIsCollapsed(track: number): boolean {
  return track <= WENMAI_PANE_RAIL
}
