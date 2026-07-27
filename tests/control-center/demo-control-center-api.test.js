const test = require('node:test')
const assert = require('node:assert/strict')

class SessionStorageShim {
  constructor() {
    this.store = new Map()
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }

  setItem(key, value) {
    this.store.set(key, String(value))
  }

  removeItem(key) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }
}

const listeners = new Map()
global.window = {
  sessionStorage: new SessionStorageShim(),
  addEventListener(eventName, listener) {
    const existing = listeners.get(eventName) || []
    listeners.set(eventName, [...existing, listener])
  },
  removeEventListener(eventName, listener) {
    const existing = listeners.get(eventName) || []
    listeners.set(eventName, existing.filter((candidate) => candidate !== listener))
  },
  dispatchEvent(event) {
    for (const listener of listeners.get(event.type) || []) listener(event)
  }
}

global.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type
    this.detail = init.detail
  }
}

let demoControlCenterAPI
const demoStorageKey = 'openpet.controlCenter.demoState'

test.before(async () => {
  ;({ demoControlCenterAPI } = await import('../../src/control-center/src/api/demo-control-center-api.ts'))
})

test('demo pet chat state initializes shared streaming state to null', async () => {
  const state = await demoControlCenterAPI.getPetChatState()

  assert.equal(state.streaming, null)
})

const ensureDemoFixturePluginInstalled = async () => {
  const existing = (await demoControlCenterAPI.getPlugins()).find((plugin) => plugin.id === 'openpet.demo.manual-review')
  if (existing) return existing
  const review = await demoControlCenterAPI.inspectPluginPackage()
  await demoControlCenterAPI.installPlugin(review.selectionId)
  const installed = (await demoControlCenterAPI.getPlugins()).find((plugin) => plugin.id === review.plugin.id)
  assert.ok(installed)
  return installed
}

const upsertDemoPlugin = async (plugin) => {
  const rawState = global.window.sessionStorage.getItem(demoStorageKey)
  assert.ok(rawState)
  const nextState = JSON.parse(rawState)
  nextState.plugins = [
    plugin,
    ...(Array.isArray(nextState.plugins) ? nextState.plugins : []).filter((candidate) => candidate?.id !== plugin.id)
  ]
  global.window.sessionStorage.setItem(demoStorageKey, JSON.stringify(nextState))
  await demoControlCenterAPI.getPetChatState()

  const installed = (await demoControlCenterAPI.getPlugins()).find((candidate) => candidate.id === plugin.id)
  assert.ok(installed)
  return installed
}

const ensureDemoCreatorStudioInstalled = async () => {
  const existing = (await demoControlCenterAPI.getPlugins()).find((plugin) => plugin.id === 'openpet.creator-studio')
  if (existing) return existing

  return upsertDemoPlugin({
    id: 'openpet.creator-studio',
    name: 'Creator Studio',
    version: '0.1.0-demo',
    source: 'bundled',
    enabled: true,
    runnable: true,
    requiresNativeExecution: false,
    nativeExecutionApproved: true,
    permissions: [],
    commands: [],
    entries: {
      setup: [],
      commands: [],
      services: [],
      dashboards: []
    },
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: 'verified',
      label: 'Verified',
      signer: '',
      algorithm: '',
      verified: true,
      errors: []
    }
  })
}

const setDemoCreatorReferencePickerPath = async (pickerPath) => {
  const rawState = global.window.sessionStorage.getItem(demoStorageKey)
  assert.ok(rawState)
  const nextState = JSON.parse(rawState)
  nextState.creatorReferencePickerPath = pickerPath
  global.window.sessionStorage.setItem(demoStorageKey, JSON.stringify(nextState))
  await demoControlCenterAPI.getPetChatState()
}

const createImGatewayPhase2DemoPlugin = () => ({
  id: 'openpet.im-gateway',
  name: 'IM Gateway',
  version: '0.2.0-demo',
  source: 'bundled',
  enabled: true,
  runnable: true,
  requiresNativeExecution: true,
  nativeExecutionApproved: true,
  permissions: ['pet:say', 'pet:action', 'pet:event', 'ai:chat'],
  commands: [],
  entries: { setup: [], commands: [], services: [], dashboards: [] },
  configSchema: {
    title: 'IM Gateway Settings',
    description: 'Public IM trigger policy. Tokens are stored by the host.',
    properties: [
      { key: 'telegramEnabled', title: 'Telegram enabled', type: 'boolean' },
      { key: 'telegramMode', title: 'Telegram mode', type: 'string', enum: ['polling'] },
      { key: 'privateTextMode', title: 'Private text mode', type: 'string', enum: ['command-only', 'pet-say', 'ai-chat'] },
      { key: 'groupChatPolicy', title: 'Group chats', type: 'string', enum: ['mention-or-command', 'command-only'] },
      { key: 'groupAiRepliesEnabled', title: 'Enable group AI replies', type: 'boolean' },
      { key: 'allowedUsers', title: 'Allowed users', type: 'string' },
      { key: 'allowedChats', title: 'Allowed chats', type: 'string' },
      { key: 'allowAllPrivateChats', title: 'Allow all private chats', type: 'boolean' },
      { key: 'allowAllGroupChats', title: 'Allow all group chats', type: 'boolean' },
      { key: 'commandAliases', title: 'Command aliases', type: 'string' },
      { key: 'petSayTtlMs', title: 'Pet say TTL', type: 'number' },
      { key: 'receiptMode', title: 'Receipt mode', type: 'string', enum: ['commands-only', 'none'] }
    ]
  },
  config: {
    telegramEnabled: true,
    telegramMode: 'polling',
    privateTextMode: 'command-only',
    groupChatPolicy: 'mention-or-command',
    groupAiRepliesEnabled: false,
    allowedUsers: '1001',
    allowedChats: '-2001',
    allowAllPrivateChats: false,
    allowAllGroupChats: false,
    commandAliases: '/openpet,/op',
    petSayTtlMs: 6000,
    receiptMode: 'commands-only'
  },
  storage: { keyCount: 0, byteSize: 0, valid: true },
  signatureStatus: { status: 'bundled', label: 'Bundled plugin', signer: 'openpet', algorithm: '', verified: true, errors: [] },
  blockStatus: { blocked: false, reasons: [] }
})

// 桥缺失时，入口不能悄悄回退到 demo 假后端：那会让用户在一个永远同步不到主
// 进程的状态上做修改。门禁 (import.meta.env.DEV) 在 Vite 之外恒为假，所以这里
// 断言的就是生产行为——明确失败，且失败信息指向真正的原因（preload 桥没注入）。
test('control center API entrypoint refuses the demo fallback outside a dev build', async () => {
  delete global.window.controlCenterAPI
  const { controlCenterAPI } = await import('../../src/control-center/src/api/control-center-api.ts')

  assert.equal(global.window.controlCenterAPI, undefined)

  await assert.rejects(
    controlCenterAPI.getSettings(),
    /bridge is unavailable/,
    'a missing preload bridge must surface as an explicit bridge error'
  )

  // 门禁不得把 demo API 装到 window 上——否则后续调用会静默"成功"。
  assert.equal(global.window.controlCenterAPI, undefined)
})

// 桥存在时入口必须直接转发到注入的 API，一个 IPC 调用都不能落到 demo 后端。
test('control center API entrypoint forwards to the injected bridge when present', async () => {
  const calls = []
  global.window.controlCenterAPI = {
    getSettings: (...args) => {
      calls.push(['getSettings', args])
      return Promise.resolve({ scale: 1.25 })
    }
  }
  try {
    const { controlCenterAPI } = await import('../../src/control-center/src/api/control-center-api.ts')
    const settings = await controlCenterAPI.getSettings()
    assert.equal(settings.scale, 1.25)
    assert.deepEqual(calls, [['getSettings', []]])
  } finally {
    delete global.window.controlCenterAPI
  }
})

test('demo API saves and returns settings from session-backed state', async () => {
  const previousSettings = await demoControlCenterAPI.getSettings()

  const savedSettings = await demoControlCenterAPI.saveSettings({
    ...previousSettings,
    scale: 1.35,
    grounded: false,
    home: {
      ...previousSettings.home,
      enabled: true
    }
  })

  assert.equal(savedSettings.scale, 1.35)
  assert.equal(savedSettings.grounded, false)
  assert.equal(savedSettings.home.enabled, false)
  assert.deepEqual(await demoControlCenterAPI.getSettings(), savedSettings)
})

test('demo API provider saves follow the same owner-only payload rules as the main host', async () => {
  const previousAiConfig = await demoControlCenterAPI.getAiConfig()
  const previousImageConfig = await demoControlCenterAPI.getImageGenerationConfig()

  const savedAiConfig = await demoControlCenterAPI.saveAiConfig({
    enabled: !previousAiConfig.enabled,
    baseUrl: 'https://gateway.example.test/v1/',
    model: 'gpt-5.5',
    vision: {
      ...previousAiConfig.vision,
      mode: 'override',
      baseUrl: 'https://vision.example.test/v1/',
      model: 'gpt-4.1-mini',
      hasApiKey: false,
      modelCatalog: {
        cacheKey: 'draft-vision-cache',
        models: ['draft-vision-model'],
        fetchedAt: '2026-07-05T09:00:00.000Z',
        source: 'draft'
      }
    },
    hasApiKey: false,
    apiKeyRef: 'draft.ai.ref',
    modelCatalog: {
      cacheKey: 'draft-cache',
      models: ['custom-model'],
      fetchedAt: '2026-07-05T09:00:00.000Z',
      source: 'draft'
    }
  })

  assert.equal(savedAiConfig.enabled, !previousAiConfig.enabled)
  assert.equal(savedAiConfig.baseUrl, 'https://gateway.example.test/v1')
  assert.equal(savedAiConfig.model, 'gpt-5.5')
  assert.equal(savedAiConfig.hasApiKey, previousAiConfig.hasApiKey)
  assert.deepEqual(savedAiConfig.modelCatalog, previousAiConfig.modelCatalog)
  assert.equal(savedAiConfig.vision.mode, 'override')
  assert.equal(savedAiConfig.vision.baseUrl, 'https://vision.example.test/v1')
  assert.equal(savedAiConfig.vision.model, 'gpt-4.1-mini')
  assert.equal(savedAiConfig.vision.hasApiKey, previousAiConfig.vision.hasApiKey)
  assert.deepEqual(savedAiConfig.vision.modelCatalog, previousAiConfig.vision.modelCatalog)

  const savedImageConfig = await demoControlCenterAPI.saveImageGenerationConfig({
    baseUrl: 'https://images.example.test/v1/',
    model: 'custom-image-model',
    timeoutMs: 90000,
    hasApiKey: false,
    apiKeyPreview: '',
    modelCatalog: {
      cacheKey: 'draft-image-cache',
      models: ['draft-image-model'],
      fetchedAt: '2026-07-05T09:00:00.000Z',
      source: 'draft'
    }
  })

  assert.equal(savedImageConfig.baseUrl, 'https://images.example.test/v1')
  assert.equal(savedImageConfig.model, 'custom-image-model')
  assert.equal(savedImageConfig.timeoutMs, 90000)
  assert.equal(savedImageConfig.hasApiKey, previousImageConfig.hasApiKey)
  assert.equal(savedImageConfig.apiKeyPreview, previousImageConfig.apiKeyPreview)
  assert.deepEqual(savedImageConfig.modelCatalog, previousImageConfig.modelCatalog)
})

test('demo API saves and clears vision API key and discovers vision models', async () => {
  await demoControlCenterAPI.saveAiConfig({
    vision: {
      mode: 'override',
      provider: 'openai-compatible',
      baseUrl: 'https://healthy-vision.example.test/v1',
      model: 'gpt-4.1-mini'
    }
  })

  const saved = await demoControlCenterAPI.saveAiVisionApiKey('sk-demo-vision')
  assert.equal(saved.hasApiKey, true)

  const discovered = await demoControlCenterAPI.discoverAiVisionModels()
  assert.equal(discovered.ok, true)
  assert.deepEqual(discovered.models, ['gpt-4.1-mini', 'gpt-4o', 'qwen2.5-vl-7b-instruct'])

  const config = await demoControlCenterAPI.getAiConfig()
  assert.equal(config.vision.hasApiKey, true)
  assert.deepEqual(config.vision.modelCatalog.models, discovered.models)

  const cleared = await demoControlCenterAPI.clearAiVisionApiKey()
  assert.equal(cleared.hasApiKey, false)
})

test('demo API installs a fixture plugin and returns command mock output', async () => {
  const review = await demoControlCenterAPI.inspectPluginPackage()
  const installResult = await demoControlCenterAPI.installPlugin(review.selectionId)
  const plugins = await demoControlCenterAPI.getPlugins()

  assert.equal(installResult.ok, true)
  assert.ok(plugins.some((plugin) => plugin.id === review.plugin.id))

  await assert.rejects(
    demoControlCenterAPI.runPluginCommand(review.plugin.id, 'hello', { greeting: 'hi' }),
    /Plugin is disabled/
  )
  await demoControlCenterAPI.setPluginEnabled(review.plugin.id, true)
  await assert.rejects(
    demoControlCenterAPI.runPluginCommand(review.plugin.id, 'hello', { greeting: 'hi' }),
    /Plugin native execution is not approved/
  )
  await demoControlCenterAPI.setPluginNativeExecutionApproved(review.plugin.id, true)
  const commandResult = await demoControlCenterAPI.runPluginCommand(review.plugin.id, 'hello', { greeting: 'hi' })

  assert.equal(commandResult.ok, true)
  assert.equal(commandResult.pluginId, review.plugin.id)
  assert.equal(commandResult.commandId, 'hello')
  assert.equal(commandResult.result.message, 'Demo command completed')
  assert.deepEqual(commandResult.result.payload, { greeting: 'hi' })
})

test('demo API IM Gateway phase 2 AI reply config fields save and reload through schema-backed normalization', async () => {
  const installed = await upsertDemoPlugin(createImGatewayPhase2DemoPlugin())
  const configured = await demoControlCenterAPI.savePluginConfig(installed.id, {
    ...(installed.config || {}),
    privateTextMode: 'ai-chat',
    groupAiRepliesEnabled: true,
    allowedUsers: '1001,1002'
  })

  assert.equal(configured.config.privateTextMode, 'ai-chat')
  assert.equal(configured.config.groupAiRepliesEnabled, true)
  assert.equal(configured.config.allowedUsers, '1001,1002')

  const refreshed = (await demoControlCenterAPI.getPlugins()).find((plugin) => plugin.id === installed.id)
  assert.ok(refreshed)
  assert.equal(refreshed.config.privateTextMode, 'ai-chat')
  assert.equal(refreshed.config.groupAiRepliesEnabled, true)
  assert.equal(refreshed.configSchema.properties.some((field) => field.key === 'privateChatPolicy'), false)
})

test('demo API preserves IM Gateway onboarding diagnostics fixtures', async () => {
  const plugin = createImGatewayPhase2DemoPlugin()
  plugin.nativeExecutionApproved = false
  plugin.entries.services = [{
    id: 'im-gateway',
    title: 'IM Gateway Service',
    command: 'node ./service/im-gateway-service.js',
    cwd: '.',
    health: { type: 'http', url: 'http://127.0.0.1:8796/health' },
    runtime: {
      status: 'running',
      pid: 3210,
      health: {
        status: 'healthy',
        checkedAt: '2026-07-09T02:00:00.000Z',
        url: 'http://127.0.0.1:8796/health',
        statusCode: 200,
        message: 'Recent Telegram message blocked by allowlist'
      }
    },
    healthPolicy: { enabled: false, intervalMs: 30000 }
  }]

  const stored = await upsertDemoPlugin(plugin)
  assert.equal(stored.entries.services[0].runtime.health.message, 'Recent Telegram message blocked by allowlist')
})

test('demo API chat mock appends user and assistant messages', async () => {
  const response = await demoControlCenterAPI.chat({ message: 'hello demo cat' })

  assert.equal(response.reply, 'OpenPet: hello demo cat')
  assert.equal(response.behavior.actionId, 'wave')
  assert.deepEqual(response.messages.slice(-2).map((message) => message.role), ['user', 'assistant'])
  assert.deepEqual(response.messages.slice(-2).map((message) => message.content), ['hello demo cat', response.reply])
})

test('demo API exposes native execution approval path for entries plugins', async () => {
  const installed = await ensureDemoFixturePluginInstalled()
  await demoControlCenterAPI.setPluginEnabled(installed.id, false)
  await demoControlCenterAPI.setPluginNativeExecutionApproved(installed.id, false)
  const reset = (await demoControlCenterAPI.getPlugins()).find((plugin) => plugin.id === installed.id)
  assert.ok(reset)

  // The gate is deny-by-default: an entries plugin surfaces the requirement and
  // starts unapproved so the UI can render an approval control (the P1-1 gap fix).
  assert.equal(reset.requiresNativeExecution, true)
  assert.equal(reset.nativeExecutionApproved, false)

  const approved = await demoControlCenterAPI.setPluginNativeExecutionApproved(installed.id, true)
  assert.equal(approved.nativeExecutionApproved, true)
  assert.equal(approved.id, installed.id)
  assert.ok(approved.entries)
  assert.ok(approved.storage)
  const afterApprove = (await demoControlCenterAPI.getPlugins()).find((plugin) => plugin.id === installed.id)
  assert.equal(afterApprove.nativeExecutionApproved, true)

  const revoked = await demoControlCenterAPI.setPluginNativeExecutionApproved(installed.id, false)
  assert.equal(revoked.nativeExecutionApproved, false)
  assert.equal(revoked.id, installed.id)
  assert.ok(revoked.entries)
  assert.ok(revoked.storage)
  const afterRevoke = (await demoControlCenterAPI.getPlugins()).find((plugin) => plugin.id === installed.id)
  assert.equal(afterRevoke.nativeExecutionApproved, false)
})

test('demo API creator picker returns an opaque reference token', async () => {
  const picked = await demoControlCenterAPI.pickCreatorReferenceImage()

  assert.equal(picked.ok, true)
  assert.equal(picked.canceled, false)
  assert.equal(typeof picked.referenceToken, 'string')
  assert.ok(picked.referenceToken.length > 10)
  assert.equal('sourcePath' in picked, false)
})

test('demo API creator picker follows synced demo storage and blocks unsupported multi-view input', async () => {
  await setDemoCreatorReferencePickerPath('/demo/creator/全面.png')

  const picked = await demoControlCenterAPI.pickCreatorReferenceImage()
  assert.equal(picked.fileName, '全面.png')

  const result = await demoControlCenterAPI.generateCreatorNewCharacter({
    characterName: 'Blocked Multi View Cat',
    referenceImageToken: picked.referenceToken
  })

  assert.equal(result.state, 'missing-input')
  assert.equal(result.code, 'unsupported_reference_image')
  assert.match(result.message, /单张干净正面图/)
  assert.match(result.message, /不要使用拼图、三视图或多视图合成图/)
  assert.equal(result.reference?.fileName, '全面.png')
})

test('demo API existing-action flow blocks unsupported multi-view references from the picker', async () => {
  await setDemoCreatorReferencePickerPath('/demo/creator/全面.png')

  const picked = await demoControlCenterAPI.pickCreatorReferenceImage()
  assert.equal(picked.fileName, '全面.png')

  const result = await demoControlCenterAPI.generateCreatorExistingAction({
    actionName: 'wave',
    referenceImageToken: picked.referenceToken
  })

  assert.equal(result.state, 'missing-input')
  assert.equal(result.code, 'unsupported_reference_image')
  assert.match(result.message, /单张干净正面图/)
  assert.equal(result.reference?.fileName, '全面.png')
})

test('demo API plugin mutations return full plugin snapshots for renderer state replacement', async () => {
  const installed = await ensureDemoFixturePluginInstalled()
  const serviceId = installed.entries.services[0].id

  const enabled = await demoControlCenterAPI.setPluginEnabled(installed.id, true)
  assert.equal(enabled.id, installed.id)
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.name, installed.name)
  assert.ok(Array.isArray(enabled.entries.services))
  assert.ok(enabled.storage)

  const configured = await demoControlCenterAPI.savePluginConfig(installed.id, { city: 'Shanghai' })
  assert.equal(configured.id, installed.id)
  assert.equal(configured.enabled, true)
  assert.deepEqual(configured.config, { city: 'Shanghai', units: '' })
  assert.ok(configured.signatureStatus)
  assert.ok(configured.storage)

  const withHealthPolicy = await demoControlCenterAPI.savePluginServiceHealthPolicy(installed.id, serviceId, {
    enabled: true,
    intervalMs: 30000
  })
  assert.equal(withHealthPolicy.id, installed.id)
  assert.equal(withHealthPolicy.config.city, 'Shanghai')
  assert.equal(withHealthPolicy.config.units, '')
  assert.deepEqual(withHealthPolicy.entries.services[0].healthPolicy, {
    enabled: true,
    intervalMs: 30000
  })
  assert.ok(withHealthPolicy.storage)

  const clearedStorage = await demoControlCenterAPI.clearPluginStorage(installed.id)
  assert.equal(clearedStorage.id, installed.id)
  assert.equal(clearedStorage.config.city, 'Shanghai')
  assert.equal(clearedStorage.config.units, '')
  assert.equal(clearedStorage.storage.keyCount, 0)
  assert.equal(clearedStorage.storage.byteSize, 0)
  assert.equal(clearedStorage.storage.valid, true)
  assert.ok(clearedStorage.entries)
})

test('demo API plugin config saves respect schema-backed normalization and rejection like host', async () => {
  const installed = await ensureDemoFixturePluginInstalled()
  await demoControlCenterAPI.setPluginEnabled(installed.id, true)

  const configured = await demoControlCenterAPI.savePluginConfig(installed.id, {
    city: 'Hangzhou',
    units: 'imperial',
    ignored: 'value'
  })
  assert.deepEqual(configured.config, {
    city: 'Hangzhou',
    units: 'imperial'
  })

  await assert.rejects(
    demoControlCenterAPI.savePluginConfig(installed.id, { city: '', units: 'metric' }),
    /Plugin config city is required/
  )
  await assert.rejects(
    demoControlCenterAPI.savePluginConfig(installed.id, { city: 'Hangzhou', units: 'kelvin' }),
    /Plugin config units must be one of: metric, imperial/
  )

  const schemaLessPlugin = await upsertDemoPlugin({
    id: 'openpet.demo.no-config-schema',
    name: 'No Config Schema',
    version: '0.1.0-demo',
    source: 'local',
    enabled: true,
    runnable: true,
    requiresNativeExecution: false,
    nativeExecutionApproved: false,
    permissions: [],
    commands: [],
    entries: {
      setup: [],
      commands: [],
      services: [],
      dashboards: []
    },
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: 'verified',
      label: 'Verified',
      signer: '',
      algorithm: '',
      verified: true,
      errors: []
    }
  })

  await assert.rejects(
    demoControlCenterAPI.savePluginConfig(schemaLessPlugin.id, { city: 'Shanghai' }),
    /Plugin does not declare a config schema/
  )
})

test('demo API plugin runtime controls honor approval and enabled guards like host runtime', async () => {
  const installed = await ensureDemoFixturePluginInstalled()
  const serviceId = installed.entries.services[0].id
  const setupId = installed.entries.setup[0].id
  const dashboardId = installed.entries.dashboards[0].id

  await demoControlCenterAPI.setPluginEnabled(installed.id, false)
  await demoControlCenterAPI.setPluginNativeExecutionApproved(installed.id, false)

  await assert.rejects(
    demoControlCenterAPI.runPluginSetup(installed.id, setupId),
    /Plugin is disabled/
  )
  await assert.rejects(
    demoControlCenterAPI.startPluginService(installed.id, serviceId),
    /Plugin is disabled/
  )
  await assert.rejects(
    demoControlCenterAPI.openPluginDashboard(installed.id, dashboardId),
    /Plugin is disabled/
  )
  await assert.rejects(
    demoControlCenterAPI.checkPluginServiceHealth(installed.id, serviceId),
    /Plugin is disabled/
  )

  await demoControlCenterAPI.setPluginEnabled(installed.id, true)

  await assert.rejects(
    demoControlCenterAPI.runPluginSetup(installed.id, setupId),
    /Plugin native execution is not approved/
  )
  await assert.rejects(
    demoControlCenterAPI.startPluginService(installed.id, serviceId),
    /Plugin native execution is not approved/
  )

  await demoControlCenterAPI.setPluginNativeExecutionApproved(installed.id, true)

  const setupResult = await demoControlCenterAPI.runPluginSetup(installed.id, setupId)
  assert.equal(setupResult.runtime.status, 'succeeded')

  const started = await demoControlCenterAPI.startPluginService(installed.id, serviceId)
  assert.equal(started.runtime.status, 'running')
  await assert.rejects(
    demoControlCenterAPI.startPluginService(installed.id, serviceId),
    /Plugin service is already running/
  )

  const opened = await demoControlCenterAPI.openPluginDashboard(installed.id, dashboardId, {
    query: { runId: 'demo-run' }
  })
  assert.match(opened.url, /runId=demo-run/)

  const ignoredArrayQuery = await demoControlCenterAPI.openPluginDashboard(installed.id, dashboardId, {
    query: ['bad', 'query']
  })
  assert.equal(ignoredArrayQuery.url.includes('0=bad'), false)
  assert.equal(ignoredArrayQuery.url.includes('1=query'), false)

  const health = await demoControlCenterAPI.checkPluginServiceHealth(installed.id, serviceId)
  assert.equal(health.health.status, 'healthy')
  assert.match(health.health.url, /^http:\/\/127\.0\.0\.1:8787\/health/)

  const stopped = await demoControlCenterAPI.stopPluginService(installed.id, serviceId)
  assert.equal(stopped.runtime.status, 'stopped')
  await assert.rejects(
    demoControlCenterAPI.stopPluginService(installed.id, serviceId),
    /Plugin service is not running/
  )
})

test('demo API plugin service stop and health policy errors match host not-found and enabled gates', async () => {
  const installed = await ensureDemoFixturePluginInstalled()
  const serviceId = installed.entries.services[0].id

  await demoControlCenterAPI.clearPluginLogs()
  await demoControlCenterAPI.setPluginEnabled(installed.id, false)

  await assert.rejects(
    demoControlCenterAPI.savePluginServiceHealthPolicy(installed.id, serviceId, {
      enabled: true,
      intervalMs: 30000
    }),
    /Plugin is disabled/
  )
  await assert.rejects(
    demoControlCenterAPI.stopPluginService(installed.id, 'missing'),
    /Plugin service not found: missing/
  )
  await assert.rejects(
    demoControlCenterAPI.stopPluginService('openpet.missing-plugin', serviceId),
    /Plugin not found: openpet\.missing-plugin/
  )

  const logs = (await demoControlCenterAPI.getPluginLogs({ pluginId: installed.id })).entries

  assert.equal(logs.some((entry) => entry.commandId === `service:${serviceId}` && /Service health policy/.test(entry.message)), false)
  assert.equal(logs.some((entry) => entry.commandId === 'service:missing' && entry.level === 'error'), false)
})

test('demo API blocked plugins reject enablement, approval, and runtime actions like host', async () => {
  const plugin = await upsertDemoPlugin({
    id: 'openpet.demo.blocked-plugin',
    name: 'Blocked Plugin',
    version: '0.1.0-demo',
    source: 'local',
    enabled: true,
    runnable: true,
    requiresNativeExecution: true,
    nativeExecutionApproved: true,
    permissions: [],
    commands: [{ id: 'hello', title: 'Hello' }],
    entries: {
      setup: [{ id: 'install', title: 'Install', command: 'npm install', cwd: '.' }],
      commands: [{ id: 'hello', title: 'Hello', command: 'node ./hello.js', cwd: '.' }],
      services: [
        {
          id: 'blocked-service',
          title: 'Blocked Service',
          command: 'node ./service.js',
          cwd: '.',
          health: { type: 'http', url: 'http://127.0.0.1:8787/health' },
          runtime: { status: 'stopped' }
        }
      ],
      dashboards: [{ id: 'main', title: 'Blocked Dashboard', url: 'http://127.0.0.1:8787' }]
    },
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: 'verified',
      label: 'Verified',
      signer: '',
      algorithm: '',
      verified: true,
      errors: []
    },
    blockStatus: { blocked: true, reasons: ['blocked for review'] }
  })

  await demoControlCenterAPI.clearPluginLogs()

  await assert.rejects(
    demoControlCenterAPI.setPluginEnabled(plugin.id, true),
    /Plugin is blocked: blocked for review/
  )
  await assert.rejects(
    demoControlCenterAPI.setPluginNativeExecutionApproved(plugin.id, true),
    /Plugin is blocked: blocked for review/
  )
  await assert.rejects(
    demoControlCenterAPI.runPluginCommand(plugin.id, 'hello'),
    /Plugin is blocked: blocked for review/
  )
  await assert.rejects(
    demoControlCenterAPI.openPluginDashboard(plugin.id, 'main'),
    /Plugin is blocked: blocked for review/
  )
  await assert.rejects(
    demoControlCenterAPI.startPluginService(plugin.id, 'blocked-service'),
    /Plugin is blocked: blocked for review/
  )
  await assert.rejects(
    demoControlCenterAPI.runPluginSetup(plugin.id, 'install'),
    /Plugin is blocked: blocked for review/
  )
  await assert.rejects(
    demoControlCenterAPI.checkPluginServiceHealth(plugin.id, 'blocked-service'),
    /Plugin is blocked: blocked for review/
  )
  await assert.rejects(
    demoControlCenterAPI.savePluginServiceHealthPolicy(plugin.id, 'blocked-service', {
      enabled: true,
      intervalMs: 30000
    }),
    /Plugin is blocked: blocked for review/
  )

  const logs = (await demoControlCenterAPI.getPluginLogs({ pluginId: plugin.id })).entries

  assert.equal(logs.some((entry) => entry.message === 'Plugin enabled'), false)
  assert.equal(logs.some((entry) => entry.message === 'Plugin native execution approved'), false)
  assert.ok(logs.some((entry) => entry.commandId === 'hello' && entry.level === 'error' && entry.message === 'Plugin is blocked: blocked for review'))
  assert.ok(logs.some((entry) => entry.commandId === 'dashboard:main' && entry.level === 'error' && entry.message === 'Plugin is blocked: blocked for review'))
  assert.ok(logs.some((entry) => entry.commandId === 'service:blocked-service' && entry.level === 'error' && entry.message === 'Plugin is blocked: blocked for review'))
  assert.ok(logs.some((entry) => entry.commandId === 'setup:install' && entry.level === 'error' && entry.message === 'Plugin is blocked: blocked for review'))
  assert.equal(logs.some((entry) => entry.commandId === 'service:blocked-service' && /Service health policy/.test(entry.message)), false)
})

test('demo API disabling plugins and revoking native approval clear running setup and service state', async () => {
  const plugin = await upsertDemoPlugin({
    id: 'openpet.demo.runtime-cleanup',
    name: 'Runtime Cleanup',
    version: '0.1.0-demo',
    source: 'local',
    enabled: true,
    runnable: true,
    requiresNativeExecution: true,
    nativeExecutionApproved: true,
    permissions: [],
    commands: [],
    entries: {
      setup: [
        {
          id: 'install',
          title: 'Install',
          command: 'npm install',
          cwd: '.',
          runtime: {
            status: 'running',
            lastRunAt: '2026-07-04T00:00:00.000Z',
            exitCode: null,
            error: ''
          }
        }
      ],
      commands: [],
      services: [
        {
          id: 'service',
          title: 'Cleanup Service',
          command: 'node ./service.js',
          cwd: '.',
          health: { type: 'http', url: 'http://127.0.0.1:8787/health' },
          runtime: {
            status: 'running',
            pid: 4321,
            startedAt: '2026-07-04T00:00:00.000Z',
            health: { status: 'healthy', url: 'http://127.0.0.1:8787/health', message: 'OK' }
          }
        }
      ],
      dashboards: []
    },
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: 'verified',
      label: 'Verified',
      signer: '',
      algorithm: '',
      verified: true,
      errors: []
    }
  })

  const disabled = await demoControlCenterAPI.setPluginEnabled(plugin.id, false)
  assert.equal(disabled.entries.setup[0].runtime.status, 'failed')
  assert.equal(disabled.entries.setup[0].runtime.error, 'Setup stopped')
  assert.equal(disabled.entries.services[0].runtime.status, 'stopped')

  const reset = await upsertDemoPlugin({
    ...plugin,
    enabled: true,
    nativeExecutionApproved: true,
    entries: {
      ...plugin.entries,
      setup: [
        {
          ...plugin.entries.setup[0],
          runtime: {
            status: 'running',
            lastRunAt: '2026-07-04T00:00:00.000Z',
            exitCode: null,
            error: ''
          }
        }
      ],
      services: [
        {
          ...plugin.entries.services[0],
          runtime: {
            status: 'running',
            pid: 4321,
            startedAt: '2026-07-04T00:00:00.000Z',
            health: { status: 'healthy', url: 'http://127.0.0.1:8787/health', message: 'OK' }
          }
        }
      ]
    }
  })

  const revoked = await demoControlCenterAPI.setPluginNativeExecutionApproved(reset.id, false)
  assert.equal(revoked.entries.setup[0].runtime.status, 'failed')
  assert.equal(revoked.entries.setup[0].runtime.error, 'Setup stopped')
  assert.equal(revoked.entries.services[0].runtime.status, 'stopped')
})

test('demo API plugin runtime failures append error logs without false success entries', async () => {
  const installed = await ensureDemoFixturePluginInstalled()
  const serviceId = installed.entries.services[0].id
  const setupId = installed.entries.setup[0].id
  const dashboardId = installed.entries.dashboards[0].id

  await demoControlCenterAPI.clearPluginLogs()
  await demoControlCenterAPI.setPluginEnabled(installed.id, false)
  await demoControlCenterAPI.setPluginNativeExecutionApproved(installed.id, false)

  await assert.rejects(
    demoControlCenterAPI.runPluginCommand(installed.id, 'hello', { greeting: 'hi' }),
    /Plugin is disabled/
  )
  await assert.rejects(
    demoControlCenterAPI.openPluginDashboard(installed.id, dashboardId),
    /Plugin is disabled/
  )

  await demoControlCenterAPI.setPluginEnabled(installed.id, true)

  await assert.rejects(
    demoControlCenterAPI.runPluginSetup(installed.id, setupId),
    /Plugin native execution is not approved/
  )
  await assert.rejects(
    demoControlCenterAPI.startPluginService(installed.id, serviceId),
    /Plugin native execution is not approved/
  )

  const logs = (await demoControlCenterAPI.getPluginLogs({ pluginId: installed.id })).entries

  assert.ok(logs.some((entry) => entry.commandId === 'hello' && entry.level === 'error' && entry.message === 'Plugin is disabled'))
  assert.ok(logs.some((entry) => entry.commandId === `dashboard:${dashboardId}` && entry.level === 'error' && entry.message === 'Plugin is disabled'))
  assert.ok(logs.some((entry) => entry.commandId === `setup:${setupId}` && entry.level === 'error' && /Plugin native execution is not approved/.test(entry.message)))
  assert.ok(logs.some((entry) => entry.commandId === `service:${serviceId}` && entry.level === 'error' && /Plugin native execution is not approved/.test(entry.message)))
  assert.equal(logs.some((entry) => entry.commandId === 'hello' && entry.message === 'Command completed'), false)
  assert.equal(logs.some((entry) => entry.commandId === `dashboard:${dashboardId}` && entry.message === 'Dashboard opened'), false)
  assert.equal(logs.some((entry) => entry.commandId === `setup:${setupId}` && entry.message === 'Setup completed'), false)
  assert.equal(logs.some((entry) => entry.commandId === `service:${serviceId}` && entry.message === 'Service started'), false)
})

test('demo API creator-studio command failure logs an error without completion log', async () => {
  const plugin = await ensureDemoCreatorStudioInstalled()
  await demoControlCenterAPI.clearPluginLogs()
  await demoControlCenterAPI.setPluginEnabled(plugin.id, true)

  await assert.rejects(
    demoControlCenterAPI.runPluginCommand(plugin.id, 'run-step', { runId: 'run-demo-action-fail' }),
    /Provider backend timed out/
  )

  const logs = (await demoControlCenterAPI.getPluginLogs({ pluginId: plugin.id })).entries

  assert.ok(logs.some((entry) => entry.commandId === 'run-step' && entry.level === 'error' && entry.message === 'Provider backend timed out'))
  assert.equal(logs.some((entry) => entry.commandId === 'run-step' && entry.message === 'Command completed'), false)
})

test('demo API creator-studio commands and default flow require native execution approval when flagged', async () => {
  await upsertDemoPlugin({
    id: 'openpet.creator-studio',
    name: 'Creator Studio',
    version: '1.0.0-demo',
    source: 'local',
    enabled: true,
    runnable: true,
    requiresNativeExecution: true,
    nativeExecutionApproved: false,
    permissions: ['model:image-generate', 'assets:generate'],
    commands: [{ id: 'draft-task', title: 'Draft Creator Task' }],
    entries: {
      setup: [],
      commands: [{ id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' }],
      services: [
        {
          id: 'studio',
          title: 'Creator Studio Service',
          command: 'node ./service/studio-service.js',
          cwd: '.',
          health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
          runtime: { status: 'running', pid: 4321, health: { status: 'healthy', url: 'http://127.0.0.1:8794/health' } }
        }
      ],
      dashboards: [{ id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }]
    },
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: 'verified',
      label: 'Verified',
      signer: '',
      algorithm: '',
      verified: true,
      errors: []
    }
  })

  await assert.rejects(
    demoControlCenterAPI.runPluginCommand('openpet.creator-studio', 'draft-task', { prompt: 'make a cat' }),
    /Plugin native execution is not approved/
  )
  await assert.rejects(
    demoControlCenterAPI.runCreatorStudioDefaultFlow('给当前猫猫新增一个动作'),
    /Plugin native execution is not approved/
  )
})

test('demo API infers requiresNativeExecution from plugin entries when fixtures omit it', async () => {
  await upsertDemoPlugin({
    id: 'openpet.demo.inferred-native-gate',
    name: 'Inferred Native Gate',
    version: '0.1.0-demo',
    source: 'local',
    enabled: true,
    runnable: true,
    permissions: [],
    commands: [{ id: 'hello', title: 'Hello' }],
    entries: {
      setup: [],
      commands: [{ id: 'hello', title: 'Hello', command: 'node ./hello.js', cwd: '.' }],
      services: [],
      dashboards: []
    },
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: 'verified',
      label: 'Verified',
      signer: '',
      algorithm: '',
      verified: true,
      errors: []
    }
  })

  const inferred = (await demoControlCenterAPI.getPlugins()).find((plugin) => plugin.id === 'openpet.demo.inferred-native-gate')
  assert.ok(inferred)
  assert.equal(inferred.requiresNativeExecution, true)
  assert.equal(inferred.nativeExecutionApproved, false)

  await assert.rejects(
    demoControlCenterAPI.runPluginCommand(inferred.id, 'hello'),
    /Plugin native execution is not approved/
  )
})

test('demo API malformed dashboard URLs and missing health type match host validation errors', async () => {
  const plugin = await upsertDemoPlugin({
    id: 'openpet.demo.bad-urls',
    name: 'Bad URLs',
    version: '0.1.0-demo',
    source: 'local',
    enabled: true,
    runnable: true,
    requiresNativeExecution: false,
    nativeExecutionApproved: true,
    permissions: [],
    commands: [],
    entries: {
      setup: [],
      commands: [],
      services: [
        {
          id: 'bad-health',
          name: 'Bad Health',
          health: { url: 'not-a-valid-url' },
          runtime: { status: 'stopped' }
        }
      ],
      dashboards: [
        {
          id: 'bad-dashboard',
          title: 'Bad Dashboard',
          url: 'not-a-valid-url'
        }
      ]
    },
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: 'verified',
      label: 'Verified',
      signer: '',
      algorithm: '',
      verified: true,
      errors: []
    }
  })

  await demoControlCenterAPI.clearPluginLogs()

  await assert.rejects(
    demoControlCenterAPI.openPluginDashboard(plugin.id, 'bad-dashboard'),
    /Plugin dashboard URL is invalid/
  )
  await assert.rejects(
    demoControlCenterAPI.checkPluginServiceHealth(plugin.id, 'bad-health'),
    /Plugin service health check is not configured/
  )

  const logs = (await demoControlCenterAPI.getPluginLogs({ pluginId: plugin.id })).entries

  assert.ok(logs.some((entry) => entry.commandId === 'dashboard:bad-dashboard' && entry.level === 'error' && entry.message === 'Plugin dashboard URL is invalid'))
  assert.ok(logs.some((entry) => entry.commandId === 'service:bad-health' && entry.level === 'error' && entry.message === 'Plugin service health check is not configured'))
})

test('demo API service health URL validation matches host loopback and type rules', async () => {
  const plugin = await upsertDemoPlugin({
    id: 'openpet.demo.bad-health-contract',
    name: 'Bad Health Contract',
    version: '0.1.0-demo',
    source: 'local',
    enabled: true,
    runnable: true,
    requiresNativeExecution: false,
    nativeExecutionApproved: true,
    permissions: [],
    commands: [],
    entries: {
      setup: [],
      commands: [],
      services: [
        {
          id: 'wrong-type',
          name: 'Wrong Type',
          health: { type: 'tcp', url: 'http://127.0.0.1:8787/health' },
          runtime: { status: 'stopped' }
        },
        {
          id: 'bad-url',
          name: 'Bad URL',
          health: { type: 'http', url: 'not-a-valid-url' },
          runtime: { status: 'stopped' }
        },
        {
          id: 'remote-host',
          name: 'Remote Host',
          health: { type: 'http', url: 'https://api.example.com/health' },
          runtime: { status: 'stopped' }
        }
      ],
      dashboards: []
    },
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: 'verified',
      label: 'Verified',
      signer: '',
      algorithm: '',
      verified: true,
      errors: []
    }
  })

  await demoControlCenterAPI.clearPluginLogs()

  await assert.rejects(
    demoControlCenterAPI.checkPluginServiceHealth(plugin.id, 'wrong-type'),
    /Plugin service health type must be http/
  )
  await assert.rejects(
    demoControlCenterAPI.checkPluginServiceHealth(plugin.id, 'bad-url'),
    /Plugin service health URL is invalid/
  )
  await assert.rejects(
    demoControlCenterAPI.checkPluginServiceHealth(plugin.id, 'remote-host'),
    /Plugin service health URL must use a loopback host/
  )

  const logs = (await demoControlCenterAPI.getPluginLogs({ pluginId: plugin.id })).entries

  assert.ok(logs.some((entry) => entry.commandId === 'service:wrong-type' && entry.level === 'error' && entry.message === 'Plugin service health type must be http'))
  assert.ok(logs.some((entry) => entry.commandId === 'service:bad-url' && entry.level === 'error' && entry.message === 'Plugin service health URL is invalid'))
  assert.ok(logs.some((entry) => entry.commandId === 'service:remote-host' && entry.level === 'error' && entry.message === 'Plugin service health URL must use a loopback host'))
})

test('demo API plugin package review and update flow reflect installed state', async () => {
  const installed = await ensureDemoFixturePluginInstalled()
  await demoControlCenterAPI.setPluginNativeExecutionApproved(installed.id, true)
  await demoControlCenterAPI.setPluginEnabled(installed.id, true)
  await demoControlCenterAPI.savePluginConfig(installed.id, { city: 'Shanghai', units: 'metric' })

  const updateReview = await demoControlCenterAPI.inspectPluginPackage()
  assert.equal(updateReview.installMode, 'update')
  assert.equal(updateReview.existingVersion, installed.version)
  assert.equal(updateReview.plugin.version, '1.1.0')
  assert.ok(updateReview.plugin.permissions.includes('network'))
  assert.deepEqual(updateReview.permissionDiff.permissions.added, ['network'])

  const updateResult = await demoControlCenterAPI.updatePlugin(updateReview.selectionId)
  assert.equal(updateResult.ok, true)
  assert.equal(updateResult.installMode, 'update')
  assert.equal(updateResult.disabled, true)
  const updatedPlugin = updateResult.plugins.find((plugin) => plugin.id === installed.id)
  assert.ok(updatedPlugin)
  assert.equal(updatedPlugin.version, '1.1.0')
  assert.equal(updatedPlugin.enabled, false)
  assert.equal(updatedPlugin.nativeExecutionApproved, true)
  assert.deepEqual(updatedPlugin.config, { city: 'Shanghai', units: 'metric' })
  assert.ok(updatedPlugin.permissions.includes('network'))
})

test('demo API GitHub plugin inspection validates repository URLs and marks sourceType github', async () => {
  await assert.rejects(
    demoControlCenterAPI.inspectPluginGithubRepository('not-a-github-url'),
    /Please enter a GitHub repository homepage URL/
  )

  const review = await demoControlCenterAPI.inspectPluginGithubRepository('https://github.com/openai/openai-node/')
  assert.equal(review.canceled, false)
  assert.equal(review.sourceType, 'github')
  assert.equal(review.selectionId, 'demo-github-plugin-selection')
  assert.match(review.plugin.description, /https:\/\/github\.com\/openai\/openai-node/)
})

test('demo API uninstall returns refreshed plugin list instead of an empty placeholder', async () => {
  const installed = await ensureDemoFixturePluginInstalled()
  const beforePlugins = await demoControlCenterAPI.getPlugins()

  const uninstallResult = await demoControlCenterAPI.uninstallPlugin(installed.id, { removeStorage: true })

  assert.equal(uninstallResult.ok, true)
  assert.equal(uninstallResult.pluginId, installed.id)
  assert.equal(uninstallResult.storageRemoved, true)
  assert.equal(uninstallResult.plugins.some((plugin) => plugin.id === installed.id), false)
  assert.equal(uninstallResult.plugins.length, beforePlugins.length - 1)
})

test('demo API catalog plugin install returns refreshed plugin state alongside catalog state', async () => {
  const selection = await demoControlCenterAPI.prepareCatalogInstall({
    kind: 'plugin',
    itemId: 'openpet.demo.weather'
  })

  assert.equal(selection.kind, 'plugin')

  const result = await demoControlCenterAPI.installCatalogSelection(selection.selectionId)

  assert.equal(result.ok, true)
  assert.equal(result.kind, 'plugin')
  assert.equal(result.itemId, 'openpet.demo.weather')
  assert.ok(result.catalog.plugins.find((plugin) => plugin.id === 'openpet.demo.weather')?.installed)
  assert.ok(Array.isArray(result.plugins))
  const installedPlugin = result.plugins.find((plugin) => plugin.id === 'openpet.demo.weather')
  assert.ok(installedPlugin)
  assert.equal(installedPlugin.source, 'catalog')
  assert.equal(installedPlugin.enabled, false)
})

test('demo API catalog pet-pack install returns refreshed pet-pack state', async () => {
  const selection = await demoControlCenterAPI.prepareCatalogInstall({
    kind: 'pet-pack',
    itemId: 'openpet.demo.pixel-cat'
  })

  assert.equal(selection.kind, 'pet-pack')

  const result = await demoControlCenterAPI.installCatalogSelection(selection.selectionId)

  assert.equal(result.ok, true)
  assert.equal(result.kind, 'pet-pack')
  assert.equal(result.itemId, 'openpet.demo.pixel-cat')
  assert.ok(result.catalog.petPacks.find((pack) => pack.id === 'openpet.demo.pixel-cat')?.installed)
  assert.ok(result.petPacks)
  assert.ok(result.petPacks.packs.some((pack) => pack.id === 'openpet.demo.pixel-cat'))
  assert.equal(result.petPacks.activePackId, 'legacy-cat')
  assert.equal(result.animations, undefined)
})

test('demo API pet-pack inspect import and remove flow updates pet-pack state', async () => {
  const inspection = await demoControlCenterAPI.inspectPetPackDirectory()

  assert.equal(inspection.canceled, false)
  assert.equal(inspection.selectionId, 'demo-pet-pack-selection')
  assert.equal(inspection.valid, true)
  assert.equal(inspection.pack?.id, 'demo-imported-cat')

  const imported = await demoControlCenterAPI.importPetPack(inspection.selectionId)
  assert.equal(imported.pack?.id, 'demo-imported-cat')
  assert.equal(imported.activePackId, 'legacy-cat')
  assert.ok(imported.petPacks.packs.some((pack) => pack.id === 'demo-imported-cat'))

  const removed = await demoControlCenterAPI.removePetPack('demo-imported-cat')
  assert.equal(removed.pack?.id, 'demo-imported-cat')
  assert.equal(removed.petPacks.packs.some((pack) => pack.id === 'demo-imported-cat'), false)
  assert.equal(removed.activePackId, 'legacy-cat')
  assert.equal(removed.animations, undefined)
})

test('demo API pet-pack mutations reject unknown active-target and active-pack removal like host runtime', async () => {
  await assert.rejects(
    demoControlCenterAPI.setActivePetPack('missing-pack'),
    /Pet pack not found: missing-pack/
  )

  await demoControlCenterAPI.setActivePetPack('legacy-cat')
  await assert.rejects(
    demoControlCenterAPI.removePetPack('legacy-cat'),
    /Cannot remove the active pet pack/
  )
})

test('demo API action inspect import and delete flow updates actions state', async () => {
  const inspection = await demoControlCenterAPI.inspectActionFrames({ actionId: 'dance' })

  assert.equal(inspection.canceled, false)
  assert.equal(inspection.selectionId, 'demo-selection')
  assert.equal(inspection.actionId, 'dance')

  const imported = await demoControlCenterAPI.importActionFrames({
    selectionId: inspection.selectionId,
    actionId: 'dance',
    label: 'Dance'
  })
  assert.equal(imported.ok, true)
  assert.equal(imported.result.importedAction.id, 'dance')
  assert.ok(imported.animations.actions.some((action) => action.id === 'dance'))

  const deleted = await demoControlCenterAPI.deleteAction('dance')
  assert.equal(deleted.animations.actions.some((action) => action.id === 'dance'), false)
})

test('demo API active pet pack change events include pet chat state', async () => {
  let receivedEvent = null
  const unsubscribe = demoControlCenterAPI.onActivePetPackChanged?.((event) => {
    receivedEvent = event
  })

  const result = await demoControlCenterAPI.setActivePetPack('citrus-cat')

  unsubscribe?.()
  assert.equal(result.activePackId, 'citrus-cat')
  assert.equal(receivedEvent?.activePackId, 'citrus-cat')
  assert.equal(receivedEvent?.pack?.id, 'citrus-cat')
  assert.equal(receivedEvent?.petChatState?.petPack?.id, 'citrus-cat')
})

test('demo API keeps per-pack conversations and trace summaries aligned with requested conversationId', async () => {
  await demoControlCenterAPI.setActivePetPack('legacy-cat')
  await demoControlCenterAPI.sendPetChatMessage({ message: 'legacy trace check' })

  const citrusReply = await demoControlCenterAPI.sendPetChatMessage({
    message: 'citrus trace check',
    conversationId: 'control-center:citrus-cat:main'
  })

  const legacyMessages = await demoControlCenterAPI.getAiConversation('control-center:legacy-cat:main')
  assert.deepEqual(legacyMessages.slice(-2).map((message) => message.content), [
    'legacy trace check',
    'OpenPet: legacy trace check'
  ])

  const citrusMessages = await demoControlCenterAPI.getAiConversation('control-center:citrus-cat:main')
  assert.deepEqual(citrusMessages.slice(-2).map((message) => message.content), [
    'citrus trace check',
    citrusReply.reply
  ])

  const citrusSummary = await demoControlCenterAPI.getAiTalkTraceSummary({ conversationId: 'control-center:citrus-cat:main' })
  assert.equal(citrusSummary.conversation.conversationId, 'control-center:citrus-cat:main')
  assert.equal(citrusSummary.conversation.petPackId, 'citrus-cat')
  assert.equal(citrusSummary.result.status, 'completed')
  assert.equal(citrusSummary.result.providerLatencyMs, 120)
  assert.equal(citrusSummary.result.elapsedMs, 120)
  assert.equal(citrusSummary.result.replyChars, citrusReply.reply.length)

  const diagnostics = JSON.parse(await demoControlCenterAPI.exportAiTalkTraceDiagnostics({
    conversationId: 'control-center:citrus-cat:main'
  }))
  assert.deepEqual(diagnostics.conversations.map((conversation) => conversation.conversationId), ['control-center:citrus-cat:main'])

  const exportedTrace = JSON.parse(await demoControlCenterAPI.exportAiTalkTrace({
    conversationId: 'control-center:citrus-cat:main'
  }))
  assert.equal(exportedTrace.trace.conversation.petPackId, 'citrus-cat')
  assert.equal(exportedTrace.trace.result.replyChars, citrusReply.reply.length)
})

test('demo API openPetChatWindow persists visible pet chat window state', async () => {
  const openedState = await demoControlCenterAPI.openPetChatWindow()

  assert.equal(openedState.visible, true)
  assert.equal(openedState.hasWindow, true)

  const refreshedState = await demoControlCenterAPI.getPetChatState()
  assert.equal(refreshedState.visible, true)
  assert.equal(refreshedState.hasWindow, true)
})

test('demo API openPetBubbleChat persists visible bubble chat window state', async () => {
  const openedState = await demoControlCenterAPI.openPetBubbleChat()

  assert.equal(openedState.visible, true)
  assert.equal(openedState.hasWindow, true)
  assert.equal(openedState.placement, 'above')

  const refreshedState = await demoControlCenterAPI.getPetChatState()
  assert.equal(refreshedState.bubbleChat.visible, true)
  assert.equal(refreshedState.bubbleChat.hasWindow, true)
  assert.equal(refreshedState.bubbleChat.placement, 'above')
})

test('demo API service log flows persist config, token, and MCP operations', async () => {
  const initialLogs = await demoControlCenterAPI.getServiceLogs()
  assert.ok(initialLogs.entries.length >= 1)

  await demoControlCenterAPI.saveServiceConfig({ enabled: false, host: '127.0.0.1', port: 4417, token: 'demo-token' })
  let logs = await demoControlCenterAPI.getServiceLogs()
  assert.equal(logs.entries[0].path, '/service/stop')

  await demoControlCenterAPI.rotateServiceToken()
  logs = await demoControlCenterAPI.getServiceLogs()
  assert.equal(logs.entries[0].path, '/service/token/rotate')

  await demoControlCenterAPI.revokeMcpSessions()
  logs = await demoControlCenterAPI.getServiceLogs()
  assert.equal(logs.entries[0].path, '/service/mcp/revoke')

  const exported = await demoControlCenterAPI.exportServiceLogs({ format: 'json' })
  assert.ok(exported.includes('/service/mcp/revoke'))

  const cleared = await demoControlCenterAPI.clearServiceLogs()
  assert.deepEqual(cleared, [])
  assert.deepEqual((await demoControlCenterAPI.getServiceLogs()).entries, [])
})

test('demo API service config normalizes host and token like host settings adapter', async () => {
  const saved = await demoControlCenterAPI.saveServiceConfig({
    enabled: true,
    host: '192.168.1.10',
    port: '4417',
    token: ''
  })

  assert.equal(saved.config.host, '127.0.0.1')
  assert.equal(saved.runtime.host, '127.0.0.1')
  assert.equal(saved.config.port, 4417)
  assert.equal(saved.runtime.port, 4417)
  assert.equal(saved.config.enabled, true)
  assert.equal(typeof saved.config.token, 'string')
  assert.ok(saved.config.token.startsWith('demo-token-'))
})

test('demo API service config rejects invalid enabled port like host runtime', async () => {
  await assert.rejects(
    demoControlCenterAPI.saveServiceConfig({
      enabled: true,
      host: '127.0.0.1',
      port: 70000,
      token: 'demo-token'
    }),
    /Local HTTP service port must be between 0 and 65535/
  )
})

test('demo API service logs honor query and status filters', async () => {
  await demoControlCenterAPI.saveServiceConfig({ enabled: true, host: '127.0.0.1', port: 4317, token: 'demo-token' })
  await demoControlCenterAPI.rotateServiceToken()

  const statusFiltered = await demoControlCenterAPI.getServiceLogs({ status: '200' })
  assert.ok(statusFiltered.entries.length >= 1)
  assert.equal(statusFiltered.entries.every((entry) => entry.statusCode === 200), true)

  const queryFiltered = await demoControlCenterAPI.getServiceLogs({ query: 'token/rotate' })
  assert.deepEqual(queryFiltered.entries.map((entry) => entry.path), ['/service/token/rotate'])

  const exported = await demoControlCenterAPI.exportServiceLogs({ format: 'json', query: 'token/rotate' })
  const parsed = JSON.parse(exported)
  assert.deepEqual(parsed.map((entry) => entry.path), ['/service/token/rotate'])
})

test('demo API AI behavior dry-run and replay use current rules and stored replay data', async () => {
  await demoControlCenterAPI.saveAiBehavior({
    enabled: true,
    useTools: true,
    cooldownMs: 0,
    rules: [
      {
        id: 'rule-wave',
        enabled: true,
        priority: 100,
        when: { textIncludes: ['hello'] },
        then: { type: 'playAction', actionId: 'wave' }
      }
    ],
    decisions: [
      {
        id: 99,
        timestamp: '2026-07-04T00:00:00.000Z',
        matched: true,
        type: 'playAction',
        ruleId: 'rule-wave',
        reason: 'matched rule rule-wave',
        actionId: 'wave',
        replay: {
          reply: 'hello from replay',
          behaviorIntent: { actionId: 'wave', intent: 'greeting', confidence: 0.9 }
        }
      }
    ]
  })

  const dryRun = await demoControlCenterAPI.dryRunAiBehavior({
    reply: 'hello there',
    behavior: {
      enabled: true,
      useTools: true,
      cooldownMs: 0,
      rules: [
        {
          id: 'rule-wave',
          enabled: true,
          priority: 100,
          when: { textIncludes: ['hello'] },
          then: { type: 'playAction', actionId: 'wave' }
        }
      ],
      decisions: []
    }
  })
  assert.equal(dryRun.matched, true)
  assert.equal(dryRun.ruleId, 'rule-wave')
  assert.equal(dryRun.actionId, 'wave')

  const replay = await demoControlCenterAPI.replayAiBehaviorDecision(99)
  assert.equal(replay.replayOf, 99)
  assert.equal(replay.matched, true)
  assert.equal(replay.actionId, 'wave')
  assert.equal(replay.intent, 'greeting')

  await assert.rejects(
    demoControlCenterAPI.replayAiBehaviorDecision(404),
    /Behavior decision not found/
  )

  const exported = JSON.parse(await demoControlCenterAPI.exportAiBehaviorDiagnostics())
  assert.equal(exported.decisions.some((decision) => decision.replayRedacted === true), true)
})

test('demo API plugin log export honors csv format', async () => {
  const plugin = await ensureDemoFixturePluginInstalled()
  await demoControlCenterAPI.setPluginEnabled(plugin.id, true)
  await demoControlCenterAPI.setPluginNativeExecutionApproved(plugin.id, true)
  await demoControlCenterAPI.runPluginCommand(plugin.id, 'hello', { greeting: 'hi' })

  const exported = await demoControlCenterAPI.exportPluginLogs({ pluginId: plugin.id, format: 'csv' })

  assert.match(exported, /^timestamp,level,pluginId,commandId,message\n/)
  assert.ok(exported.includes(plugin.id))
})

test('demo API service log export honors csv format', async () => {
  await demoControlCenterAPI.saveServiceConfig({ enabled: true, host: '127.0.0.1', port: 4317, token: 'demo-token' })

  const exported = await demoControlCenterAPI.exportServiceLogs({ format: 'csv' })

  assert.match(exported, /^timestamp,method,path,statusCode,authorized,remoteAddress,error\n/)
  assert.ok(exported.includes('/service/start'))
})

test('demo API pet-pack export returns completed shared contract fields', async () => {
  const exported = await demoControlCenterAPI.exportPetPack('legacy-cat')

  assert.equal(exported.canceled, false)
  assert.equal(exported.packId, 'legacy-cat')
  assert.equal(exported.fileName, 'legacy-cat.openpet-pet.zip')
  assert.equal(exported.outputPath, '/demo/exports/legacy-cat.openpet-pet.zip')
  assert.equal(typeof exported.sha256, 'string')
  assert.ok(exported.byteSize > 0)
})

test('demo hatch-pet config, capability, and run status stay deterministic and renderer-safe', async () => {
  const defaults = await demoControlCenterAPI.getHatchPetAgentConfig()
  assert.equal(defaults.executionMode, 'shadow')
  assert.equal(defaults.apiKeyRef, 'ai.hatch-pet')
  const saved = await demoControlCenterAPI.saveHatchPetAgentConfig({ enabled: true, configMode: 'override', provider: 'openai-compatible', baseUrl: 'https://u:p@example.test/v1?token=x#frag', model: 'demo-model', budgets: { maxProviderCalls: 999 } })
  assert.equal(saved.baseUrl, 'https://example.test/v1')
  assert.equal(saved.budgets.maxProviderCalls, 200)
  const unsupported = await demoControlCenterAPI.checkHatchPetAgentCapability()
  assert.equal(unsupported.ok, false)
  await demoControlCenterAPI.saveHatchPetAgentApiKey('demo-host-only-key')
  const supported = await demoControlCenterAPI.checkHatchPetAgentCapability()
  assert.equal(supported.ok, true)
  assert.equal(JSON.stringify(supported).includes('demo-host-only-key'), false)
  const status = await demoControlCenterAPI.getHatchPetAgentRunStatus('demo-run')
  assert.equal(JSON.stringify(status).includes('/Users/'), false)
})
