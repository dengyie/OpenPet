const test = require('node:test')
const assert = require('node:assert/strict')

const {
  collectCustomCursorAssetPaths,
  createPetRendererSettings,
  mergePetSettingsViewIntoHostSettings,
  normalizeLocalHttpConfig
} = require('../../src/main/ipc/pet-settings-adapter')

test('pet settings adapter builds renderer settings from host settings', () => {
  const result = createPetRendererSettings({
    scale: 1.25,
    walkSpeed: 3,
    walkDuration: 12000,
    bubbleDuration: 5000,
    menuPosition: 'left',
    selectedCursorId: 'cursor-1',
    customCursor: { enabled: true },
    customCursors: [{ id: 'cursor-1' }],
    petBehavior: {
      grounded: true,
      home: { enabled: true, radius: 'large', anchor: { x: 1, y: 2 } }
    },
    petBubbleChat: {
      enabled: false,
      autoPopup: true,
      autoHide: false,
      pinOnInteraction: true
    }
  })

  assert.equal(result.scale, 1.25)
  assert.equal(result.home.hasAnchor, true)
  assert.equal(result.petBubbleChat.enabled, false)
})

test('pet settings adapter merges renderer view back into host settings', () => {
  const currentSettings = {
    scale: 1,
    walkSpeed: 2,
    walkDuration: 15000,
    bubbleDuration: 6000,
    menuPosition: 'auto',
    autoStart: false,
    selectedCursorId: 'system',
    customCursor: { enabled: false },
    customCursors: [],
    petBubbleChat: { enabled: true, autoPopup: true, autoHide: true, pinOnInteraction: true },
    petBehavior: { grounded: false, home: { enabled: false, radius: 'medium', anchor: { x: 10, y: 20 } } }
  }

  const merged = mergePetSettingsViewIntoHostSettings(currentSettings, {
    scale: 1.5,
    grounded: true,
    home: { enabled: true, radius: 'small' },
    petBubbleChat: { enabled: false }
  })

  assert.equal(merged.scale, 1.5)
  assert.equal(merged.petBehavior.grounded, true)
  assert.equal(merged.petBehavior.home.anchor.x, 10)
  assert.equal(merged.petBubbleChat.enabled, false)
  assert.equal(merged.petBubbleChat.autoPopup, true)
})

test('pet settings adapter normalizes local http config onto loopback host and token', () => {
  const normalized = normalizeLocalHttpConfig({ token: '' }, { enabled: true, port: '7777' })

  assert.equal(normalized.host, '127.0.0.1')
  assert.equal(normalized.port, 7777)
  assert.equal(normalized.enabled, true)
  assert.equal(typeof normalized.token, 'string')
  assert.ok(normalized.token.length > 0)
})

test('pet settings adapter collects cursor asset paths from mixed cursor entries', () => {
  assert.deepEqual(collectCustomCursorAssetPaths([
    { assetPath: '/tmp/a.png' },
    { assetPath: 'builtin://builtin-claw-purple' },
    { assetPath: '' },
    null,
    { assetPath: '/tmp/b.png' }
  ]), ['/tmp/a.png', '/tmp/b.png'])
})
