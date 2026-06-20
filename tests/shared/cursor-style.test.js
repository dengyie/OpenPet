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

test('resolvePetCursorStyle only falls back to CSS image cursors when the pet window is unfocused', () => {
  const cursor = { enabled: true, assetUrl: 'file:///tmp/openpet/cursor.webp', hotspotX: 3, hotspotY: 5 }

  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, dragging: false, menuOpen: false }), '')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, windowFocused: true, dragging: false, menuOpen: false }), '')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, windowFocused: false, dragging: false, menuOpen: false }), 'url("file:///tmp/openpet/cursor.webp") 3 5, auto')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: false, insideCursorRegion: true, dragging: false, menuOpen: false }), '')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, insideCursorRegion: false, dragging: false, menuOpen: false }), '')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, windowFocused: false, dragging: true, menuOpen: false }), 'url("file:///tmp/openpet/cursor.webp") 3 5, auto')
  assert.equal(resolvePetCursorStyle(cursor, { insideFrame: true, dragging: false, menuOpen: true }), '')
})

test('resolvePetCursorOverlayState shows DOM cursor overlay only inside clickable pet frame', () => {
  const cursor = { enabled: true, assetUrl: 'file:///tmp/openpet/cursor.webp' }

  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: true, dragging: false, menuOpen: false }),
    { visible: true, assetUrl: 'file:///tmp/openpet/cursor.webp', nativeCursor: 'none' }
  )
  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: true, windowFocused: false, dragging: false, menuOpen: false }),
    { visible: false, assetUrl: '', nativeCursor: '' }
  )
  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: false, insideCursorRegion: true, dragging: false, menuOpen: false }),
    { visible: false, assetUrl: '', nativeCursor: '' }
  )
  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: true, dragging: true, menuOpen: false }),
    { visible: true, assetUrl: 'file:///tmp/openpet/cursor.webp', nativeCursor: 'none' }
  )
  assert.deepEqual(
    resolvePetCursorOverlayState(cursor, { insideFrame: true, dragging: false, menuOpen: true }),
    { visible: false, assetUrl: '', nativeCursor: '' }
  )
})
