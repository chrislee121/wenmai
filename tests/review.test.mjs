import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ingestText, initVault, writePage } from '../dist/store.js'
import { lintVault } from '../dist/lint.js'
import { reviewVault } from '../dist/review/index.js'
import { checkWritten } from '../dist/written.js'
import { assertLosslessJson } from './helpers/lossless-json.mjs'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-review-'))
  try {
    await initVault(dir, 'AI tools')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const BODY = `MCP 把工具接到模型。本地优先，不把成稿上传到云端。协议本身只解决连接，不解决长期记忆。
重复这一段是为了让词法 n-gram 有足够重叠：工具、协议、本地、成稿、上传、云端、连接、记忆。`

test('raw hash drift propagates to citing compiled pages; lint still only reports the raw file', async () => {
  await withVault(async (dir) => {
    const ingested = await ingestText(dir, { title: 'MCP notes', body: '# MCP\n\noriginal body\n' })
    await writePage(
      dir,
      'concepts/mcp.md',
      `---
title: MCP
updated: 2026-08-01
type: concept
sources: [${ingested.rawPath}]
---

# MCP

See [[tools]].
`,
      { updateIndex: true },
    )
    const rawAbs = path.join(dir, ingested.rawPath)
    const raw = await readFile(rawAbs, 'utf8')
    await writeFile(rawAbs, raw.replace('original body', 'changed body'), 'utf8')

    const lint = await lintVault(dir)
    assert.equal(lint.diagnostics.some((item) => item.code === 'raw-hash-drift'), true)
    assert.equal(lint.diagnostics.some((item) => item.code === 'page-stale'), false)

    const report = await reviewVault(dir)
    assert.equal(report.findings.some((item) => item.kind === 'page-stale' && item.paths.includes('concepts/mcp.md')), true)
    assert.equal(report.metrics.stalePageCount >= 1, true)
  })
})

test('duplicate detector flags near-identical compiled pages and states the paraphrase blind spot', async () => {
  await withVault(async (dir) => {
    const page = (title) => `---
title: ${title}
updated: 2026-08-20
type: concept
---

# ${title}

${BODY}
`
    await writePage(dir, 'concepts/mcp-a.md', page('MCP 工具协议'), { updateIndex: true })
    await writePage(dir, 'concepts/mcp-b.md', page('MCP 工具协议副本'), { updateIndex: true })
    const report = await reviewVault(dir)
    const dup = report.findings.find((item) => item.kind === 'duplicate')
    assert.ok(dup)
    assert.match(dup.reason, /换词重写/)
    assert.equal(report.blindSpot.includes('换词重写'), true)
  })
})

test('conflict candidate is labeled as needing human review', async () => {
  await withVault(async (dir) => {
    await writePage(
      dir,
      'concepts/mcp-pro.md',
      `---
title: MCP 协议
updated: 2026-08-20
type: concept
tags: [protocol]
---

# MCP 协议

我支持把 MCP 当作 Agent 的核心协议。
`,
      { updateIndex: true },
    )
    await writePage(
      dir,
      'concepts/mcp-con.md',
      `---
title: MCP 协议局限
updated: 2026-08-20
type: concept
tags: [protocol]
---

# MCP 协议局限

我反对把 MCP 当作 Agent 的核心协议。
`,
      { updateIndex: true },
    )
    const report = await reviewVault(dir)
    const hit = report.findings.find((item) => item.kind === 'conflict-candidate')
    assert.ok(hit)
    assert.match(hit.reason, /候选|人工复核/)
  })
})

test('ack persists in review-state.json and filters the finding next time', async () => {
  await withVault(async (dir) => {
    await writePage(
      dir,
      'concepts/lonely.md',
      `---
title: Lonely
updated: 2026-08-20
type: concept
---

# Lonely

No links.
`,
    )
    const first = await reviewVault(dir)
    const orphan = first.findings.find((item) => item.kind === 'orphan-page')
    assert.ok(orphan)
    const second = await reviewVault(dir, { ack: [orphan.id] })
    assert.equal(second.findings.some((item) => item.id === orphan.id), false)
    const third = await reviewVault(dir, { includeDismissed: true })
    assert.equal(third.findings.some((item) => item.id === orphan.id), true)
    const state = JSON.parse(await readFile(path.join(dir, 'review-state.json'), 'utf8'))
    assert.equal(state.findings[orphan.id].status, 'ack')
  })
})

test('written returns NEW / REVIEW / DUPLICATE and keeps substring hits', async () => {
  await withVault(async (dir) => {
    await writePage(
      dir,
      'concepts/deepseek-harness.md',
      `---
title: DeepSeek Harness
type: concept
---

DeepSeek Harness 本地 Web UI。
`,
      { updateIndex: true },
    )
    const duplicate = await checkWritten(dir, [], 'DeepSeek Harness')
    assert.equal(duplicate.verdict, 'DUPLICATE')
    assert.equal(duplicate.hits.some((hit) => hit.kind === 'page'), true)
    assert.match(duplicate.blindSpot, /换词重写/)

    const review = await checkWritten(dir, [], 'Web UI')
    assert.ok(review.verdict === 'REVIEW' || review.verdict === 'DUPLICATE')
    assert.equal(review.hits.some((hit) => hit.kind === 'page'), true)

    const fresh = await checkWritten(dir, [], '拓扑量子纠错码')
    assert.equal(fresh.verdict, 'NEW')
    assert.equal(fresh.hits.length, 0)
  })
})

test('review report omits undefined fields so Harness can snapshot it as lossless JSON', async () => {
  await withVault(async (dir) => {
    const report = await reviewVault(dir)
    assert.equal(report.truncated, false)
    assert.equal('truncationNote' in report, false)
    assertLosslessJson(report)
  })
})
