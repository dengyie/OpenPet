(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.OpenPetHitbox = factory()
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const getFrameHitbox = ({ animation, layout, frameIndex = 0, windowHeight, scale = 1 }) => {
    if (!animation || !layout) return null
    const frame = Array.isArray(animation.frames) ? animation.frames[frameIndex] : null
    const trim = frame?.trim || { x: 0, y: 0, width: animation.frameWidth, height: animation.frameHeight }
    const fitScale = layout.dims.fitScale || 1
    const padding = (layout.viewport.padding || 0) * scale
    const left = layout.catLeft + (trim.x * fitScale * scale) - padding
    const top = (windowHeight - layout.catBottom - (layout.dims.height * scale)) + (trim.y * fitScale * scale) - padding
    return {
      left,
      top,
      right: left + (trim.width * fitScale * scale) + padding * 2,
      bottom: top + (trim.height * fitScale * scale) + padding * 2
    }
  }

  const getViewportHitbox = ({ layout, windowHeight, scale = 1 }) => {
    if (!layout) return null
    const viewport = layout.viewport
    const width = (viewport.width + (viewport.padding || 0) * 2) * scale
    const height = (viewport.height + (viewport.padding || 0) * 2) * scale
    const left = 0
    const top = windowHeight - height
    return {
      left,
      top,
      right: left + width,
      bottom: top + height
    }
  }

  const getWindowHitbox = ({ windowWidth, windowHeight }) => ({
    left: 0,
    top: 0,
    right: Math.max(0, Number(windowWidth) || 0),
    bottom: Math.max(0, Number(windowHeight) || 0)
  })

  const isPointInHitbox = (point, hitbox) => {
    if (!point || !hitbox) return false
    return point.x >= hitbox.left && point.x <= hitbox.right && point.y >= hitbox.top && point.y <= hitbox.bottom
  }

  return {
    getFrameHitbox,
    getWindowHitbox,
    getViewportHitbox,
    isPointInHitbox
  }
})
