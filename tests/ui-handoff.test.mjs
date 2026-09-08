import assert from 'node:assert/strict'
import test from 'node:test'
import { tasksEmptyCopy } from '../dist/ui/defaults.js'
import { readPageDraft } from '../dist/ui/handoff.js'

test('read page draft asks the chat to read a compiled page', () => {
  assert.equal(
    readPageDraft({ kind: 'page', title: 'DeepSeek Harness', path: 'concepts/deepseek-harness.md' }),
    '读文脉里「DeepSeek Harness」这一页，路径 concepts/deepseek-harness.md',
  )
})

test('source hit draft points at the unpublished draft path', () => {
  assert.equal(
    readPageDraft({ kind: 'source', title: '旧稿', path: '/tmp/drafts/old.md' }),
    '这篇还没收进编译页的旧稿在 /tmp/drafts/old.md，先读重叠处再决定收不收',
  )
})

test('empty task copy never mentions findings', () => {
  assert.equal(tasksEmptyCopy().includes('finding'), false)
  assert.equal(tasksEmptyCopy(0).includes('finding'), false)
  assert.match(tasksEmptyCopy(), /点审视/)
  assert.match(tasksEmptyCopy(0), /先有旧稿/)
})
