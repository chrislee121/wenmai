export const WENMAI_API_PREFIX = '/api/wenmai'

export type UiOpName =
  | 'status'
  | 'written'
  | 'init'
  | 'ingest-preview'
  | 'ingest-confirm'
  | 'source-add'
  | 'tasks'
  | 'research'

export interface UiRequestBody {
  op?: string
  query?: string
  dir?: string
  kind?: string
  domain?: string
  workspace?: string
  taskOp?: string
  id?: string
  snoozeDays?: number
}
