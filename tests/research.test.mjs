import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ingestText, initVault, writePage } from '../dist/store.js'
import { fingerprint, reviewVault } from '../dist/review/index.js'
import { isResearchEligible, proposedPathForSlug, researchVault } from '../dist/research/index.js'
import { WRITER_PACK } from '../dist/pack/index.js'
import { runTasks } from '../dist/tasks/index.js'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-research-'))
  try {
    await initVault(dir, 'AI tools')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function addIndexGap(dir, slug, title = slug) {
  const abs = path.join(dir, 'index.md')
  const index = await readFile(abs, 'utf8')
  const line = `- [[${slug}]] — ${title}`
  if (index.includes(`[[${slug}]]`)) return
  const next = index.includes('## Concepts')
    ? index.replace('## Concepts', `## Concepts\n\n${line}`)
    : `${index.trimEnd()}\n\n## Concepts\n\n${line}\n`
  await writeFile(abs, next, 'utf8')
}

async function fileCount(dir) {
  const names = await readdir(dir)
  return names.length
}

test('proposedPath follows the index section heading', () => {
  const index = `# 文脉目录\n\n## Concepts\n\n- [[gap-topic]] — Gap\n\n## Entities\n`
  assert.equal(proposedPathForSlug(index, 'gap-topic', WRITER_PACK), 'concepts/gap-topic.md')
})

test('research is off by default and does not write', async () => {
  await withVault(async (dir) => {
    await addIndexGap(dir, '本地-web-ui', '本地 Web UI')
    const before = await fileCount(dir)
    await assert.rejects(() => researchVault(dir, { enabled: false }), /research is disabled/)
    await assert.rejects(() => researchVault(dir), /research is disabled/)
    assert.equal(await fileCount(dir), before)
  })
})

test('research only accepts directory missing-page gaps', async () => {
  await withVault(async (dir) => {
    await writePage(
      dir,
      'concepts/mcp-a.md',
      `---
title: MCP 工具协议
type: concept
---

# MCP

工具接到模型。本地优先，不把成稿上传到云端。协议本身只解决连接。
`,
      { updateIndex: true },
    )
    await writePage(
      dir,
      'concepts/mcp-b.md',
      `---
title: MCP 工具协议副本
type: concept
---

# MCP

工具接到模型。本地优先，不把成稿上传到云端。协议本身只解决连接。
`,
      { updateIndex: true },
    )
    await addIndexGap(dir, '本地-web-ui', '本地 Web UI')
    const review = await reviewVault(dir)
    const dup = review.findings.find((item) => item.kind === 'duplicate')
    const gap = review.findings.find((item) => item.kind === 'index-mismatch' && item.paths[0] === 'index.md')
    assert.ok(dup)
    assert.ok(gap)
    assert.equal(isResearchEligible(dup), false)
    assert.equal(isResearchEligible(gap), true)
    assert.equal(gap.id, fingerprint('index-mismatch', gap.paths))
    await assert.rejects(
      () => researchVault(dir, { enabled: true, findingId: dup.id }),
      /not a structural gap/,
    )
  })
})

test('research finds local raw evidence and lists no-local-evidence when none', async () => {
  await withVault(async (dir) => {
    await ingestText(dir, {
      title: '本地 Web UI 笔记',
      body: '# 本地 Web UI\n\n默认地址 3080。这是旧稿，可以编译成概念页。\n',
    })
    await addIndexGap(dir, '本地-web-ui', '本地 Web UI')
    await addIndexGap(dir, 'zzzz-no-such-topic', 'No such topic')
    const review = await reviewVault(dir)
    const readyFinding = review.findings.find(
      (item) => item.kind === 'index-mismatch' && item.paths[1] === '本地-web-ui',
    )
    const emptyFinding = review.findings.find(
      (item) => item.kind === 'index-mismatch' && item.paths[1] === 'zzzz-no-such-topic',
    )
    assert.ok(readyFinding)
    assert.ok(emptyFinding)
    const before = await fileCount(dir)
    const ready = await researchVault(dir, { enabled: true, findingId: readyFinding.id })
    assert.equal(ready.ok, true)
    assert.equal(ready.briefs[0]?.status, 'ready')
    assert.equal(ready.briefs[0]?.proposedPath, 'concepts/本地-web-ui.md')
    assert.ok(ready.briefs[0]?.evidence.some((item) => item.path.startsWith('raw/')))
    assert.ok(ready.briefs[0]?.proposedSources.every((item) => item.startsWith('raw/')))
    const empty = await researchVault(dir, { enabled: true, findingId: emptyFinding.id })
    assert.equal(empty.briefs[0]?.status, 'no-local-evidence')
    assert.equal(empty.briefs[0]?.evidence.length, 0)
    assert.match(empty.briefs[0]?.note ?? '', /不要编造/)
    assert.equal(await fileCount(dir), before)
    const listed = await runTasks(dir, { op: 'list', research: true })
    assert.equal(listed.tasks.find((item) => item.id === readyFinding.id)?.suggestedOp, 'research')
    const listedOff = await runTasks(dir, { op: 'list' })
    assert.equal(listedOff.tasks.find((item) => item.id === readyFinding.id)?.suggestedOp, undefined)
    const written = await writePage(
      dir,
      ready.briefs[0].proposedPath,
      `---
title: 本地 Web UI
type: concept
sources: [${ready.briefs[0].proposedSources[0]}]
---

# 本地 Web UI

从旧稿编译。
`,
      { updateIndex: true, finding: readyFinding.id, log: 'write | 本地-web-ui' },
    )
    assert.equal(written.findingAcked, readyFinding.id)
    const after = await runTasks(dir, { op: 'list', research: true })
    assert.equal(after.tasks.some((item) => item.id === readyFinding.id), false)
  })
})
