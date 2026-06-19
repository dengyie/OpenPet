const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('os')
const Module = require('module')

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
  assert.deepEqual(defaultSettings.customCursor, {
    enabled: false,
    assetPath: '',
    assetUrl: '',
    fileName: ''
  })
})

test('mergeSettings preserves hosted custom cursor metadata', () => {
  const settings = mergeSettings({
    customCursor: {
      enabled: true,
      assetPath: '/tmp/openpet/cursors/cursor.png',
      assetUrl: 'file:///tmp/openpet/cursors/cursor.png',
      fileName: 'cursor.png',
      ignored: 'nope'
    }
  })

  assert.deepEqual(settings.customCursor, {
    enabled: true,
    assetPath: '/tmp/openpet/cursors/cursor.png',
    assetUrl: 'file:///tmp/openpet/cursors/cursor.png',
    fileName: 'cursor.png'
  })
})
