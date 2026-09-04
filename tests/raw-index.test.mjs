import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { findRawByHash, RAW_HASH_FILE } from '../dist/raw-index.js'
import { ingestText, initVault } from '../dist/store.js'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-hash-'))
  try {
    await initVault(dir, 'AI tools')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('ingest writes sha256 index and reuses it for dedupe', async () => {
  await withVault(async (dir) => {
    const first = await ingestText(dir, { title: 'Hash Index', body: '# Hello\n\nbody\n' })
    const saved = JSON.parse(await readFile(path.join(dir, RAW_HASH_FILE), 'utf8'))
    assert.equal(saved.version, 1)
    assert.equal(saved.byHash[first.sha256], first.rawPath)
    const second = await ingestText(dir, { title: 'Hash Index copy', body: '# Hello\n\nbody\n' })
    assert.equal(second.deduped, true)
    assert.equal(second.rawPath, first.rawPath)
  })
})

test('stale or missing index still finds the raw file and rebuilds', async () => {
  await withVault(async (dir) => {
    const first = await ingestText(dir, { title: 'Rebuild Me', body: '# Rebuild\n\nbody\n' })
    await writeFile(
      path.join(dir, RAW_HASH_FILE),
      `${JSON.stringify({ version: 1, byHash: { [first.sha256]: 'raw/articles/missing.md' } }, null, 2)}\n`,
      'utf8',
    )
    assert.equal(await findRawByHash(dir, first.sha256), first.rawPath)
    const rebuilt = JSON.parse(await readFile(path.join(dir, RAW_HASH_FILE), 'utf8'))
    assert.equal(rebuilt.byHash[first.sha256], first.rawPath)

    await unlink(path.join(dir, RAW_HASH_FILE))
    const again = await ingestText(dir, { title: 'Rebuild Me again', body: '# Rebuild\n\nbody\n' })
    assert.equal(again.deduped, true)
    const restored = JSON.parse(await readFile(path.join(dir, RAW_HASH_FILE), 'utf8'))
    assert.equal(restored.byHash[first.sha256], first.rawPath)
  })
})
