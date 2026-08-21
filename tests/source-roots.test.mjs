import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  addAgentSourceRoot,
  isTooBroad,
  mergeSourceRoots,
  readAgentSourceRoots,
  sessionWorkspaceCwd,
  writeAgentSourceRoots,
} from '../dist/source-roots.js'

test('session workspace cwd comes from session.header.cwd', () => {
  const cwd = path.join(os.tmpdir(), 'writing-project')
  assert.equal(sessionWorkspaceCwd({ session: { header: { cwd } } }), path.resolve(cwd))
  assert.equal(sessionWorkspaceCwd({ session: { header: { cwd: homedir() } } }), undefined)
  assert.equal(sessionWorkspaceCwd(undefined), undefined)
})

test('merge prefers workspace then plugin then agent extras, unique by path', () => {
  const workspace = path.join(os.tmpdir(), 'ws-a')
  const extra = path.join(os.tmpdir(), 'ws-b')
  const merged = mergeSourceRoots({
    workspace,
    plugin: [extra, workspace],
    agent: [extra],
  })
  assert.deepEqual(
    merged.map((item) => item.origin),
    ['workspace', 'plugin'],
  )
  assert.equal(merged[0].path, path.resolve(workspace))
  assert.equal(merged[1].path, path.resolve(extra))
})

test('agent extras persist in the vault and reject home directory', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tongjian-roots-'))
  try {
    const added = path.join(dir, 'drafts')
    await addAgentSourceRoot(dir, added)
    const saved = await readAgentSourceRoots(dir)
    assert.deepEqual(saved, [path.resolve(added)])
    const raw = await readFile(path.join(dir, 'source-roots.json'), 'utf8')
    assert.match(raw, /sourceRoots/)
    await assert.rejects(() => writeAgentSourceRoots(dir, [homedir()]), /too broad/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('home and filesystem root are too broad', () => {
  assert.equal(isTooBroad(homedir()), true)
  assert.equal(isTooBroad('/'), true)
  assert.equal(isTooBroad(path.join(os.tmpdir(), 'notes')), false)
})
