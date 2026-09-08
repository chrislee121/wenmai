import type { IncomingMessage, ServerResponse } from 'node:http'
import type { UiHandleRuntime } from './handle.js'
import { handleUiRequest } from './handle.js'
import { isBrowserSameOrigin, isLoopbackRequest } from './loopback.js'
import { WENMAI_API_PREFIX, type UiRequestBody } from './protocol.js'

export interface WebRoute {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

const BODY_LIMIT = 64 * 1024

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function guard(req: IncomingMessage, res: ServerResponse): boolean {
  if (isBrowserSameOrigin(req) && isLoopbackRequest(req)) return true
  json(res, 403, { ok: false, error: 'forbidden' })
  return false
}

async function readBody(req: IncomingMessage): Promise<UiRequestBody> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT) throw new Error('body-too-large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid body')
  }
  return parsed as UiRequestBody
}

export function makeWenmaiRoutes(runtime: UiHandleRuntime): WebRoute[] {
  const route: WebRoute = {
    kind: 'exact',
    path: WENMAI_API_PREFIX,
    handler: async (req, res) => {
      if (!guard(req, res)) return
      if (req.method === 'GET') {
        json(res, 200, await handleUiRequest(runtime, { op: 'status' }))
        return
      }
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      try {
        const body = await readBody(req)
        const result = await handleUiRequest(runtime, body)
        const failed = result && typeof result === 'object' && 'ok' in result && (result as { ok: unknown }).ok === false
        json(res, failed ? 400 : 200, result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        json(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message })
      }
    },
  }
  return [route]
}
