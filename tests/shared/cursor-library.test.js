const assert = require('node:assert/strict')
const test = require('node:test')

const {
  BUILTIN_CURSORS,
  CUSTOM_CURSOR_MAX_BYTES,
  LEGACY_CUSTOM_CURSOR_ID,
  SYSTEM_CURSOR_ID,
  listCursorOptions,
  normalizeCursorSettingsState,
  resolveSelectedCursor
} = require('../../src/shared/cursor-library')

test('cursor library exposes the built-in picker catalog', () => {
  assert.equal(CUSTOM_CURSOR_MAX_BYTES, 500 * 1024)
  assert.equal(BUILTIN_CURSORS.length, 6)
  assert.deepEqual(
    BUILTIN_CURSORS.map((cursor) => cursor.name),
    ['爪爪紫', '粉色肉垫', '小鱼游游', '胡萝卜', '魔法棒', '小猫咪']
  )
})

test('listCursorOptions returns system, built-ins, and custom cursors in order', () => {
  const options = listCursorOptions([{
    id: 'custom-lemon',
    name: '柠檬切片',
    assetPath: '/tmp/lemon.png',
    assetUrl: 'file:///tmp/lemon.png',
    fileName: 'lemon.png',
    width: 32,
    height: 32,
    byteSize: 1280,
    hotspotX: 0,
    hotspotY: 0,
    createdAt: '2026-06-19T00:00:00.000Z'
  }])

  assert.equal(options[0].id, SYSTEM_CURSOR_ID)
  assert.equal(options[0].type, 'system')
  assert.equal(options.at(-1)?.id, 'custom-lemon')
  assert.equal(options.at(-1)?.type, 'custom')
  assert.equal(options.length, 8)
})

test('normalizeCursorSettingsState migrates a legacy hosted cursor into the new cursor library state', () => {
  const normalized = normalizeCursorSettingsState({
    selectedCursorId: '',
    customCursors: [],
    customCursor: {
      enabled: true,
      assetPath: '/tmp/openpet/cursors/legacy.png',
      assetUrl: 'file:///tmp/openpet/cursors/legacy.png',
      fileName: 'legacy.png'
    }
  })

  assert.equal(normalized.selectedCursorId, LEGACY_CUSTOM_CURSOR_ID)
  assert.equal(normalized.customCursors.length, 1)
  assert.equal(normalized.customCursors[0].id, LEGACY_CUSTOM_CURSOR_ID)
  assert.equal(normalized.customCursors[0].name, 'legacy')
  assert.deepEqual(normalized.customCursor, {
    enabled: true,
    assetPath: '/tmp/openpet/cursors/legacy.png',
    assetUrl: 'file:///tmp/openpet/cursors/legacy.png',
    fileName: 'legacy.png',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  })
})

test('resolveSelectedCursor returns a disabled runtime cursor for system default and an enabled one for built-ins', () => {
  assert.deepEqual(resolveSelectedCursor({ selectedCursorId: SYSTEM_CURSOR_ID, customCursors: [] }), {
    enabled: false,
    assetPath: '',
    assetUrl: '',
    fileName: '',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  })

  const builtin = resolveSelectedCursor({
    selectedCursorId: BUILTIN_CURSORS[0].id,
    customCursors: []
  })
  assert.equal(builtin.enabled, true)
  assert.equal(builtin.fileName, BUILTIN_CURSORS[0].fileName)
  assert.equal(builtin.width, BUILTIN_CURSORS[0].width)
  assert.equal(builtin.height, BUILTIN_CURSORS[0].height)
  assert.match(builtin.assetUrl, /^data:image\/svg\+xml/)
})

test('resolveSelectedCursor preserves custom cursor dimensions for runtime overlay alignment', () => {
  const runtime = resolveSelectedCursor({
    selectedCursorId: 'cursor-large',
    customCursors: [{
      id: 'cursor-large',
      name: 'Large Cursor',
      assetPath: '/tmp/large.png',
      assetUrl: 'file:///tmp/large.png',
      fileName: 'large.png',
      width: 64,
      height: 40,
      byteSize: 1200,
      hotspotX: 9,
      hotspotY: 11,
      createdAt: '2026-06-20T00:00:00.000Z'
    }]
  })

  assert.deepEqual(runtime, {
    enabled: true,
    assetPath: '/tmp/large.png',
    assetUrl: 'file:///tmp/large.png',
    fileName: 'large.png',
    width: 64,
    height: 40,
    hotspotX: 9,
    hotspotY: 11
  })
})
