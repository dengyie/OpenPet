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
    createCustomCursorCss({ enabled: true, assetUrl: 'file:///tmp/openpet/cursor.png', hotspotX: 4, hotspotY: 6 }),
    'url("file:///tmp/openpet/cursor.png") 4 6, auto'
  )
})

test('resolvePetCursorStyle applies custom cursor only inside the active pet region', () => {
  const cursor = { enabled: true, assetUrl: 'file:///tmp/openpet/cursor.webp', hotspotX: 3, hotspotY: 5 }

  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, dragging: false, menuOpen: false }), 'url("file:///tmp/openpet/cursor.webp") 3 5, auto')
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
  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: true, dragging: true, menuOpen: false }),
    { visible: false, assetUrl: '', nativeCursor: '' }
  )
  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: true, dragging: false, menuOpen: true }),
    { visible: false, assetUrl: '', nativeCursor: '' }
  )
})
