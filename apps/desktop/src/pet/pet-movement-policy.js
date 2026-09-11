const HOME_RADIUS_PX = Object.freeze({
  small: 120,
  medium: 220,
  large: 360
})

const GROUND_INSET = 40

const normalizePetHomeRadius = (value) => {
  if (value === 'small' || value === 'large') return value
  return 'medium'
}

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizePetBehaviorSettings = (settings = {}) => {
  const grounded = Boolean(settings?.grounded)
  const home = isPlainObject(settings?.home) ? settings.home : {}
  const enabled = grounded && Boolean(home.enabled)

  return {
    grounded,
    home: {
      enabled,
      radius: normalizePetHomeRadius(home.radius),
      anchor: isPlainObject(home.anchor) ? {
        displayId: String(home.anchor.displayId || ''),
        x: Math.round(Number(home.anchor.x) || 0),
        y: Math.round(Number(home.anchor.y) || 0)
      } : null
    }
  }
}

const getDisplayWorkAreaBounds = (display) => ({
  minX: display.workArea.x,
  maxX: display.workArea.x + display.workArea.width,
  minY: display.workArea.y,
  maxY: display.workArea.y + display.workArea.height
})

const getLandingPoint = (windowBounds) => ({
  x: Math.round(windowBounds.x + (windowBounds.width / 2)),
  y: Math.round(windowBounds.y + windowBounds.height)
})

const getTopLeftForLandingPoint = (landingPoint, windowBounds) => ({
  x: Math.round(landingPoint.x - (windowBounds.width / 2)),
  y: Math.round(landingPoint.y - windowBounds.height)
})

const createPetMovementPolicy = ({ screen }) => {
  const getGroundInset = () => GROUND_INSET

  const resolveDisplayForWindow = (windowBounds) => (
    screen.getDisplayMatching(windowBounds)
    || screen.getDisplayNearestPoint({ x: windowBounds.x, y: windowBounds.y })
    || screen.getPrimaryDisplay()
  )

  const getGroundYForDisplay = (display) => display.workArea.y + display.workArea.height - getGroundInset()

  const getAllowedLandingBounds = (display, windowBounds) => {
    const area = getDisplayWorkAreaBounds(display)
    return {
      minLandingX: area.minX + Math.round(windowBounds.width / 2),
      maxLandingX: area.maxX - Math.round(windowBounds.width / 2),
      groundY: getGroundYForDisplay(display)
    }
  }

  const getAllowedRange = (radius, anchorX) => ({
    min: Math.round(anchorX - HOME_RADIUS_PX[normalizePetHomeRadius(radius)]),
    max: Math.round(anchorX + HOME_RADIUS_PX[normalizePetHomeRadius(radius)])
  })

  const normalizeAnchorForDisplay = ({ anchor, display, windowBounds = { width: 300, height: 300 } }) => {
    const bounds = getAllowedLandingBounds(display, windowBounds)
    return {
      displayId: String(display.id),
      x: Math.min(Math.max(Math.round(Number(anchor?.x) || 0), bounds.minLandingX), bounds.maxLandingX),
      y: bounds.groundY
    }
  }

  const createHomeAnchorFromWindow = ({ windowBounds, display = resolveDisplayForWindow(windowBounds) }) => (
    normalizeAnchorForDisplay({
      anchor: getLandingPoint(windowBounds),
      display,
      windowBounds
    })
  )

  const clampDragPosition = ({ windowBounds, requestedTopLeft, settings }) => {
    const normalizedSettings = normalizePetBehaviorSettings(settings)
    const display = resolveDisplayForWindow({
      x: requestedTopLeft.x,
      y: requestedTopLeft.y,
      width: windowBounds.width,
      height: windowBounds.height
    })
    const bounds = getAllowedLandingBounds(display, windowBounds)
    const requestedLanding = {
      x: Math.round(requestedTopLeft.x + (windowBounds.width / 2)),
      y: Math.round(requestedTopLeft.y + windowBounds.height)
    }

    const clampedLandingX = Math.min(Math.max(requestedLanding.x, bounds.minLandingX), bounds.maxLandingX)
    const clampedLandingY = normalizedSettings.grounded
      ? bounds.groundY
      : Math.min(Math.max(requestedLanding.y, display.workArea.y + windowBounds.height), display.workArea.y + display.workArea.height)

    const next = getTopLeftForLandingPoint({ x: clampedLandingX, y: clampedLandingY }, windowBounds)
    return {
      ...next,
      hitX: requestedLanding.x !== clampedLandingX,
      hitY: requestedLanding.y !== clampedLandingY,
      landingX: clampedLandingX,
      landingY: clampedLandingY,
      displayId: String(display.id)
    }
  }

  const clampMoveBy = ({ windowBounds, delta, settings }) => {
    const normalizedSettings = normalizePetBehaviorSettings(settings)
    const display = resolveDisplayForWindow(windowBounds)
    const currentLanding = getLandingPoint(windowBounds)
    const bounds = getAllowedLandingBounds(display, windowBounds)
    const requestedLanding = {
      x: Math.round(currentLanding.x + (Number(delta?.x) || 0)),
      y: normalizedSettings.grounded ? bounds.groundY : Math.round(currentLanding.y + (Number(delta?.y) || 0))
    }

    let minLandingX = bounds.minLandingX
    let maxLandingX = bounds.maxLandingX

    if (normalizedSettings.home.enabled && normalizedSettings.home.anchor) {
      const anchor = normalizeAnchorForDisplay({
        anchor: normalizedSettings.home.anchor,
        display,
        windowBounds
      })
      const homeRange = getAllowedRange(normalizedSettings.home.radius, anchor.x)
      minLandingX = Math.max(minLandingX, homeRange.min)
      maxLandingX = Math.min(maxLandingX, homeRange.max)
    }

    const clampedLandingX = Math.min(Math.max(requestedLanding.x, minLandingX), maxLandingX)
    const clampedLandingY = Math.min(Math.max(requestedLanding.y, display.workArea.y + windowBounds.height), bounds.groundY)
    const next = getTopLeftForLandingPoint({ x: clampedLandingX, y: clampedLandingY }, windowBounds)

    return {
      ...next,
      hitX: requestedLanding.x !== clampedLandingX,
      hitY: requestedLanding.y !== clampedLandingY,
      landingX: clampedLandingX,
      landingY: clampedLandingY,
      displayId: String(display.id)
    }
  }

  const normalizeWindowForDisplay = ({ windowBounds, settings }) => {
    const normalizedSettings = normalizePetBehaviorSettings(settings)
    const display = resolveDisplayForWindow(windowBounds)
    const bounds = getAllowedLandingBounds(display, windowBounds)
    const landingPoint = getLandingPoint(windowBounds)
    let minLandingX = bounds.minLandingX
    let maxLandingX = bounds.maxLandingX

    if (normalizedSettings.home.enabled && normalizedSettings.home.anchor) {
      const anchor = normalizeAnchorForDisplay({
        anchor: normalizedSettings.home.anchor,
        display,
        windowBounds
      })
      const homeRange = getAllowedRange(normalizedSettings.home.radius, anchor.x)
      minLandingX = Math.max(minLandingX, homeRange.min)
      maxLandingX = Math.min(maxLandingX, homeRange.max)
    }

    const nextLanding = {
      x: Math.min(Math.max(landingPoint.x, minLandingX), maxLandingX),
      y: normalizedSettings.grounded ? bounds.groundY : Math.min(Math.max(landingPoint.y, display.workArea.y + windowBounds.height), bounds.groundY)
    }

    return {
      ...getTopLeftForLandingPoint(nextLanding, windowBounds),
      landingX: nextLanding.x,
      landingY: nextLanding.y,
      displayId: String(display.id)
    }
  }

  return {
    getGroundInset,
    getAllowedRange,
    clampDragPosition,
    clampMoveBy,
    createHomeAnchorFromWindow,
    normalizeAnchorForDisplay,
    normalizeWindowForDisplay,
    resolveDisplayForWindow,
    normalizePetBehaviorSettings
  }
}

module.exports = { createPetMovementPolicy, HOME_RADIUS_PX, GROUND_INSET }
