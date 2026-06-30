const test = require('node:test')
const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')

const { IPC } = require('../../src/shared/ipc-channels')
const {
  PLUGIN_SHUTDOWN_TIMEOUT_MS,
  registerDisplayLifecycle,
  registerPetWindowLifecycle,
  registerRuntimeAppLifecycle
} = require('../../src/main/bootstrap/runtime-lifecycle')

test('runtime app lifecycle continues quit after plugin shutdown timeout', async () => {
  const appHandlers = new Map()
  const safeLogs = []
  let preventDefaultCalls = 0
  let quitCalls = 0
  let triggerStopCalls = 0
  let pluginStopCalls = 0

  registerRuntimeAppLifecycle({
    app: {
      quit: () => { quitCalls += 1 }
    },
    appLogService: { record: () => {} },
    registerAppLifecycleLogs: ({ onBeforeQuit }) => {
      appHandlers.set('before-quit', onBeforeQuit)
    },
    safeRecordAppLog: (_appLogService, entry) => safeLogs.push(entry),
    triggerRuleRuntimeService: {
      stop: () => { triggerStopCalls += 1 }
    },
    getPluginService: () => ({
      stopAllServices: () => {
        pluginStopCalls += 1
        return new Promise(() => {})
      }
    }),
    shutdownTimeoutMs: 5
  })

  appHandlers.get('before-quit')({
    preventDefault: () => { preventDefaultCalls += 1 }
  })
  await delay(20)

  assert.equal(PLUGIN_SHUTDOWN_TIMEOUT_MS, 2000)
  assert.equal(preventDefaultCalls, 1)
  assert.equal(triggerStopCalls, 1)
  assert.equal(pluginStopCalls, 1)
  assert.equal(quitCalls, 1)
  assert.equal(safeLogs.some((entry) => entry.event === 'plugins.shutdown.timed_out' && entry.message.includes('5ms')), true)
})

test('display lifecycle normalizes pet window and persists adjusted home anchor', () => {
  const screenHandlers = new Map()
  const positionCalls = []
  const sendCalls = []
  const saveSettingsCalls = []
  const settings = {
    scale: 1,
    petBehavior: {
      home: {
        enabled: true,
        anchor: { displayId: 'old-display', x: 1, y: 2 }
      }
    }
  }
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 100, y: 200, width: 80, height: 90 }),
    setPosition: (x, y) => positionCalls.push({ x, y }),
    webContents: {
      send: (...args) => sendCalls.push(args)
    }
  }

  registerDisplayLifecycle({
    screen: {
      on: (eventName, handler) => { screenHandlers.set(eventName, handler) }
    },
    getPetWindow: () => petWindow,
    petService: {
      getSettings: () => settings,
      saveSettings: (nextSettings) => saveSettingsCalls.push(nextSettings)
    },
    petMovementPolicy: {
      normalizeWindowForDisplay: ({ windowBounds, settings: behaviorSettings }) => {
        assert.deepEqual(windowBounds, { x: 100, y: 200, width: 80, height: 90 })
        assert.equal(behaviorSettings, settings.petBehavior)
        return { x: 10, y: 20 }
      },
      normalizePetBehaviorSettings: (behavior) => behavior,
      resolveDisplayForWindow: () => ({ id: 'new-display' }),
      normalizeAnchorForDisplay: ({ anchor, display }) => ({
        ...anchor,
        displayId: display.id,
        x: 30,
        y: 40
      })
    },
    createPetRendererSettings: (input) => ({ rendererSettings: input })
  })

  assert.equal(typeof screenHandlers.get('display-metrics-changed'), 'function')
  assert.equal(typeof screenHandlers.get('display-removed'), 'function')
  assert.equal(typeof screenHandlers.get('display-added'), 'function')

  screenHandlers.get('display-added')()

  assert.deepEqual(positionCalls, [{ x: 10, y: 20 }])
  assert.equal(saveSettingsCalls.length, 1)
  assert.deepEqual(saveSettingsCalls[0].petBehavior.home.anchor, {
    displayId: 'new-display',
    x: 30,
    y: 40
  })
  assert.deepEqual(sendCalls, [
    [IPC.SETTINGS_CHANGED, { rendererSettings: settings }]
  ])
})

test('pet window lifecycle runs packaged smoke hooks after did-finish-load', () => {
  const webContentsHandlers = new Map()
  const sendCalls = []
  const smokeCalls = []
  const cleanupCalls = []
  const creatorEvidenceCalls = []
  const creatorUiCalls = []
  const loadPetWindowCalls = []
  const applyWindowScaleCalls = []
  const petWindow = {
    webContents: {
      on: (eventName, handler) => { webContentsHandlers.set(eventName, handler) },
      send: (...args) => sendCalls.push(args)
    }
  }
  const appHandlers = new Map()
  const app = {
    on: (eventName, handler) => { appHandlers.set(eventName, handler) }
  }
  const petService = { id: 'pet-service', getSettings: () => ({ scale: 1.5 }) }
  const petPackService = { id: 'pet-pack-service' }
  const petBubbleChatWindowService = { id: 'pet-bubble-chat-window-service' }
  const pluginInstallService = { id: 'plugin-install-service' }
  const pluginService = { id: 'plugin-service' }

  registerPetWindowLifecycle({
    app,
    BrowserWindow: { getAllWindows: () => [petWindow] },
    petWindow,
    getPetWindow: () => petWindow,
    setPetWindow: () => {},
    createWindow: () => petWindow,
    loadPetWindow: (targetWindow) => loadPetWindowCalls.push(targetWindow),
    createSettingsWindow: (targetWindow) => ({ targetWindow }),
    petService,
    petPackService,
    petBubbleChatWindowService,
    pluginInstallService,
    pluginService,
    applyWindowScale: (...args) => applyWindowScaleCalls.push(args),
    createPetRendererSettings: (settings) => ({ rendererSettings: settings }),
    maybeRunPackagedRuntimeSmoke: (payload) => smokeCalls.push(payload),
    maybeRunPackagedPluginCleanupEvidence: (payload) => cleanupCalls.push(payload),
    maybeRunPackagedCreatorStudioEvidence: (payload) => creatorEvidenceCalls.push(payload),
    maybeRunPackagedCreatorStudioUiE2e: (payload) => creatorUiCalls.push(payload)
  })

  assert.deepEqual(loadPetWindowCalls, [petWindow])
  assert.equal(typeof appHandlers.get('activate'), 'function')
  assert.equal(smokeCalls.length, 0)

  webContentsHandlers.get('did-finish-load')()

  assert.deepEqual(applyWindowScaleCalls, [[petWindow, 1.5]])
  assert.deepEqual(sendCalls, [
    [IPC.SETTINGS_CHANGED, { rendererSettings: { scale: 1.5 } }]
  ])
  assert.deepEqual(smokeCalls, [{ app, petWindow, petService, petPackService, petBubbleChatWindowService }])
  assert.deepEqual(cleanupCalls, [{ app, pluginInstallService, pluginService }])
  assert.deepEqual(creatorEvidenceCalls, [{ app, pluginService }])
  assert.equal(creatorUiCalls.length, 1)
  assert.equal(creatorUiCalls[0].app, app)
  assert.equal(creatorUiCalls[0].pluginService, pluginService)
  assert.deepEqual(creatorUiCalls[0].openControlCenter(), { targetWindow: petWindow })
})
