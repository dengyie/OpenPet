const test = require('node:test')
const assert = require('node:assert/strict')

const {
  choosePetContextMenuPoint,
  choosePetContextSubmenuPoint,
  estimatePetContextMenuSize,
  filterManualPetActions
} = require('../../src/main/pet-context-menu')
const {
  MENU_METRICS,
  constrainPetContextMenuSize,
  layoutPetContextMenu,
  layoutPetContextSubmenu,
  measurePetContextMenu
} = require('../../src/main/pet-context-menu-layout')

test('menu metrics measure the exact rendered row and separator blocks', () => {
  const size = measurePetContextMenu([
    { type: 'action', label: '设置' },
    { type: 'separator' },
    { type: 'action', label: '退出' }
  ])

  assert.deepEqual(size, {
    width: 112,
    height: MENU_METRICS.padding * 2
      + MENU_METRICS.rowHeight * 2
      + MENU_METRICS.separatorBlockHeight
  })
})

test('menu sizing constrains long action lists to the work area and enables scrolling', () => {
  const contentSize = measurePetContextMenu(Array.from({ length: 30 }, (_, index) => ({
    type: 'action',
    label: `动作 ${index + 1}`
  })))
  const size = constrainPetContextMenuSize({
    contentSize,
    workArea: { x: 0, y: 0, width: 900, height: 700 }
  })

  assert.deepEqual(size, {
    width: contentSize.width,
    height: 700 - MENU_METRICS.screenMargin * 2,
    contentHeight: contentSize.height,
    scrollable: true
  })
})

test('root layout keeps the preferred side while clamping the cross axis into the work area', () => {
  const layout = layoutPetContextMenu({
    petBounds: { x: 1000, y: 720, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
    size: { width: 180, height: 420, contentHeight: 420, scrollable: false },
    preferredPoint: { x: 75, y: 75 },
    menuPosition: 'right'
  })

  assert.equal(layout.placement, 'right')
  assert.deepEqual(layout.point, { x: 1162, y: 472 })
  assert.equal(layout.reason, 'preferred-placement')
  assert.equal(layout.candidates.every((candidate) => candidate.overflowArea === 0), true)
})

test('root layout falls back from a preferred side when clamping would cover the pet', () => {
  const layout = layoutPetContextMenu({
    petBounds: { x: 360, y: 20, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    size: { width: 140, height: 220, contentHeight: 220, scrollable: false },
    preferredPoint: { x: 70, y: 80 },
    menuPosition: 'above'
  })

  assert.equal(layout.placement, 'below')
  assert.equal(layout.petOverlapArea, 0)
  assert.equal(layout.reason, 'avoids-pet')
})

test('root layout supports shifted negative-coordinate displays', () => {
  const layout = layoutPetContextMenu({
    petBounds: { x: -1180, y: 260, width: 120, height: 120 },
    workArea: { x: -1440, y: 24, width: 1440, height: 876 },
    size: { width: 124, height: 146, contentHeight: 146, scrollable: false },
    preferredPoint: { x: 60, y: 60 },
    menuPosition: 'left'
  })

  assert.equal(layout.placement, 'left')
  assert.equal(layout.point.x >= -1432, true)
  assert.equal(layout.point.y >= 32, true)
  assert.equal(layout.point.x + layout.size.width <= -8, true)
})

test('submenu layout opens flush right when both sides fit and neither covers the pet', () => {
  const layout = layoutPetContextSubmenu({
    parentMenuBounds: { x: 360, y: 120, width: 132, height: 146 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    size: { width: 148, height: 146, contentHeight: 146, scrollable: false },
    petBounds: { x: 100, y: 100, width: 120, height: 120 },
    anchorOffsetTop: 6
  })

  assert.equal(layout.placement, 'right')
  assert.deepEqual(layout.point, { x: 492, y: 120 })
  assert.equal(layout.parentOverlapArea, 0)
  assert.equal(layout.reason, 'right-preferred')
})

test('submenu layout chooses the fitting side that avoids covering the pet', () => {
  const layout = layoutPetContextSubmenu({
    parentMenuBounds: { x: 420, y: 220, width: 132, height: 176 },
    workArea: { x: 0, y: 0, width: 900, height: 520 },
    size: { width: 148, height: 200, contentHeight: 200, scrollable: false },
    petBounds: { x: 560, y: 120, width: 140, height: 330 },
    anchorOffsetTop: 36
  })

  assert.equal(layout.placement, 'left')
  assert.deepEqual(layout.point, { x: 272, y: 250 })
  assert.equal(layout.petOverlapArea, 0)
  assert.equal(layout.reason, 'avoids-pet')
})

test('submenu layout protects the parent menu when neither side fits', () => {
  const layout = layoutPetContextSubmenu({
    parentMenuBounds: { x: 1460, y: 140, width: 132, height: 176 },
    workArea: { x: 1440, y: 33, width: 220, height: 260 },
    size: { width: 148, height: 146, contentHeight: 146, scrollable: false },
    petBounds: { x: 1540, y: 120, width: 90, height: 120 },
    anchorOffsetTop: 36
  })

  const chosen = layout.candidates.find((candidate) => candidate.placement === layout.placement)
  const rejected = layout.candidates.find((candidate) => candidate.placement !== layout.placement)
  assert.equal(chosen.parentOverlapArea <= rejected.parentOverlapArea, true)
  assert.equal(layout.reason, 'constrained-space')
})

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
  ]), { width: 112, height: 102 })
  assert.deepEqual(estimatePetContextMenuSize([
    { type: 'submenu', label: '动作' },
    { type: 'action', label: '和宠物聊天' },
    { type: 'separator' },
    { type: 'action', label: '设置' },
    { type: 'separator' },
    { type: 'action', label: '退出' }
  ]), { width: 124, height: 146 })
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
  assert.deepEqual(placement.screenPoint, { x: 492, y: 120 })
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
  assert.deepEqual(placement.screenPoint, { x: 612, y: 150 })
})

test('choosePetContextSubmenuPoint prefers the side that avoids covering the pet', () => {
  const placement = choosePetContextSubmenuPoint({
    parentMenuBounds: { x: 420, y: 220, width: 132, height: 176 },
    workArea: { x: 0, y: 0, width: 900, height: 520 },
    submenuSize: { width: 148, height: 200 },
    petBounds: { x: 560, y: 120, width: 140, height: 330 },
    anchorOffsetTop: 36,
    anchorHeight: 30
  })

  assert.equal(placement.placement, 'left')
  assert.deepEqual(placement.screenPoint, { x: 272, y: 250 })
})

test('choosePetContextSubmenuPoint stays anchored to the parent row when only a distant detour would avoid the pet', () => {
  const placement = choosePetContextSubmenuPoint({
    parentMenuBounds: { x: 60, y: 260, width: 132, height: 176 },
    workArea: { x: 0, y: 0, width: 900, height: 900 },
    submenuSize: { width: 148, height: 146 },
    petBounds: { x: 244, y: 260, width: 150, height: 150 },
    anchorOffsetTop: 36,
    anchorHeight: 30
  })

  assert.equal(placement.placement, 'right')
  assert.deepEqual(placement.screenPoint, { x: 192, y: 290 })
})

test('choosePetContextSubmenuPoint protects the parent menu in a narrow shifted work area', () => {
  const placement = choosePetContextSubmenuPoint({
    parentMenuBounds: { x: 1460, y: 140, width: 132, height: 176 },
    workArea: { x: 1440, y: 33, width: 220, height: 260 },
    submenuSize: { width: 148, height: 146 },
    petBounds: { x: 1540, y: 120, width: 90, height: 120 },
    anchorOffsetTop: 36,
    anchorHeight: 30
  })

  assert.equal(placement.placement, 'right')
  assert.deepEqual(placement.screenPoint, { x: 1504, y: 139 })
  assert.equal(placement.rightCandidate.fitsHorizontally, false)
  assert.equal(placement.leftCandidate.fitsHorizontally, false)
  assert.equal(placement.rightCandidate.parentOverlapArea < placement.leftCandidate.parentOverlapArea, true)
})
