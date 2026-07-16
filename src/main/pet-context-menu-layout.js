const MENU_METRICS = Object.freeze({
  screenMargin: 8,
  petGap: 12,
  submenuGap: 0,
  minWidth: 112,
  maxWidth: 220,
  padding: 6,
  rowHeight: 30,
  separatorHeight: 1,
  separatorMargin: 3,
  separatorBlockHeight: 7
})

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const createRect = ({ x, y, width, height }) => ({
  left: x,
  top: y,
  right: x + width,
  bottom: y + height
})

const getRectIntersectionArea = (leftRect, rightRect) => {
  const width = Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left)
  const height = Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top)
  return width > 0 && height > 0 ? width * height : 0
}

const getOverflowArea = (rect, workArea) => {
  const workRect = createRect(workArea)
  const area = Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top)
  return Math.max(0, area - getRectIntersectionArea(rect, workRect))
}

const clampPointToWorkArea = ({ x, y }, workArea, size) => {
  const minX = workArea.x + MENU_METRICS.screenMargin
  const minY = workArea.y + MENU_METRICS.screenMargin
  const maxX = workArea.x + workArea.width - size.width - MENU_METRICS.screenMargin
  const maxY = workArea.y + workArea.height - size.height - MENU_METRICS.screenMargin

  return {
    x: Math.round(clamp(x, minX, Math.max(minX, maxX))),
    y: Math.round(clamp(y, minY, Math.max(minY, maxY)))
  }
}

const getDistance = (left, right) => Math.abs(left.x - right.x) + Math.abs(left.y - right.y)

const MENU_POSITION_ALIASES = {
  auto: null,
  right: 'right',
  left: 'left',
  above: 'above',
  below: 'below',
  top: 'above',
  bottom: 'below'
}

const normalizeMenuPosition = (menuPosition) => MENU_POSITION_ALIASES[String(menuPosition || 'auto')] || null

const getPlacementOrder = (menuPosition) => {
  const preferred = normalizeMenuPosition(menuPosition)
  if (preferred === 'left') return ['left', 'right', 'above', 'below']
  if (preferred === 'above') return ['above', 'below', 'right', 'left']
  if (preferred === 'below') return ['below', 'above', 'right', 'left']
  return ['right', 'left', 'above', 'below']
}

const measurePetContextMenu = (items = []) => {
  const longestLabel = items.reduce((length, item) => {
    if (!item || item.type === 'separator') return length
    return Math.max(length, String(item.label || '').length)
  }, 0)
  const actionCount = items.filter((item) => item && item.type !== 'separator').length
  const separatorCount = items.filter((item) => item?.type === 'separator').length

  return {
    width: clamp(84 + longestLabel * 8, MENU_METRICS.minWidth, MENU_METRICS.maxWidth),
    height: MENU_METRICS.padding * 2
      + actionCount * MENU_METRICS.rowHeight
      + separatorCount * MENU_METRICS.separatorBlockHeight
  }
}

const constrainPetContextMenuSize = ({ contentSize, workArea }) => {
  const availableWidth = Math.max(1, Number(workArea?.width || 0) - MENU_METRICS.screenMargin * 2)
  const availableHeight = Math.max(1, Number(workArea?.height || 0) - MENU_METRICS.screenMargin * 2)
  const width = Math.min(Number(contentSize?.width || MENU_METRICS.minWidth), availableWidth)
  const contentHeight = Number(contentSize?.height || 0)
  const height = Math.min(contentHeight, availableHeight)

  return {
    width,
    height,
    contentHeight,
    scrollable: contentHeight > height
  }
}

const createRootIdealPoint = ({ placement, petBounds, size, preferredPoint }) => {
  const centeredX = petBounds.x + preferredPoint.x - Math.round(size.width / 2)
  const centeredY = petBounds.y + preferredPoint.y - Math.round(size.height / 2)

  if (placement === 'right') {
    return { x: petBounds.x + petBounds.width + MENU_METRICS.petGap, y: centeredY }
  }
  if (placement === 'left') {
    return { x: petBounds.x - size.width - MENU_METRICS.petGap, y: centeredY }
  }
  if (placement === 'above') {
    return { x: centeredX, y: petBounds.y - size.height - MENU_METRICS.petGap }
  }
  return { x: centeredX, y: petBounds.y + petBounds.height + MENU_METRICS.petGap }
}

const layoutPetContextMenu = ({ petBounds, workArea, size, preferredPoint, menuPosition }) => {
  const safePreferredPoint = {
    x: Number.isFinite(preferredPoint?.x) ? preferredPoint.x : Math.round(petBounds.width / 2),
    y: Number.isFinite(preferredPoint?.y) ? preferredPoint.y : Math.round(petBounds.height / 2)
  }
  const placementOrder = getPlacementOrder(menuPosition)
  const petRect = createRect(petBounds)
  const candidates = placementOrder.map((placement, preferenceRank) => {
    const idealPoint = createRootIdealPoint({ placement, petBounds, size, preferredPoint: safePreferredPoint })
    const point = clampPointToWorkArea(idealPoint, workArea, size)
    const rect = createRect({ ...point, width: size.width, height: size.height })

    return {
      placement,
      preferenceRank,
      idealPoint,
      point,
      overflowArea: getOverflowArea(rect, workArea),
      idealOverflowArea: getOverflowArea(
        createRect({ ...idealPoint, width: size.width, height: size.height }),
        workArea
      ),
      petOverlapArea: getRectIntersectionArea(rect, petRect),
      displacement: getDistance(idealPoint, point)
    }
  })
  const ranked = [...candidates].sort((left, right) => (
    left.overflowArea - right.overflowArea
    || left.petOverlapArea - right.petOverlapArea
    || left.preferenceRank - right.preferenceRank
    || left.displacement - right.displacement
  ))
  const chosen = ranked[0]
  const preferred = candidates[0]
  let reason = 'preferred-placement'
  if (chosen.overflowArea < preferred.overflowArea) reason = 'avoids-overflow'
  else if (chosen.petOverlapArea < preferred.petOverlapArea) reason = 'avoids-pet'
  else if (chosen.placement !== preferred.placement) reason = 'fallback-placement'

  return {
    placement: chosen.placement,
    point: chosen.point,
    size,
    reason,
    overflowArea: chosen.overflowArea,
    petOverlapArea: chosen.petOverlapArea,
    candidates
  }
}

const layoutPetContextSubmenu = ({
  parentMenuBounds,
  workArea,
  size,
  petBounds,
  anchorOffsetTop = MENU_METRICS.padding,
  anchorHeight = MENU_METRICS.rowHeight
}) => {
  const desiredY = parentMenuBounds.y + anchorOffsetTop - MENU_METRICS.padding
  const parentRect = createRect(parentMenuBounds)
  const petRect = petBounds ? createRect(petBounds) : null
  const placements = ['right', 'left']
  const candidates = placements.map((placement) => {
    const idealPoint = {
      x: placement === 'right'
        ? parentMenuBounds.x + parentMenuBounds.width + MENU_METRICS.submenuGap
        : parentMenuBounds.x - size.width - MENU_METRICS.submenuGap,
      y: desiredY
    }
    const point = clampPointToWorkArea(idealPoint, workArea, size)
    const idealRect = createRect({ ...idealPoint, width: size.width, height: size.height })
    const rect = createRect({ ...point, width: size.width, height: size.height })
    const idealOverflowArea = getOverflowArea(idealRect, workArea)

    return {
      placement,
      idealPoint,
      point,
      overflowArea: getOverflowArea(rect, workArea),
      idealOverflowArea,
      fitsIdeal: idealOverflowArea === 0,
      parentOverlapArea: getRectIntersectionArea(rect, parentRect),
      petOverlapArea: petRect ? getRectIntersectionArea(rect, petRect) : 0,
      displacement: getDistance(idealPoint, point)
    }
  })
  const ranked = [...candidates].sort((left, right) => (
    Number(right.fitsIdeal) - Number(left.fitsIdeal)
    || left.parentOverlapArea - right.parentOverlapArea
    || left.petOverlapArea - right.petOverlapArea
    || left.displacement - right.displacement
    || (left.placement === 'right' ? -1 : 1)
  ))
  const chosen = ranked[0]
  const rightCandidate = candidates[0]
  const leftCandidate = candidates[1]
  let reason = 'right-preferred'
  if (!chosen.fitsIdeal && !candidates.some((candidate) => candidate.fitsIdeal)) reason = 'constrained-space'
  else if (chosen.petOverlapArea < rightCandidate.petOverlapArea) reason = 'avoids-pet'
  else if (chosen.placement === 'left' && leftCandidate.fitsIdeal !== rightCandidate.fitsIdeal) reason = 'avoids-edge'
  else if (chosen.placement === 'left') reason = 'left-preferred-by-score'

  return {
    placement: chosen.placement,
    point: chosen.point,
    size,
    reason,
    overflowArea: chosen.overflowArea,
    parentOverlapArea: chosen.parentOverlapArea,
    petOverlapArea: chosen.petOverlapArea,
    anchorHeight,
    candidates
  }
}

module.exports = {
  MENU_METRICS,
  constrainPetContextMenuSize,
  layoutPetContextMenu,
  layoutPetContextSubmenu,
  measurePetContextMenu,
  normalizeMenuPosition
}
