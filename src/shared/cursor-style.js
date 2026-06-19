(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.OpenPetCursorStyle = factory()
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const escapeCssUrl = (value) => String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n|\r|\f/g, '')

  const createCustomCursorCss = (cursor) => {
    if (!cursor || !cursor.enabled || !cursor.assetUrl) return ''
    const hotspotX = Number.isFinite(Number(cursor.hotspotX)) ? Number(cursor.hotspotX) : 0
    const hotspotY = Number.isFinite(Number(cursor.hotspotY)) ? Number(cursor.hotspotY) : 0
    return `url("${escapeCssUrl(cursor.assetUrl)}") ${hotspotX} ${hotspotY}, auto`
  }

  const resolvePetCursorStyle = (cursor, context = {}) => {
    return ''
  }

  const resolvePetCursorOverlayState = (cursor, context = {}) => {
    if (!cursor || !cursor.enabled || !cursor.assetUrl || !context.insideFrame || context.menuOpen) {
      return { visible: false, assetUrl: '', nativeCursor: '' }
    }
    return { visible: true, assetUrl: cursor.assetUrl, nativeCursor: 'none' }
  }

  return {
    createCustomCursorCss,
    resolvePetCursorOverlayState,
    resolvePetCursorStyle
  }
})
