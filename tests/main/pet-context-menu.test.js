const test = require('node:test')
const assert = require('node:assert/strict')

const { choosePetContextMenuPoint, estimatePetContextMenuSize } = require('../../src/main/pet-context-menu')

test('choosePetContextMenuPoint keeps native menus near the pet instead of resizing the pet window', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 1228, y: 727, width: 104, height: 112 },
    workArea: { x: 0, y: 0, width: 1512, height: 900 },
    menuSize: { width: 148, height: 420 },
    preferredPoint: { x: 10, y: 36 }
  })

  assert.equal(point.placement, 'right')
  assert.equal(point.screenPoint.x, 1344)
  assert.equal(Math.abs(point.screenPoint.y - 727) <= 56, true)
})

test('choosePetContextMenuPoint falls back to the left near the right screen edge', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 1380, y: 727, width: 104, height: 112 },
    workArea: { x: 0, y: 0, width: 1512, height: 900 },
    menuSize: { width: 148, height: 260 },
    preferredPoint: { x: 52, y: 56 }
  })

  assert.equal(point.placement, 'left')
  assert.equal(point.screenPoint.x, 1220)
})

test('estimatePetContextMenuSize scales with action count but keeps stable bounds', () => {
  assert.deepEqual(estimatePetContextMenuSize([
    { label: '待机' },
    { label: '超长动作名称测试' }
  ]), { width: 148, height: 176 })
})
