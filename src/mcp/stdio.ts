import type { Readable, Writable } from 'node:stream'
import { parametersSchema } from '../tool-def.js'
import { toolByName, WENMAI_TOOLS } from '../ops/catalog.js'
import { inputFromToolArgs } from '../ops/input.js'
import { runOp, type OpsRuntime } from '../ops/index.js'

type JsonRpc = {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: unknown
}

export function frameMcp(message: unknown): string {
  const body = JSON.stringify(message)
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
}

function toolText(value: unknown, isError = false): { content: { type: 'text'; text: string }[]; isError?: boolean } {
  const payload = { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
  return isError ? { ...payload, isError: true } : payload
}

export async function handleMcpMessage(
  runtime: OpsRuntime,
  version: string,
  raw: string,
  workspace?: string,
): Promise<{ jsonrpc: '2.0'; id: number | string | null; result?: unknown; error?: { code: number; message: string } } | null> {
  let message: JsonRpc
  try {
    message = JSON.parse(raw) as JsonRpc
  } catch {
    return null
  }
  const method = typeof message.method === 'string' ? message.method : ''
  const id = message.id ?? null
  const notification = message.id === undefined
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'wenmai', version },
        instructions:
          '文脉是文字工作者的选题防撞。其他 Agent 把文脉当知识层时，第一件事仍是 wenmai_written，禁止凭记忆回答「写过没有」。不改 raw/，不扫家目录，不抓网页。',
      },
    }
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null
  if (method === 'ping') {
    return notification ? null : { jsonrpc: '2.0', id, result: {} }
  }
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: WENMAI_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: parametersSchema(tool.parameters),
        })),
      },
    }
  }
  if (method === 'tools/call') {
    const params = message.params && typeof message.params === 'object' ? (message.params as Record<string, unknown>) : {}
    const name = typeof params.name === 'string' ? params.name : ''
    const tool = toolByName(name)
    if (!tool) {
      return { jsonrpc: '2.0', id, result: toolText({ ok: false, error: `unknown tool: ${name}` }, true) }
    }
    const args =
      params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, string | number | boolean | undefined>)
        : {}
    try {
      const result = await runOp(runtime, inputFromToolArgs(tool.op, args, workspace))
      const failed = result && typeof result === 'object' && 'ok' in result && (result as { ok: unknown }).ok === false
      return { jsonrpc: '2.0', id, result: toolText(result, failed === true) }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        result: toolText({ ok: false, error: error instanceof Error ? error.message : String(error) }, true),
      }
    }
  }
  if (!notification && method) {
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
  }
  return null
}

export function serveMcp(
  runtime: OpsRuntime,
  version: string,
  workspace?: string,
  streams?: { stdin: Readable; stdout: Writable },
): Promise<void> {
  const input = streams?.stdin ?? process.stdin
  const output = streams?.stdout ?? process.stdout
  let buffer = Buffer.alloc(0)
  let needed: number | null = null
  let chain = Promise.resolve()

  const write = (message: unknown): void => {
    output.write(frameMcp(message))
  }

  const consume = (raw: string): void => {
    chain = chain.then(async () => {
      const reply = await handleMcpMessage(runtime, version, raw, workspace)
      if (reply) write(reply)
    })
  }

  return new Promise((resolve, reject) => {
    input.on('error', reject)
    input.on('end', () => {
      void chain.then(() => resolve())
    })
    input.on('data', (chunk: Buffer | string) => {
      buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
      while (true) {
        if (needed === null) {
          const crlf = buffer.indexOf('\r\n\r\n')
          const lf = buffer.indexOf('\n\n')
          const headerEnd = crlf >= 0 ? crlf : lf
          if (headerEnd < 0) break
          const sep = crlf >= 0 ? 4 : 2
          const header = buffer.subarray(0, headerEnd).toString('utf8')
          const match = /Content-Length:\s*(\d+)/i.exec(header)
          if (!match) {
            buffer = buffer.subarray(headerEnd + sep)
            continue
          }
          needed = Number(match[1])
          buffer = buffer.subarray(headerEnd + sep)
        }
        if (needed !== null && buffer.length >= needed) {
          const body = buffer.subarray(0, needed).toString('utf8')
          buffer = buffer.subarray(needed)
          needed = null
          consume(body)
          continue
        }
        break
      }
    })
    if (input === process.stdin && typeof input.resume === 'function') input.resume()
  })
}
