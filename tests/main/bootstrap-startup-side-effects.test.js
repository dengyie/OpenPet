const test = require('node:test')
const assert = require('node:assert/strict')
const { setImmediate: setImmediatePromise } = require('node:timers/promises')

const { runPostPluginStartupSideEffects } = require('../../src/main/bootstrap/startup-side-effects')

const createBaseDependencies = (overrides = {}) => ({
  petService: {
    getSettings: () => ({ autoStart: false, localHttp: { enabled: false }, customCursorScope: 'openpet' }),
    saveSettings: (settings) => settings
  },
  localHttpService: { start: async () => {} },
  normalizeLocalHttpConfig: (_current, next) => next,
  syncLoginItemSettings: () => {},
  triggerRuleRuntimeService: { start: () => {} },
  systemCursorService: { sync: async () => {} },
  appLogService: { record: () => {} },
  ...overrides
})

test('post-plugin startup waits for cursor repair before restoring system cursor scope', async () => {
  const order = []
  let resolveRepair
  const cursorRepairPromise = new Promise((resolve) => { resolveRepair = resolve })
  const dependencies = createBaseDependencies({
    cursorRepairPromise,
    petService: {
      getSettings: () => ({ autoStart: false, localHttp: { enabled: false }, customCursorScope: 'system', customCursor: { enabled: true } }),
      saveSettings: (settings) => settings
    },
    systemCursorService: {
      sync: async () => { order.push('system-cursor-sync') }
    }
  })

  const startupPromise = runPostPluginStartupSideEffects(dependencies)
  await setImmediatePromise()
  assert.deepEqual(order, [])

  order.push('cursor-repair')
  resolveRepair()
  await startupPromise
  assert.deepEqual(order, ['cursor-repair', 'system-cursor-sync'])
})

test('post-plugin startup falls back to openpet when restoring system cursor fails', async () => {
  const savedSettings = []
  const logs = []
  const fallbacks = []
  const currentSettings = {
    autoStart: false,
    localHttp: { enabled: false },
    customCursorScope: 'system',
    customCursor: { enabled: true }
  }
  const dependencies = createBaseDependencies({
    cursorRepairPromise: Promise.resolve(),
    petService: {
      getSettings: () => currentSettings,
      saveSettings: (settings) => {
        savedSettings.push(settings)
        return settings
      }
    },
    systemCursorService: { sync: async () => { throw new Error('native helper unavailable') } },
    appLogService: { record: (entry) => logs.push(entry) },
    onSystemCursorFallback: (settings) => fallbacks.push(settings)
  })

  await runPostPluginStartupSideEffects(dependencies)

  assert.equal(savedSettings.length, 1)
  assert.equal(savedSettings[0].customCursorScope, 'openpet')
  assert.deepEqual(fallbacks, [savedSettings[0]])
  assert.equal(logs.some((entry) => entry.event === 'system-cursor.startup.failed'), true)
})
