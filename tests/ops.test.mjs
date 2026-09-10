import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runOp } from '../dist/ops/index.js'
import { initVault } from '../dist/store.js'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-ops-'))
  try {
    await initVault(dir, 'ops')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function runtime(root, pluginRoots = []) {
  return {
    root,
    pluginRoots,
    ingestAdapters: false,
    research: false,
    refreshOrient: async () => {},
  }
}

test('runOp status and written share the same entry', async () => {
  await withVault(async (root) => {
    const report = await runOp(runtime(root), { op: 'status' })
    assert.equal(report.ok, true)
    assert.equal(report.initialized, true)
    const written = await runOp(runtime(root), { op: 'written', query: '不存在的选题xyz' })
    assert.equal(written.ok, true)
    assert.equal(written.verdict, 'NEW')
  })
})

test('runOp ingest dir defaults to dry-run', async () => {
  await withVault(async (root) => {
    const drafts = path.join(root, 'drafts')
    await mkdir(drafts)
    await writeFile(path.join(drafts, 'alpha.md'), '# Alpha\n\nbody\n')
    const preview = await runOp(runtime(root, [drafts]), {
      op: 'ingest',
      dir: drafts,
      workspace: drafts,
    })
    assert.equal(preview.ok, true)
    assert.equal(preview.dryRun, true)
    assert.equal(preview.planned, 1)
    const rawDir = path.join(root, 'raw', 'workspace')
    let rawCount = 0
    try {
      rawCount = (await readdir(rawDir)).length
    } catch {
      rawCount = 0
    }
    assert.equal(rawCount, 0)
  })
})

test('runOp rejects unknown op', async () => {
  await withVault(async (root) => {
    await assert.rejects(() => runOp(runtime(root), { op: 'explode' }), /unknown op/)
  })
})
