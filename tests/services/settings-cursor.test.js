const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('os')
const Module = require('module')
const { BUILTIN_CURSORS, LEGACY_CUSTOM_CURSOR_ID, SYSTEM_CURSOR_ID } = require('../../src/shared/cursor-library')

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath: () => os.tmpdir(),
        isPackaged: false,
        setLoginItemSettings: () => {}
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { defaultSettings, mergeSettings } = require('../../src/main/settings')

test('settings default custom cursor is disabled', () => {
  assert.equal(defaultSettings.selectedCursorId, SYSTEM_CURSOR_ID)
  assert.deepEqual(defaultSettings.ai.memory, { enabled: false })
  assert.deepEqual(defaultSettings.customCursors, [])
  assert.deepEqual(defaultSettings.customCursor, {
    enabled: false,
    assetPath: '',
    assetUrl: '',
    fileName: '',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  })
})

test('mergeSettings preserves ai automatic memory config', () => {
  const settings = mergeSettings({
    ai: {
      memory: { enabled: true }
    }
  })

  assert.deepEqual(settings.ai.memory, { enabled: true })
})

test('mergeSettings migrates a legacy hosted custom cursor into the new cursor library state', () => {
  const settings = mergeSettings({
    customCursor: {
      enabled: true,
      assetPath: '/tmp/openpet/cursors/cursor.png',
      assetUrl: 'file:///tmp/openpet/cursors/cursor.png',
      fileName: 'cursor.png',
      ignored: 'nope'
    }
  })

  assert.equal(settings.selectedCursorId, LEGACY_CUSTOM_CURSOR_ID)
  assert.equal(settings.customCursors.length, 1)
  assert.equal(settings.customCursors[0].name, 'cursor')
  assert.deepEqual(settings.customCursor, {
    enabled: true,
    assetPath: '/tmp/openpet/cursors/cursor.png',
    assetUrl: 'file:///tmp/openpet/cursors/cursor.png',
    fileName: 'cursor.png',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  })
})

test('mergeSettings resolves built-in cursor selections to the effective runtime custom cursor', () => {
  const settings = mergeSettings({
    selectedCursorId: BUILTIN_CURSORS[4].id,
    customCursors: []
  })

  assert.equal(settings.selectedCursorId, BUILTIN_CURSORS[4].id)
  assert.equal(settings.customCursor.enabled, true)
  assert.equal(settings.customCursor.fileName, BUILTIN_CURSORS[4].fileName)
  assert.match(settings.customCursor.assetUrl, /^data:image\/svg\+xml/)
})

test('mergeSettings falls back to system default when the selected custom cursor no longer exists', () => {
  const settings = mergeSettings({
    selectedCursorId: 'missing-cursor',
    customCursors: []
  })

  assert.equal(settings.selectedCursorId, SYSTEM_CURSOR_ID)
  assert.deepEqual(settings.customCursor, {
    enabled: false,
    assetPath: '',
    assetUrl: '',
    fileName: '',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  })
})
