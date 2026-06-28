const test = require('node:test')
const assert = require('node:assert/strict')

const {
  choosePetContextMenuPoint,
  choosePetContextSubmenuPoint,
  estimatePetContextMenuSize,
  filterManualPetActions
} = require('../../src/main/pet-context-menu')

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

test('choosePetContextMenuPoint keeps tall side menus inside the work area near the bottom edge', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 1000, y: 720, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
    menuSize: { width: 180, height: 420 },
    preferredPoint: { x: 75, y: 75 },
    menuPosition: 'right'
  })

  assert.equal(point.placement, 'right')
  assert.equal(point.screenPoint.x, 1162)
  assert.equal(point.screenPoint.y, 472)
  assert.equal(point.screenPoint.y + 420, 892)
  assert.equal(point.windowPoint.x > 150, true)
})

test('choosePetContextMenuPoint keeps auto-positioned tall side menus inside the work area', () => {
  const point = choosePetContextMenuPoint({
    petBounds: { x: 1000, y: 720, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
    menuSize: { width: 180, height: 420 },
    preferredPoint: { x: 75, y: 75 },
    menuPosition: 'auto'
  })

  assert.equal(point.placement, 'right')
  assert.equal(point.screenPoint.x, 1162)
  assert.equal(point.screenPoint.y, 472)
  assert.equal(point.screenPoint.y + 420, 892)
  assert.equal(point.windowPoint.x > 150, true)
})

test('estimatePetContextMenuSize scales with action count but keeps stable bounds', () => {
  assert.deepEqual(estimatePetContextMenuSize([
    { type: 'submenu', label: '动作' },
    { type: 'action', label: '设置' },
    { type: 'action', label: '退出' }
  ]), { width: 112, height: 116 })
  assert.deepEqual(estimatePetContextMenuSize([
    { type: 'submenu', label: '动作' },
    { type: 'action', label: '和宠物聊天' },
    { type: 'separator' },
    { type: 'action', label: '设置' },
    { type: 'separator' },
    { type: 'action', label: '退出' }
  ]), { width: 124, height: 176 })
})

test('filterManualPetActions hides state-like actions and keeps manual actions in original order', () => {
  const actions = filterManualPetActions([
    { id: 'idle', label: '待机', kind: 'idle' },
    { id: 'wave', label: '挥手', kind: 'greeting' },
    { id: 'run', label: '奔跑', kind: 'working' },
    { id: 'review', label: '评审', kind: 'thinking' },
    { id: 'custom-jump', label: '跳跃', kind: 'custom' },
    { id: 'failed', label: '失败', kind: 'failure' }
  ])

  assert.deepEqual(actions.map((action) => action.id), ['wave', 'review', 'custom-jump'])
})

test('choosePetContextSubmenuPoint opens to the right of the parent menu row when there is room', () => {
  const placement = choosePetContextSubmenuPoint({
    parentMenuBounds: { x: 360, y: 120, width: 132, height: 176 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    submenuSize: { width: 148, height: 146 },
    anchorOffsetTop: 6,
    anchorHeight: 30
  })

  assert.equal(placement.placement, 'right')
  assert.deepEqual(placement.screenPoint, { x: 504, y: 120 })
})

test('choosePetContextSubmenuPoint flips to the left when the right side would overflow', () => {
  const placement = choosePetContextSubmenuPoint({
    parentMenuBounds: { x: 760, y: 120, width: 132, height: 176 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    submenuSize: { width: 148, height: 146 },
    anchorOffsetTop: 36,
    anchorHeight: 30
  })

  assert.equal(placement.placement, 'left')
  assert.deepEqual(placement.screenPoint, { x: 600, y: 150 })
})
