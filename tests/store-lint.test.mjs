import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ingestText, initVault, writePage } from '../dist/store.js'
import { lintVault } from '../dist/lint.js'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-'))
  try {
    await initVault(dir, 'AI tools')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('init creates schema index log and directories', async () => {
  await withVault(async (dir) => {
    const schema = await readFile(path.join(dir, 'SCHEMA.md'), 'utf8')
    assert.match(schema, /AI tools/)
    const index = await readFile(path.join(dir, 'index.md'), 'utf8')
    assert.match(index, /## Concepts/)
  })
})

test('ingest copies raw once and dedupes by sha256', async () => {
  await withVault(async (dir) => {
    const first = await ingestText(dir, { title: 'DeepSeek Harness', body: '# Hello\n\nbody\n' })
    const second = await ingestText(dir, { title: 'DeepSeek Harness copy', body: '# Hello\n\nbody\n' })
    assert.equal(first.deduped, false)
    assert.equal(second.deduped, true)
    assert.equal(first.sha256, second.sha256)
    assert.equal(first.rawPath, 'raw/articles/deepseek-harness.md')
  })
})

test('write refuses raw/ and can update index', async () => {
  await withVault(async (dir) => {
    await assert.rejects(
      () => writePage(dir, 'raw/articles/x.md', 'nope'),
      /raw/,
    )
    const page = `---
title: DeepSeek Harness
created: 2026-08-20
updated: 2026-08-20
type: concept
tags: [product]
sources: [raw/articles/deepseek-harness.md]
---

# DeepSeek Harness

Local agent harness. See [[claude-code]].
`
    await writePage(dir, 'concepts/deepseek-harness.md', page, { log: 'write | deepseek-harness', updateIndex: true })
    const index = await readFile(path.join(dir, 'index.md'), 'utf8')
    assert.match(index, /\[\[deepseek-harness\]\]/)
    const log = await readFile(path.join(dir, 'log.md'), 'utf8')
    assert.match(log, /write \| deepseek-harness/)
  })
})

test('lint reports missing frontmatter, orphans, broken links, and hash drift', async () => {
  await withVault(async (dir) => {
    await writeFile(path.join(dir, 'concepts', 'orphan.md'), '# No frontmatter\n\nSee [[missing-page]].\n')
    await writeFile(
      path.join(dir, 'raw', 'articles', 'drift.md'),
      `---
ingested: 2026-08-20
sha256: deadbeef
---

changed body
`,
    )
    const report = await lintVault(dir)
    const codes = report.diagnostics.map((item) => item.code)
    assert.equal(codes.includes('frontmatter-missing'), true)
    assert.equal(codes.includes('orphan-page'), true)
    assert.equal(codes.includes('broken-wikilink'), true)
    assert.equal(codes.includes('raw-hash-drift'), true)
  })
})
