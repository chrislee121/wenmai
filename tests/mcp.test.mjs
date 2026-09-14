import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { handleMcpMessage } from '../dist/mcp/stdio.js'
import { makeOpsRuntime } from '../dist/ops/runtime.js'
import { initVault } from '../dist/store.js'

test('mcp lists wenmai_written and can call it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wenmai-mcp-'))
  try {
    await initVault(root, 'mcp')
    const runtime = makeOpsRuntime({ root })
    const init = await handleMcpMessage(
      runtime,
      '0.8.0',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      }),
    )
    assert.equal(init.result.serverInfo.name, 'wenmai')
    const listed = await handleMcpMessage(runtime, '0.8.0', JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))
    const names = listed.result.tools.map((item) => item.name)
    assert.equal(names.includes('wenmai_written'), true)
    assert.equal(names.includes('wenmai_status'), true)
    const called = await handleMcpMessage(
      runtime,
      '0.8.0',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'wenmai_written', arguments: { query: '不存在的选题xyz' } },
      }),
    )
    const payload = JSON.parse(called.result.content[0].text)
    assert.equal(payload.ok, true)
    assert.equal(payload.verdict, 'NEW')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
