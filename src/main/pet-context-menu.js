const MENU_GAP = 12
const MENU_MARGIN = 8
const MENU_MIN_WIDTH = 112
const MENU_MAX_WIDTH = 220
const MENU_VERTICAL_PADDING = 12
const MENU_ROW_HEIGHT = 30
const MENU_DIVIDER_HEIGHT = 7
const MENU_PLACEMENTS = ['right', 'left', 'above', 'below']
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

const estimatePetContextMenuSize = (actions = []) => {
  const longestLabel = actions.reduce((length, action) => {
    return Math.max(length, String(action?.label || '').length)
  }, 0)
  const width = clamp(84 + longestLabel * 8, MENU_MIN_WIDTH, MENU_MAX_WIDTH)
  const itemCount = actions.length + 3
  const height = MENU_VERTICAL_PADDING + itemCount * MENU_ROW_HEIGHT + 2 * MENU_DIVIDER_HEIGHT
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
  return [
    preferredPlacement,
    ...MENU_PLACEMENTS.filter((placement) => placement !== preferredPlacement)
  ]
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
  const chosen = candidates.find((candidate) => fitsWorkArea(candidate, workArea, menuSize)) || candidates[0]
  const minX = workArea.x + MENU_MARGIN
  const minY = workArea.y + MENU_MARGIN
  const maxX = workArea.x + workArea.width - menuSize.width - MENU_MARGIN
  const maxY = workArea.y + workArea.height - menuSize.height - MENU_MARGIN
  const screenPoint = {
    x: Math.round(clamp(chosen.x, minX, Math.max(minX, maxX))),
    y: Math.round(clamp(chosen.y, minY, Math.max(minY, maxY)))
  }
  return {
    placement: chosen.placement,
    screenPoint,
    popupPoint: {
      x: screenPoint.x - petBounds.x,
      y: screenPoint.y - petBounds.y
    }
  }
}

module.exports = {
  choosePetContextMenuPoint,
  estimatePetContextMenuSize,
  normalizeMenuPosition
}
