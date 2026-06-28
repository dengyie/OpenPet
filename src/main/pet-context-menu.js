const { inferActionKind } = require('./pet-pack/schema')

const MENU_GAP = 12
const MENU_MARGIN = 8
const MENU_MIN_WIDTH = 112
const MENU_MAX_WIDTH = 220
const MENU_VERTICAL_PADDING = 26
const MENU_ROW_HEIGHT = 30
const MENU_DIVIDER_HEIGHT = 15
const MENU_INNER_PADDING = 6
const MENU_PLACEMENTS = ['right', 'left', 'above', 'below']
const HIDDEN_MANUAL_ACTION_KINDS = new Set(['idle', 'working', 'waiting', 'failure'])
const MENU_POSITION_ALIASES = {
  auto: null,
  right: 'right',
  left: 'left',
  above: 'above',
  below: 'below',
  top: 'above',
  bottom: 'below'
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const filterManualPetActions = (actions = []) => {
  return actions.filter((action) => {
    if (!action || !action.id) return false
    const kind = String(action.kind || inferActionKind(action.id) || 'custom')
    return !HIDDEN_MANUAL_ACTION_KINDS.has(kind)
  })
}

const estimatePetContextMenuSize = (items = []) => {
  const longestLabel = items.reduce((length, item) => {
    if (!item || item.type === 'separator') return length
    return Math.max(length, String(item.label || '').length)
  }, 0)
  const width = clamp(84 + longestLabel * 8, MENU_MIN_WIDTH, MENU_MAX_WIDTH)
  const actionItemCount = items.filter((item) => item && item.type !== 'separator').length
  const separatorCount = items.filter((item) => item && item.type === 'separator').length
  const height = MENU_VERTICAL_PADDING + actionItemCount * MENU_ROW_HEIGHT + separatorCount * MENU_DIVIDER_HEIGHT
  return { width, height }
}

const createCandidate = ({ petBounds, workArea, menuSize, preferredPoint, placement }) => {
  const centeredY = petBounds.y + preferredPoint.y - Math.round(menuSize.height / 2)
  const centeredX = petBounds.x + preferredPoint.x - Math.round(menuSize.width / 2)
  if (placement === 'right') {
    return {
      placement,
      x: petBounds.x + petBounds.width + MENU_GAP,
      y: centeredY
    }
  }
  if (placement === 'left') {
    return {
      placement,
      x: petBounds.x - menuSize.width - MENU_GAP,
      y: centeredY
    }
  }
  if (placement === 'above') {
    return {
      placement,
      x: centeredX,
      y: petBounds.y - menuSize.height - MENU_GAP
    }
  }
  return {
    placement,
    x: centeredX,
    y: petBounds.y + petBounds.height + MENU_GAP
  }
}

const fitsWorkArea = ({ x, y }, workArea, menuSize) => (
  x >= workArea.x + MENU_MARGIN &&
  y >= workArea.y + MENU_MARGIN &&
  x + menuSize.width <= workArea.x + workArea.width - MENU_MARGIN &&
  y + menuSize.height <= workArea.y + workArea.height - MENU_MARGIN
)

const normalizeMenuPosition = (menuPosition) => MENU_POSITION_ALIASES[String(menuPosition || 'auto')] || null

const getPlacementOrder = (menuPosition) => {
  const preferredPlacement = normalizeMenuPosition(menuPosition)
  if (!preferredPlacement) return MENU_PLACEMENTS
  if (preferredPlacement === 'right') return ['right', 'left', 'above', 'below']
  if (preferredPlacement === 'left') return ['left', 'right', 'above', 'below']
  if (preferredPlacement === 'above') return ['above', 'below', 'right', 'left']
  return ['below', 'above', 'right', 'left']
}

const fitsPrimaryAxis = (candidate, workArea, menuSize) => {
  if (candidate.placement === 'right') {
    return candidate.x + menuSize.width <= workArea.x + workArea.width - MENU_MARGIN
  }
  if (candidate.placement === 'left') {
    return candidate.x >= workArea.x + MENU_MARGIN
  }
  if (candidate.placement === 'above') {
    return candidate.y >= workArea.y + MENU_MARGIN
  }
  return candidate.y + menuSize.height <= workArea.y + workArea.height - MENU_MARGIN
}

const clampCrossAxisNearPet = ({ candidate, petBounds, workArea, menuSize }) => {
  const minX = workArea.x + MENU_MARGIN
  const minY = workArea.y + MENU_MARGIN
  const maxX = workArea.x + workArea.width - menuSize.width - MENU_MARGIN
  const maxY = workArea.y + workArea.height - menuSize.height - MENU_MARGIN

  if (candidate.placement === 'right' || candidate.placement === 'left') {
    const relativeY = clamp(
      candidate.y - petBounds.y,
      -Math.round(petBounds.height / 2),
      Math.round(petBounds.height / 2)
    )
    return {
      x: Math.round(clamp(candidate.x, minX, Math.max(minX, maxX))),
      y: Math.round(clamp(petBounds.y + relativeY, minY, Math.max(minY, maxY)))
    }
  }

  const relativeX = clamp(
    candidate.x - petBounds.x,
    -Math.round(petBounds.width / 2),
    Math.round(petBounds.width / 2)
  )
  return {
    x: Math.round(clamp(petBounds.x + relativeX, minX, Math.max(minX, maxX))),
    y: Math.round(clamp(candidate.y, minY, Math.max(minY, maxY)))
  }
}

const choosePetContextMenuPoint = ({ petBounds, workArea, menuSize, preferredPoint, menuPosition }) => {
  const safePreferredPoint = {
    x: Number.isFinite(preferredPoint?.x) ? preferredPoint.x : Math.round(petBounds.width / 2),
    y: Number.isFinite(preferredPoint?.y) ? preferredPoint.y : Math.round(petBounds.height / 2)
  }
  const placements = getPlacementOrder(menuPosition)
  const candidates = placements.map((placement) => createCandidate({
    petBounds,
    workArea,
    menuSize,
    preferredPoint: safePreferredPoint,
    placement
  }))
  const preferredPlacement = normalizeMenuPosition(menuPosition)
  const preferredCandidate = preferredPlacement ? candidates[0] : null
  const chosen = (preferredCandidate && fitsPrimaryAxis(preferredCandidate, workArea, menuSize) ? preferredCandidate : null)
    || (!preferredPlacement ? candidates.find((candidate) => fitsPrimaryAxis(candidate, workArea, menuSize)) : null)
    || candidates.find((candidate) => fitsWorkArea(candidate, workArea, menuSize))
    || candidates.find((candidate) => fitsPrimaryAxis(candidate, workArea, menuSize))
    || candidates[0]
  const screenPoint = clampCrossAxisNearPet({ candidate: chosen, petBounds, workArea, menuSize })
  return {
    placement: chosen.placement,
    screenPoint,
    windowPoint: {
      x: screenPoint.x - petBounds.x,
      y: screenPoint.y - petBounds.y
    }
  }
}

const choosePetContextSubmenuPoint = ({ parentMenuBounds, workArea, submenuSize, anchorOffsetTop = MENU_INNER_PADDING, anchorHeight = MENU_ROW_HEIGHT }) => {
  const minY = workArea.y + MENU_MARGIN
  const maxY = workArea.y + workArea.height - submenuSize.height - MENU_MARGIN
  const desiredY = parentMenuBounds.y + anchorOffsetTop - MENU_INNER_PADDING
  const rightX = parentMenuBounds.x + parentMenuBounds.width + MENU_GAP
  const leftX = parentMenuBounds.x - submenuSize.width - MENU_GAP
  const rightFits = rightX + submenuSize.width <= workArea.x + workArea.width - MENU_MARGIN
  const placement = rightFits ? 'right' : 'left'
  return {
    placement,
    screenPoint: {
      x: placement === 'right' ? rightX : Math.max(workArea.x + MENU_MARGIN, leftX),
      y: Math.round(clamp(desiredY, minY, Math.max(minY, maxY)))
    },
    anchorHeight
  }
}

module.exports = {
  choosePetContextMenuPoint,
  choosePetContextSubmenuPoint,
  estimatePetContextMenuSize,
  filterManualPetActions,
  normalizeMenuPosition
}
