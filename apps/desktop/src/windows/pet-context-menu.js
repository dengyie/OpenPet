const {
  buildPetContextMenuItems,
  filterManualPetActions
} = require('./pet-context-menu-model')
const {
  MENU_METRICS,
  constrainPetContextMenuSize,
  layoutPetContextMenu,
  layoutPetContextSubmenu,
  measurePetContextMenu,
  normalizeMenuPosition
} = require('./pet-context-menu-layout')

const withLegacySizeFields = (menuSize) => ({
  width: menuSize.width,
  height: menuSize.height,
  contentHeight: menuSize.contentHeight ?? menuSize.height,
  scrollable: Boolean(menuSize.scrollable)
})

const choosePetContextMenuPoint = ({ petBounds, workArea, menuSize, preferredPoint, menuPosition }) => {
  const layout = layoutPetContextMenu({
    petBounds,
    workArea,
    size: withLegacySizeFields(menuSize),
    preferredPoint,
    menuPosition
  })

  return {
    placement: layout.placement,
    screenPoint: layout.point,
    windowPoint: {
      x: layout.point.x - petBounds.x,
      y: layout.point.y - petBounds.y
    },
    reason: layout.reason,
    candidates: layout.candidates
  }
}

const toLegacySubmenuCandidate = (candidate, workArea, size) => ({
  placement: candidate.placement,
  screenPoint: candidate.point,
  overlapArea: candidate.petOverlapArea,
  petOverlapArea: candidate.petOverlapArea,
  parentOverlapArea: candidate.parentOverlapArea,
  overflowArea: candidate.overflowArea,
  idealPoint: candidate.idealPoint,
  fitsHorizontally: (
    candidate.idealPoint.x >= workArea.x + MENU_METRICS.screenMargin
    && candidate.idealPoint.x + size.width <= workArea.x + workArea.width - MENU_METRICS.screenMargin
  )
})

const choosePetContextSubmenuPoint = ({
  parentMenuBounds,
  workArea,
  submenuSize,
  petBounds,
  anchorOffsetTop,
  anchorHeight
}) => {
  const size = withLegacySizeFields(submenuSize)
  const layout = layoutPetContextSubmenu({
    parentMenuBounds,
    workArea,
    size,
    petBounds,
    anchorOffsetTop,
    anchorHeight
  })
  const rightCandidate = layout.candidates.find((candidate) => candidate.placement === 'right')
  const leftCandidate = layout.candidates.find((candidate) => candidate.placement === 'left')

  return {
    placement: layout.placement,
    screenPoint: layout.point,
    anchorHeight: layout.anchorHeight,
    reason: layout.reason,
    parentOverlapArea: layout.parentOverlapArea,
    petOverlapArea: layout.petOverlapArea,
    rightCandidate: toLegacySubmenuCandidate(rightCandidate, workArea, size),
    leftCandidate: toLegacySubmenuCandidate(leftCandidate, workArea, size)
  }
}

module.exports = {
  MENU_METRICS,
  buildPetContextMenuItems,
  choosePetContextMenuPoint,
  choosePetContextSubmenuPoint,
  constrainPetContextMenuSize,
  estimatePetContextMenuSize: measurePetContextMenu,
  filterManualPetActions,
  layoutPetContextMenu,
  layoutPetContextSubmenu,
  measurePetContextMenu,
  normalizeMenuPosition
}
