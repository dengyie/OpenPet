const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getSpriteLayout
} = require('../../examples/plugins/creator-studio/lib/action-sheet-layout')

test('quality-first character layouts use square multi-row grids', () => {
  assert.deepEqual(getSpriteLayout(4), { columns: 2, rows: 2, cellCount: 4, unusedCells: [], canvas: { width: 1024, height: 1024 } })
  assert.deepEqual(getSpriteLayout(5), { columns: 3, rows: 2, cellCount: 6, unusedCells: [5], canvas: { width: 1024, height: 1024 } })
  assert.deepEqual(getSpriteLayout(6), { columns: 3, rows: 2, cellCount: 6, unusedCells: [], canvas: { width: 1024, height: 1024 } })
  assert.deepEqual(getSpriteLayout(8), { columns: 4, rows: 2, cellCount: 8, unusedCells: [], canvas: { width: 1024, height: 1024 } })
})

test('quality-first character layouts reject unsupported frame counts', () => {
  assert.throws(() => getSpriteLayout(7), /Unsupported quality-first sprite frame count/)
})
