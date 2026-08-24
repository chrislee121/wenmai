import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ingestDirectory } from '../dist/ingest-dir.js'
import { PathEscapeError } from '../dist/paths.js'
import { MAX_SOURCE_BYTES } from '../dist/scan.js'
import { initVault } from '../dist/store.js'

async function withVault(run) {
  const dir = await mkdtempSafe()
  try {
    await initVault(dir, 'batch ingest')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function mkdtempSafe() {
  const { mkdtemp } = await import('node:fs/promises')
  return mkdtemp(path.join(os.tmpdir(), 'wenmai-'))
}

test('directory ingest dry-run lists markdown and skips CLAUDE.md / oversized files', async () => {
  await withVault(async (vault) => {
    const sources = path.join(vault, 'drafts')
    await mkdir(sources)
    await writeFile(path.join(sources, 'one.md'), '# One\n\nhello\n')
    await writeFile(path.join(sources, 'two.md'), '---\ntitle: Two Title\n---\n\nbody\n')
    await writeFile(path.join(sources, 'CLAUDE.md'), '# skip me\n')
    await writeFile(path.join(sources, 'notes.txt'), 'not markdown\n')
    await writeFile(path.join(sources, 'huge.md'), 'x'.repeat(MAX_SOURCE_BYTES + 1))

    const preview = await ingestDirectory(vault, sources, { allowedRoots: [sources], dryRun: true })
    assert.equal(preview.dryRun, true)
    assert.equal(preview.planned, 2)
    assert.equal(preview.ingested, 0)
    assert.equal(preview.notMarkdownCount, 1)
    assert.ok(preview.skipped.some((item) => item.reason === 'skip-file' && item.path.endsWith('CLAUDE.md')))
    assert.ok(preview.skipped.some((item) => item.reason === 'too-large' && item.path.endsWith('huge.md')))
  })
})

test('directory ingest writes raw/, then rerun is all deduped', async () => {
  await withVault(async (vault) => {
    const sources = path.join(vault, 'drafts')
    await mkdir(sources)
    await writeFile(path.join(sources, 'alpha.md'), '# Alpha\n\nalpha body\n')
    await writeFile(path.join(sources, 'beta.md'), '# Beta\n\nbeta body\n')

    const first = await ingestDirectory(vault, sources, { allowedRoots: [sources], dryRun: false })
    assert.equal(first.dryRun, false)
    assert.equal(first.ingested, 2)
    assert.equal(first.deduped, 0)
    assert.ok(first.files.every((item) => item.rawPath?.startsWith('raw/workspace/')))

    const second = await ingestDirectory(vault, sources, { allowedRoots: [sources], dryRun: false })
    assert.equal(second.ingested, 0)
    assert.equal(second.deduped, 2)
  })
})

test('directory ingest refuses home and paths outside allowed roots', async () => {
  await withVault(async (vault) => {
    const sources = path.join(vault, 'drafts')
    await mkdir(sources)
    await assert.rejects(
      () => ingestDirectory(vault, homedir(), { allowedRoots: [sources], dryRun: true }),
      PathEscapeError,
    )
    await assert.rejects(
      () => ingestDirectory(vault, os.tmpdir(), { allowedRoots: [sources], dryRun: true }),
      PathEscapeError,
    )
  })
})
