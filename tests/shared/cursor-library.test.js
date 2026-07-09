const assert = require('node:assert/strict')
const test = require('node:test')

const {
  BUILTIN_CURSORS,
  CUSTOM_CURSOR_MAX_SIZE_PERCENT,
  CUSTOM_CURSOR_MAX_BYTES,
  CUSTOM_CURSOR_MIN_SIZE_PERCENT,
  CUSTOM_CURSOR_SIZE_STEP_PERCENT,
  createPersistedCursorRecord,
  LEGACY_CUSTOM_CURSOR_ID,
  SYSTEM_CURSOR_ID,
  listCursorOptions,
  normalizeCustomCursorScope,
  normalizeCursorSettingsState,
  removeStoredCursorRecord,
  resizeCustomCursorRecord,
  resolveSelectedCursor
} = require('../../src/shared/cursor-library')

test('cursor library exposes the built-in picker catalog', () => {
  assert.equal(CUSTOM_CURSOR_MAX_BYTES, 500 * 1024)
  assert.equal(CUSTOM_CURSOR_MIN_SIZE_PERCENT, 50)
  assert.equal(CUSTOM_CURSOR_MAX_SIZE_PERCENT, 200)
  assert.equal(CUSTOM_CURSOR_SIZE_STEP_PERCENT, 5)
  assert.equal(BUILTIN_CURSORS.length, 6)
  assert.deepEqual(
    BUILTIN_CURSORS.map((cursor) => cursor.name),
    ['爪爪紫', '粉色肉垫', '小鱼游游', '胡萝卜', '魔法棒', '小猫咪']
  )
  assert.deepEqual(BUILTIN_CURSORS.map((cursor) => cursor.canDelete), [false, false, false, false, false, false])
})

test('decorative built-in cursors use a centered visual hotspot', () => {
  const decorativeIds = [
    'builtin-paw-pink',
    'builtin-fish-blue',
    'builtin-carrot',
    'builtin-magic-wand',
    'builtin-kitty'
  ]

  for (const cursorId of decorativeIds) {
    const cursor = BUILTIN_CURSORS.find((candidate) => candidate.id === cursorId)
    assert.equal(cursor.width, 48)
    assert.equal(cursor.height, 48)
    assert.equal(cursor.hotspotX, 24)
    assert.equal(cursor.hotspotY, 24)
  }
})

test('arrow-like built-in cursor keeps its tip hotspot', () => {
  const claw = BUILTIN_CURSORS.find((cursor) => cursor.id === 'builtin-claw-purple')

  assert.equal(claw.hotspotX, 2)
  assert.equal(claw.hotspotY, 2)
})

test('listCursorOptions returns system, built-ins, and custom cursors in order', () => {
  const options = listCursorOptions([{
    id: 'custom-lemon',
    name: '柠檬切片',
    source: 'uploaded',
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
  assert.equal(options[0].source, 'system')
  assert.equal(options[1].source, 'builtin')
  assert.equal(options[1].canDelete, false)
  assert.equal(options[1].canResetSize, false)
  assert.equal(options.at(-1)?.id, 'custom-lemon')
  assert.equal(options.at(-1)?.type, 'custom')
  assert.equal(options.at(-1)?.source, 'uploaded')
  assert.equal(options.at(-1)?.canDelete, true)
  assert.equal(options.at(-1)?.canResetSize, false)
  assert.equal(options.at(-1)?.canRestore, false)
  assert.equal(options.length, 8)
})

test('listCursorOptions keeps historical hidden built-ins visible after management UI removal', () => {
  const hiddenId = BUILTIN_CURSORS[0].id
  const options = listCursorOptions([], [hiddenId])

  assert.equal(options.some((option) => option.id === hiddenId), true)
  assert.equal(options.length, 7)
})

test('listCursorOptions merges built-in cursor overrides without duplicating cards', () => {
  const builtin = BUILTIN_CURSORS[0]
  const options = listCursorOptions([{
    ...createPersistedCursorRecord(builtin),
    width: 72,
    height: 72,
    hotspotX: 3,
    hotspotY: 3,
    sizePercent: 150,
    baseWidth: 48,
    baseHeight: 48,
    baseHotspotX: 2,
    baseHotspotY: 2
  }])

  const matchingOptions = options.filter((option) => option.id === builtin.id)
  assert.equal(matchingOptions.length, 1)
  assert.equal(matchingOptions[0].type, 'custom')
  assert.equal(matchingOptions[0].source, 'builtin')
  assert.equal(matchingOptions[0].canDelete, false)
  assert.equal(matchingOptions[0].canResetSize, true)
  assert.equal(matchingOptions[0].canRestore, false)
  assert.equal(matchingOptions[0].width, 72)
  assert.equal(matchingOptions[0].sizePercent, 150)
})

test('normalizeCustomCursorScope preserves the two supported scope values', () => {
  assert.equal(normalizeCustomCursorScope(undefined), 'openpet')
  assert.equal(normalizeCustomCursorScope('nope'), 'openpet')
  assert.equal(normalizeCustomCursorScope('openpet'), 'openpet')
  assert.equal(normalizeCustomCursorScope('system'), 'system')
})

test('normalizeCursorSettingsState clears legacy hidden cursor ids and keeps hidden built-in selections active', () => {
  const hiddenId = BUILTIN_CURSORS[0].id
  const normalized = normalizeCursorSettingsState({
    selectedCursorId: hiddenId,
    hiddenCursorIds: [hiddenId],
    customCursors: []
  })

  assert.equal(normalized.selectedCursorId, hiddenId)
  assert.equal(normalized.customCursor.enabled, true)
  assert.deepEqual(normalized.hiddenCursorIds, [])
  assert.equal(normalized.customCursorScope, 'openpet')
})

test('normalizeCursorSettingsState keeps system scope only while a custom cursor is selected', () => {
  const builtinId = BUILTIN_CURSORS[0].id
  const enabled = normalizeCursorSettingsState({
    selectedCursorId: builtinId,
    customCursorScope: 'system',
    customCursors: []
  })
  const disabled = normalizeCursorSettingsState({
    selectedCursorId: SYSTEM_CURSOR_ID,
    customCursorScope: 'system',
    customCursors: []
  })

  assert.equal(enabled.customCursor.enabled, true)
  assert.equal(enabled.customCursorScope, 'system')
  assert.equal(disabled.customCursor.enabled, false)
  assert.equal(disabled.customCursorScope, 'openpet')
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

test('resolveSelectedCursor prefers persisted overrides for built-in cursors', () => {
  const builtin = BUILTIN_CURSORS[0]
  const runtime = resolveSelectedCursor({
    selectedCursorId: builtin.id,
    customCursors: [{
      ...createPersistedCursorRecord(builtin),
      width: 72,
      height: 72,
      hotspotX: 3,
      hotspotY: 3,
      sizePercent: 150,
      baseWidth: 48,
      baseHeight: 48,
      baseHotspotX: 2,
      baseHotspotY: 2
    }]
  })

  assert.equal(runtime.enabled, true)
  assert.equal(runtime.width, 72)
  assert.equal(runtime.height, 72)
  assert.equal(runtime.hotspotX, 3)
  assert.equal(runtime.hotspotY, 3)
})

test('resolveSelectedCursor preserves explicit custom cursor hotspots for runtime overlay alignment', () => {
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

test('resizeCustomCursorRecord scales a custom cursor from its stored 100 percent baseline', () => {
  const resized = resizeCustomCursorRecord({
    id: 'cursor-demo',
    type: 'custom',
    name: 'Demo Cursor',
    assetPath: '/tmp/demo.png',
    assetUrl: 'file:///tmp/demo.png',
    fileName: 'demo.png',
    width: 32,
    height: 32,
    byteSize: 2048,
    hotspotX: 16,
    hotspotY: 16,
    createdAt: '2026-06-20T00:00:00.000Z'
  }, 150)

  assert.equal(resized.sizePercent, 150)
  assert.equal(resized.width, 48)
  assert.equal(resized.height, 48)
  assert.equal(resized.baseWidth, 32)
  assert.equal(resized.baseHeight, 32)
  assert.equal(resized.baseHotspotX, 16)
  assert.equal(resized.baseHotspotY, 16)
  assert.equal(resized.hotspotX, 24)
  assert.equal(resized.hotspotY, 24)
})

test('resolveSelectedCursor recenters invalid custom cursor hotspots when metadata is out of bounds', () => {
  const runtime = resolveSelectedCursor({
    selectedCursorId: 'cursor-invalid-hotspot',
    customCursors: [{
      id: 'cursor-invalid-hotspot',
      name: 'Invalid Hotspot Cursor',
      assetPath: '/tmp/invalid.png',
      assetUrl: 'file:///tmp/invalid.png',
      fileName: 'invalid.png',
      width: 64,
      height: 40,
      byteSize: 1200,
      hotspotX: 640,
      hotspotY: 400,
      createdAt: '2026-06-20T00:00:00.000Z'
    }]
  })

  assert.deepEqual(runtime, {
    enabled: true,
    assetPath: '/tmp/invalid.png',
    assetUrl: 'file:///tmp/invalid.png',
    fileName: 'invalid.png',
    width: 64,
    height: 40,
    hotspotX: 32,
    hotspotY: 20
  })
})

test('removeStoredCursorRecord falls back to system when deleting the selected custom-only cursor', () => {
  const result = removeStoredCursorRecord({
    selectedCursorId: 'cursor-large',
    cursorId: 'cursor-large',
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

  assert.equal(result.selectedCursorId, SYSTEM_CURSOR_ID)
  assert.deepEqual(result.customCursors, [])
  assert.equal(result.removedBuiltinOverride, false)
})

test('removeStoredCursorRecord resets built-in overrides without clearing the current built-in selection', () => {
  const builtin = BUILTIN_CURSORS[0]
  const result = removeStoredCursorRecord({
    selectedCursorId: builtin.id,
    cursorId: builtin.id,
    customCursors: [{
      ...createPersistedCursorRecord(builtin),
      width: 72,
      height: 72,
      hotspotX: 3,
      hotspotY: 3,
      sizePercent: 150,
      baseWidth: 48,
      baseHeight: 48,
      baseHotspotX: 2,
      baseHotspotY: 2
    }]
  })

  assert.equal(result.selectedCursorId, builtin.id)
  assert.deepEqual(result.customCursors, [])
  assert.equal(result.removedBuiltinOverride, true)
})
