const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createActionFrameImportResult,
  createActionTriggerProposalPreviewResult,
  createActionsMutationResult,
  createAboutInfoView,
  createCatalogBlocklistResult,
  createLocalHttpConfigView,
  createLocalHttpRuntimeView,
  createPetPackMutationResult,
  createPluginMutationResult,
  createServiceStatusView,
  createUpdateCheckView
} = require('../../src/main/control-center-adapters')

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

test('createCatalogBlocklistResult preserves catalog and blocklist payload identity', () => {
  const catalog = {
    schemaVersion: 1,
    updatedAt: '2026-06-17T00:00:00.000Z',
    feedbackUrl: '',
    localBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    catalogBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    blocklist: { pluginIds: [], packIds: [], sha256: [] },
    plugins: [],
    petPacks: []
  }
  const blocklist = { pluginIds: ['openpet.demo'], packIds: [], sha256: [] }

  assert.deepEqual(createCatalogBlocklistResult(catalog, blocklist), { catalog, blocklist })
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
    plugins
  })
})

test('createPetPackMutationResult packages pack metadata with refreshed packs and optional animations', () => {
  const pack = {
    id: 'doro',
    displayName: 'Doro',
    version: '1.0.0',
    source: 'bundled',
    rootPath: '/assets/pet-packs/doro',
    active: true
  }
  const petPacks = { activePackId: 'doro', packs: [pack] }
  const animations = {
    defaultAction: 'idle',
    clickAction: 'happy',
    actions: [{ id: 'idle', label: 'Idle', sprite: 'idle.png', frames: 4, fps: 8, loop: true }]
  }

  assert.deepEqual(createPetPackMutationResult({
    pack,
    activePackId: 'doro'
  }, petPacks, animations), {
    pack,
    activePackId: 'doro',
    petPacks,
    animations
  })

  assert.deepEqual(createPetPackMutationResult({}, petPacks), { petPacks })
})

test('action adapters package import and mutation results without leaking service internals', () => {
  const animations = {
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [{ id: 'wave', label: 'Wave', sprite: 'wave.png', frames: 8, fps: 12, loop: false }]
  }
  const importedAction = animations.actions[0]
  const inspectionResult = {
    canceled: false,
    selectionId: 'selection-wave',
    folderName: 'wave',
    actionId: 'wave',
    inspection: {
      valid: false,
      frameCount: 0,
      maxWidth: 0,
      maxHeight: 0,
      frames: [],
      skippedFiles: [],
      errors: ['missing frames'],
      warnings: []
    }
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
    inspectionResult
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
