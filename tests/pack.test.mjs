import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { builtinPack, loadVaultPack, PACK_FILE } from '../dist/pack/index.js'
import { initVault } from '../dist/store.js'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-pack-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('init writes writer pack.json', async () => {
  await withVault(async (dir) => {
    const created = await initVault(dir, 'AI tools')
    assert.equal(created.pack, 'writer')
    const saved = JSON.parse(await readFile(path.join(dir, PACK_FILE), 'utf8'))
    assert.equal(saved.id, 'writer')
    assert.ok(saved.pageDirs.includes('concepts'))
    const loaded = await loadVaultPack(dir)
    assert.equal(loaded.id, 'writer')
  })
})

test('vaults without pack.json fall back to writer', async () => {
  await withVault(async (dir) => {
    await initVault(dir, 'AI tools')
    await unlink(path.join(dir, PACK_FILE))
    const loaded = await loadVaultPack(dir)
    assert.equal(loaded.id, 'writer')
    assert.ok(loaded.rawKinds.includes('articles'))
  })
})

test('unknown pack id is rejected', () => {
  assert.throws(() => builtinPack('lawyer'), /unknown pack/)
})
