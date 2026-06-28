const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const { IPC } = require('../../src/shared/ipc-channels')
const { createPluginInstallService } = require('../../src/main/services/plugin-install-service')
const { registerIpcHandlers } = require('../../src/main/ipc')

const createSettingsService = () => {
  let current = { plugins: { enabled: {}, config: {}, storage: {}, installed: {} } }
  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const createSignedPluginPackageZip = ({ pluginId = 'focus-timer' } = {}) => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ipc-plugin-src-'))
  const zipRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ipc-plugin-zip-'))
  fs.writeFileSync(path.join(sourceRoot, 'plugin.json'), JSON.stringify({
    id: pluginId,
    name: 'Focus Timer',
    version: '1.0.0',
    main: 'index.js',
    permissions: ['pet:say'],
    commands: [{ id: 'start', title: 'Start focus' }]
  }, null, 2))
  fs.writeFileSync(path.join(sourceRoot, 'index.js'), 'module.exports = function activate() { return {} }\n')
  fs.writeFileSync(path.join(sourceRoot, 'signature.json'), JSON.stringify({
    algorithm: 'sha256-test',
    signer: 'openpet-labs',
    value: 'local-test-signature',
    manifestSha256: sha256(path.join(sourceRoot, 'plugin.json')),
    files: {
      'plugin.json': sha256(path.join(sourceRoot, 'plugin.json')),
      'index.js': sha256(path.join(sourceRoot, 'index.js'))
    }
  }, null, 2))
  const zipPath = path.join(zipRoot, `${pluginId}.openpet-plugin.zip`)
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourceRoot })
  return { zipPath, sourceRoot, zipRoot }
}

const createIpcMainStub = () => {
  const handlers = new Map()
  const listeners = new Map()
  return {
    handlers,
    listeners,
    handle(channel, handler) {
      if (!channel) throw new Error('Attempted to register IPC handler without a channel')
      if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for ${channel}`)
      handlers.set(channel, handler)
    },
    on(channel, handler) {
      listeners.set(channel, handler)
    }
  }
}

const createRequiredServices = ({ pluginInstallService, pluginService, dialogService }) => ({
  getPetWindow: () => null,
  petService: {
    onSay: () => {},
    onAction: () => {},
    onEvent: () => {},
    getAnimations: () => ({ actions: [] }),
    getPreviewAnimations: () => ({ actions: [] }),
    reloadAnimations: () => ({ actions: [] }),
    getSettings: () => ({ localHttp: {} }),
    saveSettings: (settings) => settings,
    previewSettings: () => {},
    say: (payload) => payload,
    playAction: (payload) => payload,
    setEvent: (payload) => payload
  },
  petPackService: {
    listPacks: () => [],
    inspectPackDirectory: () => ({}),
    inspectPackSource: () => ({}),
    clearPendingSelection: () => ({ ok: true }),
    importPack: () => ({ ok: true }),
    exportPack: () => ({ ok: true }),
    setActivePack: () => ({ ok: true }),
    removePack: () => ({ ok: true })
  },
  aiService: {
    getConfig: () => ({}),
    saveConfig: (config) => config,
    saveApiKey: () => ({ ok: true }),
    testConnection: () => ({ ok: true }),
    getConversation: () => [],
    chat: () => ({ reply: 'ok' })
  },
  aiTalkService: null,
  behaviorOrchestratorService: {
    getConfig: () => ({ enabled: false }),
    saveConfig: (config) => config,
    dryRun: () => ({ matched: false })
  },
  creatorStudioDefaultFlowService: {
    runDefaultFlow: async ({ prompt }) => ({ ok: true, state: 'completed', message: prompt || '', runId: '', lastCommandResult: null })
  },
  pluginService,
  pluginInstallService,
  catalogService: {
    listCatalog: () => [],
    prepareInstall: () => ({ ok: true }),
    installSelection: () => ({ ok: true }),
    clearSelection: () => ({ ok: true }),
    addBlocklistEntry: () => [],
    removeBlocklistEntry: () => []
  },
  localHttpService: {
    getStatus: () => ({ enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }),
    getLogs: () => [],
    exportLogs: () => ({ ok: true }),
    clearLogs: () => ({ ok: true }),
    start: async (config) => ({ enabled: true, host: config.host || '127.0.0.1', port: config.port || 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }),
    stop: async () => ({ enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }),
    revokeMcpSessions: () => ({ activeSessions: 0, sessionTtlMs: 0 })
  },
  aboutService: {
    getInfo: () => ({}),
    checkForUpdates: () => ({ ok: true })
  },
  actionService: {
    acceptTriggerProposal: (proposal) => ({
      ok: true,
      applied: proposal.type === 'click',
      actionId: proposal.actionId,
      type: proposal.type,
      binding: proposal.binding || '',
      code: proposal.type === 'click' ? 'applied' : 'pending_host_rule',
      message: proposal.type === 'click' ? 'applied' : 'pending',
      acceptedAt: '2026-06-22T10:00:00.000Z',
      sourcePluginId: proposal.sourcePluginId || '',
      sourceRunId: proposal.sourceRunId || '',
      sourceCommandId: proposal.sourceCommandId || ''
    }),
    setTriggerRuleStatus: (ruleId, status) => ({
      animations: { actions: [] },
      rule: { id: ruleId, actionId: 'wave', type: 'state', status, sourceProposalId: '', sourcePluginId: '', sourceRunId: '', sourceCommandId: '', message: '', preview: '', createdAt: '', updatedAt: '' }
    }),
    deleteTriggerRule: (ruleId) => ({
      animations: { actions: [] },
      rule: { id: ruleId, actionId: 'wave', type: 'state', status: 'active', sourceProposalId: '', sourcePluginId: '', sourceRunId: '', sourceCommandId: '', message: '', preview: '', createdAt: '', updatedAt: '' }
    })
  },
  actionImportService: {
    inspectActionFrames: () => ({ inspection: { valid: true } }),
    importActionFrames: () => ({ ok: true }),
    updateActionConfig: (payload) => payload,
    deleteAction: () => ({ ok: true })
  },
  applyWindowScale: () => {},
  clampToWorkArea: (_win, x, y) => ({ x, y }),
  getMovementState: () => null,
  createSettingsWindow: () => {},
  dialogService
})

test('ai chat handler delegates to ai talk service when available', async () => {
  const ipcMain = createIpcMainStub()
  const sayCalls = []
  const talkCalls = []
  const appLogs = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    petService: {
      ...createRequiredServices({
        pluginInstallService: {},
        pluginService: { listPlugins: () => [] },
        dialogService: {}
      }).petService,
      say: (payload) => {
        sayCalls.push(payload)
        return payload
      }
    },
    aiService: {
      getConfig: () => ({}),
      saveConfig: (config) => config,
      saveApiKey: () => ({ ok: true }),
      testConnection: () => ({ ok: true }),
      getConversation: () => [],
      chat: () => {
        throw new Error('legacy ai service chat should not be called')
      }
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      getConversation: () => [{ role: 'assistant', content: 'hello' }],
      chat: async (payload) => {
        talkCalls.push(payload)
        return { conversationId: 'control-center:legacy-cat:main', reply: 'talk reply', messages: [{ role: 'assistant', content: 'talk reply' }] }
      }
    },
    appLogService: { record: (entry) => appLogs.push(entry) },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.AI_CHAT)(null, { message: 'hi', conversationId: 'ignored' })
  const history = await ipcMain.handlers.get(IPC.AI_GET_CONVERSATION)(null, 'control-center')

  assert.deepEqual(talkCalls, [{ message: 'hi', conversationId: 'ignored' }])
  assert.equal(sayCalls.length, 1)
  assert.equal(sayCalls[0].text, 'talk reply')
  assert.equal(sayCalls[0].source, 'ai')
  assert.equal(sayCalls[0].sourceSurface, 'control-center')
  assert.match(sayCalls[0].requestId, /^chat-/)
  assert.equal(result.reply, 'talk reply')
  assert.equal(result.conversationId, 'control-center:legacy-cat:main')
  assert.equal(result.bubble.text, 'talk reply')
  assert.equal(result.state.petPack.id, 'legacy-cat')
  assert.deepEqual(history, [{ role: 'assistant', content: 'hello' }])
  assert.deepEqual(appLogs.map((entry) => entry.event), [
    'ai-chat.ipc.received',
    'ai-chat.bubble.dispatching',
    'ai-chat.bubble.dispatched',
    'ai-chat.ipc.completed'
  ])
  assert.equal(appLogs.some((entry) => JSON.stringify(entry.details || {}).includes('hi')), false)
  assert.equal(appLogs.at(-1).details.messageCount, 1)
})

test('ai persona profile IPC delegates to ai talk service when available', async () => {
  const ipcMain = createIpcMainStub()
  const saveCalls = []
  const generateCalls = []
  const profile = {
    petPackId: 'legacy-cat',
    petPackDisplayName: 'Legacy Cat',
    packPersona: { name: 'OpenPet', identity: 'pet', tone: 'warm', coreTraits: ['friendly'], speakingStyle: 'Short.', relationshipToUser: 'Companion.', actionStyle: 'Use actions.', boundaries: ['No secrets.'] },
    overridePersona: { tone: 'sleepy' },
    effectivePersona: { name: 'OpenPet', identity: 'pet', tone: 'sleepy', coreTraits: ['friendly'], speakingStyle: 'Short.', relationshipToUser: 'Companion.', actionStyle: 'Use actions.', boundaries: ['No secrets.'] },
    compiledPersonaPrompt: '# Pet Persona\nTone: sleepy',
    compiledSystemPrompt: '# Global Instructions\nTest\n\n# Pet Persona\nTone: sleepy',
    rawProviderReply: 'do-not-forward',
    secretValue: 'sk-hidden'
  }

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    aiTalkService: {
      getPersonaProfile: async () => profile,
      generatePersonaDraft: async (request) => {
        generateCalls.push(request)
        return {
          petPackId: 'legacy-cat',
          petPackDisplayName: 'Legacy Cat',
          draftPersona: { tone: 'generated', hiddenPrompt: 'do-not-forward' },
          compiledPersonaPrompt: '# Pet Persona\nTone: generated',
          rawProviderReply: 'do-not-forward'
        }
      },
      savePersonaOverride: async (override) => {
        saveCalls.push(override)
        return { ...profile, overridePersona: override, effectivePersona: { ...profile.effectivePersona, ...override } }
      }
    },
    ipcMainService: ipcMain
  })

  const loaded = await ipcMain.handlers.get(IPC.AI_GET_PERSONA_PROFILE)()
  const generated = await ipcMain.handlers.get(IPC.AI_GENERATE_PERSONA_DRAFT)(null, { instruction: 'make it calmer' })
  const saved = await ipcMain.handlers.get(IPC.AI_SAVE_PERSONA_OVERRIDE)(null, { tone: 'playful' })

  assert.equal(loaded.petPackId, 'legacy-cat')
  assert.equal(loaded.petPackDisplayName, 'Legacy Cat')
  assert.equal(loaded.effectivePersona.tone, 'sleepy')
  assert.match(loaded.compiledSystemPrompt, /# Global Instructions/)
  assert.equal('rawProviderReply' in loaded, false)
  assert.equal('secretValue' in loaded, false)
  assert.deepEqual(generateCalls, [{ instruction: 'make it calmer' }])
  assert.equal(generated.draftPersona.tone, 'generated')
  assert.equal('hiddenPrompt' in generated.draftPersona, false)
  assert.equal('rawProviderReply' in generated, false)
  assert.deepEqual(saveCalls, [{ tone: 'playful' }])
  assert.equal(saved.overridePersona.tone, 'playful')
  assert.equal('rawProviderReply' in saved, false)
})

test('ai memory management IPC delegates to ai talk service when available', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []
  const profile = {
    petPackId: 'legacy-cat',
    petPackDisplayName: 'Legacy Cat',
    globalMemories: [{ id: 'memory-global', scope: 'global', petPackId: '', text: 'User likes focus.', tags: [], confidence: 0.8, importance: 0.7, sourceConversationId: '', sourceMessageIds: [], createdAt: '', updatedAt: '', lastUsedAt: '', lastEvidenceAt: '', useCount: 0, status: 'active', supersedes: '', reason: '', rawEvidence: 'do-not-forward' }],
    petPackMemories: [{ id: 'memory-pack', scope: 'petPack', petPackId: 'legacy-cat', text: 'Legacy likes greetings.', tags: [], confidence: 0.7, importance: 0.6, sourceConversationId: '', sourceMessageIds: [], createdAt: '', updatedAt: '', lastUsedAt: '', lastEvidenceAt: '', useCount: 0, status: 'active', supersedes: '', reason: '' }],
    recentJobs: [{ id: 'job-1', petPackId: 'legacy-cat', conversationId: 'main', status: 'done', createdAt: '', updatedAt: '', errorCode: '', appliedCount: 1, filteredCount: 0, raw: 'do-not-forward' }],
    secretValue: 'sk-hidden'
  }

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    aiTalkService: {
      getMemoryProfile: async () => {
        calls.push(['getMemoryProfile'])
        return profile
      },
      deleteMemory: async (memoryId) => {
        calls.push(['deleteMemory', memoryId])
        return { ...profile, globalMemories: [] }
      },
      clearPetPackMemories: async () => {
        calls.push(['clearPetPackMemories'])
        return { ...profile, petPackMemories: [] }
      }
    },
    ipcMainService: ipcMain
  })

  const loaded = await ipcMain.handlers.get(IPC.AI_GET_MEMORY_PROFILE)()
  const afterDelete = await ipcMain.handlers.get(IPC.AI_DELETE_MEMORY)(null, { memoryId: 'memory-global' })
  const afterClear = await ipcMain.handlers.get(IPC.AI_CLEAR_PET_PACK_MEMORIES)()

  assert.equal(loaded.petPackId, 'legacy-cat')
  assert.equal(loaded.globalMemories[0].text, 'User likes focus.')
  assert.equal('rawEvidence' in loaded.globalMemories[0], false)
  assert.equal('raw' in loaded.recentJobs[0], false)
  assert.equal('secretValue' in loaded, false)
  assert.deepEqual(afterDelete.globalMemories, [])
  assert.deepEqual(afterClear.petPackMemories, [])
  assert.deepEqual(calls, [
    ['getMemoryProfile'],
    ['deleteMemory', 'memory-global'],
    ['clearPetPackMemories']
  ])
})

test('ai provider settings IPC delegates config save key save and connection test', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []
  const services = createRequiredServices({})

  registerIpcHandlers({
    ...services,
    aiService: {
      ...services.aiService,
      getConfig: () => {
        calls.push(['getConfig'])
        return {
          enabled: 1,
          provider: 'openai-compatible',
          baseUrl: 'https://ai.example.test/v1',
          model: 'saved-model',
          apiKeyRef: null,
          systemPrompt: ['bad'],
          memory: { enabled: 'yes', internal: 'ignore-me' },
          behavior: {
            enabled: 1,
            useTools: '',
            cooldownMs: '2500',
            rules: [{ id: 'rule-1' }],
            decisions: ['bad']
          },
          hasApiKey: false,
          secretValue: 'sk-hidden'
        }
      },
      saveConfig: (config) => {
        calls.push(['saveConfig', config])
        return { ...config, hasApiKey: false }
      },
      saveApiKey: (apiKey) => {
        calls.push(['saveApiKey', apiKey])
        return { apiKeyRef: 'ai.default', hasApiKey: true, updatedAt: '2026-06-24T00:00:00.000Z' }
      },
      testConnection: () => {
        calls.push(['testConnection'])
        return {
          ok: true,
          provider: 'openai-compatible',
          baseUrl: 'https://ai.example.test/v1',
          model: 'saved-model',
          hasApiKey: true,
          elapsedMs: 12,
          code: 'ok',
          message: 'AI provider connection test succeeded'
        }
      }
    },
    ipcMainService: ipcMain
  })

  const config = await ipcMain.handlers.get(IPC.AI_GET_CONFIG)()
  const savedConfig = await ipcMain.handlers.get(IPC.AI_SAVE_CONFIG)(null, { model: 'next-model' })
  const savedKey = await ipcMain.handlers.get(IPC.AI_SAVE_API_KEY)(null, 'sk-demo-secret')
  const connection = await ipcMain.handlers.get(IPC.AI_TEST_CONNECTION)()

  assert.deepEqual(config, {
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: 'https://ai.example.test/v1',
    model: 'saved-model',
    apiKeyRef: '',
    systemPrompt: '',
    memory: { enabled: true },
    behavior: {
      enabled: true,
      useTools: false,
      cooldownMs: 2500,
      rules: [{ id: 'rule-1' }],
      decisions: []
    },
    hasApiKey: false
  })
  assert.deepEqual(savedConfig, {
    enabled: false,
    provider: '',
    baseUrl: '',
    model: 'next-model',
    apiKeyRef: '',
    systemPrompt: '',
    memory: { enabled: false },
    behavior: {
      enabled: false,
      useTools: false,
      cooldownMs: 0,
      rules: [],
      decisions: []
    },
    hasApiKey: false
  })
  assert.deepEqual(savedKey, { apiKeyRef: 'ai.default', hasApiKey: true, updatedAt: '2026-06-24T00:00:00.000Z' })
  assert.deepEqual(connection, {
    ok: true,
    provider: 'openai-compatible',
    baseUrl: 'https://ai.example.test/v1',
    model: 'saved-model',
    hasApiKey: true,
    elapsedMs: 12,
    code: 'ok',
    message: 'AI provider connection test succeeded'
  })
  assert.deepEqual(calls, [
    ['getConfig'],
    ['saveConfig', { model: 'next-model' }],
    ['saveApiKey', 'sk-demo-secret'],
    ['testConnection']
  ])
})

test('service:get-status returns Control Center service status shape', async () => {
  const ipcMain = createIpcMainStub()

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    petService: {
      ...createRequiredServices({
        pluginInstallService: {},
        pluginService: { listPlugins: () => [] },
        dialogService: {}
      }).petService,
      getSettings: () => ({
        localHttp: {
          enabled: true,
          port: '4317',
          token: 'demo-token'
        }
      })
    },
    localHttpService: {
      getStatus: () => ({ enabled: true, host: 'localhost', port: '4317', mcp: { activeSessions: '1', sessionTtlMs: '5000' } }),
      getLogs: () => [],
      exportLogs: () => '',
      clearLogs: () => [],
      start: async () => ({}),
      stop: async () => ({}),
      revokeMcpSessions: () => ({ activeSessions: 0, sessionTtlMs: 5000 })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.SERVICE_GET_STATUS)()

  assert.deepEqual(result, {
    config: {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      token: 'demo-token',
      logs: []
    },
    runtime: {
      enabled: true,
      host: 'localhost',
      port: 4317,
      mcp: { activeSessions: 1, sessionTtlMs: 5000 }
    }
  })
})

test('about handlers return stable info and update check view shapes', async () => {
  const ipcMain = createIpcMainStub()

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    aboutService: {
      getInfo: () => ({
        name: 'openpet',
        version: '1.0.1',
        packaged: true,
        platform: 'darwin',
        arch: 'arm64',
        update: { configured: false }
      }),
      checkForUpdates: async () => ({
        status: 'not-configured',
        currentVersion: '1.0.1',
        checkedAt: '2026-06-17T00:00:00.000Z',
        message: 'Update feed is not configured.'
      })
    },
    ipcMainService: ipcMain
  })

  const info = await ipcMain.handlers.get(IPC.ABOUT_GET_INFO)()
  const updateCheck = await ipcMain.handlers.get(IPC.ABOUT_CHECK_UPDATES)()

  assert.deepEqual(info, {
    name: 'openpet',
    productName: 'OpenPet',
    version: '1.0.1',
    packaged: true,
    platform: 'darwin',
    arch: 'arm64',
    update: {
      configured: false,
      provider: '',
      channel: '',
      url: ''
    }
  })
  assert.deepEqual(updateCheck, {
    status: 'not-configured',
    configured: false,
    currentVersion: '1.0.1',
    latestVersion: '',
    updateAvailable: false,
    prerelease: false,
    releaseUrl: '',
    assets: [],
    checkedAt: '2026-06-17T00:00:00.000Z',
    message: 'Update feed is not configured.'
  })
})

test('image generation handlers delegate to the model service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    imageGenerationModelService: {
      getConfig: () => {
        calls.push(['getConfig'])
        return {
          provider: 'openai-compatible',
          baseUrl: 42,
          model: 'gpt-image-2',
          apiKeyRef: null,
          organization: 'org-demo',
          project: 7,
          timeoutMs: '420000',
          maxConcurrentJobs: '2',
          hasApiKey: 'yes',
          apiKeyPreview: 1234,
          apiKeyLabel: '',
          defaultBackend: 'fixture',
          secretValue: 'sk-hidden'
        }
      },
      saveConfig: (config) => {
        calls.push(['saveConfig', config])
        return { ...config, model: 'gpt-image-2', hasApiKey: false, secretValue: 'sk-hidden' }
      },
      saveCloudApiKey: (apiKey) => {
        calls.push(['saveCloudApiKey', apiKey])
        return { apiKeyRef: 'secret:model.image.openai.apiKey', hasApiKey: true, apiKeyPreview: '••••1234', secretValue: 'sk-hidden' }
      },
      clearCloudApiKey: () => {
        calls.push(['clearCloudApiKey'])
        return { apiKeyRef: 'secret:model.image.openai.apiKey', hasApiKey: false, apiKeyPreview: '', secretValue: 'sk-hidden' }
      },
      checkHealth: (payload) => {
        calls.push(['checkHealth', payload])
        return {
          ok: true,
          provider: 'openai-compatible',
          backend: payload.backend || 'fixture',
          code: 'provider_healthy',
          message: 'ok',
          modelsProbe: 'ok',
          availableModels: ['gpt-image-2', 42, 'gpt-image-2'],
          currentModelDiscovered: 'yes',
          usage: { estimatedCostUsd: '0.02', internal: 'ignore-me' },
          secretValue: 'sk-hidden'
        }
      }
    },
    ipcMainService: ipcMain
  })

  const config = await ipcMain.handlers.get(IPC.IMAGE_GENERATION_GET_CONFIG)()
  const saved = await ipcMain.handlers.get(IPC.IMAGE_GENERATION_SAVE_CONFIG)(null, { defaultBackend: 'local' })
  const savedApiKey = await ipcMain.handlers.get(IPC.IMAGE_GENERATION_SAVE_API_KEY)(null, 'sk-demo-1234')
  const clearedApiKey = await ipcMain.handlers.get(IPC.IMAGE_GENERATION_CLEAR_API_KEY)()
  const health = await ipcMain.handlers.get(IPC.IMAGE_GENERATION_CHECK_HEALTH)(null, { backend: 'cloud' })

  assert.deepEqual(config, {
    provider: 'openai-compatible',
    baseUrl: '',
    model: 'gpt-image-2',
    apiKeyRef: '',
    organization: 'org-demo',
    project: '',
    timeoutMs: 420000,
    maxConcurrentJobs: 2,
    hasApiKey: true,
    apiKeyPreview: '',
    apiKeyLabel: 'Image API Key'
  })
  assert.deepEqual(saved, {
    provider: '',
    baseUrl: '',
    model: 'gpt-image-2',
    apiKeyRef: '',
    organization: '',
    project: '',
    timeoutMs: 0,
    maxConcurrentJobs: 0,
    hasApiKey: false,
    apiKeyPreview: '',
    apiKeyLabel: 'Image API Key'
  })
  assert.deepEqual(savedApiKey, {
    apiKeyRef: 'secret:model.image.openai.apiKey',
    hasApiKey: true,
    apiKeyPreview: '••••1234'
  })
  assert.deepEqual(clearedApiKey, {
    apiKeyRef: 'secret:model.image.openai.apiKey',
    hasApiKey: false,
    apiKeyPreview: ''
  })
  assert.deepEqual(health, {
    ok: true,
    provider: 'openai-compatible',
    code: 'provider_healthy',
    message: 'ok',
    modelsProbe: 'ok',
    availableModels: ['gpt-image-2'],
    currentModelDiscovered: true,
    usage: { estimatedCostUsd: 0.02 }
  })
  assert.deepEqual(calls, [
    ['getConfig'],
    ['saveConfig', { defaultBackend: 'local' }],
    ['saveCloudApiKey', 'sk-demo-1234'],
    ['clearCloudApiKey'],
    ['checkHealth', { backend: 'cloud' }]
  ])
})

test('action mutation handlers return contract-shaped results and refreshed animations', async () => {
  const ipcMain = createIpcMainStub()
  const animations = {
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [{ id: 'wave', label: 'Wave' }]
  }
  const sourceDir = path.join(os.tmpdir(), 'openpet-action-frames-wave')
  const calls = []
  const petWindowMessages = []
  const services = createRequiredServices({
    pluginInstallService: {
      inspectPluginPackage: () => ({}),
      clearPendingSelection: () => ({ ok: true }),
      installPlugin: () => ({ ok: true }),
      updatePlugin: () => ({ ok: true }),
      uninstallPlugin: () => ({ ok: true })
    },
    pluginService: { listPlugins: () => [] },
    dialogService: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [sourceDir] })
    }
  })

  registerIpcHandlers({
    ...services,
    petService: {
      ...services.petService,
      getAnimations: () => animations,
      getPreviewAnimations: () => animations,
      reloadAnimations: () => animations
    },
    getPetWindow: () => ({
      isDestroyed: () => false,
      webContents: {
        send: (...args) => petWindowMessages.push(args)
      }
    }),
    actionImportService: {
      inspectActionFrames: async ({ sourceDir: selectedSourceDir, actionId }) => {
        calls.push(['inspect', selectedSourceDir, actionId])
        return {
          actionId,
          folderName: path.basename(selectedSourceDir),
          inspection: {
            valid: actionId !== 'broken',
            frameCount: actionId === 'broken' ? '0' : 8,
            maxWidth: '32',
            maxHeight: '32',
            frames: actionId === 'broken'
              ? [
                  { fileName: '01_no_bg.png', width: '32', height: '32', hasAlpha: 1, privatePath: '/tmp/private.png' },
                  { fileName: '', width: 'bad', height: 'bad', hasAlpha: false }
                ]
              : [],
            skippedFiles: actionId === 'broken' ? ['Thumbs.db', 42] : [],
            errors: actionId === 'broken' ? ['missing frames', null] : [],
            warnings: actionId === 'broken' ? ['rename files', false] : [],
            internal: 'service-only'
          }
        }
      },
      importActionFrames: async ({ sourceDir: selectedSourceDir, actionId, label }) => {
        calls.push(['import', selectedSourceDir, actionId, label])
        return { ...animations, importedAction: { id: actionId, label }, internal: 'service-only' }
      },
      updateActionConfig: async (payload) => {
        calls.push(['save', payload])
        return { ...animations, internal: 'service-only' }
      },
      deleteAction: async (actionId) => {
        calls.push(['delete', actionId])
        return { ...animations, deletedActionId: actionId }
      }
    },
    actionService: {
      previewTriggerProposal: (proposal) => {
        calls.push(['preview-trigger', proposal])
        return {
          ok: true,
          applied: true,
          actionId: proposal.actionId,
          type: proposal.type,
          binding: proposal.binding || '',
          code: 'will_apply',
          message: 'preview',
          preview: `Click trigger will set clickAction to ${proposal.actionId}.`,
          sourcePluginId: proposal.sourcePluginId || '',
          sourceRunId: proposal.sourceRunId || '',
          sourceCommandId: proposal.sourceCommandId || '',
          internal: 'service-only'
        }
      },
      acceptTriggerProposal: (proposal) => {
        calls.push(['trigger', proposal])
        return {
          ok: true,
          applied: true,
          actionId: proposal.actionId,
          type: proposal.type,
          binding: proposal.binding || '',
          code: 'applied',
          message: 'applied',
          acceptedAt: '2026-06-22T10:00:00.000Z',
          sourcePluginId: proposal.sourcePluginId || '',
          sourceRunId: proposal.sourceRunId || '',
          sourceCommandId: proposal.sourceCommandId || ''
        }
      },
      setTriggerRuleStatus: (ruleId, status) => {
        calls.push(['set-trigger-rule-status', ruleId, status])
        return {
          animations,
          rule: {
            id: ruleId,
            actionId: 'wave',
            type: 'state',
            status,
            sourceProposalId: 'proposal:state:wave:test',
            sourcePluginId: 'openpet.creator-studio',
            sourceRunId: 'run-1',
            sourceCommandId: 'import-approved-action',
            message: 'updated',
            preview: 'State trigger rule can play wave when a host state condition matches.',
            createdAt: '2026-06-22T10:00:00.000Z',
            updatedAt: '2026-06-22T10:01:00.000Z'
          }
        }
      },
      deleteTriggerRule: (ruleId) => {
        calls.push(['delete-trigger-rule', ruleId])
        return {
          animations,
          rule: {
            id: ruleId,
            actionId: 'wave',
            type: 'state',
            status: 'disabled',
            sourceProposalId: 'proposal:state:wave:test',
            sourcePluginId: 'openpet.creator-studio',
            sourceRunId: 'run-1',
            sourceCommandId: 'import-approved-action',
            message: 'deleted',
            preview: 'State trigger rule can play wave when a host state condition matches.',
            createdAt: '2026-06-22T10:00:00.000Z',
            updatedAt: '2026-06-22T10:01:00.000Z'
          }
        }
      }
    },
    ipcMainService: ipcMain
  })

  const inspection = await ipcMain.handlers.get(IPC.ACTIONS_INSPECT_FRAMES)(null, { actionId: 'wave' })
  const importResult = await ipcMain.handlers.get(IPC.ACTIONS_IMPORT_FRAMES)(null, {
    selectionId: inspection.selectionId,
    actionId: 'wave',
    label: 'Wave hello'
  })
  const brokenInspection = await ipcMain.handlers.get(IPC.ACTIONS_INSPECT_FRAMES)(null, { actionId: 'broken' })
  const brokenImportResult = await ipcMain.handlers.get(IPC.ACTIONS_IMPORT_FRAMES)(null, {
    selectionId: brokenInspection.selectionId,
    actionId: 'broken',
    label: 'Broken'
  })
  const saveResult = await ipcMain.handlers.get(IPC.ACTIONS_SAVE_CONFIG)(null, { defaultAction: 'idle', clickAction: 'wave' })
  const triggerResult = await ipcMain.handlers.get(IPC.ACTIONS_SAVE_CONFIG)(null, {
    triggerProposal: {
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action'
    }
  })
  const triggerPreview = await ipcMain.handlers.get(IPC.ACTIONS_PREVIEW_TRIGGER_PROPOSAL)(null, {
    actionId: 'wave',
    type: 'click',
    binding: 'clickAction',
    sourcePluginId: 'openpet.creator-studio',
    sourceRunId: 'run-1',
    sourceCommandId: 'import-approved-action'
  })
  const updatedRuleResult = await ipcMain.handlers.get(IPC.ACTIONS_UPDATE_TRIGGER_RULE)(null, {
    ruleId: 'rule:state:wave:test',
    status: 'disabled'
  })
  const deletedRuleResult = await ipcMain.handlers.get(IPC.ACTIONS_DELETE_TRIGGER_RULE)(null, {
    ruleId: 'rule:state:wave:test'
  })
  const deleteResult = await ipcMain.handlers.get(IPC.ACTIONS_DELETE)(null, { actionId: 'wave' })

  assert.deepEqual(importResult, {
    ok: true,
    canceled: false,
    result: { importedAction: { id: 'wave', label: 'Wave hello' } },
    animations
  })
  assert.equal(brokenImportResult.ok, false)
  assert.equal(brokenImportResult.inspectionResult.inspection.valid, false)
  assert.deepEqual(brokenImportResult.inspectionResult, {
    canceled: false,
    selectionId: brokenImportResult.inspectionResult.selectionId,
    folderName: path.basename(sourceDir),
    actionId: 'broken',
    inspection: {
      valid: false,
      frameCount: 0,
      maxWidth: 32,
      maxHeight: 32,
      frames: [
        { fileName: '01_no_bg.png', width: 32, height: 32, hasAlpha: true }
      ],
      skippedFiles: ['Thumbs.db'],
      errors: ['missing frames'],
      warnings: ['rename files']
    }
  })
  assert.deepEqual(saveResult, { animations })
  assert.deepEqual(triggerResult, {
    animations,
    triggerProposal: {
      ok: true,
      applied: true,
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      code: 'applied',
      message: 'applied',
      acceptedAt: '2026-06-22T10:00:00.000Z',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action'
    }
  })
  assert.deepEqual(triggerPreview, {
    ok: true,
    applied: true,
    actionId: 'wave',
    type: 'click',
    binding: 'clickAction',
    code: 'will_apply',
    message: 'preview',
    preview: 'Click trigger will set clickAction to wave.',
    sourcePluginId: 'openpet.creator-studio',
    sourceRunId: 'run-1',
    sourceCommandId: 'import-approved-action'
  })
  assert.deepEqual(updatedRuleResult, {
    animations,
    rule: {
      id: 'rule:state:wave:test',
      actionId: 'wave',
      type: 'state',
      status: 'disabled',
      sourceProposalId: 'proposal:state:wave:test',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action',
      message: 'updated',
      preview: 'State trigger rule can play wave when a host state condition matches.',
      createdAt: '2026-06-22T10:00:00.000Z',
      updatedAt: '2026-06-22T10:01:00.000Z'
    }
  })
  assert.deepEqual(deletedRuleResult, {
    animations,
    rule: {
      id: 'rule:state:wave:test',
      actionId: 'wave',
      type: 'state',
      status: 'disabled',
      sourceProposalId: 'proposal:state:wave:test',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action',
      message: 'deleted',
      preview: 'State trigger rule can play wave when a host state condition matches.',
      createdAt: '2026-06-22T10:00:00.000Z',
      updatedAt: '2026-06-22T10:01:00.000Z'
    }
  })
  assert.deepEqual(deleteResult, { animations })
  assert.deepEqual(petWindowMessages.map((message) => message[0]), [
    IPC.PET_ANIMATIONS_CHANGED,
    IPC.PET_ANIMATIONS_CHANGED,
    IPC.PET_ANIMATIONS_CHANGED,
    IPC.PET_ANIMATIONS_CHANGED
  ])
  assert.deepEqual(calls, [
    ['inspect', sourceDir, 'wave'],
    ['inspect', sourceDir, 'wave'],
    ['import', sourceDir, 'wave', 'Wave hello'],
    ['inspect', sourceDir, 'broken'],
    ['inspect', sourceDir, 'broken'],
    ['save', { defaultAction: 'idle', clickAction: 'wave' }],
    ['trigger', {
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action'
    }],
    ['preview-trigger', {
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action'
    }],
    ['set-trigger-rule-status', 'rule:state:wave:test', 'disabled'],
    ['delete-trigger-rule', 'rule:state:wave:test'],
    ['delete', 'wave']
  ])
})

test('actions save config IPC surfaces trigger rule validation failures', async () => {
  const ipcMain = createIpcMainStub()
  const services = createRequiredServices({
    pluginInstallService: {
      inspectPluginPackage: () => ({}),
      clearPendingSelection: () => ({ ok: true }),
      installPlugin: () => ({ ok: true }),
      updatePlugin: () => ({ ok: true }),
      uninstallPlugin: () => ({ ok: true })
    },
    pluginService: { listPlugins: () => [] },
    dialogService: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    }
  })

  registerIpcHandlers({
    ...services,
    actionImportService: {
      inspectActionFrames: () => ({ inspection: { valid: true } }),
      importActionFrames: () => ({ ok: true }),
      updateActionConfig: async () => {
        throw new Error('Trigger rule action does not exist: missing')
      },
      deleteAction: () => ({ ok: true })
    },
    ipcMainService: ipcMain
  })

  await assert.rejects(
    () => ipcMain.handlers.get(IPC.ACTIONS_SAVE_CONFIG)(null, {
      defaultAction: 'idle',
      clickAction: 'wave',
      triggerRules: [{
        id: 'rule:event:missing:1',
        type: 'event',
        actionId: 'missing',
        enabled: true,
        binding: 'plugin:event',
        intervalMs: 0,
        notes: '',
        sourcePluginId: '',
        sourceRunId: '',
        sourceCommandId: '',
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z'
      }]
    }),
    /does not exist/
  )
})

test('actions save config IPC refreshes trigger rule runtime after saving edited host rules', async () => {
  const ipcMain = createIpcMainStub()
  let refreshCalls = 0

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    actionImportService: {
      inspectActionFrames: () => ({ inspection: { valid: true } }),
      importActionFrames: () => ({ ok: true }),
      updateActionConfig: async () => ({ ok: true }),
      deleteAction: () => ({ ok: true })
    },
    triggerRuleRuntimeService: {
      refresh: () => { refreshCalls += 1 }
    },
    ipcMainService: ipcMain
  })

  await ipcMain.handlers.get(IPC.ACTIONS_SAVE_CONFIG)(null, {
    defaultAction: 'idle',
    clickAction: 'wave',
    triggerRules: [{
      id: 'rule:event:wave:1',
      type: 'event',
      actionId: 'wave',
      enabled: true,
      binding: 'plugin:event',
      intervalMs: 0,
      notes: '',
      sourcePluginId: '',
      sourceRunId: '',
      sourceCommandId: '',
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z'
    }]
  })

  assert.equal(refreshCalls, 1)
})
test('catalog blocklist handlers return catalog plus updated blocklist view result', async () => {
  const ipcMain = createIpcMainStub()
  const catalog = {
    schemaVersion: '1',
    updatedAt: '2026-06-17T00:00:00.000Z',
    feedbackUrl: 42,
    localBlocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: [] },
    catalogBlocklist: { pluginIds: [], packIds: ['blocked-pack', 7], sha256: [] },
    blocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: ['hash-b'] },
    plugins: [{
      id: 'openpet.demo.weather',
      name: 'Demo Weather',
      version: '1.0.0',
      permissions: ['pet:say', 42],
      downloadable: 1,
      updateAvailable: 'yes',
      blockStatus: { blocked: 0, reasons: ['ok', 7] }
    }],
    petPacks: [{
      id: 'openpet.demo.pixel-cat',
      displayName: 'Pixel Cat',
      version: '1.0.0',
      actionCount: '3',
      downloadable: 1,
      updateAvailable: 'yes',
      blockStatus: { blocked: 1, reasons: ['blocked', 9] }
    }]
  }
  const normalizedCatalog = {
    schemaVersion: 1,
    updatedAt: '2026-06-17T00:00:00.000Z',
    feedbackUrl: '',
    localBlocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: [] },
    catalogBlocklist: { pluginIds: [], packIds: ['blocked-pack'], sha256: [] },
    blocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: ['hash-b'] },
    plugins: [{
      id: 'openpet.demo.weather',
      name: 'Demo Weather',
      version: '1.0.0',
      permissions: ['pet:say'],
      downloadable: true,
      updateAvailable: true,
      blockStatus: { blocked: false, reasons: ['ok'] }
    }],
    petPacks: [{
      id: 'openpet.demo.pixel-cat',
      displayName: 'Pixel Cat',
      version: '1.0.0',
      actionCount: 3,
      downloadable: true,
      updateAvailable: true,
      blockStatus: { blocked: true, reasons: ['blocked'] }
    }]
  }
  const blocklist = { pluginIds: ['blocked-plugin', 1], packIds: [], sha256: ['hash-b', false] }
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    catalogService: {
      listCatalog: () => catalog,
      prepareInstall: () => ({ ok: true }),
      installSelection: () => ({ ok: true }),
      clearSelection: () => ({ ok: true }),
      addBlocklistEntry: (payload) => {
        calls.push(['add', payload])
        return blocklist
      },
      removeBlocklistEntry: (payload) => {
        calls.push(['remove', payload])
        return blocklist
      }
    },
    ipcMainService: ipcMain
  })

  const payload = { type: 'pluginId', value: 'blocked-plugin' }
  const getResult = await ipcMain.handlers.get(IPC.CATALOG_GET)()
  const addResult = await ipcMain.handlers.get(IPC.CATALOG_ADD_BLOCKLIST)(null, payload)
  const removeResult = await ipcMain.handlers.get(IPC.CATALOG_REMOVE_BLOCKLIST)(null, payload)

  assert.deepEqual(getResult, normalizedCatalog)
  assert.deepEqual(addResult, {
    catalog: normalizedCatalog,
    blocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: ['hash-b'] }
  })
  assert.deepEqual(removeResult, {
    catalog: normalizedCatalog,
    blocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: ['hash-b'] }
  })
  assert.deepEqual(calls, [['add', payload], ['remove', payload]])
})

test('catalog install selection handlers return normalized catalog payloads', async () => {
  const ipcMain = createIpcMainStub()
  const catalog = {
    schemaVersion: '1',
    updatedAt: '2026-06-20T00:00:00.000Z',
    feedbackUrl: 7,
    localBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    catalogBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    blocklist: { pluginIds: [], packIds: [], sha256: [] },
    plugins: [{
      id: 'openpet.demo.weather',
      name: 'Demo Weather',
      version: '1.0.0',
      permissions: ['pet:say', 42],
      downloadable: 1,
      updateAvailable: '',
      blockStatus: { blocked: 0, reasons: ['ok', 7] }
    }],
    petPacks: []
  }
  const normalizedCatalog = {
    schemaVersion: 1,
    updatedAt: '2026-06-20T00:00:00.000Z',
    feedbackUrl: '',
    localBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    catalogBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    blocklist: { pluginIds: [], packIds: [], sha256: [] },
    plugins: [{
      id: 'openpet.demo.weather',
      name: 'Demo Weather',
      version: '1.0.0',
      permissions: ['pet:say'],
      downloadable: true,
      updateAvailable: false,
      blockStatus: { blocked: false, reasons: ['ok'] }
    }],
    petPacks: []
  }

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    catalogService: {
      listCatalog: () => catalog,
      prepareInstall: () => ({ ok: true }),
      installSelection: () => ({ ok: true, kind: 'plugin', itemId: 'openpet.demo.weather' }),
      clearSelection: () => ({ ok: true }),
      addBlocklistEntry: () => ({ pluginIds: [], packIds: [], sha256: [] }),
      removeBlocklistEntry: () => ({ pluginIds: [], packIds: [], sha256: [] })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.CATALOG_INSTALL_SELECTION)(null, { selectionId: 'sel-1' })

  assert.deepEqual(result, {
    ok: true,
    kind: 'plugin',
    itemId: 'openpet.demo.weather',
    catalog: normalizedCatalog
  })
})

test('plugins:list returns normalized plugin view payloads', async () => {
  const ipcMain = createIpcMainStub()
  const plugins = [{
    id: 'openpet.demo',
    name: 'Demo',
    version: '1.0.0',
    profile: 'creator-tools',
    source: 'local',
    enabled: 1,
    runnable: '',
    permissions: ['pet:say', 42],
    commands: [{ id: 'run', title: 'Run' }],
    entries: {
      setup: [],
      commands: [],
      services: [],
      dashboards: []
    },
    configSchema: {
      title: 'Demo Config',
      description: 'Safe renderer fields only.',
      properties: [{
        key: 'tone',
        title: 'Tone',
        type: 'string',
        enum: ['soft', 'direct'],
        required: 1,
        secretPath: '/Users/mango/private/key'
      }]
    },
    config: { tone: 'soft' },
    storage: {
      keyCount: '2',
      byteSize: '4096',
      valid: 1,
      rawPath: '/Users/mango/private/storage.json'
    },
    signatureStatus: {
      status: 'hash-verified',
      label: 'Verified package hash',
      signer: 'OpenPet Maintainer',
      algorithm: 'sha256',
      verified: 1,
      errors: [''],
      certificatePath: '/Users/mango/private/cert.pem'
    },
    blockStatus: { blocked: false, reasons: [], internal: 'ignore-me' },
    privateRuntime: { pid: 1234 }
  }]

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => plugins },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_LIST)()

  assert.deepEqual(result, [{
    id: 'openpet.demo',
    name: 'Demo',
    version: '1.0.0',
    profile: 'creator-tools',
    source: 'local',
    enabled: true,
    runnable: false,
    permissions: ['pet:say'],
    commands: [{ id: 'run', title: 'Run' }],
    entries: {
      setup: [],
      commands: [],
      services: [],
      dashboards: []
    },
    configSchema: {
      title: 'Demo Config',
      description: 'Safe renderer fields only.',
      properties: [{
        key: 'tone',
        title: 'Tone',
        type: 'string',
        enum: ['soft', 'direct'],
        required: true
      }]
    },
    config: { tone: 'soft' },
    storage: {
      keyCount: 2,
      byteSize: 4096,
      valid: true
    },
    signatureStatus: {
      status: 'hash-verified',
      label: 'Verified package hash',
      signer: 'OpenPet Maintainer',
      algorithm: 'sha256',
      verified: true,
      errors: []
    },
    blockStatus: { blocked: false, reasons: [] }
  }])
})

test('plugin mutation handlers return plugin mutation result with refreshed plugin list', async () => {
  const ipcMain = createIpcMainStub()
  const plugins = [{ id: 'focus-timer', enabled: false }]
  const normalizedPlugins = [{
    id: 'focus-timer',
    name: '',
    version: '',
    source: '',
    enabled: false,
    runnable: false,
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
    storage: { keyCount: 0, byteSize: 0 },
    signatureStatus: {
      status: '',
      label: 'Signature unknown',
      signer: '',
      algorithm: '',
      verified: false,
      errors: []
    }
  }]
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: (selectionId) => {
          calls.push(['install', selectionId])
          return { ok: true, pluginId: 'focus-timer', installMode: 'install', disabled: true }
        },
        updatePlugin: (selectionId) => {
          calls.push(['update', selectionId])
          return { ok: true, pluginId: 'focus-timer', installMode: 'update', disabled: true }
        },
        uninstallPlugin: (pluginId, options) => {
          calls.push(['uninstall', pluginId, options])
          return { ok: true, pluginId, storageRemoved: Boolean(options.removeStorage) }
        }
      },
      pluginService: { listPlugins: () => plugins },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const installResult = await ipcMain.handlers.get(IPC.PLUGINS_INSTALL)(null, { selectionId: 'selection-install' })
  const updateResult = await ipcMain.handlers.get(IPC.PLUGINS_UPDATE)(null, { selectionId: 'selection-update' })
  const uninstallResult = await ipcMain.handlers.get(IPC.PLUGINS_UNINSTALL)(null, { pluginId: 'focus-timer', removeStorage: true })

  assert.deepEqual(installResult, {
    ok: true,
    pluginId: 'focus-timer',
    installMode: 'install',
    disabled: true,
    plugins: normalizedPlugins
  })
  assert.deepEqual(updateResult, {
    ok: true,
    pluginId: 'focus-timer',
    installMode: 'update',
    disabled: true,
    plugins: normalizedPlugins
  })
  assert.deepEqual(uninstallResult, {
    ok: true,
    pluginId: 'focus-timer',
    storageRemoved: true,
    plugins: normalizedPlugins
  })
  assert.deepEqual(calls, [
    ['install', 'selection-install'],
    ['update', 'selection-update'],
    ['uninstall', 'focus-timer', { removeStorage: true }]
  ])
})

test('plugin github inspection handler delegates to github import service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    pluginGithubImportService: {
      inspectRepositoryUrl: async (repositoryUrl) => {
        calls.push(repositoryUrl)
        return {
          selectionId: 'selection-github',
          installMode: 'install',
          existingVersion: '',
          riskLevel: 'review',
          plugin: {
            id: 'demo-plugin',
            name: 'Demo Plugin',
            version: '1.0.0',
            permissions: [],
            commands: [],
            entries: { commands: [], services: [], dashboards: [] }
          },
          permissionDiff: {
            permissions: { added: [], removed: [], unchanged: [] },
            networkAllowlist: { added: [], removed: [], unchanged: [] }
          },
          signature: { label: 'Unsigned plugin', errors: [] },
          blockStatus: { blocked: false, reasons: [] },
          packageHash: 'abc',
          fileCount: 2,
          byteSize: 20
        }
      }
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_INSPECT_GITHUB_REPOSITORY)(null, {
    repositoryUrl: 'https://github.com/openpet/demo-plugin'
  })

  assert.equal(result.canceled, false)
  assert.equal(result.plugin.id, 'demo-plugin')
  assert.deepEqual(calls, ['https://github.com/openpet/demo-plugin'])
})

test('plugin dashboard open handler delegates to plugin service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: {
        listPlugins: () => [],
        openDashboard: async (pluginId, dashboardId) => {
          calls.push([pluginId, dashboardId])
          return { ok: true, pluginId, dashboardId, url: 'http://127.0.0.1:8787/' }
        }
      },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_OPEN_DASHBOARD)(null, {
    pluginId: 'weather-declaration',
    dashboardId: 'main'
  })

  assert.deepEqual(result, {
    ok: true,
    pluginId: 'weather-declaration',
    dashboardId: 'main',
    url: 'http://127.0.0.1:8787/'
  })
  assert.deepEqual(calls, [['weather-declaration', 'main']])
})

test('creator studio default flow handler delegates to the host runtime service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    creatorStudioDefaultFlowService: {
      runDefaultFlow: async (payload) => {
        calls.push(payload)
        return { ok: true, state: 'completed', message: 'done', runId: 'run-123', lastCommandResult: null }
      }
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_RUN_CREATOR_STUDIO_DEFAULT_FLOW)(null, {
    prompt: '新增一个害羞转圈动作'
  })

  assert.deepEqual(calls, [{ prompt: '新增一个害羞转圈动作' }])
  assert.deepEqual(result, {
    ok: true,
    state: 'completed',
    message: 'done',
    runId: 'run-123',
    lastCommandResult: null
  })
})

test('plugin service lifecycle handlers delegate to plugin service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: {
        listPlugins: () => [],
        startService: (pluginId, serviceId) => {
          calls.push(['start', pluginId, serviceId])
          return { ok: true, pluginId, serviceId, runtime: { status: 'running', pid: 4321 } }
        },
        stopService: (pluginId, serviceId) => {
          calls.push(['stop', pluginId, serviceId])
          return { ok: true, pluginId, serviceId, runtime: { status: 'stopped' } }
        }
      },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const startResult = await ipcMain.handlers.get(IPC.PLUGINS_START_SERVICE)(null, {
    pluginId: 'weather-declaration',
    serviceId: 'companion'
  })
  const stopResult = await ipcMain.handlers.get(IPC.PLUGINS_STOP_SERVICE)(null, {
    pluginId: 'weather-declaration',
    serviceId: 'companion'
  })

  assert.deepEqual(startResult, {
    ok: true,
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    runtime: { status: 'running', pid: 4321 }
  })
  assert.deepEqual(stopResult, {
    ok: true,
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    runtime: { status: 'stopped' }
  })
  assert.deepEqual(calls, [
    ['start', 'weather-declaration', 'companion'],
    ['stop', 'weather-declaration', 'companion']
  ])
})

test('plugin setup handler delegates to plugin service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: {
        listPlugins: () => [],
        runSetup: (pluginId, setupId) => {
          calls.push({ pluginId, setupId })
          return { ok: true, pluginId, setupId, runtime: { status: 'succeeded' } }
        }
      },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_RUN_SETUP)(null, {
    pluginId: 'weather-declaration',
    setupId: 'install-deps'
  })

  assert.deepEqual(calls, [{ pluginId: 'weather-declaration', setupId: 'install-deps' }])
  assert.deepEqual(result, {
    ok: true,
    pluginId: 'weather-declaration',
    setupId: 'install-deps',
    runtime: { status: 'succeeded' }
  })
})

test('plugin service health handler delegates to plugin service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: {
        listPlugins: () => [],
        checkServiceHealth: (pluginId, serviceId) => {
          calls.push([pluginId, serviceId])
          return {
            ok: true,
            pluginId,
            serviceId,
            health: { status: 'healthy', url: 'http://127.0.0.1:8787/health', statusCode: 200 },
            runtime: { status: 'running', health: { status: 'healthy' } }
          }
        }
      },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_CHECK_SERVICE_HEALTH)(null, {
    pluginId: 'weather-declaration',
    serviceId: 'companion'
  })

  assert.deepEqual(result, {
    ok: true,
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    health: { status: 'healthy', url: 'http://127.0.0.1:8787/health', statusCode: 200 },
    runtime: { status: 'running', health: { status: 'healthy' } }
  })
  assert.deepEqual(calls, [['weather-declaration', 'companion']])
})

test('plugin service health policy handler delegates to plugin service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: {
        listPlugins: () => [],
        saveServiceHealthPolicy: (pluginId, serviceId, policy) => {
          calls.push({ pluginId, serviceId, policy })
          return {
            id: pluginId,
            entries: {
              services: [{ id: serviceId, healthPolicy: policy }]
            }
          }
        }
      },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_SAVE_SERVICE_HEALTH_POLICY)(null, {
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    policy: { enabled: true, intervalMs: 30000 }
  })

  assert.deepEqual(calls, [{
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    policy: { enabled: true, intervalMs: 30000 }
  }])
  assert.deepEqual(result, {
    id: 'weather-declaration',
    entries: {
      services: [{ id: 'companion', healthPolicy: { enabled: true, intervalMs: 30000 } }]
    }
  })
})

test('pet-packs:inspect-directory opens native folder or zip picker and delegates selected source', async () => {
  const ipcMain = createIpcMainStub()
  const dialogCalls = []
  const inspectedPaths = []
  const selectedPath = path.join(os.tmpdir(), 'clawd.codex-pet.zip')

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async (options) => {
          dialogCalls.push(options)
          return { canceled: false, filePaths: [selectedPath] }
        }
      }
    }),
    petPackService: {
      listPacks: () => [],
      inspectPackDirectory: () => {
        throw new Error('directory-only inspect should not be called')
      },
      inspectPackSource: (sourcePath) => {
        inspectedPaths.push(sourcePath)
        return { selectionId: 'sel-1', valid: true, pack: { id: 'clawd' } }
      },
      clearPendingSelection: () => ({ ok: true }),
      importPack: () => ({ ok: true }),
      setActivePack: () => ({ ok: true }),
      removePack: () => ({ ok: true })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PET_PACKS_INSPECT_DIRECTORY)()

  assert.equal(result.canceled, false)
  assert.equal(result.selectionId, 'sel-1')
  assert.deepEqual(inspectedPaths, [selectedPath])
  assert.equal(dialogCalls.length, 1)
  assert.equal(dialogCalls[0].title, '选择 Pet Pack 文件夹或 Codex Pet 包')
  assert.deepEqual(dialogCalls[0].properties, ['openFile', 'openDirectory'])
  assert.deepEqual(dialogCalls[0].filters[0], { name: 'Pet Pack Package', extensions: ['zip'] })
})

test('pet pack mutation handlers return refreshed pet pack views and active animations', async () => {
  const ipcMain = createIpcMainStub()
  const pack = {
    id: 'doro',
    displayName: 'Doro',
    version: '1.0.0',
    source: 'bundled',
    rootPath: '/packs/doro',
    actionCount: '4',
    previewAction: {
      id: 'idle',
      frameCount: '4',
      frameWidth: '64',
      frameHeight: '64',
      frameMs: '120',
      frameDurations: ['120', 'bad']
    },
    blockStatus: { blocked: 0, reasons: ['ok', 42] }
  }
  const activePack = {
    ...pack,
    active: 1,
    provenance: { sourceUrl: 'https://example.com/doro', originalFormat: 'directory', rawPath: '/Users/mango/private' },
    conflict: { installed: 1, decision: 'upgrade', requiresReview: '', installedVersion: '0.9.0', incomingVersion: '1.0.0' }
  }
  const petPacks = { activePackId: 'doro', packs: [activePack] }
  const animations = { defaultAction: 'idle', clickAction: 'happy', actions: [{ id: 'idle', label: 'Idle' }] }
  const normalizedActivePack = {
    id: 'doro',
    displayName: 'Doro',
    version: '1.0.0',
    source: 'bundled',
    rootPath: '/packs/doro',
    active: true,
    provenance: { sourceUrl: 'https://example.com/doro', originalFormat: 'directory' },
    actionCount: 4,
    previewAction: {
      id: 'idle',
      frameCount: 4,
      frameWidth: 64,
      frameHeight: 64,
      frameMs: 120,
      frameDurations: [120, 0]
    },
    blockStatus: { blocked: false, reasons: ['ok'] },
    conflict: {
      installed: true,
      decision: 'upgrade',
      requiresReview: false,
      installedVersion: '0.9.0',
      incomingVersion: '1.0.0'
    }
  }
  const calls = []
  const petWindowMessages = []
  const chatStateChanges = []
  const bubbleRefreshCalls = []
  const controlCenterMessages = []
  const services = createRequiredServices({
    pluginInstallService: {
      inspectPluginPackage: () => ({}),
      clearPendingSelection: () => ({ ok: true }),
      installPlugin: () => ({ ok: true }),
      updatePlugin: () => ({ ok: true }),
      uninstallPlugin: () => ({ ok: true })
    },
    pluginService: { listPlugins: () => [] },
    dialogService: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    }
  })

  registerIpcHandlers({
    ...services,
    petService: {
      ...services.petService,
      getAnimations: () => animations,
      getPreviewAnimations: () => animations,
      reloadAnimations: () => animations
    },
    getPetWindow: () => ({
      isDestroyed: () => false,
      webContents: {
        send: (...args) => petWindowMessages.push(args)
      }
    }),
    browserWindowService: {
      fromWebContents: () => null,
      getAllWindows: () => [{
        isDestroyed: () => false,
        webContents: {
          getURL: () => 'app://-/control-center/index.html',
          send: (...args) => controlCenterMessages.push(args)
        }
      }]
    },
    petPackService: {
      listPacks: () => petPacks,
      inspectPackDirectory: () => ({}),
      inspectPackSource: () => ({}),
      clearPendingSelection: () => ({ ok: true }),
      importPack: (selectionId) => {
        calls.push(['import', selectionId])
        return { pack }
      },
      exportPack: () => ({}),
      setActivePack: (packId) => {
        calls.push(['set-active', packId])
        return { activePackId: packId, pack: activePack }
      },
      removePack: (packId) => {
        calls.push(['remove', packId])
        return {}
      }
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'doro', petPackDisplayName: 'Doro' }),
      getConversation: () => [{ id: 'a1', role: 'assistant', content: 'hi from doro', createdAt: '2026-06-27T00:00:00.000Z' }]
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true }),
      sendStateChanged: (state) => chatStateChanges.push(state)
    },
    petBubbleChatWindowService: {
      getState: () => ({ visible: true, hasWindow: true }),
      refreshItems: (payload) => {
        bubbleRefreshCalls.push(payload)
        return { visible: true, items: payload.conversationMessages }
      }
    },
    ipcMainService: ipcMain
  })

  const importResult = await ipcMain.handlers.get(IPC.PET_PACKS_IMPORT)(null, { selectionId: 'selection-doro' })
  const activeResult = await ipcMain.handlers.get(IPC.PET_PACKS_SET_ACTIVE)({
    sender: {
      send: (...args) => controlCenterMessages.push(args)
    }
  }, { packId: 'doro' })
  const removeResult = await ipcMain.handlers.get(IPC.PET_PACKS_REMOVE)(null, { packId: 'doro' })

  assert.deepEqual(importResult, {
    pack: {
      id: 'doro',
      displayName: 'Doro',
      version: '1.0.0',
      source: 'bundled',
      rootPath: '/packs/doro',
      actionCount: 4,
      previewAction: {
        id: 'idle',
        frameCount: 4,
        frameWidth: 64,
        frameHeight: 64,
        frameMs: 120,
        frameDurations: [120, 0]
      },
      blockStatus: { blocked: false, reasons: ['ok'] }
    },
    petPacks: { activePackId: 'doro', packs: [normalizedActivePack] },
    animations
  })
  assert.deepEqual(activeResult, {
    activePackId: 'doro',
    pack: normalizedActivePack,
    petPacks: { activePackId: 'doro', packs: [normalizedActivePack] },
    animations
  })
  assert.deepEqual(removeResult, { petPacks: { activePackId: 'doro', packs: [normalizedActivePack] } })
  assert.deepEqual(calls, [
    ['import', 'selection-doro'],
    ['set-active', 'doro'],
    ['remove', 'doro']
  ])
  assert.deepEqual(bubbleRefreshCalls, [{
    conversationMessages: [{ id: 'a1', role: 'assistant', content: 'hi from doro', createdAt: '2026-06-27T00:00:00.000Z' }],
    reason: 'pet-pack-set-active'
  }])
  assert.equal(chatStateChanges.length, 1)
  assert.deepEqual(chatStateChanges[0].petPack, { id: 'doro', displayName: 'Doro' })
  assert.equal(controlCenterMessages.length, 1)
  assert.equal(controlCenterMessages[0][0], IPC.PET_PACKS_ACTIVE_CHANGED)
  assert.equal(controlCenterMessages[0][1].activePackId, 'doro')
  assert.deepEqual(controlCenterMessages[0][1].pack, activePack)
  assert.deepEqual(controlCenterMessages[0][1].petChatState.petPack, { id: 'doro', displayName: 'Doro' })
  assert.equal(petWindowMessages.length, 2)
  assert.equal(petWindowMessages[0][0], IPC.PET_ANIMATIONS_CHANGED)
  assert.equal(petWindowMessages[1][0], IPC.PET_ANIMATIONS_CHANGED)
})

test('pet-packs:export opens native output folder picker and delegates selected pack id', async () => {
  const ipcMain = createIpcMainStub()
  const dialogCalls = []
  const exportCalls = []
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ipc-pet-pack-export-'))

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async (options) => {
          dialogCalls.push(options)
          return { canceled: false, filePaths: [outputDir] }
        }
      }
    }),
    petPackService: {
      listPacks: () => [],
      inspectPackDirectory: () => ({}),
      inspectPackSource: () => ({}),
      clearPendingSelection: () => ({ ok: true }),
      importPack: () => ({ ok: true }),
      exportPack: (packId, selectedOutputDir) => {
        exportCalls.push({ packId, selectedOutputDir })
        return {
          packId,
          fileName: `${packId}-1.0.0.openpet-pet.zip`,
          outputPath: path.join(selectedOutputDir, `${packId}-1.0.0.openpet-pet.zip`),
          sha256: 'abc123',
          byteSize: 42
        }
      },
      setActivePack: () => ({ ok: true }),
      removePack: () => ({ ok: true })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PET_PACKS_EXPORT)(null, { packId: 'exportable-cat' })

  assert.equal(result.canceled, false)
  assert.equal(result.packId, 'exportable-cat')
  assert.equal(result.fileName, 'exportable-cat-1.0.0.openpet-pet.zip')
  assert.deepEqual(exportCalls, [{ packId: 'exportable-cat', selectedOutputDir: outputDir }])
  assert.equal(dialogCalls.length, 1)
  assert.equal(dialogCalls[0].title, '选择 Pet Pack 导出目录')
  assert.deepEqual(dialogCalls[0].properties, ['openDirectory', 'createDirectory'])
})

test('pet-packs:export returns canceled without exporting when output picker is canceled', async () => {
  const ipcMain = createIpcMainStub()

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    petPackService: {
      listPacks: () => [],
      inspectPackDirectory: () => ({}),
      inspectPackSource: () => ({}),
      clearPendingSelection: () => ({ ok: true }),
      importPack: () => ({ ok: true }),
      exportPack: () => {
        throw new Error('export should not run after cancel')
      },
      setActivePack: () => ({ ok: true }),
      removePack: () => ({ ok: true })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PET_PACKS_EXPORT)(null, { packId: 'exportable-cat' })

  assert.deepEqual(result, { canceled: true })
})

test('plugins:inspect-package opens native package picker options and returns canceled without inspecting', async () => {
  const ipcMain = createIpcMainStub()
  const dialogCalls = []
  const pluginInstallService = {
    inspectPluginPackage: () => {
      throw new Error('inspect should not be called after cancel')
    },
    clearPendingSelection: () => ({ ok: true }),
    installPlugin: () => ({ ok: true }),
    updatePlugin: () => ({ ok: true }),
    uninstallPlugin: () => ({ ok: true })
  }

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService,
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async (options) => {
          dialogCalls.push(options)
          return { canceled: true, filePaths: [] }
        }
      }
    }),
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_INSPECT_PACKAGE)()

  assert.deepEqual(result, { canceled: true })
  assert.equal(dialogCalls.length, 1)
  assert.equal(dialogCalls[0].title, '选择插件目录或 OpenPet 插件包')
  assert.deepEqual(dialogCalls[0].properties, ['openFile', 'openDirectory'])
  assert.deepEqual(dialogCalls[0].filters[0], { name: 'OpenPet Plugin Package', extensions: ['zip'] })
})

test('plugins:run-command delegates payloads to plugin service', async () => {
  const ipcMain = createIpcMainStub()
  const calls = []
  const commandResult = {
    ok: true,
    pluginId: 'weather-declaration',
    commandId: 'announce',
    exitCode: 0,
    result: { ok: true }
  }

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: {
        listPlugins: () => [],
        runCommand: (pluginId, commandId, payload) => {
          calls.push({ pluginId, commandId, payload })
          return commandResult
        }
      },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_RUN_COMMAND)(null, {
    pluginId: 'weather-declaration',
    commandId: 'announce',
    payload: { city: 'Shanghai' }
  })

  assert.deepEqual(result, commandResult)
  assert.deepEqual(calls, [{
    pluginId: 'weather-declaration',
    commandId: 'announce',
    payload: { city: 'Shanghai' }
  }])
})

test('plugins:inspect-package and plugins:install handle a selected .openpet-plugin.zip through main-process IPC', async () => {
  const ipcMain = createIpcMainStub()
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ipc-installed-plugins-'))
  const settingsService = createSettingsService()
  const pluginInstallService = createPluginInstallService({ settingsService, pluginDir })
  const { zipPath } = createSignedPluginPackageZip()
  const pluginService = {
    listPlugins: () => [{ id: 'focus-timer', enabled: settingsService.get().plugins.enabled['focus-timer'] }]
  }

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService,
      pluginService,
      dialogService: {
        showOpenDialog: async () => ({ canceled: false, filePaths: [zipPath] })
      }
    }),
    ipcMainService: ipcMain
  })

  const review = await ipcMain.handlers.get(IPC.PLUGINS_INSPECT_PACKAGE)()

  assert.equal(review.canceled, false)
  assert.equal(review.sourceType, 'zip')
  assert.equal(review.installMode, 'install')
  assert.equal(review.plugin.id, 'focus-timer')
  assert.equal(review.signature.status, 'hash-verified')
  assert.deepEqual(review.permissionDiff.permissions.added, ['pet:say'])
  assert.ok(review.selectionId)

  const installResult = ipcMain.handlers.get(IPC.PLUGINS_INSTALL)(null, { selectionId: review.selectionId })

  assert.equal(installResult.ok, true)
  assert.equal(installResult.pluginId, 'focus-timer')
  assert.equal(installResult.disabled, true)
  assert.deepEqual(installResult.plugins, [{
    id: 'focus-timer',
    name: '',
    version: '',
    source: '',
    enabled: false,
    runnable: false,
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
    storage: { keyCount: 0, byteSize: 0 },
    signatureStatus: {
      status: '',
      label: 'Signature unknown',
      signer: '',
      algorithm: '',
      verified: false,
      errors: []
    }
  }])
  assert.equal(fs.existsSync(path.join(pluginDir, 'focus-timer', 'plugin.json')), true)
  assert.equal(settingsService.get().plugins.enabled['focus-timer'], false)
  assert.equal(settingsService.get().plugins.installed['focus-timer'].signatureStatus, 'hash-verified')
})
