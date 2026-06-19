const test = require('node:test')
const assert = require('node:assert/strict')

const { choosePetContextMenuPoint, estimatePetContextMenuSize } = require('../../src/main/pet-context-menu')

test('choosePetContextMenuPoint places the menu beside the pet when there is room', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 100, y: 300, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    menuSize: { width: 140, height: 220 },
    preferredPoint: { x: 70, y: 80 }
  })

  assert.equal(point.placement, 'right')
  assert.deepEqual(point.screenPoint, { x: 262, y: 270 })
  assert.deepEqual(point.windowPoint, { x: 162, y: -30 })
})

test('choosePetContextMenuPoint moves the menu to the left near the right screen edge', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 720, y: 300, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    menuSize: { width: 140, height: 220 },
    preferredPoint: { x: 70, y: 80 }
  })

  assert.equal(point.placement, 'left')
  assert.deepEqual(point.screenPoint, { x: 568, y: 270 })
  assert.deepEqual(point.windowPoint, { x: -152, y: -30 })
})

test('choosePetContextMenuPoint honors a preferred placement when it fits', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 360, y: 300, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    menuSize: { width: 140, height: 220 },
    preferredPoint: { x: 70, y: 80 },
    menuPosition: 'above'
  })

  assert.equal(point.placement, 'above')
  assert.deepEqual(point.screenPoint, { x: 360, y: 68 })
})

test('choosePetContextMenuPoint falls back from a preferred placement when it would leave the screen', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 360, y: 20, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    menuSize: { width: 140, height: 220 },
    preferredPoint: { x: 70, y: 80 },
    menuPosition: 'above'
  })

  assert.equal(point.placement, 'below')
})

test('choosePetContextMenuPoint keeps tall menus close to the pet near the screen edge', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 1000, y: 720, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
    menuSize: { width: 180, height: 420 },
    preferredPoint: { x: 75, y: 75 },
    menuPosition: 'right'
  })

  assert.equal(point.placement, 'right')
  assert.equal(point.screenPoint.x, 1162)
  assert.equal(Math.abs(point.screenPoint.y - 720), 75)
})

test('choosePetContextMenuPoint keeps auto-positioned tall menus close to the pet', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 1000, y: 720, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
    menuSize: { width: 180, height: 420 },
    preferredPoint: { x: 75, y: 75 },
    menuPosition: 'auto'
  })

  assert.equal(point.placement, 'right')
  assert.equal(point.screenPoint.x, 1162)
  assert.equal(Math.abs(point.screenPoint.y - 720), 75)
})

test('estimatePetContextMenuSize scales with action count but keeps stable bounds', () => {
  assert.deepEqual(estimatePetContextMenuSize([
    { label: '待机' },
    { label: '超长动作名称测试' }
  ]), { width: 148, height: 176 })
})
