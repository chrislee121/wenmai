import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ingestText, initVault, writePage } from '../dist/store.js'
import { reviewVault } from '../dist/review/index.js'
import { refactorVault } from '../dist/refactor/index.js'
import { checkWritten } from '../dist/written.js'
import { searchVault } from '../dist/search.js'
import { assertLosslessJson } from './helpers/lossless-json.mjs'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-refactor-'))
  try {
    await initVault(dir, 'AI tools')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function page(title, extra = '') {
  return `---
title: ${title}
updated: 2026-08-20
type: concept
---

# ${title}

${extra}
`
}

test('refactor refuses raw/ paths', async () => {
  await withVault(async (dir) => {
    await ingestText(dir, { title: 'notes', body: '# notes\n' })
    await assert.rejects(
      () => refactorVault(dir, { op: 'archive', source: 'raw/workspace/notes.md', dryRun: true }),
      /raw/,
    )
  })
})

test('rename dry-run lists inbound links and apply rewrites them without touching raw', async () => {
  await withVault(async (dir) => {
    const ingested = await ingestText(dir, { title: 'MCP notes', body: '# MCP\noriginal\n' })
    await writePage(
      dir,
      'concepts/mcp.md',
      page('MCP', 'See also.\n\nsources stay.\n'),
      { updateIndex: true },
    )
    await writePage(
      dir,
      'concepts/tools.md',
      page('Tools', 'Uses [[mcp]].\n'),
      { updateIndex: true },
    )
    const dry = await refactorVault(dir, { op: 'rename', source: 'concepts/mcp.md', target: 'mcp-protocol', dryRun: true })
    assert.equal(dry.dryRun, true)
    assert.equal(dry.applied, false)
    assert.equal(dry.inbound.some((item) => item.from === 'concepts/tools.md' && item.newLink === 'mcp-protocol'), true)
    assertLosslessJson(dry)

    const applied = await refactorVault(dir, { op: 'rename', source: 'concepts/mcp.md', target: 'mcp-protocol', dryRun: false })
    assert.equal(applied.applied, true)
    const tools = await readFile(path.join(dir, 'concepts/tools.md'), 'utf8')
    assert.match(tools, /\[\[mcp-protocol\]\]/)
    const index = await readFile(path.join(dir, 'index.md'), 'utf8')
    assert.match(index, /\[\[mcp-protocol\]\]/)
    const raw = await readFile(path.join(dir, ingested.rawPath), 'utf8')
    assert.match(raw, /original/)
    await assert.rejects(() => readFile(path.join(dir, 'concepts/mcp.md'), 'utf8'))
  })
})

test('undo restores the previous compiled pages', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/alpha.md', page('Alpha', 'Hello.\n'), { updateIndex: true })
    await refactorVault(dir, { op: 'rename', source: 'concepts/alpha.md', title: 'Alpha Two', target: 'alpha-two', dryRun: false })
    const undone = await refactorVault(dir, { undo: true })
    assert.equal(undone.undone, true)
    const text = await readFile(path.join(dir, 'concepts/alpha.md'), 'utf8')
    assert.match(text, /title: Alpha/)
    await assert.rejects(() => readFile(path.join(dir, 'concepts/alpha-two.md'), 'utf8'))
  })
})

test('archive is skipped by written and search', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/old-topic.md', page('Old Topic', 'unique-archive-token 归档稿\n'), { updateIndex: true })
    const before = await checkWritten(dir, [], 'Old Topic')
    assert.equal(before.verdict, 'DUPLICATE')
    await refactorVault(dir, { op: 'archive', source: 'concepts/old-topic.md', dryRun: false })
    const after = await checkWritten(dir, [], 'Old Topic')
    assert.equal(after.verdict, 'NEW')
    const hits = await searchVault(dir, 'unique-archive-token')
    assert.equal(hits.some((hit) => hit.path === 'concepts/old-topic.md'), false)
  })
})

test('link adds a wikilink once', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/a.md', page('A', 'Body A.\n'), { updateIndex: true })
    await writePage(dir, 'concepts/b.md', page('B', 'Body B.\n'), { updateIndex: true })
    const first = await refactorVault(dir, { op: 'link', source: 'concepts/a.md', target: 'concepts/b.md', dryRun: false })
    assert.equal(first.applied, true)
    const second = await refactorVault(dir, { op: 'link', source: 'concepts/a.md', target: 'b', dryRun: false })
    assert.equal(second.applied, false)
    const text = await readFile(path.join(dir, 'concepts/a.md'), 'utf8')
    assert.equal([...text.matchAll(/\[\[b\]\]/g)].length, 1)
  })
})

test('merge archives the source and can ack a duplicate finding', async () => {
  await withVault(async (dir) => {
    const body = `MCP 把工具接到模型。本地优先，不把成稿上传到云端。协议本身只解决连接，不解决长期记忆。
重复这一段是为了让词法 n-gram 有足够重叠：工具、协议、本地、成稿、上传、云端、连接、记忆。`
    await writePage(dir, 'concepts/mcp-a.md', page('MCP 工具协议', body), { updateIndex: true })
    await writePage(dir, 'concepts/mcp-b.md', page('MCP 工具协议副本', body), { updateIndex: true })
    const review = await reviewVault(dir)
    const dup = review.findings.find((item) => item.kind === 'duplicate')
    assert.ok(dup)
    const merged = await refactorVault(dir, {
      op: 'merge',
      source: 'concepts/mcp-b.md',
      target: 'concepts/mcp-a.md',
      dryRun: false,
      finding: dup.id,
    })
    assert.equal(merged.applied, true)
    assert.equal(merged.findingAcked, dup.id)
    const source = await readFile(path.join(dir, 'concepts/mcp-b.md'), 'utf8')
    assert.match(source, /archived: true/)
    const later = await reviewVault(dir)
    assert.equal(later.findings.some((item) => item.id === dup.id), false)
  })
})

test('split requires both bodies and rewrite is dry-run by default', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/long.md', page('Long', '## One\n\nA.\n\n## Two\n\nB.\n'), { updateIndex: true })
    await assert.rejects(
      () => refactorVault(dir, { op: 'split', source: 'concepts/long.md', target: 'concepts/two.md', content: 'only-left', dryRun: true }),
      /contentB/,
    )
    const split = await refactorVault(dir, {
      op: 'split',
      source: 'concepts/long.md',
      target: 'concepts/two.md',
      title: 'Two',
      content: page('Long', '## One\n\nA.\n'),
      contentB: page('Two', '## Two\n\nB.\n'),
      dryRun: false,
    })
    assert.equal(split.applied, true)
    const two = await readFile(path.join(dir, 'concepts/two.md'), 'utf8')
    assert.match(two, /\[\[long\]\]/)
    const dryRewrite = await refactorVault(dir, { op: 'rewrite', source: 'concepts/long.md', content: page('Long', 'rewritten-token\n') })
    assert.equal(dryRewrite.dryRun, true)
    const original = await readFile(path.join(dir, 'concepts/long.md'), 'utf8')
    assert.equal(original.includes('rewritten-token'), false)
    await refactorVault(dir, {
      op: 'rewrite',
      source: 'concepts/long.md',
      content: page('Long', 'rewritten-token\n'),
      dryRun: false,
    })
    const rewritten = await readFile(path.join(dir, 'concepts/long.md'), 'utf8')
    assert.match(rewritten, /rewritten-token/)
  })
})

test('move updates type and index section', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/acme.md', page('Acme', 'A company.\n'), { updateIndex: true })
    const moved = await refactorVault(dir, { op: 'move', source: 'concepts/acme.md', target: 'entities', dryRun: false })
    assert.equal(moved.applied, true)
    const text = await readFile(path.join(dir, 'entities/acme.md'), 'utf8')
    assert.match(text, /type: entity/)
    const index = await readFile(path.join(dir, 'index.md'), 'utf8')
    assert.match(index, /## Entities[\s\S]*\[\[acme\]\]/)
  })
})
