import assert from 'node:assert/strict'
import test from 'node:test'
import { paneIsCollapsed, resolvePaneTrack, WENMAI_PANE_DEFAULT, WENMAI_PANE_RAIL } from '../dist/ui/pane.js'

test('wide center keeps the preferred wenmai pane and leaves room for chat', () => {
  assert.equal(resolvePaneTrack(1000, WENMAI_PANE_DEFAULT, true), WENMAI_PANE_DEFAULT)
  assert.equal(paneIsCollapsed(WENMAI_PANE_DEFAULT), false)
})

test('closed pane collapses to the rail', () => {
  assert.equal(resolvePaneTrack(1000, 400, false), WENMAI_PANE_RAIL)
  assert.equal(paneIsCollapsed(WENMAI_PANE_RAIL), true)
})

test('tight center shrinks the pane instead of covering the chat', () => {
  const track = resolvePaneTrack(640, 460, true)
  assert.equal(track <= 400, true)
  assert.equal(track >= 180, true)
})

test('very narrow center falls back to the rail', () => {
  assert.equal(resolvePaneTrack(400, 360, true), WENMAI_PANE_RAIL)
})
