const { inferActionKind } = require('./pet-pack/schema')

const HIDDEN_MANUAL_ACTION_KINDS = new Set(['idle', 'working', 'waiting', 'failure'])

const filterManualPetActions = (actions = []) => actions.filter((action) => {
  if (!action?.id) return false
  const kind = String(action.kind || inferActionKind(action.id) || 'custom').toLowerCase()
  return !HIDDEN_MANUAL_ACTION_KINDS.has(kind)
})

const buildPetContextMenuItems = ({
  actions = [],
  canChat = false,
  onWalk = () => {},
  onAction = () => {},
  onChat = () => {},
  onSettings = () => {},
  onQuit = () => {}
} = {}) => {
  const manualActions = filterManualPetActions(actions)
  const items = []

  if (manualActions.length > 0) {
    items.push({
      id: 'actions',
      type: 'submenu',
      label: '动作',
      submenu: [
        {
          id: 'walk',
          type: 'action',
          label: '散步',
          onSelect: onWalk
        },
        ...manualActions.map((action) => ({
          id: `action:${action.id}`,
          type: 'action',
          label: action.label || action.id,
          onSelect: () => onAction(action.id)
        }))
      ]
    })
  }

  if (canChat) {
    items.push({
      id: 'chat',
      type: 'action',
      label: '和宠物聊天',
      onSelect: onChat
    })
  }

  if (items.length > 0) items.push({ type: 'separator' })
  items.push({ id: 'settings', type: 'action', label: '设置', onSelect: onSettings })
  items.push({ type: 'separator' })
  items.push({ id: 'quit', type: 'action', label: '退出', onSelect: onQuit })

  return items
}

module.exports = {
  buildPetContextMenuItems,
  filterManualPetActions
}
