const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createAiConfigView,
  createAiMemoryProfileView,
  createAiPersonaDraftView,
  createAiPersonaProfileView,
  createActionFrameImportResult,
  createActionTriggerProposalPreviewResult,
  createActionsMutationResult,
  createAboutInfoView,
  createCatalogBlocklistResult,
  createImageGenerationApiKeyResult,
  createImageGenerationConfigView,
  createImageGenerationHealthCheckResult,
  createLocalHttpConfigView,
  createLocalHttpRuntimeView,
  createPetPackMutationResult,
  createPluginMutationResult,
  createServiceStatusView,
  createUpdateCheckView
} = require('../../src/main/control-center-adapters')

test('createAiConfigView normalizes AI config payloads for Control Center', () => {
  assert.deepEqual(createAiConfigView({
    enabled: 1,
    provider: 'openai-compatible',
    baseUrl: 42,
    model: 'gpt-5.5',
    apiKeyRef: null,
    systemPrompt: ['bad'],
    memory: { enabled: 'yes', internal: 'ignore-me' },
    behavior: {
      enabled: 1,
      useTools: '',
      cooldownMs: '2500',
      rules: [{ id: 'rule-1' }],
      decisions: ['bad'],
      internal: 'ignore-me'
    },
    hasApiKey: 'yes',
    secretValue: 'sk-hidden'
  }), {
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: '',
    model: 'gpt-5.5',
    apiKeyRef: '',
    systemPrompt: '',
    memory: { enabled: true },
    behavior: {
      enabled: true,
      useTools: false,
      cooldownMs: 2500,
      rules: [{ id: 'rule-1' }],
      decisions: [],
    },
    hasApiKey: true
  })
})

test('AI talk persona adapters normalize payloads for Control Center', () => {
  assert.deepEqual(createAiPersonaProfileView({
    petPackId: 'legacy-cat',
    petPackDisplayName: 7,
    packPersona: {
      name: 'OpenPet',
      identity: 'pet',
      tone: 'warm',
      coreTraits: ['friendly', 42],
      speakingStyle: 'Short.',
      relationshipToUser: 'Companion.',
      actionStyle: 'Use actions.',
      boundaries: ['No secrets.', false],
      internal: 'ignore-me'
    },
    overridePersona: {
      tone: 'sleepy',
      coreTraits: ['calm', null],
      hiddenPrompt: 'ignore-me'
    },
    effectivePersona: {
      name: 'OpenPet',
      identity: 'pet',
      tone: 'sleepy',
      coreTraits: ['friendly'],
      speakingStyle: 'Short.',
      relationshipToUser: 'Companion.',
      actionStyle: 'Use actions.',
      boundaries: ['No secrets.']
    },
    compiledPersonaPrompt: ['bad'],
    compiledSystemPrompt: '# system',
    secretValue: 'sk-hidden'
  }), {
    petPackId: 'legacy-cat',
    petPackDisplayName: '',
    packPersona: {
      name: 'OpenPet',
      identity: 'pet',
      tone: 'warm',
      coreTraits: ['friendly'],
      speakingStyle: 'Short.',
      relationshipToUser: 'Companion.',
      actionStyle: 'Use actions.',
      boundaries: ['No secrets.']
    },
    overridePersona: {
      tone: 'sleepy',
      coreTraits: ['calm']
    },
    effectivePersona: {
      name: 'OpenPet',
      identity: 'pet',
      tone: 'sleepy',
      coreTraits: ['friendly'],
      speakingStyle: 'Short.',
      relationshipToUser: 'Companion.',
      actionStyle: 'Use actions.',
      boundaries: ['No secrets.']
    },
    compiledPersonaPrompt: '',
    compiledSystemPrompt: '# system'
  })

  assert.deepEqual(createAiPersonaDraftView({
    petPackId: 'legacy-cat',
    petPackDisplayName: 'Legacy Cat',
    draftPersona: { tone: 'generated', boundaries: ['No secrets.', 9], hiddenPrompt: 'ignore-me' },
    compiledPersonaPrompt: '# Pet Persona\nTone: generated',
    rawProviderReply: 'ignore-me'
  }), {
    petPackId: 'legacy-cat',
    petPackDisplayName: 'Legacy Cat',
    draftPersona: { tone: 'generated', boundaries: ['No secrets.'] },
    compiledPersonaPrompt: '# Pet Persona\nTone: generated'
  })
})

test('AI talk memory adapter normalizes payloads for Control Center', () => {
  assert.deepEqual(createAiMemoryProfileView({
    petPackId: 'legacy-cat',
    petPackDisplayName: 42,
    globalMemories: [{
      id: 'memory-global',
      scope: 'bad',
      petPackId: null,
      text: 'User likes focus.',
      tags: ['focus', 7],
      confidence: '0.8',
      importance: '0.7',
      sourceConversationId: 9,
      sourceMessageIds: ['m1', false],
      createdAt: 'created',
      updatedAt: 'updated',
      lastUsedAt: 10,
      lastEvidenceAt: 'evidence',
      useCount: '2',
      status: 'superseded',
      supersedes: 5,
      reason: 'merged',
      rawEvidence: 'ignore-me'
    }],
    petPackMemories: [],
    recentJobs: [{
      id: 'job-1',
      petPackId: 'legacy-cat',
      conversationId: 9,
      status: 'done',
      createdAt: '',
      updatedAt: '',
      errorCode: null,
      appliedCount: '3',
      filteredCount: '1',
      raw: 'ignore-me'
    }],
    secretValue: 'sk-hidden'
  }), {
    petPackId: 'legacy-cat',
    petPackDisplayName: '',
    globalMemories: [{
      id: 'memory-global',
      scope: 'global',
      petPackId: '',
      text: 'User likes focus.',
      tags: ['focus'],
      confidence: 0.8,
      importance: 0.7,
      sourceConversationId: '',
      sourceMessageIds: ['m1'],
      createdAt: 'created',
      updatedAt: 'updated',
      lastUsedAt: '',
      lastEvidenceAt: 'evidence',
      useCount: 2,
      status: 'superseded',
      supersedes: '',
      reason: 'merged'
    }],
    petPackMemories: [],
    recentJobs: [{
      id: 'job-1',
      petPackId: 'legacy-cat',
      conversationId: '',
      status: 'done',
      createdAt: '',
      updatedAt: '',
      errorCode: '',
      appliedCount: 3,
      filteredCount: 1
    }]
  })
})

test('image generation adapters normalize provider payloads for Control Center', () => {
  assert.deepEqual(createImageGenerationConfigView({
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
    defaultBackend: 'cloud',
    secretValue: 'sk-hidden'
  }), {
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

  assert.deepEqual(createImageGenerationApiKeyResult({
    apiKeyRef: 'secret:model.image.openai.apiKey',
    hasApiKey: 1,
    apiKeyPreview: '••••1234',
    secretValue: 'sk-hidden'
  }), {
    apiKeyRef: 'secret:model.image.openai.apiKey',
    hasApiKey: true,
    apiKeyPreview: '••••1234'
  })

  assert.deepEqual(createImageGenerationHealthCheckResult({
    ok: 1,
    provider: 'openai-compatible',
    backend: 'cloud',
    code: 'provider_healthy',
    message: 'ok',
    modelsProbe: 'ok',
    availableModels: ['gpt-image-2', 42, 'gpt-image-2'],
    currentModelDiscovered: 'yes',
    usage: { estimatedCostUsd: '0.02', internal: 'ignore-me' },
    secretValue: 'sk-hidden'
  }), {
    ok: true,
    provider: 'openai-compatible',
    code: 'provider_healthy',
    message: 'ok',
    modelsProbe: 'ok',
    availableModels: ['gpt-image-2'],
    currentModelDiscovered: true,
    usage: { estimatedCostUsd: 0.02 }
  })
})

test('createServiceStatusView normalizes local HTTP config and runtime for Control Center', () => {
  const status = createServiceStatusView(
    {
      enabled: 1,
      port: '4317',
      token: 'secret-token',
      logs: [{ id: '1', timestamp: 'now', method: 'GET', path: '/api/status', statusCode: 200, authorized: true, remoteAddress: '127.0.0.1', error: '' }]
    },
    {
      enabled: true,
      host: 'localhost',
      port: '4318',
      mcp: { activeSessions: '2', sessionTtlMs: '30000' }
    }
  )

  assert.deepEqual(status, {
    config: {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      token: 'secret-token',
      logs: [{ id: '1', timestamp: 'now', method: 'GET', path: '/api/status', statusCode: 200, authorized: true, remoteAddress: '127.0.0.1', error: '' }]
    },
    runtime: {
      enabled: true,
      host: 'localhost',
      port: 4318,
      mcp: { activeSessions: 2, sessionTtlMs: 30000 }
    }
  })
})

test('createLocalHttpConfigView normalizes service logs to the shared log-entry shape', () => {
  assert.deepEqual(createLocalHttpConfigView({
    enabled: true,
    host: '127.0.0.1',
    port: 4317,
    token: 'demo-token',
    logs: [
      {
        id: 'log-1',
        timestamp: '2026-06-29T00:00:00.000Z',
        method: 'GET',
        path: '/health',
        statusCode: '200',
        authorized: 1,
        remoteAddress: '127.0.0.1',
        error: null,
        internal: 'ignore-me'
      },
      {
        timestamp: '2026-06-29T00:00:01.000Z',
        method: 'POST',
        path: '/mcp',
        statusCode: 'oops'
      },
      'bad-log-entry'
    ]
  }), {
    enabled: true,
    host: '127.0.0.1',
    port: 4317,
    token: 'demo-token',
    logs: [
      {
        id: 'log-1',
        timestamp: '2026-06-29T00:00:00.000Z',
        method: 'GET',
        path: '/health',
        statusCode: 200,
        authorized: true,
        remoteAddress: '127.0.0.1',
        error: ''
      },
      {
        id: '2026-06-29T00:00:01.000Z-POST-/mcp-oops',
        timestamp: '2026-06-29T00:00:01.000Z',
        method: 'POST',
        path: '/mcp',
        statusCode: 0,
        authorized: false,
        remoteAddress: '',
        error: ''
      }
    ]
  })
})

test('local HTTP view adapters provide stable defaults for missing fields', () => {
  assert.deepEqual(createLocalHttpConfigView(), {
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    token: '',
    logs: []
  })
  assert.deepEqual(createLocalHttpRuntimeView(), {
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    mcp: { activeSessions: 0, sessionTtlMs: 0 }
  })
})

test('createCatalogBlocklistResult normalizes catalog and blocklist payloads for Control Center', () => {
  const catalog = {
    schemaVersion: '1',
    updatedAt: '2026-06-17T00:00:00.000Z',
    feedbackUrl: 42,
    localBlocklist: { pluginIds: ['local-block'], packIds: [7], sha256: ['hash-a'], internal: 'ignore-me' },
    catalogBlocklist: { pluginIds: [], packIds: ['pack-a'], sha256: [false] },
    blocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: ['hash-b'], raw: 'ignore-me' },
    plugins: [{
      id: 'openpet.demo.weather',
      name: 'Demo Weather',
      version: '1.0.0',
      author: 'OpenPet',
      description: 'Weather demo',
      openpetApiVersion: '1.0',
      permissions: ['pet:say', 42],
      downloadable: 1,
      installed: '',
      installedVersion: 9,
      updateAvailable: 'yes',
      sha256: 'plugin-hash',
      reportUrl: 'https://example.com/report',
      blockStatus: { blocked: 0, reasons: ['ok', 7], internal: 'ignore-me' },
      serviceOnly: 'ignore-me'
    }],
    petPacks: [{
      id: 'openpet.demo.pixel-cat',
      displayName: 'Pixel Cat',
      version: '1.0.0',
      author: 'OpenPet',
      description: 'Pet pack demo',
      actionCount: '3',
      downloadable: 1,
      installed: '',
      installedVersion: 7,
      updateAvailable: 'yes',
      sha256: 'pack-hash',
      reportUrl: 'https://example.com/pack-report',
      blockStatus: { blocked: 1, reasons: ['blocked', 9], internal: 'ignore-me' },
      previewPath: '/Users/mango/private'
    }],
    privateCatalogCache: '/tmp/openpet'
  }
  const blocklist = { pluginIds: ['openpet.demo', 1], packIds: ['demo-pack'], sha256: ['hash-z', false], raw: 'ignore-me' }

  assert.deepEqual(createCatalogBlocklistResult(catalog, blocklist), {
    catalog: {
      schemaVersion: 1,
      updatedAt: '2026-06-17T00:00:00.000Z',
      feedbackUrl: '',
      localBlocklist: { pluginIds: ['local-block'], packIds: [], sha256: ['hash-a'] },
      catalogBlocklist: { pluginIds: [], packIds: ['pack-a'], sha256: [] },
      blocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: ['hash-b'] },
      plugins: [{
        id: 'openpet.demo.weather',
        name: 'Demo Weather',
        version: '1.0.0',
        author: 'OpenPet',
        description: 'Weather demo',
        openpetApiVersion: '1.0',
        permissions: ['pet:say'],
        downloadable: true,
        installed: false,
        updateAvailable: true,
        sha256: 'plugin-hash',
        reportUrl: 'https://example.com/report',
        blockStatus: { blocked: false, reasons: ['ok'] }
      }],
      petPacks: [{
        id: 'openpet.demo.pixel-cat',
        displayName: 'Pixel Cat',
        version: '1.0.0',
        author: 'OpenPet',
        description: 'Pet pack demo',
        actionCount: 3,
        downloadable: true,
        installed: false,
        updateAvailable: true,
        sha256: 'pack-hash',
        reportUrl: 'https://example.com/pack-report',
        blockStatus: { blocked: true, reasons: ['blocked'] }
      }]
    },
    blocklist: { pluginIds: ['openpet.demo'], packIds: ['demo-pack'], sha256: ['hash-z'] }
  })
})

test('createPluginMutationResult packages mutation metadata with refreshed plugins', () => {
  const plugins = [{
    id: 'openpet.demo',
    name: 'Demo',
    version: '1.0.0',
    source: 'local',
    enabled: false,
    runnable: true,
    permissions: ['pet:say'],
    commands: [],
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0 },
    signatureStatus: { label: 'Unsigned' }
  }]

  assert.deepEqual(createPluginMutationResult({
    ok: true,
    pluginId: 'openpet.demo',
    installMode: 'update',
    disabled: true,
    storageRemoved: false
  }, plugins), {
    ok: true,
    pluginId: 'openpet.demo',
    installMode: 'update',
    disabled: true,
    storageRemoved: false,
    plugins: [{
      id: 'openpet.demo',
      name: 'Demo',
      version: '1.0.0',
      source: 'local',
      enabled: false,
      runnable: true,
      permissions: ['pet:say'],
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
        label: 'Unsigned',
        signer: '',
        algorithm: '',
        verified: false,
        errors: []
      }
    }]
  })
})

test('createPluginMutationResult normalizes plugin view payloads for Control Center', () => {
  assert.deepEqual(createPluginMutationResult({ ok: true }, [{
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
      properties: [
        {
          key: 'tone',
          title: 'Tone',
          description: 'Voice tone',
          type: 'string',
          enum: ['soft', 'direct'],
          required: 1,
          secretPath: '/Users/mango/private/key'
        },
        {
          key: 'retries',
          type: 'integer'
        },
        {
          title: 'missing key'
        }
      ],
      internal: 'ignore-me'
    },
    config: { tone: 'soft' },
    storage: {
      keyCount: '2',
      byteSize: '4096',
      valid: 1,
      rawPath: '/Users/mango/Library/Application Support/OpenPet/plugins/openpet.demo/storage.json'
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
  }]), {
    ok: true,
    plugins: [{
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
        properties: [
          {
            key: 'tone',
            title: 'Tone',
            description: 'Voice tone',
            type: 'string',
            enum: ['soft', 'direct'],
            required: true
          },
          {
            key: 'retries'
          }
        ]
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
    }]
  })
})

test('createPetPackMutationResult packages pack metadata with refreshed packs and optional animations', () => {
  const pack = {
    id: 'doro',
    displayName: 'Doro',
    version: '1.0.0',
    source: 'bundled',
    rootPath: '/assets/pet-packs/doro',
    active: true,
    actionCount: '4',
    defaultAction: 'idle',
    clickAction: 'happy',
    previewSprite: 'file:///assets/pet-packs/doro/idle.png',
    previewAction: {
      id: 'idle',
      label: 'Idle',
      frameCount: '4',
      frameWidth: '64',
      frameHeight: '64',
      frameMs: '120',
      frameRow: '0',
      frameColumn: '1',
      atlas: {
        columns: '2',
        rows: '2',
        width: '128',
        height: '128',
        secretPath: '/Users/mango/private'
      },
      frameDurations: ['120', 90, 'bad'],
      loop: 1,
      internal: 'ignore-me'
    },
    provenance: {
      sourceUrl: 'https://example.com/doro',
      assetAuthor: 'OpenPet',
      license: 'CC-BY',
      licenseUrl: 'https://example.com/license',
      importedAt: '2026-06-20T00:00:00.000Z',
      originalFormat: 'directory',
      rawPath: '/Users/mango/private'
    },
    blockStatus: { blocked: 0, reasons: ['ok', 42], internal: 'ignore-me' },
    conflict: {
      installed: 1,
      decision: 'upgrade',
      requiresReview: '',
      installedVersion: '0.9.0',
      incomingVersion: '1.0.0',
      privateNote: 'ignore-me'
    },
    internalOnly: 'service-field'
  }
  const petPacks = { activePackId: 'doro', packs: [pack] }
  const normalizedPack = {
    id: 'doro',
    displayName: 'Doro',
    version: '1.0.0',
    source: 'bundled',
    rootPath: '/assets/pet-packs/doro',
    active: true,
    actionCount: 4,
    defaultAction: 'idle',
    clickAction: 'happy',
    previewSprite: 'file:///assets/pet-packs/doro/idle.png',
    previewAction: {
      id: 'idle',
      label: 'Idle',
      frameCount: 4,
      frameWidth: 64,
      frameHeight: 64,
      frameMs: 120,
      frameRow: 0,
      frameColumn: 1,
      atlas: {
        columns: 2,
        rows: 2,
        width: 128,
        height: 128
      },
      frameDurations: [120, 90, 0],
      loop: true
    },
    provenance: {
      sourceUrl: 'https://example.com/doro',
      assetAuthor: 'OpenPet',
      license: 'CC-BY',
      licenseUrl: 'https://example.com/license',
      importedAt: '2026-06-20T00:00:00.000Z',
      originalFormat: 'directory'
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
  const animations = {
    defaultAction: 'idle',
    clickAction: 'happy',
    actions: [{ id: 'idle', label: 'Idle', sprite: 'idle.png', frames: 4, fps: 8, loop: true }]
  }

  assert.deepEqual(createPetPackMutationResult({
    pack,
    activePackId: 'doro'
  }, petPacks, animations), {
    pack: normalizedPack,
    activePackId: 'doro',
    petPacks: {
      activePackId: 'doro',
      packs: [normalizedPack]
    },
    animations
  })

  assert.deepEqual(createPetPackMutationResult({}, petPacks), {
    petPacks: {
      activePackId: 'doro',
      packs: [normalizedPack]
    }
  })
})

test('action adapters package import and mutation results without leaking service internals', () => {
  const animations = {
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [{ id: 'wave', label: 'Wave', sprite: 'wave.png', frames: 8, fps: 12, loop: false }]
  }
  const importedAction = animations.actions[0]
  const inspectionResult = {
    canceled: 0,
    selectionId: 'selection-wave',
    folderName: 'wave',
    actionId: 'wave',
    inspection: {
      valid: '',
      frameCount: '0',
      maxWidth: '64',
      maxHeight: '32',
      frames: [
        { fileName: '01_no_bg.png', width: '64', height: '32', hasAlpha: 1, rawPath: '/tmp/private.png' },
        { fileName: '', width: 'bad', height: 'bad', hasAlpha: false }
      ],
      skippedFiles: ['Thumbs.db', 42],
      errors: ['missing frames', null],
      warnings: ['rename files', false],
      internal: 'service-only'
    },
    privateSelectionPath: '/Users/mango/private'
  }

  assert.deepEqual(createActionFrameImportResult({
    ok: true,
    canceled: false,
    result: { importedAction, extra: 'internal-service-field' }
  }, animations), {
    ok: true,
    canceled: false,
    result: { importedAction },
    animations
  })

  assert.deepEqual(createActionFrameImportResult({ ok: false, inspectionResult }), {
    ok: false,
    inspectionResult: {
      canceled: false,
      selectionId: 'selection-wave',
      folderName: 'wave',
      actionId: 'wave',
      inspection: {
        valid: false,
        frameCount: 0,
        maxWidth: 64,
        maxHeight: 32,
        frames: [
          { fileName: '01_no_bg.png', width: 64, height: 32, hasAlpha: true }
        ],
        skippedFiles: ['Thumbs.db'],
        errors: ['missing frames'],
        warnings: ['rename files']
      }
    }
  })
  assert.deepEqual(createActionFrameImportResult({
    ok: false,
    inspectionResult: {
      canceled: true,
      selectionId: 42,
      folderName: 'ignore-me',
      inspection: { valid: true }
    }
  }), {
    ok: false,
    inspectionResult: { canceled: true }
  })
  assert.deepEqual(createActionsMutationResult(animations), { animations })
  assert.deepEqual(createActionsMutationResult(animations, {
    proposal: {
      id: 'proposal:click:wave:test',
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action',
      message: 'Click trigger proposal',
      status: 'applied',
      triggerRuleId: '',
      preview: 'Click trigger will set clickAction to wave.',
      resultCode: 'applied',
      resultMessage: 'Click trigger now uses action: wave',
      rejectionReason: '',
      createdAt: '2026-06-22T09:00:00.000Z',
      updatedAt: '2026-06-22T10:00:00.000Z',
      acceptedAt: '2026-06-22T10:00:00.000Z',
      rejectedAt: '',
      internal: 'ignore-me'
    },
    triggerProposal: {
      ok: true,
      applied: true,
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      code: 'applied',
      message: 'Click trigger now uses action: wave',
      acceptedAt: '2026-06-22T10:00:00.000Z',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action',
      internal: 'ignore-me'
    }
  }), {
    animations,
    proposal: {
      id: 'proposal:click:wave:test',
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action',
      message: 'Click trigger proposal',
      status: 'applied',
      triggerRuleId: '',
      preview: 'Click trigger will set clickAction to wave.',
      resultCode: 'applied',
      resultMessage: 'Click trigger now uses action: wave',
      rejectionReason: '',
      createdAt: '2026-06-22T09:00:00.000Z',
      updatedAt: '2026-06-22T10:00:00.000Z',
      acceptedAt: '2026-06-22T10:00:00.000Z',
      rejectedAt: ''
    },
    triggerProposal: {
      ok: true,
      applied: true,
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      code: 'applied',
      message: 'Click trigger now uses action: wave',
      acceptedAt: '2026-06-22T10:00:00.000Z',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action'
    }
  })
  assert.deepEqual(createActionsMutationResult(animations, {
    triggerProposal: {
      ok: true,
      applied: false,
      actionId: 'sleep',
      type: 'state',
      binding: '',
      code: 'rule_created',
      message: 'Created host trigger rule rule:state:sleep:test for action: sleep',
      acceptedAt: '2026-06-22T10:00:00.000Z',
      triggerRuleId: 'rule:state:sleep:test',
      preview: 'State trigger rule can play sleep when a host state condition matches.',
      triggerRule: {
        id: 'rule:state:sleep:test',
        actionId: 'sleep',
        type: 'state',
        status: 'active',
        sourceProposalId: 'proposal:state:sleep:test',
        sourcePluginId: 'openpet.creator-studio',
        sourceRunId: 'run-1',
        sourceCommandId: 'import-approved-action',
        message: 'Sleep when idle.',
        preview: 'State trigger rule can play sleep when a host state condition matches.',
        ruleSpec: {
          schemaVersion: 1,
          type: 'state',
          summary: 'Sleep when idle with sk-test-secret.',
          state: { predicate: 'pet.idle && source=/Users/mango/private/state.json', source: 'creator-studio' },
          internal: 'ignore-me'
        },
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
        internal: 'ignore-me'
      }
    }
  }), {
    animations,
    triggerProposal: {
      ok: true,
      applied: false,
      actionId: 'sleep',
      type: 'state',
      binding: '',
      code: 'rule_created',
      message: 'Created host trigger rule rule:state:sleep:test for action: sleep',
      acceptedAt: '2026-06-22T10:00:00.000Z',
      triggerRuleId: 'rule:state:sleep:test',
      preview: 'State trigger rule can play sleep when a host state condition matches.',
      triggerRule: {
        id: 'rule:state:sleep:test',
        actionId: 'sleep',
        type: 'state',
        status: 'active',
        sourceProposalId: 'proposal:state:sleep:test',
        sourcePluginId: 'openpet.creator-studio',
        sourceRunId: 'run-1',
        sourceCommandId: 'import-approved-action',
        message: 'Sleep when idle.',
        preview: 'State trigger rule can play sleep when a host state condition matches.',
        ruleSpec: {
          schemaVersion: 1,
          type: 'state',
          summary: 'Sleep when idle with [redacted-secret].',
          state: { predicate: 'pet.idle && source=[redacted-path]', source: 'creator-studio' }
        },
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z'
      }
    }
  })
})

test('action trigger proposal preview adapter strips internal fields', () => {
  assert.deepEqual(createActionTriggerProposalPreviewResult({
    ok: true,
    applied: false,
    actionId: 'sleep',
    type: 'state',
    binding: '',
    code: 'will_create_rule',
    message: 'Preview: a host trigger rule would be created for action: sleep',
    triggerRuleId: 'preview:state:sleep',
    preview: 'State trigger rule can play sleep when a host state condition matches.',
    triggerRule: {
      id: 'preview:state:sleep',
      actionId: 'sleep',
      type: 'state',
      status: 'active',
      sourceProposalId: '',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action',
      message: 'Sleep when idle.',
      preview: 'State trigger rule can play sleep when a host state condition matches.',
      ruleSpec: {
        schemaVersion: 1,
        type: 'state',
        summary: 'Sleep when idle with sk-test-secret.',
        state: { predicate: 'pet.idle && source=/Users/mango/private/state.json', source: 'creator-studio' },
        internal: 'ignore-me'
      },
      createdAt: '2026-06-22T10:00:00.000Z',
      updatedAt: '2026-06-22T10:00:00.000Z',
      internal: 'ignore-me'
    },
    sourcePluginId: 'openpet.creator-studio',
    sourceRunId: 'run-1',
    sourceCommandId: 'import-approved-action',
    internal: 'ignore-me'
  }), {
    ok: true,
    applied: false,
    actionId: 'sleep',
    type: 'state',
    binding: '',
    code: 'will_create_rule',
    message: 'Preview: a host trigger rule would be created for action: sleep',
    triggerRuleId: 'preview:state:sleep',
    preview: 'State trigger rule can play sleep when a host state condition matches.',
    triggerRule: {
      id: 'preview:state:sleep',
      actionId: 'sleep',
      type: 'state',
      status: 'active',
      sourceProposalId: '',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action',
      message: 'Sleep when idle.',
      preview: 'State trigger rule can play sleep when a host state condition matches.',
      ruleSpec: {
        schemaVersion: 1,
        type: 'state',
        summary: 'Sleep when idle with [redacted-secret].',
        state: { predicate: 'pet.idle && source=[redacted-path]', source: 'creator-studio' }
      },
      createdAt: '2026-06-22T10:00:00.000Z',
      updatedAt: '2026-06-22T10:00:00.000Z'
    },
    sourcePluginId: 'openpet.creator-studio',
    sourceRunId: 'run-1',
    sourceCommandId: 'import-approved-action'
  })
})

test('about adapters provide stable defaults for partial info and update checks', () => {
  assert.deepEqual(createAboutInfoView({
    version: '1.0.1',
    packaged: true,
    platform: 'darwin',
    arch: 'arm64',
    update: {
      configured: true,
      provider: 'github',
      owner: 'openpet',
      repo: 'desktop',
      channel: 'latest',
      url: 'https://example.test/releases'
    }
  }), {
    name: 'openpet',
    productName: 'OpenPet',
    version: '1.0.1',
    packaged: true,
    platform: 'darwin',
    arch: 'arm64',
    update: {
      configured: true,
      provider: 'github',
      owner: 'openpet',
      repo: 'desktop',
      channel: 'latest',
      url: 'https://example.test/releases'
    }
  })

  assert.deepEqual(createUpdateCheckView({
    status: 'not-configured',
    currentVersion: '1.0.1',
    checkedAt: '2026-06-17T00:00:00.000Z',
    message: 'Update feed is not configured.'
  }), {
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

test('createUpdateCheckView normalizes update assets to a stable renderer-safe shape', () => {
  assert.deepEqual(createUpdateCheckView({
    status: 'ok',
    configured: true,
    currentVersion: '1.0.1',
    latestVersion: '1.0.2',
    updateAvailable: true,
    prerelease: false,
    releaseUrl: 'https://github.com/dengyie/OpenPet/releases/tag/v1.0.2',
    assets: [
      {
        name: 'OpenPet-1.0.2-mac-arm64.dmg',
        url: 'https://example.com/OpenPet-1.0.2-mac-arm64.dmg',
        size: '134799501',
        contentType: 'application/x-apple-diskimage',
        extraInternalField: 'ignore-me'
      },
      'legacy-asset-string',
      {
        name: '',
        url: 123,
        size: 'oops'
      }
    ],
    checkedAt: '2026-06-29T00:00:00.000Z',
    message: 'A newer version is available.'
  }), {
    status: 'ok',
    configured: true,
    currentVersion: '1.0.1',
    latestVersion: '1.0.2',
    updateAvailable: true,
    prerelease: false,
    releaseUrl: 'https://github.com/dengyie/OpenPet/releases/tag/v1.0.2',
    assets: [
      {
        name: 'OpenPet-1.0.2-mac-arm64.dmg',
        url: 'https://example.com/OpenPet-1.0.2-mac-arm64.dmg',
        size: 134799501,
        contentType: 'application/x-apple-diskimage'
      },
      {
        name: '',
        url: '',
        size: 0,
        contentType: ''
      },
      {
        name: '',
        url: '',
        size: 0,
        contentType: ''
      }
    ],
    checkedAt: '2026-06-29T00:00:00.000Z',
    message: 'A newer version is available.'
  })
})
