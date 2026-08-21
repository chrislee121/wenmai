import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PathEscapeError, isUnderRoot, resolveUnder } from '../dist/paths.js'

async function withTemp(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tongjian-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('resolveUnder allows nested relative paths', () => {
  const root = '/tmp/tongjian-root'
  assert.equal(resolveUnder(root, 'concepts/foo.md'), path.resolve(root, 'concepts/foo.md'))
})

test('resolveUnder rejects parent segments and absolute paths', () => {
  const root = '/tmp/tongjian-root'
  assert.throws(() => resolveUnder(root, '../etc/passwd'), PathEscapeError)
  assert.throws(() => resolveUnder(root, '/etc/passwd'), PathEscapeError)
  assert.throws(() => resolveUnder(root, 'concepts/foo/../../x.md'), PathEscapeError)
})

test('isUnderRoot accepts nested files and rejects siblings', () => {
  const root = '/tmp/vault'
  assert.equal(isUnderRoot(root, '/tmp/vault/a/b.md'), true)
  assert.equal(isUnderRoot(root, '/tmp/other/a.md'), false)
})

test('symlink inside root is still rejected by assertNoSymlinkEscape', async () => {
  const { assertNoSymlinkEscape } = await import('../dist/paths.js')
  await withTemp(async (dir) => {
    const target = path.join(dir, 'outside.txt')
    const link = path.join(dir, 'raw', 'link.md')
    await writeFile(target, 'nope\n')
    await mkdir(path.join(dir, 'raw'))
    await symlink(target, link)
    await assert.rejects(() => assertNoSymlinkEscape(dir, link), PathEscapeError)
  })
})
