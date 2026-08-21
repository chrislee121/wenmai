#!/usr/bin/env node
/**
 * 通鉴端到端验收：init → ingest 示例文稿 → write 编译页 → written/search/read/lint/graph
 * 使用仓库内脱敏 fixture，不读取私人目录。传 --live 则写 ~/tongjian。
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeGraphHtml } from '../dist/graph.js'
import { buildOrient } from '../dist/orient.js'
import { lintVault } from '../dist/lint.js'
import { searchVault } from '../dist/search.js'
import { ingestText, initVault, readPage, status, writePage } from '../dist/store.js'
import { findWritten } from '../dist/written.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const ARTICLE = path.join(here, '../tests/fixtures/sample-article.md')
const SOURCE_ROOTS = [path.join(here, '../tests/fixtures')]
const live = process.argv.includes('--live')

const root = live
  ? path.join(homedir(), 'tongjian')
  : await mkdtemp(path.join(os.tmpdir(), 'tongjian-e2e-'))

try {
  const init = await initVault(root, '个人文字工作：文章、脚本、文案、文档')
  assert.equal(init.ok, true)

  const st0 = await status(root, SOURCE_ROOTS)
  assert.equal(st0.initialized, true)
  assert.equal(st0.sourceRoots.every((item) => item.readable), true)

  const article = await readFile(ARTICLE, 'utf8')
  const ingested = await ingestText(root, {
    title: '本地 Web UI 三步打开',
    body: article,
    kind: 'workspace',
    sourcePath: ARTICLE,
  })
  assert.equal(ingested.ok, true)
  assert.match(ingested.rawPath, /^raw\/workspace\//)

  const page = `---
title: Local Web UI
created: 2026-08-21
updated: 2026-08-21
type: concept
tags: [product]
sources: [${ingested.rawPath}]
---

# Local Web UI

默认地址 \`http://127.0.0.1:3080\`。

相关：[[related-topic]] 与日常工作流。
`
  const writtenPage = await writePage(root, 'concepts/local-web-ui.md', page, {
    log: 'write | local-web-ui',
    updateIndex: true,
  })
  assert.equal(writtenPage.ok, true)

  const hits = await findWritten(root, SOURCE_ROOTS, 'Web UI')
  assert.ok(hits.some((hit) => hit.kind === 'page'))
  assert.ok(hits.some((hit) => hit.kind === 'source' && hit.path.includes('sample-article')))

  const search = await searchVault(root, '3080')
  assert.ok(search.length > 0)

  const read = await readPage(root, 'concepts/local-web-ui.md')
  assert.match(read.content, /Local Web UI/)

  await assert.rejects(() => writePage(root, 'raw/articles/nope.md', 'x'), /raw/)

  const lint = await lintVault(root)
  assert.equal(lint.ok, true)
  assert.ok(lint.diagnostics.some((item) => item.code === 'broken-wikilink'))

  const graph = await writeGraphHtml(root, { sourceRoots: SOURCE_ROOTS })
  assert.equal(graph.ok, true)
  assert.ok(graph.nodeCount >= 1)
  assert.ok(graph.articleCount >= 1)
  assert.match(await readFile(graph.htmlPath, 'utf8'), /通鉴关联图/)

  const orient = await buildOrient(root, 8000)
  assert.match(orient, /SCHEMA.md/)
  assert.match(orient, /index.md/)

  console.log(
    JSON.stringify(
      {
        ok: true,
        root,
        live,
        ingested: ingested.rawPath,
        writtenHits: hits.length,
        searchHits: search.length,
        lint: { errors: lint.errorCount, warnings: lint.warningCount },
        graph: { nodes: graph.nodeCount, edges: graph.edgeCount, articles: graph.articleCount },
      },
      null,
      2,
    ),
  )
} finally {
  if (!live) await rm(root, { recursive: true, force: true })
}
