import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildKnowledgeGraph, filterLocalGraph, mermaidFromGraph, writeGraphHtml } from '../dist/graph.js'
import { initVault, writePage } from '../dist/store.js'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-graph-'))
  try {
    await initVault(dir, 'writing')
    await writePage(
      dir,
      'concepts/alpha.md',
      `---
title: Alpha
type: concept
tags: [topic]
sources: [raw/articles/a.md]
---

See [[beta]].
`,
    )
    await writePage(
      dir,
      'concepts/beta.md',
      `---
title: Beta
type: concept
tags: [topic]
---

Back to [[alpha]] and missing [[gamma]].
`,
    )
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('buildKnowledgeGraph links pages, tags, sources, and missing wikilinks', async () => {
  await withVault(async (dir) => {
    const graph = await buildKnowledgeGraph(dir)
    const ids = graph.nodes.map((node) => node.id)
    assert.equal(ids.includes('alpha'), true)
    assert.equal(ids.includes('beta'), true)
    assert.equal(ids.includes('gamma'), true)
    assert.equal(ids.includes('tag:topic'), true)
    assert.equal(ids.some((id) => id.startsWith('source:')), true)
    assert.equal(
      graph.edges.some((edge) => edge.source === 'alpha' && edge.target === 'beta' && edge.kind === 'wikilink'),
      true,
    )
    const local = filterLocalGraph(graph, 'alpha', 1)
    assert.equal(local.nodes.some((node) => node.id === 'alpha'), true)
    assert.equal(local.nodes.some((node) => node.id === 'beta'), true)
    assert.match(mermaidFromGraph(graph), /graph LR/)
  })
})

test('writeGraphHtml writes a standalone viewer', async () => {
  await withVault(async (dir) => {
    const result = await writeGraphHtml(dir)
    assert.equal(result.ok, true)
    assert.equal(result.pageCount, 2)
    assert.equal(result.articleCount, 0)
    const html = await readFile(result.htmlPath, 'utf8')
    assert.match(html, /文脉关联图/)
    assert.match(html, /Alpha/)
    assert.match(html, /zoomTrack/)
    assert.match(html, /title="放大"/)
    assert.match(html, /id="g"/)
    assert.match(html, /id="cy"/)
    assert.match(html, /viewMode/)
    assert.match(html, /力导向/)
    assert.match(html, /目录簇/)
    assert.match(html, /graph-assets/)
    assert.match(html, /fcose/)
    assert.match(html, /showFileLabels/)
    assert.match(html, /full-label/)
  })
})

test('buildKnowledgeGraph includes workspace markdown from sourceRoots', async () => {
  await withVault(async (dir) => {
    const sources = await mkdtemp(path.join(os.tmpdir(), 'wenmai-articles-'))
    try {
      await writeFile(
        path.join(sources, 'one.md'),
        '# One\n\nSee [[two]].\n',
      )
      await writeFile(
        path.join(sources, 'two.md'),
        '# Two\n\nBack to [one](one.md).\n',
      )
      const graph = await buildKnowledgeGraph(dir, { sourceRoots: [sources] })
      const articles = graph.nodes.filter((node) => node.kind === 'article')
      assert.equal(articles.length, 2)
      assert.equal(
        graph.edges.some((edge) => edge.kind === 'wikilink' && edge.source.includes('one') && edge.target.includes('two')),
        true,
      )
      assert.equal(
        graph.edges.some((edge) => edge.kind === 'mdlink'),
        true,
      )
      assert.equal(graph.nodes.some((node) => node.kind === 'folder'), true)
    } finally {
      await rm(sources, { recursive: true, force: true })
    }
  })
})
