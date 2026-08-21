import assert from 'node:assert/strict'
import test from 'node:test'
import { Config } from '../dist/config.js'

test('Config fills defaults', () => {
  const result = Config['~standard'].validate({})
  assert.equal('value' in result, true)
  if ('value' in result) {
    assert.equal(result.value.root, '~/tongjian')
    assert.deepEqual(result.value.sourceRoots, [])
    assert.equal(result.value.orientBudgetChars, 8000)
  }
})

test('Config rejects bad sourceRoots', () => {
  const result = Config['~standard'].validate({ sourceRoots: [1] })
  assert.equal('issues' in result, true)
})
