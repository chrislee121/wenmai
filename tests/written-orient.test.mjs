import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { truncate } from '../dist/orient.js'
import { initVault, writePage } from '../dist/store.js'
import { findWritten } from '../dist/written.js'

async function withTemp(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('findWritten hits compiled pages and sourceRoots filenames', async () => {
  await withTemp(async (dir) => {
    const vault = path.join(dir, 'vault')
    const sources = path.join(dir, 'drafts')
    await mkdir(sources, { recursive: true })
    await initVault(vault, 'writing')
    await writeFile(
      path.join(sources, 'local-web-ui-three-steps.md'),
      '# Local Web UI\n\nThree steps to open.\n',
    )
    await writePage(
      vault,
      'concepts/deepseek-harness.md',
      `---
title: DeepSeek Harness
type: concept
---

DeepSeek Harness 本地 Web UI。
`,
    )
    const hits = await findWritten(vault, [sources], 'Web UI')
    assert.equal(hits.some((hit) => hit.kind === 'page'), true)
    assert.equal(hits.some((hit) => hit.kind === 'source' && hit.path.includes('local-web-ui')), true)
  })
})

test('orient truncate appends a marker when over budget', () => {
  const text = truncate('abcdefghijabcdefghij', 12)
  assert.match(text, /截断/)
  assert.equal(truncate('short', 100), 'short')
})
