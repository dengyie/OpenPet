const assert = require('node:assert')
const { test } = require('node:test')

const {
  createCustomCursorCss,
  resolvePetCursorOverlayState,
  resolvePetCursorStyle
} = require('../../src/shared/cursor-style')

test('createCustomCursorCss returns empty style unless a hosted cursor is enabled', () => {
  assert.equal(createCustomCursorCss(null), '')
  assert.equal(createCustomCursorCss({ enabled: true, assetUrl: '' }), '')
  assert.equal(createCustomCursorCss({ enabled: false, assetUrl: 'file:///tmp/cursor.png' }), '')
})

test('createCustomCursorCss builds a CSS cursor from the hosted asset URL', () => {
  assert.equal(
    createCustomCursorCss({ enabled: true, assetUrl: 'file:///tmp/openpet/cursor.png' }),
    'url("file:///tmp/openpet/cursor.png") 0 0, auto'
  )
})

test('resolvePetCursorStyle applies custom cursor only inside the active pet region', () => {
  const cursor = { enabled: true, assetUrl: 'file:///tmp/openpet/cursor.webp' }

  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, dragging: false, menuOpen: false }), 'url("file:///tmp/openpet/cursor.webp") 0 0, auto')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: false, dragging: false, menuOpen: false }), '')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, dragging: true, menuOpen: false }), '')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, dragging: false, menuOpen: true }), '')
})

test('resolvePetCursorOverlayState shows a DOM cursor and hides the native cursor inside the active pet region', () => {
  const cursor = { enabled: true, assetUrl: 'file:///tmp/openpet/cursor.webp' }

  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: true, dragging: false, menuOpen: false }),
    { visible: true, assetUrl: 'file:///tmp/openpet/cursor.webp', nativeCursor: 'none' }
  )
  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: false, dragging: false, menuOpen: false }),
    { visible: false, assetUrl: '', nativeCursor: '' }
  )
})
