import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { handleUiRequest } from '../dist/http/handle.js'
import { initVault } from '../dist/store.js'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-ui-'))
  try {
    await initVault(dir, 'ui handle')
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
    refreshOrient: async () => {},
  }
}

test('ui handle status and written reuse store functions', async () => {
  await withVault(async (root) => {
    const report = await handleUiRequest(runtime(root), { op: 'status' })
    assert.equal(report.ok, true)
    assert.equal(report.initialized, true)
    const written = await handleUiRequest(runtime(root), { op: 'written', query: '不存在的选题xyz' })
    assert.equal(written.ok, true)
    assert.equal(written.verdict, 'NEW')
  })
})

test('ui handle ingest-confirm writes raw/ after a listed directory', async () => {
  await withVault(async (root) => {
    const drafts = path.join(root, 'drafts')
    await mkdir(drafts)
    await writeFile(path.join(drafts, 'alpha.md'), '# Alpha\n\nbody\n')
    const result = await handleUiRequest(runtime(root, [drafts]), {
      op: 'ingest-confirm',
      dir: drafts,
      kind: 'workspace',
      workspace: drafts,
    })
    assert.equal(result.ok, true)
    assert.equal(result.dryRun, false)
    assert.equal(result.ingested, 1)
  })
})

test('ui handle ingest-preview lists files without writing raw/', async () => {
  await withVault(async (root) => {
    const drafts = path.join(root, 'drafts')
    await mkdir(drafts)
    await writeFile(path.join(drafts, 'alpha.md'), '# Alpha\n\nbody\n')
    const preview = await handleUiRequest(runtime(root, [drafts]), {
      op: 'ingest-preview',
      dir: drafts,
      workspace: drafts,
    })
    assert.equal(preview.ok, true)
    assert.equal(preview.dryRun, true)
    assert.equal(preview.planned, 1)
    assert.equal(preview.ingested, 0)
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

test('ui handle ingest-preview adopts a path outside the workspace', async () => {
  await withVault(async (root) => {
    const drafts = await mkdtemp(path.join(os.tmpdir(), 'wenmai-ui-drafts-'))
    try {
      await writeFile(path.join(drafts, 'beta.md'), '# Beta\n\nbody\n')
      const preview = await handleUiRequest(runtime(root), {
        op: 'ingest-preview',
        dir: drafts,
        workspace: root,
      })
      assert.equal(preview.ok, true)
      assert.equal(preview.dryRun, true)
      assert.equal(preview.planned, 1)
      const saved = JSON.parse(await readFile(path.join(root, 'source-roots.json'), 'utf8'))
      assert.equal(saved.sourceRoots.includes(drafts), true)
    } finally {
      await rm(drafts, { recursive: true, force: true })
    }
  })
})

test('ui handle init creates SCHEMA on an empty vault', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-ui-init-'))
  try {
    const created = await handleUiRequest(runtime(dir), { op: 'init' })
    assert.equal(created.ok, true)
    assert.equal(created.initialized, true)
    const schema = await readFile(path.join(dir, 'SCHEMA.md'), 'utf8')
    assert.match(schema, /文章、脚本、文案与工作文档/)
    const again = await handleUiRequest(runtime(dir), { op: 'init', domain: '忽略这次' })
    assert.equal(again.ok, true)
    assert.equal(again.initialized, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('ui handle rejects unknown ops and home ingest', async () => {
  await withVault(async (root) => {
    const unknown = await handleUiRequest(runtime(root), { op: 'explode' })
    assert.equal(unknown.ok, false)
    const blocked = await handleUiRequest(runtime(root), { op: 'ingest-confirm', dir: os.homedir() })
    assert.equal(blocked.ok, false)
    const addHome = await handleUiRequest(runtime(root), { op: 'source-add', dir: os.homedir() })
    assert.equal(addHome.ok, false)
    const previewHome = await handleUiRequest(runtime(root), { op: 'ingest-preview', dir: os.homedir() })
    assert.equal(previewHome.ok, false)
  })
})
