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
    return `url("${escapeCssUrl(cursor.assetUrl)}") 0 0, auto`
  }

  const resolvePetCursorStyle = (cursor, context = {}) => {
    if (!context.insideFrame || context.dragging || context.menuOpen) return ''
    return createCustomCursorCss(cursor)
  }

  return {
    createCustomCursorCss,
    resolvePetCursorStyle
  }
})
