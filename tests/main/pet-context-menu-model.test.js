const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildPetContextMenuItems,
  filterManualPetActions
} = require('../../src/main/pet-context-menu-model')

const createCallbacks = () => {
  const calls = []
  return {
    calls,
    callbacks: {
      onWalk: () => calls.push(['walk']),
      onAction: (actionId) => calls.push(['action', actionId]),
      onChat: () => calls.push(['chat']),
      onSettings: () => calls.push(['settings']),
      onQuit: () => calls.push(['quit'])
    }
  }
}

test('filterManualPetActions keeps triggerable actions in resource order', () => {
  const actions = filterManualPetActions([
    { id: 'idle', label: '待机', kind: 'idle' },
    { id: 'wave', label: '挥手', kind: 'greeting' },
    { id: 'run', label: '奔跑', kind: 'working' },
    { id: 'review', label: '评审', kind: 'thinking' },
    { id: 'jump', label: '跳跃', kind: 'custom' },
    { id: 'failed', label: '失败', kind: 'failure' }
  ])

  assert.deepEqual(actions.map((action) => action.id), ['wave', 'review', 'jump'])
})

test('buildPetContextMenuItems creates the accepted first-level and action submenu structure', () => {
  const { callbacks } = createCallbacks()
  const items = buildPetContextMenuItems({
    actions: [
      { id: 'idle', label: '待机', kind: 'idle' },
      { id: 'wave', label: '挥手', kind: 'greeting' }
    ],
    canChat: true,
    ...callbacks
  })

  assert.deepEqual(items.map((item) => item.label || item.type), [
    '动作',
    '和宠物聊天',
    'separator',
    '设置',
    'separator',
    '退出'
  ])
  assert.equal(items[0].id, 'actions')
  assert.equal(items[0].type, 'submenu')
  assert.deepEqual(items[0].submenu.map((item) => item.label), ['散步', '挥手'])
  assert.deepEqual(items[0].submenu.map((item) => item.id), ['walk', 'action:wave'])
})

test('buildPetContextMenuItems hides actions when no manual animation is available', () => {
  const { callbacks } = createCallbacks()
  const items = buildPetContextMenuItems({
    actions: [
      { id: 'idle', label: '待机', kind: 'idle' },
      { id: 'run', label: '奔跑', kind: 'working' }
    ],
    canChat: false,
    ...callbacks
  })

  assert.deepEqual(items.map((item) => item.label || item.type), ['设置', 'separator', '退出'])
})

test('buildPetContextMenuItems keeps a submenu for one manual animation and invokes callbacks', () => {
  const { callbacks, calls } = createCallbacks()
  const items = buildPetContextMenuItems({
    actions: [{ id: 'wave', label: '挥手', kind: 'greeting' }],
    canChat: true,
    ...callbacks
  })

  items[0].submenu[0].onSelect()
  items[0].submenu[1].onSelect()
  items[1].onSelect()
  items[3].onSelect()
  items[5].onSelect()

  assert.deepEqual(calls, [
    ['walk'],
    ['action', 'wave'],
    ['chat'],
    ['settings'],
    ['quit']
  ])
})
