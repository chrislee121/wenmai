import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initVault, writePage } from '../dist/store.js'
import { reviewVault } from '../dist/review/index.js'
import { refactorVault } from '../dist/refactor/index.js'
import { derivePriority, runTasks, suggestedOp } from '../dist/tasks/index.js'
import { checkWritten } from '../dist/written.js'
import { assertLosslessJson } from './helpers/lossless-json.mjs'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-tasks-'))
  try {
    await initVault(dir, 'AI tools')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const BODY = `MCP 把工具接到模型。本地优先，不把成稿上传到云端。协议本身只解决连接，不解决长期记忆。
重复这一段是为了让词法 n-gram 有足够重叠：工具、协议、本地、成稿、上传、云端、连接、记忆。`

function page(title, extra = BODY) {
  return `---
title: ${title}
updated: 2026-08-20
type: concept
---

# ${title}

${extra}
`
}

test('tasks project duplicate findings with the same fingerprint and omit empty suggestedOp', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/mcp-a.md', page('MCP 工具协议'), { updateIndex: true })
    await writePage(dir, 'concepts/mcp-b.md', page('MCP 工具协议副本'), { updateIndex: true })
    const review = await reviewVault(dir)
    const dup = review.findings.find((item) => item.kind === 'duplicate')
    assert.ok(dup)
    const listed = await runTasks(dir, { op: 'list' })
    const task = listed.tasks.find((item) => item.id === dup.id)
    assert.ok(task)
    assert.equal(task.suggestedOp, 'merge')
    assert.equal(task.priority, 'high')
    assert.equal(task.status, 'open')
    assert.deepEqual(task.relatedPages, dup.paths)
    assertLosslessJson(listed)
  })
})

test('start pins in_progress; done acks and drops the task from the default list', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/mcp-a.md', page('MCP 工具协议'), { updateIndex: true })
    await writePage(dir, 'concepts/mcp-b.md', page('MCP 工具协议副本'), { updateIndex: true })
    const listed = await runTasks(dir)
    const id = listed.tasks.find((item) => item.kind === 'duplicate')?.id
    assert.ok(id)
    const started = await runTasks(dir, { op: 'start', id, priority: 'high' })
    assert.equal(started.tasks.find((item) => item.id === id)?.status, 'in_progress')
    const state = JSON.parse(await readFile(path.join(dir, 'review-state.json'), 'utf8'))
    assert.equal(state.findings[id].status, 'in_progress')
    assert.equal(state.findings[id].priority, 'high')
    assertLosslessJson(started)
    const done = await runTasks(dir, { op: 'done', id })
    assert.equal(done.tasks.some((item) => item.id === id), false)
    const later = await reviewVault(dir)
    assert.equal(later.findings.some((item) => item.id === id), false)
  })
})

test('written attaches overlapping open tasks and omits the key when none match', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/mcp-a.md', page('MCP 工具协议'), { updateIndex: true })
    await writePage(dir, 'concepts/mcp-b.md', page('MCP 工具协议副本'), { updateIndex: true })
    const listed = await runTasks(dir)
    const dup = listed.tasks.find((item) => item.kind === 'duplicate')
    assert.ok(dup)
    const hit = await checkWritten(dir, [], 'MCP 工具协议')
    assert.ok(hit.openTasks?.some((item) => item.id === dup.id))
    assertLosslessJson(hit)
    const fresh = await checkWritten(dir, [], '拓扑量子纠错码')
    assert.equal(fresh.verdict, 'NEW')
    assert.equal('openTasks' in fresh, false)
    assertLosslessJson(fresh)
  })
})

test('refactor merge with finding ack clears the task from written', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/mcp-a.md', page('MCP 工具协议'), { updateIndex: true })
    await writePage(dir, 'concepts/mcp-b.md', page('MCP 工具协议副本'), { updateIndex: true })
    const listed = await runTasks(dir)
    const dup = listed.tasks.find((item) => item.kind === 'duplicate')
    assert.ok(dup)
    const merged = await refactorVault(dir, {
      op: 'merge',
      source: 'concepts/mcp-b.md',
      target: 'concepts/mcp-a.md',
      dryRun: false,
      finding: dup.id,
    })
    assert.equal(merged.findingAcked, dup.id)
    const after = await runTasks(dir)
    assert.equal(after.tasks.some((item) => item.id === dup.id), false)
    const written = await checkWritten(dir, [], 'MCP 工具协议')
    assert.equal(written.openTasks?.some((item) => item.id === dup.id) ?? false, false)
    const archived = await readFile(path.join(dir, 'concepts/mcp-b.md'), 'utf8')
    assert.match(archived, /archived: true/)
  })
})

test('suggestedOp and priority follow the deterministic table', () => {
  assert.equal(suggestedOp('duplicate'), 'merge')
  assert.equal(suggestedOp('oversized-page'), 'split')
  assert.equal(suggestedOp('hub-overload'), 'split')
  assert.equal(suggestedOp('orphan-page'), 'link')
  assert.equal(suggestedOp('page-stale'), 'rewrite')
  assert.equal(suggestedOp('page-expired'), 'rewrite')
  assert.equal(suggestedOp('source-missing'), 'rewrite')
  assert.equal(suggestedOp('conflict-candidate'), undefined)
  assert.equal(suggestedOp('index-mismatch'), undefined)
  assert.equal(derivePriority({ kind: 'duplicate', severity: 'warning' }, undefined), 'high')
  assert.equal(derivePriority({ kind: 'conflict-candidate', severity: 'warning' }, undefined), 'high')
  assert.equal(derivePriority({ kind: 'orphan-page', severity: 'info' }, undefined), 'low')
  assert.equal(derivePriority({ kind: 'page-stale', severity: 'warning' }, undefined), 'medium')
  assert.equal(derivePriority({ kind: 'orphan-page', severity: 'info' }, 'high'), 'high')
})

test('list filters by priority and sorts high before medium before low', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/mcp-a.md', page('MCP 工具协议'), { updateIndex: true })
    await writePage(dir, 'concepts/mcp-b.md', page('MCP 工具协议副本'), { updateIndex: true })
    const listed = await runTasks(dir, { op: 'list' })
    assert.ok(listed.tasks.length >= 2)
    for (let i = 1; i < listed.tasks.length; i++) {
      const rank = { high: 0, medium: 1, low: 2 }
      assert.ok(rank[listed.tasks[i - 1].priority] <= rank[listed.tasks[i].priority])
    }
    const highOnly = await runTasks(dir, { op: 'list', priority: 'high' })
    assert.ok(highOnly.tasks.every((item) => item.priority === 'high'))
    assert.ok(highOnly.tasks.some((item) => item.kind === 'duplicate'))
    assertLosslessJson(highOnly)
  })
})

test('snooze and wontfix hide tasks unless includeDismissed', async () => {
  await withVault(async (dir) => {
    await writePage(dir, 'concepts/mcp-a.md', page('MCP 工具协议'), { updateIndex: true })
    await writePage(dir, 'concepts/mcp-b.md', page('MCP 工具协议副本'), { updateIndex: true })
    const listed = await runTasks(dir)
    const id = listed.tasks.find((item) => item.kind === 'duplicate')?.id
    assert.ok(id)
    const snoozed = await runTasks(dir, { op: 'snooze', id, snoozeDays: 7 })
    assert.equal(snoozed.tasks.some((item) => item.id === id), false)
    const withSnooze = await runTasks(dir, { includeDismissed: true })
    assert.equal(withSnooze.tasks.find((item) => item.id === id)?.status, 'snoozed')
    const wont = await runTasks(dir, { op: 'wontfix', id })
    assert.equal(wont.tasks.some((item) => item.id === id), false)
    const withWont = await runTasks(dir, { includeDismissed: true })
    assert.equal(withWont.tasks.find((item) => item.id === id)?.status, 'wontfix')
    assertLosslessJson(withWont)
  })
})

test('start rejects unknown ids', async () => {
  await withVault(async (dir) => {
    await assert.rejects(() => runTasks(dir, { op: 'start', id: 'deadbeefdeadbeef' }), /unknown finding/)
  })
})
