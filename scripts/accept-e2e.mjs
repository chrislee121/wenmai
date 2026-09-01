#!/usr/bin/env node
/**
 * 文脉端到端验收：init → ingest 示例文稿 → write 编译页 → written 三态 → review → search/read/lint/graph
 * 使用仓库内脱敏 fixture，不读取私人目录。传 --live 则写 ~/wenmai。
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
import { ingestDirectory } from '../dist/ingest-dir.js'
import { ingestText, initVault, readPage, status, writePage } from '../dist/store.js'
import { reviewVault } from '../dist/review/index.js'
import { checkWritten, findWritten } from '../dist/written.js'
import { assertLosslessJson } from '../tests/helpers/lossless-json.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const ARTICLE = path.join(here, '../tests/fixtures/sample-article.md')
const SOURCE_ROOTS = [path.join(here, '../tests/fixtures')]
const live = process.argv.includes('--live')

const root = live
  ? path.join(homedir(), 'wenmai')
  : await mkdtemp(path.join(os.tmpdir(), 'wenmai-e2e-'))

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

  const dirPreview = await ingestDirectory(root, SOURCE_ROOTS[0], { allowedRoots: SOURCE_ROOTS, dryRun: true })
  assert.equal(dirPreview.dryRun, true)
  assert.ok(dirPreview.planned >= 1)
  const dirIngest = await ingestDirectory(root, SOURCE_ROOTS[0], { allowedRoots: SOURCE_ROOTS, dryRun: false })
  assert.ok(dirIngest.deduped >= 1)

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

  const duplicate = await checkWritten(root, SOURCE_ROOTS, '本地 Web UI 三步打开')
  assert.ok(duplicate.verdict === 'DUPLICATE' || duplicate.verdict === 'REVIEW')
  assertLosslessJson(duplicate)

  const fresh = await checkWritten(root, SOURCE_ROOTS, '拓扑量子纠错码')
  assert.equal(fresh.verdict, 'NEW')
  assert.equal(fresh.hits.length, 0)
  assertLosslessJson(fresh)

  const rawBefore = await readFile(path.join(root, ingested.rawPath), 'utf8')
  const review = await reviewVault(root)
  assert.equal(review.ok, true)
  assert.equal(typeof review.findingCount, 'number')
  assert.match(review.blindSpot, /换词重写/)
  assert.equal('truncationNote' in review && review.truncationNote === undefined, false)
  assertLosslessJson(review)
  assert.equal(await readFile(path.join(root, ingested.rawPath), 'utf8'), rawBefore)

  const search = await searchVault(root, '3080')
  assert.ok(search.length > 0)

  const read = await readPage(root, 'concepts/local-web-ui.md')
  assert.match(read.content, /Local Web UI/)

  await assert.rejects(() => writePage(root, 'raw/articles/nope.md', 'x'), /raw/)

  const lint = await lintVault(root)
  assert.equal(lint.ok, true)
  assert.ok(lint.diagnostics.some((item) => item.code === 'broken-wikilink'))
  assertLosslessJson(lint)

  const graph = await writeGraphHtml(root, { sourceRoots: SOURCE_ROOTS })
  assert.equal(graph.ok, true)
  assert.ok(graph.nodeCount >= 1)
  assert.ok(graph.articleCount >= 1)
  assert.match(await readFile(graph.htmlPath, 'utf8'), /文脉关联图/)

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
        writtenVerdicts: { duplicate: duplicate.verdict, fresh: fresh.verdict },
        review: { findings: review.findingCount, pages: review.metrics.pageCount },
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
