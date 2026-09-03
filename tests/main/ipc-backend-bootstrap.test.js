const test = require('node:test')
const assert = require('node:assert/strict')

const { IPC } = require('../../src/shared/ipc-channels')
const { registerSettingsIpc } = require('../../src/main/ipc/register-settings-ipc')

test('settings:get and settings:save are retired from the native settings IPC surface', () => {
  const handlers = new Map()
  const listeners = new Map()
  const ipcMainService = {
    handle: (channel, handler) => handlers.set(channel, handler),
    on: (channel, handler) => listeners.set(channel, handler)
  }

  registerSettingsIpc({
    ipcMainService,
    petService: { getSettings: () => ({}) },
    createPetRendererSettings: (value) => value,
    systemCursorService: { getStatus: () => null },
    browserWindowService: {},
    sendToPetWindow: () => {},
    recordAppLog: () => {},
    showOpenDialogForEvent: async () => ({ canceled: true, filePaths: [] }),
    petMovementPolicy: {}
  })

  assert.equal(handlers.has(IPC.SETTINGS_GET), false)
  assert.equal(handlers.has(IPC.SETTINGS_SAVE), false)
  assert.equal(listeners.has(IPC.SETTINGS_CHANGED), false)
})
