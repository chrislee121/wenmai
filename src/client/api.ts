import { WENMAI_API_PREFIX, type UiRequestBody } from '../http/protocol.js'

export async function wenmaiApi(body: UiRequestBody): Promise<unknown> {
  const response = await fetch(WENMAI_API_PREFIX, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const parsed: unknown = await response.json().catch(() => null)
  if (parsed) return parsed
  return { ok: false, error: `http ${response.status}` }
}
