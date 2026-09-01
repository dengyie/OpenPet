const test = require('node:test')
const assert = require('node:assert/strict')

const { IPC } = require('../../src/shared/ipc-channels')
const { registerSettingsIpc } = require('../../src/main/ipc/register-settings-ipc')

test('settings IPC private backend bootstrap preserves the public settings shape', async () => {
  const handlers = new Map()
  const listeners = new Map()
  const ipcMainService = {
    handle: (channel, handler) => handlers.set(channel, handler),
    on: (channel, handler) => listeners.set(channel, handler)
  }
  const settings = { scale: 1, customCursors: [], selectedCursorId: 'system' }
  const backend = { baseUrl: 'http://127.0.0.1:4321', sessionToken: 'session' }

  registerSettingsIpc({
    ipcMainService,
    petService: { getSettings: () => settings },
    createPetRendererSettings: (value) => value,
    sidecarRuntimeCoordinator: { getBackend: () => backend },
    systemCursorService: { getStatus: () => null },
    browserWindowService: {},
    sendToPetWindow: () => {},
    recordAppLog: () => {},
    showOpenDialogForEvent: async () => ({ canceled: true, filePaths: [] }),
    petMovementPolicy: {}
  })

  const getSettings = handlers.get(IPC.SETTINGS_GET)
  assert.equal(typeof getSettings, 'function')
  assert.deepEqual(await getSettings(), settings)
  assert.deepEqual(await getSettings(null, { includeBackend: true }), { settings, backend })
  assert.equal(listeners.has(IPC.SETTINGS_CHANGED), false)
})
