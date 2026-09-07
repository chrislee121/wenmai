import assert from 'node:assert/strict'
import test from 'node:test'
import { isIPv4Loopback, isLoopbackAddress, isLoopbackHostname } from '../dist/http/loopback.js'
import {
  ingestCardModel,
  parseToolPayload,
  statusCardModel,
  tasksCardModel,
  writtenCardModel,
  writtenHeadline,
} from '../dist/ui/models.js'

test('written headline maps the three verdicts for writers', () => {
  assert.equal(writtenHeadline('NEW'), '可以写')
  assert.equal(writtenHeadline('REVIEW'), '动笔前先看旧稿')
  assert.equal(writtenHeadline('DUPLICATE'), '已经写过')
})

test('written card model keeps hits and overlapping tasks', () => {
  const model = writtenCardModel({
    ok: true,
    query: 'DeepSeek Harness',
    verdict: 'DUPLICATE',
    reason: '已有高度重合的成稿或编译页',
    hits: [
      {
        kind: 'page',
        path: 'concepts/deepseek-harness.md',
        title: 'DeepSeek Harness',
        snippet: '本地 Web UI',
        overlappingPhrases: ['Web UI'],
        match: 'DUPLICATE',
      },
    ],
    openTasks: [{ id: 'abc', why: '两页重复', relatedPages: ['concepts/a.md'], priority: 'high', status: 'open' }],
  })
  assert.equal(model.headline, '已经写过')
  assert.equal(model.hits[0]?.title, 'DeepSeek Harness')
  assert.equal(model.openTasks[0]?.why, '两页重复')
})

test('ingest dry-run model exposes confirm, written ingest does not', () => {
  const preview = ingestCardModel({
    ok: true,
    dryRun: true,
    dir: '/tmp/drafts',
    kind: 'workspace',
    planned: 2,
    ingested: 0,
    deduped: 0,
    files: [{ title: 'One', rel: 'one.md', sourcePath: '/tmp/drafts/one.md' }],
  })
  assert.equal(preview.canConfirm, true)
  assert.equal(preview.headline === undefined, true)
  const written = ingestCardModel({
    ok: true,
    dryRun: false,
    dir: '/tmp/drafts',
    kind: 'workspace',
    planned: 2,
    ingested: 2,
    deduped: 0,
    files: [],
  })
  assert.equal(written.canConfirm, false)
  const single = ingestCardModel({
    ok: true,
    deduped: false,
    rawPath: 'raw/workspace/foo.md',
    title: 'Foo',
  })
  assert.equal(single.ingested, 1)
  assert.equal(single.canConfirm, false)
})

test('status and tasks models tolerate errors', () => {
  const status = statusCardModel({ ok: false, error: 'vault missing' })
  assert.equal(status.initialized, false)
  assert.match(status.error ?? '', /vault missing/)
  const tasks = tasksCardModel({
    ok: true,
    op: 'list',
    taskCount: 1,
    tasks: [{ id: '1', why: '合并重复页', relatedPages: ['a.md'], expectedResult: '剩一页', priority: 'high', status: 'open', suggestedOp: 'merge' }],
  })
  assert.equal(tasks.tasks[0]?.suggestedOp, 'merge')
})

test('parseToolPayload reads OBJECT_OUTPUT JSON text blocks', () => {
  const payload = parseToolPayload({
    kind: 'result',
    content: [{ type: 'text', text: '{"ok":true,"verdict":"NEW","query":"x","reason":"无","hits":[]}' }],
  })
  const model = writtenCardModel(payload)
  assert.equal(model.verdict, 'NEW')
  assert.equal(model.headline, '可以写')
})

test('loopback fence accepts only 127/8 and localhost', () => {
  assert.equal(isIPv4Loopback('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('8.8.8.8'), false)
  assert.equal(isLoopbackHostname('localhost'), true)
  assert.equal(isLoopbackHostname('example.com'), false)
})
