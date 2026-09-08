#!/usr/bin/env node
/**
 * 文脉端到端验收：init → ingest → write → written 三态 → review → tasks → refactor rename → research gap → search/read/lint/graph
 * 使用仓库内脱敏 fixture，不读取私人目录。传 --live 则写 ~/wenmai。
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
import { researchVault } from '../dist/research/index.js'
import { refactorVault } from '../dist/refactor/index.js'
import { runTasks } from '../dist/tasks/index.js'
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
  await writePage(
    root,
    'concepts/workflow.md',
    `---
title: Workflow
type: concept
---

# Workflow

Depends on [[local-web-ui]].
`,
    { updateIndex: true },
  )

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

  const dupBody = `本地 Web UI 三步打开。默认地址 3080。重复这一段是为了让词法 n-gram 有足够重叠：本地、Web、UI、打开、默认、地址、端口、工作流。
再写一句本地 Web UI 与默认地址 3080，好让两页被判定为 duplicate。`
  await writePage(
    root,
    'concepts/dup-a.md',
    `---
title: 本地 Web UI 打开
type: concept
---

# 本地 Web UI 打开

${dupBody}
`,
    { updateIndex: true },
  )
  await writePage(
    root,
    'concepts/dup-b.md',
    `---
title: 本地 Web UI 打开副本
type: concept
---

# 本地 Web UI 打开副本

${dupBody}
`,
    { updateIndex: true },
  )
  const queued = await runTasks(root, { op: 'list' })
  const dupTask = queued.tasks.find((item) => item.kind === 'duplicate')
  assert.ok(dupTask)
  assert.equal(dupTask.suggestedOp, 'merge')
  assertLosslessJson(queued)
  const writtenTasks = await checkWritten(root, SOURCE_ROOTS, '本地 Web UI 打开')
  assert.ok(writtenTasks.openTasks?.some((item) => item.id === dupTask.id))
  assertLosslessJson(writtenTasks)
  const mergedDup = await refactorVault(root, {
    op: 'merge',
    source: 'concepts/dup-b.md',
    target: 'concepts/dup-a.md',
    dryRun: false,
    finding: dupTask.id,
  })
  assert.equal(mergedDup.findingAcked, dupTask.id)
  const queuedAfter = await runTasks(root, { op: 'list' })
  assert.equal(queuedAfter.tasks.some((item) => item.id === dupTask.id), false)
  const writtenAfter = await checkWritten(root, SOURCE_ROOTS, '本地 Web UI 打开')
  assert.equal(writtenAfter.openTasks?.some((item) => item.id === dupTask.id) ?? false, false)

  const renameDry = await refactorVault(root, {
    op: 'rename',
    source: 'concepts/local-web-ui.md',
    target: 'local-web-ui-guide',
    dryRun: true,
  })
  assert.equal(renameDry.dryRun, true)
  assert.equal(renameDry.inbound.some((item) => item.from === 'concepts/workflow.md'), true)
  assertLosslessJson(renameDry)
  const renamed = await refactorVault(root, {
    op: 'rename',
    source: 'concepts/local-web-ui.md',
    target: 'local-web-ui-guide',
    dryRun: false,
  })
  assert.equal(renamed.applied, true)
  const workflow = await readFile(path.join(root, 'concepts/workflow.md'), 'utf8')
  assert.match(workflow, /\[\[local-web-ui-guide\]\]/)
  assert.equal(await readFile(path.join(root, ingested.rawPath), 'utf8'), rawBefore)

  const indexPath = path.join(root, 'index.md')
  const indexMd = await readFile(indexPath, 'utf8')
  await writeFile(
    indexPath,
    indexMd.replace('## Concepts', '## Concepts\n\n- [[脱敏示例文稿]] — 脱敏示例文稿\n'),
    'utf8',
  )
  const gapList = await runTasks(root, { op: 'list', research: true })
  const gap = gapList.tasks.find((item) => item.suggestedOp === 'research' && item.relatedPages[1] === '脱敏示例文稿')
  assert.ok(gap)
  const researched = await researchVault(root, {
    findingId: gap.id,
    enabled: true,
    sourceRoots: SOURCE_ROOTS,
  })
  assert.equal(researched.ok, true)
  assert.equal(researched.briefs[0]?.status, 'ready')
  assertLosslessJson(researched)
  const writtenGap = await checkWritten(root, [], '脱敏示例文稿', 20, { research: true })
  assert.equal(writtenGap.verdict, 'NEW')
  assert.match(writtenGap.reason, /目录已点名/)
  assert.ok(writtenGap.openTasks?.some((item) => item.id === gap.id))
  const filled = await writePage(
    root,
    researched.briefs[0].proposedPath,
    `---
title: 脱敏示例文稿
type: concept
sources: [${ingested.rawPath}]
---

# 脱敏示例文稿

从旧稿编译。相关：[[local-web-ui-guide]]。
`,
    { updateIndex: true, finding: gap.id, log: 'write | 脱敏示例文稿' },
  )
  assert.equal(filled.findingAcked, gap.id)
  const gapAfter = await runTasks(root, { op: 'list', research: true })
  assert.equal(gapAfter.tasks.some((item) => item.id === gap.id), false)

  const search = await searchVault(root, '3080')
  assert.ok(search.length > 0)

  const read = await readPage(root, 'concepts/local-web-ui-guide.md')
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
        tasks: { before: queued.taskCount, after: queuedAfter.taskCount },
        research: { status: researched.briefs[0]?.status, written: writtenGap.verdict },
        refactor: { op: renamed.op, applied: renamed.applied },
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
