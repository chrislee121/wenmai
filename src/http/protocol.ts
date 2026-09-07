export const WENMAI_API_PREFIX = '/api/wenmai'

export type UiOpName = 'status' | 'written' | 'ingest-confirm' | 'tasks'

export interface UiRequestBody {
  op?: string
  query?: string
  dir?: string
  kind?: string
  workspace?: string
  taskOp?: string
  id?: string
  snoozeDays?: number
}
