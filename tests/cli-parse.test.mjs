import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCliArgv } from '../dist/cli/parse.js'

test('parseCliArgv maps written query and global root', () => {
  const parsed = parseCliArgv(['node', 'wenmai', '--root', '/tmp/vault', 'written', 'DeepSeek', 'Harness'])
  assert.equal(parsed.op, 'written')
  assert.equal(parsed.root, '/tmp/vault')
  assert.equal(parsed.input.query, 'DeepSeek Harness')
})

test('parseCliArgv ingest stays dry-run unless --write', () => {
  const preview = parseCliArgv(['node', 'wenmai', 'ingest', '--dir', '/tmp/drafts'])
  assert.equal(parsedDry(preview), true)
  const write = parseCliArgv(['node', 'wenmai', 'ingest', '--dir', '/tmp/drafts', '--write'])
  assert.equal(write.input.dryRun, false)
})

function parsedDry(parsed) {
  return parsed.input.dryRun !== false
}

test('parseCliArgv mcp is a shell, not an op', () => {
  const parsed = parseCliArgv(['node', 'wenmai', 'mcp', '--root', '/tmp/vault'])
  assert.equal(parsed.mcp, true)
  assert.equal(parsed.op, undefined)
})
