const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const {
  __testInternals,
  CREATOR_STUDIO_PLUGIN_ID,
  EDITABLE_TARGET_ID,
  EDITABLE_TARGET_TYPE,
  createCreatorWorkflowService
} = require('../../src/main/services/creator-workflow-service')
const { readRun } = require('../../examples/plugins/creator-studio/lib/run-store')
const { getQualityFirstQualityProfile } = require('../../examples/plugins/creator-studio/lib/pet-generation-quality-profile')

const OFFICIAL_FULL_PET_ACTION_IDS = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review'
]
const LEGACY_PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xn9pAAAAAElFTkSuQmCC', 'base64')
const LEGACY_GIF_BYTES = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')

const createReadyHatchPetAgentService = () => ({
  getGenerationReadiness: () => ({
    ok: true,
    code: 'hatch_pet_ready',
    message: 'ready',
    enabled: true,
    configSource: 'chat-fallback',
    provider: 'openai-compatible',
    model: 'chat-model'
  }),
  checkGenerationCapability: async () => ({
    ok: true,
    code: 'ok',
    message: 'capable',
    enabled: true,
    configSource: 'chat-fallback',
    provider: 'openai-compatible',
    model: 'chat-model'
  })
})

const createPluginView = ({
  enabled = true,
  runnable = true,
  blocked = false,
  serviceStatus = 'running',
  commands = [{ id: 'draft-task' }]
} = {}) => ({
  id: CREATOR_STUDIO_PLUGIN_ID,
  enabled,
  runnable,
  blockStatus: { blocked, reasons: blocked ? ['blocked'] : [] },
  commands,
  entries: {
    services: [{
      id: 'studio',
      runtime: { status: serviceStatus }
    }]
  }
})

const createHealthCoordinationFixture = ({
  checkHealth = async () => ({ ok: true, code: 'provider_healthy', message: 'ready' }),
  getHealthCacheRevision = () => 0,
  getConfig = () => ({
    provider: 'openai-compatible',
    baseUrl: 'https://images.example.test/v1',
    model: 'gpt-image-2',
    apiKeyRef: 'secret:model.image.openai.apiKey'
  }),
  runCommand = async (_pluginId, commandId) => ({
    commandId,
    result: {
      ok: true,
      message: commandId,
      run: {
        runId: 'run-health',
        taskStatus: commandId === 'draft-task' ? 'ready_for_confirmation' : 'confirmed',
        status: commandId === 'run-step' ? 'ready_for_review' : 'draft'
      }
    }
  }),
  hatchPetAgentService = createReadyHatchPetAgentService(),
  nowMs = () => Date.now()
} = {}) => {
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    assetPath: '/tmp/reference.png',
    assetUrl: 'file:///tmp/reference.png',
    fileName: 'reference.png',
    width: 256,
    height: 256,
    contentHash: 'health-reference',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z'
  }
  const commandCalls = []
  const referenceBindCalls = []
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => '/tmp/openpet-health-coordination',
      runCommand: async (...args) => {
        commandCalls.push(args)
        return runCommand(...args)
      }
    },
    imageGenerationModelService: { checkHealth, getConfig, getHealthCacheRevision },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async (payload) => {
        referenceBindCalls.push(payload)
        return { replaced: false, reference }
      },
      copyReferenceIntoRun: () => ({})
    },
    hatchPetAgentService,
    nowMs
  })
  return { service, commandCalls, referenceBindCalls }
}

const createFixedWorkflowHarness = ({ createShadowDecision } = {}) => {
  const commandCalls = []
  const logs = []
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    assetPath: '/tmp/reference.png',
    assetUrl: 'file:///tmp/reference.png',
    fileName: 'reference.png',
    width: 512,
    height: 512,
    contentHash: 'reference-hash',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z'
  }
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => '/tmp/openpet-shadow-workflow',
      runCommand: async (_pluginId, commandId, payload) => {
        commandCalls.push({ commandId, payload })
        const runs = {
          'draft-task': { runId: 'run-shadow', taskStatus: 'ready_for_confirmation' },
          'confirm-task': { runId: 'run-shadow', taskStatus: 'confirmed' },
          'run-step': { runId: 'run-shadow', status: 'ready_for_review' },
          'approve-run': { runId: 'run-shadow', status: 'approved' },
          'import-approved-action': { runId: 'run-shadow', status: 'imported', importedActionId: 'spin' }
        }
        if (!runs[commandId]) throw new Error(`Unexpected command: ${commandId}`)
        return {
          commandId,
          result: {
            ok: true,
            message: commandId,
            run: runs[commandId],
            ...(commandId === 'import-approved-action' ? {
              importedAction: { id: 'spin' },
              triggerProposalSubmission: { ok: true, proposal: { id: 'proposal:shadow:spin' } }
            } : {})
          }
        }
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ready' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { defaultAction: 'idle', clickAction: 'spin', actions: [{ id: 'idle' }, { id: 'spin' }] } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: () => ({})
    },
    hatchPetAgentService: {
      getGenerationReadiness: () => ({ ok: true, code: 'hatch_pet_ready', message: 'ready' }),
      checkGenerationCapability: async () => ({ ok: true, code: 'ok', message: 'capable' }),
      createShadowDecision
    },
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'shadow-workflow-request'
  })
  return { commandCalls, logs, service }
}

test('an unresolved shadow planner does not block the fixed Creator workflow', async () => {
  const h = createFixedWorkflowHarness({ createShadowDecision: () => new Promise(() => {}) })

  const result = await Promise.race([
    h.service.generateExistingAction({ actionName: 'spin', motionPrompt: 'spin quickly' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('fixed workflow waited for shadow planner')), 50))
  ])

  // Production stops after generation for explicit human review; shadow must not delay that path.
  assert.equal(result.state, 'review-required')
  assert.equal(result.code, 'human_review_required')
  assert.deepEqual(h.commandCalls.map((call) => call.commandId), [
    'draft-task', 'confirm-task', 'run-step'
  ])
})

test('shadow planner rejection is contained while the fixed Creator workflow completes', async () => {
  const h = createFixedWorkflowHarness({ createShadowDecision: async () => { throw new Error('shadow unavailable') } })

  const result = await h.service.generateExistingAction({ actionName: 'spin', motionPrompt: 'spin quickly' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(result.state, 'review-required')
  assert.equal(result.code, 'human_review_required')
  assert.equal(h.logs.some((entry) => entry.event === 'creator.workflow.shadow-planning-failed'), true)
  assert.deepEqual(h.commandCalls.map((call) => call.commandId), [
    'draft-task', 'confirm-task', 'run-step'
  ])
})

test('resolved shadow diagnostics remain additive and never enter fixed command payloads', async () => {
  const shadowResults = []
  const h = createFixedWorkflowHarness({
    createShadowDecision: async () => {
      const value = {
        status: 'shadow-recorded',
        code: 'ok',
        decision: { decision: 'observe' },
        decisionId: 'shadow-1'
      }
      shadowResults.push(value)
      return value
    }
  })

  const result = await h.service.generateExistingAction({ actionName: 'spin', motionPrompt: 'spin quickly' })
  assert.equal(result.state, 'review-required')
  assert.equal(result.code, 'human_review_required')
  // Shadow planning is fire-and-forget and must never delay or pollute the fixed workflow.
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(shadowResults.length, 1)
  assert.equal(shadowResults[0].decision.decision, 'observe')
  assert.equal(shadowResults[0].decisionId, 'shadow-1')
  // When the fixed path finishes first, hatchPetAgent may still be null on the returned snapshot.
  if (result.diagnostics?.hatchPetAgent) {
    assert.equal(result.diagnostics.hatchPetAgent.decision, 'observe')
    assert.equal(result.diagnostics.hatchPetAgent.decisionId, 'shadow-1')
  }
  assert.equal(JSON.stringify(h.commandCalls).includes('shadow-1'), false)
  assert.equal(JSON.stringify(h.commandCalls).includes('observe'), false)
  assert.deepEqual(h.commandCalls.map((call) => call.commandId), [
    'draft-task', 'confirm-task', 'run-step'
  ])
})

test('creator workflow treats missing full-pet QA evidence as default idle coverage missing', () => {
  const coverage = __testInternals.resolveOfficialActionCoverage(null)

  assert.equal(coverage.basicActions, null)
  // Default required coverage without QA evidence is the minimal full-pet gate (idle).
  assert.deepEqual(coverage.missingOfficialActionIds, ['idle'])
})

test('creator workflow rejects full-pet coverage from failed QA evidence', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-failed-qa-'))
  const qaDir = path.join(pluginDataDir, 'runs', 'run-failed-qa', 'qa')
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
    ok: false,
    basicActions: {
      realActionIds: OFFICIAL_FULL_PET_ACTION_IDS,
      requiredOfficialActionIds: OFFICIAL_FULL_PET_ACTION_IDS,
      missingRequiredOfficialActionIds: []
    }
  }, null, 2)}\n`)

  assert.equal(__testInternals.readBasicActionCoverage({
    pluginDataDir,
    runId: 'run-failed-qa'
  }), null)
})

test('creator workflow service blocks before drafting runs when provider health is unavailable', async () => {
  const commandCalls = []
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async (...args) => {
        commandCalls.push(args)
        return {}
      },
      getPluginCreatorDataDir: () => '/tmp/openpet-plugin-data'
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: false, code: 'missing_api_key', message: 'missing' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({
        replaced: false,
        reference: {
          targetType: EDITABLE_TARGET_TYPE,
          targetId: EDITABLE_TARGET_ID,
          assetPath: '/tmp/reference.png',
          assetUrl: 'file:///tmp/reference.png',
          fileName: 'reference.png',
          width: 256,
          height: 256,
          contentHash: 'hash',
          createdAt: '2026-07-02T10:00:00.000Z',
          updatedAt: '2026-07-02T10:00:00.000Z'
        }
      }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin quickly',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'provider-not-ready')
  assert.equal(result.code, 'missing_api_key')
  assert.match(result.message, /AI -> 模型 Provider -> 图片模型 配置/i)
  assert.equal(commandCalls.length, 0)
})

test('creator workflow service blocks before drafting when no verified creator image model is available', async () => {
  const commandCalls = []
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async (...args) => {
        commandCalls.push(args)
        throw new Error('should not draft without a verified creator workflow image model')
      },
      getPluginCreatorDataDir: () => '/tmp/openpet-plugin-data'
    },
    imageGenerationModelService: {
      checkHealth: async () => ({
        ok: true,
        code: 'provider_reachable_models_unavailable',
        message: 'Image Provider is reachable, but the optional /models probe is unavailable'
      }),
      getConfig: () => ({
        provider: 'openai-compatible',
        model: 'gpt-image-legacy',
        creatorWorkflowModelPolicy: {
          evidenceScope: 'creator-one-click-default',
          preferredModel: 'gpt-image-legacy',
          verifiedModels: [],
          fallbackModels: [],
          discoveredModels: [],
          preferredModelVerified: false
        }
      })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({
        replaced: false,
        reference: {
          targetType: EDITABLE_TARGET_TYPE,
          targetId: EDITABLE_TARGET_ID,
          assetPath: '/tmp/reference.png',
          assetUrl: 'file:///tmp/reference.png',
          fileName: 'reference.png',
          width: 256,
          height: 256,
          contentHash: 'hash',
          createdAt: '2026-07-02T10:00:00.000Z',
          updatedAt: '2026-07-02T10:00:00.000Z'
        }
      }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const state = await service.getState()
  assert.equal(state.provider.ready, false)
  assert.equal(state.provider.code, 'no_verified_creator_image_model')

  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin quickly',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'provider-not-ready')
  assert.equal(result.code, 'no_verified_creator_image_model')
  assert.match(result.message, /可用模型/)
  assert.equal(commandCalls.length, 0)
})

test('creator workflow service getState falls back quickly when provider health stalls', async () => {
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async () => ({}),
      getPluginCreatorDataDir: () => '/tmp/openpet-plugin-data'
    },
    imageGenerationModelService: {
      checkHealth: async () => new Promise(() => {}),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({
        replaced: false,
        reference: {
          targetType: EDITABLE_TARGET_TYPE,
          targetId: EDITABLE_TARGET_ID,
          assetPath: '/tmp/reference.png',
          assetUrl: 'file:///tmp/reference.png',
          fileName: 'reference.png',
          width: 256,
          height: 256,
          contentHash: 'hash',
          createdAt: '2026-07-02T10:00:00.000Z',
          updatedAt: '2026-07-02T10:00:00.000Z'
        }
      }),
      copyReferenceIntoRun: () => ({})
    },
    providerHealthTimeoutMs: 20
  })

  const result = await Promise.race([
    service.getState(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('creator getState timed out waiting for provider health')), 80))
  ])

  assert.equal(result.ok, true)
  assert.equal(result.provider.ready, false)
  assert.equal(result.provider.code, 'health_check_timeout')
})

test('creator health checks coalesce concurrent getState calls', async () => {
  let resolveHealth
  let calls = 0
  const health = new Promise((resolve) => { resolveHealth = resolve })
  const { service } = createHealthCoordinationFixture({
    checkHealth: () => {
      calls += 1
      return health
    }
  })

  const first = service.getState()
  const second = service.getState()
  assert.equal(calls, 1)
  resolveHealth({ ok: true, code: 'provider_healthy', message: 'ready' })
  assert.equal((await first).provider.ready, true)
  assert.equal((await second).provider.ready, true)
})

test('creator reuses a recent successful health result for generation preflight', async () => {
  let calls = 0
  const { service } = createHealthCoordinationFixture({
    checkHealth: async () => {
      calls += 1
      return { ok: true, code: 'provider_healthy', message: 'ready' }
    }
  })

  await service.getState()
  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin',
    referenceImageToken: 'token-reference'
  })
  assert.equal(result.state, 'review-required')
  assert.equal(calls, 1)
})

test('creator health cache expires and configuration changes invalidate it', async () => {
  let now = 1000
  let model = 'gpt-image-2'
  let calls = 0
  const { service } = createHealthCoordinationFixture({
    nowMs: () => now,
    getConfig: () => ({
      provider: 'openai-compatible',
      baseUrl: 'https://images.example.test/v1',
      model,
      apiKeyRef: 'secret:model.image.openai.apiKey'
    }),
    checkHealth: async () => {
      calls += 1
      return { ok: true, code: 'provider_healthy', message: 'ready' }
    }
  })

  await service.getState()
  now += 29999
  await service.getState()
  model = 'gpt-image-1.5'
  await service.getState()
  now += 30000
  await service.getState()
  assert.equal(calls, 3)
})

test('creator invalidates a successful health result when Provider credentials change at the same secret ref', async () => {
  let credentialRevision = 0
  let calls = 0
  const { service } = createHealthCoordinationFixture({
    getHealthCacheRevision: () => credentialRevision,
    checkHealth: async () => {
      calls += 1
      return calls === 1
        ? { ok: true, code: 'provider_healthy', message: 'ready' }
        : { ok: false, code: 'missing_api_key', message: 'Image generation API key is missing' }
    }
  })

  assert.equal((await service.getState()).provider.ready, true)
  credentialRevision += 1
  const nextState = await service.getState()

  assert.equal(calls, 2)
  assert.equal(nextState.provider.ready, false)
  assert.equal(nextState.provider.code, 'missing_api_key')
})

test('creator does not cache a health timeout as a successful result', async () => {
  let calls = 0
  const { service } = createHealthCoordinationFixture({
    checkHealth: async () => {
      calls += 1
      return { ok: false, code: 'health_check_timeout', message: 'timed out' }
    }
  })

  assert.equal((await service.getState()).provider.ready, false)
  assert.equal((await service.getState()).provider.ready, false)
  assert.equal(calls, 2)
})

test('creator reports health timeout as temporary latency instead of missing configuration', async () => {
  const { service, commandCalls } = createHealthCoordinationFixture({
    checkHealth: async () => ({
      ok: false,
      code: 'health_check_timeout',
      message: 'Image Provider health check timed out after 10000ms'
    })
  })

  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin',
    referenceImageToken: 'token-reference'
  })
  assert.equal(result.state, 'provider-not-ready')
  assert.equal(result.code, 'health_check_timeout')
  assert.match(result.message, /响应较慢|检查超时/)
  assert.doesNotMatch(result.message, /配置并保存可用模型/)
  assert.equal(commandCalls.length, 0)
})

test('creator blocks a disabled Hatch-pet Agent before drafting a full-pet run', async () => {
  let capabilityChecks = 0
  const { service, commandCalls, referenceBindCalls } = createHealthCoordinationFixture({
    hatchPetAgentService: {
      getGenerationReadiness: () => ({
        ok: false,
        code: 'hatch_pet_disabled',
        message: 'Hatch-pet Agent 未启用',
        enabled: false,
        configSource: 'chat-fallback',
        provider: 'openai-compatible',
        model: 'chat-model'
      }),
      checkGenerationCapability: async () => {
        capabilityChecks += 1
        return { ok: true, code: 'ok', message: 'capable' }
      }
    }
  })

  const result = await service.generateNewCharacter({
    characterName: 'Blocked Pet',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.state, 'hatch-pet-not-ready')
  assert.equal(result.code, 'hatch_pet_disabled')
  assert.match(result.message, /开启 Agent/)
  assert.equal(capabilityChecks, 0)
  assert.deepEqual(commandCalls, [])
  assert.deepEqual(referenceBindCalls, [])
})

test('creator blocks a failed Hatch-pet capability probe before drafting a full-pet run', async () => {
  let capabilityChecks = 0
  const { service, commandCalls, referenceBindCalls } = createHealthCoordinationFixture({
    hatchPetAgentService: {
      getGenerationReadiness: () => ({
        ok: true,
        code: 'hatch_pet_ready',
        message: 'ready',
        enabled: true,
        configSource: 'chat-fallback',
        provider: 'openai-compatible',
        model: 'chat-model'
      }),
      checkGenerationCapability: async () => {
        capabilityChecks += 1
        return {
          ok: false,
          code: 'structured_tool_not_supported',
          message: 'Configured model did not confirm structured tool capability',
          enabled: true,
          configSource: 'chat-fallback',
          provider: 'openai-compatible',
          model: 'chat-model'
        }
      }
    }
  })

  const result = await service.generateNewCharacter({
    characterName: 'Unsupported Planner Pet',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.state, 'hatch-pet-not-ready')
  assert.equal(result.code, 'structured_tool_not_supported')
  assert.equal(capabilityChecks, 1)
  assert.deepEqual(commandCalls, [])
  assert.deepEqual(referenceBindCalls, [])
})

test('creator drafts a full-pet run only after the Hatch-pet capability probe passes', async () => {
  let capabilityChecks = 0
  const { service, commandCalls, referenceBindCalls } = createHealthCoordinationFixture({
    hatchPetAgentService: {
      getGenerationReadiness: () => ({ ok: true, code: 'hatch_pet_ready', message: 'ready' }),
      checkGenerationCapability: async () => {
        capabilityChecks += 1
        return { ok: true, code: 'ok', message: 'capable' }
      }
    }
  })

  const result = await service.generateNewCharacter({
    characterName: 'Ready Pet',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.state, 'preview-ready')
  assert.equal(capabilityChecks, 1)
  assert.deepEqual(commandCalls.map((call) => call[1]), ['draft-task', 'confirm-task', 'run-step'])
  assert.equal(referenceBindCalls.length, 1)
})

test('creator keeps single-action generation available when Hatch-pet Agent is disabled', async () => {
  const { service, commandCalls } = createHealthCoordinationFixture({
    hatchPetAgentService: {
      getGenerationReadiness: () => ({ ok: false, code: 'hatch_pet_disabled', message: 'disabled' })
    }
  })

  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.state, 'review-required')
  assert.deepEqual(commandCalls.map((call) => call[1]), ['draft-task', 'confirm-task', 'run-step'])
})

test('creator uses a widened default health timeout for Provider probes', async () => {
  let options = null
  const { service } = createHealthCoordinationFixture({
    checkHealth: async (nextOptions) => {
      options = nextOptions
      return { ok: true, code: 'provider_healthy', message: 'ready' }
    }
  })

  await service.getState()
  assert.equal(options.timeoutMs, 10000)
})

test('creator does not combine an old-config health result with a changed Provider config', async () => {
  let model = 'gpt-image-2'
  let calls = 0
  let resolveFirst
  const firstHealth = new Promise((resolve) => { resolveFirst = resolve })
  const { service } = createHealthCoordinationFixture({
    getConfig: () => ({
      provider: 'openai-compatible',
      baseUrl: 'https://images.example.test/v1',
      model,
      apiKeyRef: 'secret:model.image.openai.apiKey'
    }),
    checkHealth: async () => {
      calls += 1
      if (calls === 1) return firstHealth
      return { ok: true, code: 'provider_healthy', message: 'ready' }
    }
  })

  const statePromise = service.getState()
  model = 'gpt-image-1.5'
  resolveFirst({ ok: true, code: 'provider_healthy', message: 'old config ready' })
  const state = await statePromise
  assert.equal(calls, 2)
  assert.equal(state.provider.model, 'gpt-image-1.5')
  assert.equal(state.provider.ready, true)
})

test('creator workflow service stops existing-action generation for human review without auto-approve or import', async () => {
  const commandCalls = []
  const copiedRuns = []
  const logs = []
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-workflow-'))
  const writeRunRecord = (run) => {
    const runDir = path.join(pluginDataDir, 'runs', run.runId)
    fs.mkdirSync(runDir, { recursive: true })
    fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`)
  }
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    assetPath: '/tmp/reference.png',
    assetUrl: 'file:///tmp/reference.png',
    fileName: 'reference.png',
    width: 512,
    height: 512,
    contentHash: 'hash',
    createdAt: '2026-07-02T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z'
  }

  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView({ serviceStatus: 'stopped' })],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId, payload) => {
        commandCalls.push({ commandId, payload })
        if (commandId === 'draft-task') {
          writeRunRecord({
            runId: 'run-001',
            status: 'draft',
            currentStep: 'task_preview',
            reviewStatus: 'pending',
            importStatus: 'not-imported',
            backend: 'provider',
            artifacts: {}
          })
          return {
            commandId,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId: 'run-001',
                taskStatus: 'ready_for_confirmation'
              }
            }
          }
        }
        if (commandId === 'confirm-task') {
          writeRunRecord({
            runId: 'run-001',
            status: 'draft',
            currentStep: 'confirmed',
            reviewStatus: 'pending',
            importStatus: 'not-imported',
            backend: 'provider',
            artifacts: {}
          })
          return {
            commandId,
            result: {
              ok: true,
              message: 'confirmed',
              run: {
                runId: 'run-001',
                taskStatus: 'confirmed'
              }
            }
          }
        }
        if (commandId === 'run-step') {
          writeRunRecord({
            runId: 'run-001',
            status: 'ready_for_review',
            currentStep: 'review',
            reviewStatus: 'pending',
            importStatus: 'not-imported',
            backend: 'provider',
            artifacts: {
              generatedImage: {
                generatedAt: '2026-07-02T10:10:00.000Z',
                outputs: [{
                  dataRelativePath: 'runs/run-001/frames/base/0001.png'
                }],
                conditioning: {
                  mode: 'image-edit',
                  endpoint: '/images/edits',
                  referenceImageCount: 1,
                  multipartImageField: 'image',
                  requestedOutputCount: 1,
                  references: [{
                    fileName: 'canonical-reference.png'
                  }]
                }
              }
            }
          })
          return {
            commandId,
            result: {
              ok: true,
              message: 'generated',
              run: {
                runId: 'run-001',
                status: 'ready_for_review'
              }
            }
          }
        }
        if (commandId === 'approve-run' || commandId === 'import-approved-action') {
          throw new Error('single-action default path must not auto-approve or import')
        }
        throw new Error(`Unexpected command: ${commandId}`)
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: (proposalId) => {
        assert.equal(proposalId, 'proposal:click:spin:test')
        return {
          animations: {
            defaultAction: 'idle',
            clickAction: 'spin',
            actions: [{ id: 'idle' }, { id: 'spin' }]
          }
        }
      }
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: (payload) => {
        copiedRuns.push(payload)
        return {}
      }
    },
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'creator-workflow-1'
  })

  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin quickly'
  })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'review-required')
  assert.equal(result.code, 'human_review_required')
  assert.equal(result.importedAction, null)
  assert.equal(result.clickAction, '')
  assert.equal(result.clickActionChange, null)
  assert.equal(result.run.runId, 'run-001')
  assert.equal(result.run.importedActionId, '')
  assert.equal(result.diagnostics.runStatus, 'ready_for_review')
  assert.equal(result.diagnostics.outputCount, 1)
  assert.equal(result.diagnostics.conditioning.mode, 'image-edit')
  assert.equal(result.diagnostics.conditioning.referenceImageCount, 1)
  assert.equal(result.diagnostics.conditioning.multipartImageField, 'image')
  assert.equal(result.diagnostics.conditioning.requestedOutputCount, 1)
  assert.equal(JSON.stringify(result.diagnostics).includes('canonical-reference.png'), false)
  assert.deepEqual(commandCalls.map((entry) => entry.commandId), [
    'draft-task',
    'confirm-task',
    'run-step'
  ])
  assert.equal(commandCalls[0].payload.generationTask.mode, 'single-action')
  assert.equal(commandCalls[0].payload.generationTask.actions[0].frameCount, 6)
  assert.equal(commandCalls[0].payload.generationTask.actions[0].synthesisMode, 'canonical-frame')
  assert.equal(commandCalls[0].payload.generationTask.actions[0].animationType, 'reaction')
  assert.deepEqual(copiedRuns, [{
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    pluginDataDir,
    runId: 'run-001'
  }])
  assert.deepEqual(logs.map((entry) => entry.event), [
    'creator.workflow.started',
    'creator.workflow.stage.completed',
    'creator.workflow.stage.completed',
    'creator.workflow.stage.completed',
    'creator.workflow.human-review-required'
  ])
  assert.equal(logs[0].details.requestId, 'creator-workflow-1')
  assert.equal(logs.at(-1).event, 'creator.workflow.human-review-required')
  assert.equal(JSON.stringify(logs).includes('spin quickly'), false)
})

test('creator workflow service surfaces failed run diagnostics from Creator Studio run records', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-workflow-failed-'))
  const runId = 'run-failed'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'failed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    backendStatus: {
      state: 'failed',
      message: 'Provider queue overloaded'
    },
    error: 'Provider queue overloaded',
    artifacts: {
      generatedImage: {
        failedAt: '2026-07-02T10:20:00.000Z',
        outputs: [],
        failure: {
          message: 'Provider queue overloaded'
        },
        conditioning: {
          mode: 'image-edit',
          endpoint: '/images/edits',
          referenceImageCount: 1,
          multipartImageField: 'image',
          requestedOutputCount: 1,
          references: [{
            fileName: 'canonical-reference.png'
          }]
        }
      }
    }
  }, null, 2)}\n`)
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    assetPath: '/tmp/reference.png',
    assetUrl: 'file:///tmp/reference.png',
    fileName: 'reference.png',
    width: 512,
    height: 512,
    contentHash: 'hash',
    createdAt: '2026-07-02T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z'
  }

  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView({ serviceStatus: 'stopped' })],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId) => {
        if (commandId === 'draft-task') {
          return {
            commandId,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId,
                taskStatus: 'confirmed'
              }
            }
          }
        }
        if (commandId === 'run-step') {
          throw new Error('Provider queue overloaded')
        }
        throw new Error(`Unexpected command: ${commandId}`)
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin quickly'
  })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'review-required')
  assert.equal(result.run.runId, runId)
  assert.equal(result.diagnostics.runStatus, 'failed')
  assert.equal(result.diagnostics.backendState, 'failed')
  assert.equal(result.diagnostics.attemptStatus, 'failed')
  assert.equal(result.diagnostics.failedAt, '2026-07-02T10:20:00.000Z')
  assert.equal(result.diagnostics.failureReason, 'Provider queue overloaded')
  assert.equal(result.diagnostics.conditioning.endpoint, '/images/edits')
})

test('creator workflow service settles a fresh generating lease after the active command stops', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-stale-command-'))
  const logs = []
  const runId = 'run-stale-command'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    fileName: 'reference.png',
    width: 512,
    height: 512,
    contentHash: 'hash'
  }
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView({ serviceStatus: 'stopped' })],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId) => {
        if (commandId === 'draft-task') {
          return {
            commandId,
            result: { ok: true, run: { runId, status: 'draft', taskStatus: 'confirmed' } }
          }
        }
        if (commandId === 'run-step') {
          fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
            runId,
            status: 'generating',
            taskStatus: 'confirmed',
            currentStep: 'canonical-candidates',
            backend: 'provider',
            backendStatus: { backend: 'provider', state: 'running', message: 'Generating canonical identity candidates' },
            generationLease: {
              commandId: 'quality-first-identity',
              leaseId: 'stale-command-lease',
              startedAt: '2026-07-25T00:05:30.000Z',
              heartbeatAt: '2026-07-25T00:05:59.000Z'
            }
          }, null, 2)}\n`)
          throw new Error('Command stopped')
        }
        throw new Error(`Unexpected command: ${commandId}`)
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: () => ({})
    },
    appLogService: { record: (entry) => logs.push(entry) },
    nowMs: () => Date.parse('2026-07-25T00:06:00.000Z')
  })

  const result = await service.generateExistingAction({ actionName: 'spin', motionPrompt: 'spin' })

  assert.equal(result.state, 'review-required')
  assert.equal(result.diagnostics.runStatus, 'failed')
  assert.equal(result.diagnostics.failureReason, 'generation-command-terminated')
  assert.equal(readRun({ dataDir: pluginDataDir, runId }).status, 'failed')
  assert.equal(logs.at(-1).event, 'creator.workflow.failed')
  assert.equal(logs.at(-1).details.lastCommandId, 'run-step')
})

test('creator workflow state polling reuses the preflight health result while generation is active', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-health-poll-'))
  let now = 0
  let healthCalls = 0
  let releaseGenerate
  const generateGate = new Promise((resolve) => { releaseGenerate = resolve })
  let runStepStarted
  const runStepGate = new Promise((resolve) => { runStepStarted = resolve })
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    fileName: 'reference.png',
    width: 512,
    height: 512,
    contentHash: 'hash'
  }
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView({ serviceStatus: 'stopped' })],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId) => {
        if (commandId === 'draft-task') {
          return { commandId, result: { ok: true, run: { runId: 'run-health-poll', status: 'draft', taskStatus: 'confirmed' } } }
        }
        if (commandId === 'run-step') {
          runStepStarted()
          await generateGate
          return { commandId, result: { ok: true, run: { runId: 'run-health-poll', status: 'ready_for_review', taskStatus: 'confirmed', currentStep: 'review' } } }
        }
        throw new Error(`Unexpected command: ${commandId}`)
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => {
        healthCalls += 1
        return { ok: true, code: 'provider_healthy', message: 'ok' }
      },
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: () => ({})
    },
    nowMs: () => now
  })

  const pending = service.generateExistingAction({ actionName: 'spin', motionPrompt: 'spin' })
  await runStepGate
  assert.equal(healthCalls, 1)
  now = 31000
  await service.getState()
  await service.getState()
  assert.equal(healthCalls, 1)

  releaseGenerate()
  await pending
  now = 62000
  await service.getState()
  assert.equal(healthCalls, 2)
})

test('creator workflow service failure logs do not include raw prompt or file-path error text', async () => {
  const logs = []
  const sensitiveError = new Error('Prompt "spin quickly" failed at /Users/mango/private/reference.png')
  sensitiveError.code = 'provider_failed'
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    assetPath: '/tmp/reference.png',
    assetUrl: 'file:///tmp/reference.png',
    fileName: 'reference.png',
    width: 512,
    height: 512,
    contentHash: 'hash',
    createdAt: '2026-07-02T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z'
  }
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-workflow-log-')),
      runCommand: async (_pluginId, commandId) => {
        if (commandId === 'draft-task') {
          return {
            commandId,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId: 'run-unsafe-failure',
                taskStatus: 'ready_for_confirmation'
              }
            }
          }
        }
        throw sensitiveError
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: () => ({})
    },
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'creator-workflow-unsafe-1'
  })

  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin quickly'
  })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'review-required')
  assert.equal(logs.at(-1).event, 'creator.workflow.failed')
  assert.equal(logs.at(-1).message, 'Creator workflow failed')
  assert.equal(logs.at(-1).details.errorCode, 'provider_failed')
  assert.match(logs.at(-1).details.errorMessage, /\[redacted-prompt\]/)
  assert.match(logs.at(-1).details.errorMessage, /\[redacted-path\]/)
  assert.equal(JSON.stringify(logs).includes('spin quickly'), false)
  assert.equal(JSON.stringify(logs).includes('/Users/mango/private/reference.png'), false)
})

test('creator workflow service returns preview-ready for new-character output without official action rows', async () => {
  const bindCalls = []
  const copyCalls = []
  const commandCalls = []
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-full-pet-'))
  const writeAtlasQa = () => {
    const qaDir = path.join(pluginDataDir, 'runs', 'run-002', 'qa')
    fs.mkdirSync(qaDir, { recursive: true })
    fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
      ok: true,
      basicActions: {
        baseIdentityCoverage: true,
        requiredRealActionIds: [],
        realActionIds: [],
        fallbackActionIds: ['idle', 'waving', 'waiting'],
        missingRequiredActionIds: [],
        // Partial coverage evidence with only the default required idle gate.
        availableActionIds: [],
        requiredActionIds: ['idle'],
        missingRequiredActionIds: ['idle'],
        previewFallbackActionIds: ['idle', 'waving', 'waiting'],
        rows: [
          { actionId: 'idle', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-002/frames/base/0001.png', fallback: true, quality: 'base-preview' },
          { actionId: 'waving', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-002/frames/base/0001.png', fallback: true, quality: 'synthesized-preview' },
          { actionId: 'waiting', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-002/frames/base/0001.png', fallback: true, quality: 'synthesized-preview' }
        ]
      }
    }, null, 2)}\n`)
  }
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView({ serviceStatus: 'stopped' })],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId) => {
        commandCalls.push(commandId)
        if (commandId === 'draft-task') {
          return {
            commandId,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId: 'run-002',
                taskStatus: 'ready_for_confirmation'
              }
            }
          }
        }
        if (commandId === 'confirm-task') {
          return {
            commandId,
            result: {
              ok: true,
              message: 'confirmed',
              run: {
                runId: 'run-002',
                taskStatus: 'confirmed'
              }
            }
          }
        }
        if (commandId === 'run-step') {
          writeAtlasQa()
          return {
            commandId,
            result: {
              ok: true,
              message: 'generated',
              run: {
                runId: 'run-002',
                status: 'ready_for_review'
              }
            }
          }
        }
        if (commandId === 'approve-run') {
          throw new Error('preview-only runs must not be auto-approved')
        }
        if (commandId === 'import-approved-pet') {
          throw new Error('preview-only runs must not be imported')
        }
        throw new Error(`Unexpected command: ${commandId}`)
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: ({ targetType, targetId }) => ({
        targetType,
        targetId,
        assetPath: '/tmp/reference.png',
        assetUrl: 'file:///tmp/reference.png',
        fileName: 'reference.png',
        width: 512,
        height: 512,
        contentHash: 'hash',
        createdAt: '2026-07-02T10:00:00.000Z',
        updatedAt: '2026-07-02T10:00:00.000Z'
      }),
      bindReference: async (payload) => {
        bindCalls.push(payload)
        return {
          replaced: false,
          reference: {
            targetType: payload.targetType,
            targetId: payload.targetId
          }
        }
      },
      copyReferenceIntoRun: (payload) => {
        copyCalls.push(payload)
        return {}
      }
    },
    hatchPetAgentService: createReadyHatchPetAgentService()
  })

  const result = await service.generateNewCharacter({
    characterName: 'Mango Cat',
    stylePrompt: 'bright orange helper',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'preview-ready')
  assert.equal(result.code, 'preview_ready')
  assert.equal(result.activePet, null)
  assert.equal(result.run.activatedPackId, '')
  assert.equal(result.basicActions.baseIdentityCoverage, true)
  assert.deepEqual(result.basicActions.realActionIds, [])
  assert.deepEqual(result.basicActions.fallbackActionIds, ['idle', 'waving', 'waiting'])
  // Legacy QA fixtures without availableActionIds/real coverage resolve required set to default idle.
  assert.deepEqual(result.basicActions.requiredActionIds, ['idle'])
  assert.deepEqual(result.basicActions.missingRequiredActionIds, ['idle'])
  assert.equal(result.basicActions.rows.find((row) => row.actionId === 'idle').quality, 'base-preview')
  assert.deepEqual(commandCalls, ['draft-task', 'confirm-task', 'run-step'])
  assert.deepEqual(bindCalls, [{
    targetType: 'pet-pack',
    targetId: 'mango-cat',
    referenceToken: 'token-reference'
  }])
  assert.deepEqual(copyCalls, [{
    targetType: 'pet-pack',
    targetId: 'mango-cat',
    pluginDataDir,
    runId: 'run-002'
  }])
})

test('creator workflow service forwards official row coverage without leaking absolute row paths', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-official-full-pet-'))
  const writeAtlasQa = () => {
    const qaDir = path.join(pluginDataDir, 'runs', 'run-003', 'qa')
    fs.mkdirSync(qaDir, { recursive: true })
    fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
      ok: true,
      basicActions: {
        baseIdentityCoverage: true,
        requiredRealActionIds: [],
        realActionIds: OFFICIAL_FULL_PET_ACTION_IDS,
        fallbackActionIds: [],
        missingRequiredActionIds: [],
        requiredOfficialActionIds: OFFICIAL_FULL_PET_ACTION_IDS,
        previewFallbackActionIds: [],
        missingRequiredOfficialActionIds: [],
        rows: OFFICIAL_FULL_PET_ACTION_IDS.map((actionId) => ({
          actionId,
          sourceActionId: actionId === 'running-left' ? 'running-right' : actionId,
          sourceRelativePath: actionId === 'idle'
            ? '/Users/mango/private/idle-strip.png'
            : `runs/run-003/rows/${actionId}/strip.png`,
          fallback: false,
          quality: actionId === 'running-left' ? 'approved-mirror' : 'row-real'
        }))
      }
    }, null, 2)}\n`)
  }
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId) => {
        if (commandId === 'draft-task') {
          return {
            commandId,
            result: { ok: true, message: 'drafted', run: { runId: 'run-003', taskStatus: 'ready_for_confirmation' } }
          }
        }
        if (commandId === 'confirm-task') {
          return {
            commandId,
            result: { ok: true, message: 'confirmed', run: { runId: 'run-003', taskStatus: 'confirmed' } }
          }
        }
        if (commandId === 'run-step') {
          writeAtlasQa()
          return {
            commandId,
            result: { ok: true, message: 'generated', run: { runId: 'run-003', status: 'ready_for_review' } }
          }
        }
        if (commandId === 'approve-run') {
          return {
            commandId,
            result: { ok: true, message: 'approved', run: { runId: 'run-003', status: 'approved' } }
          }
        }
        if (commandId === 'import-approved-pet') {
          return {
            commandId,
            result: {
              ok: true,
              message: 'imported',
              run: {
                runId: 'run-003',
                status: 'imported',
                importedPackId: 'official-cat',
                activatedPackId: 'official-cat'
              },
              imported: {
                pack: {
                  id: 'official-cat',
                  displayName: 'Official Cat',
                  version: '1.0.0',
                  source: 'creator-studio',
                  actionCount: 9,
                  defaultAction: 'idle',
                  clickAction: 'waving'
                }
              },
              activated: { activePackId: 'official-cat' }
            }
          }
        }
        throw new Error(`Unexpected command: ${commandId}`)
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({ replaced: false, reference: { targetType: 'pet-pack', targetId: 'official-cat' } }),
      copyReferenceIntoRun: () => ({})
    },
    hatchPetAgentService: createReadyHatchPetAgentService()
  })

  const result = await service.generateNewCharacter({
    characterName: 'Official Cat',
    stylePrompt: 'complete official rows',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.basicActions.realActionIds, OFFICIAL_FULL_PET_ACTION_IDS)
  assert.deepEqual(result.basicActions.fallbackActionIds, [])
  assert.deepEqual(result.basicActions.missingRequiredOfficialActionIds, [])
  assert.equal(result.basicActions.rows.find((row) => row.actionId === 'running-left').quality, 'approved-mirror')
  assert.equal(result.basicActions.rows.find((row) => row.actionId === 'idle').sourceRelativePath, '')
  assert.equal(JSON.stringify(result.basicActions).includes('/Users/mango'), false)
})

test('creator workflow service blocks new-character default flow when the approved reference looks like a multi-view collage', async () => {
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async () => {
        throw new Error('should not draft when the reference is unsupported')
      },
      getPluginCreatorDataDir: () => '/tmp/openpet-plugin-data'
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => null,
      inspectApprovedSource: async () => ({
        defaultPathEligible: false,
        code: 'unsupported_multi_view_reference',
        message: '默认一键生成暂只支持单张干净正面图，请改用一张清晰的正面图，不要使用拼图、三视图或多视图合成图。'
      }),
      bindReference: async () => {
        throw new Error('bind should not run for unsupported default-path references')
      },
      copyReferenceIntoRun: () => ({})
    }
  })

  const result = await service.generateNewCharacter({
    characterName: 'Mango Cat',
    stylePrompt: 'bright orange helper',
    referenceImageToken: 'token-reference'
  })

  assert.equal(result.state, 'missing-input')
  assert.equal(result.code, 'unsupported_reference_image')
  assert.match(result.message, /单张干净正面图/)
})

test('creator workflow diagnostics expose stage and action progress for failed full-pet checkpoints', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-progress-failed-'))
  const runId = 'run-progress-failed'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    backendStatus: {
      state: 'failed',
      message: 'Official full-pet row idle failed QA: row_identity_shape_drift'
    },
    error: 'Official full-pet row idle failed QA: row_identity_shape_drift',
    artifacts: {
      generatedImage: {
        outputs: [{ dataRelativePath: 'runs/run-progress-failed/frames/base/0001.png' }],
        conditioning: {
          mode: 'image-edit',
          endpoint: '/images/edits',
          referenceImageCount: 1,
          multipartImageField: 'image',
          requestedOutputCount: 1
        }
      }
    }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: {
      idle: {
        actionId: 'idle',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: 'runs/run-progress-failed/official-row-frames/idle/01.png', sha256: 'a' }]
        },
        updatedAt: '2026-07-19T00:00:00.000Z'
      },
      'running-right': {
        actionId: 'running-right',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: 'runs/run-progress-failed/official-row-frames/running-right/01.png', sha256: 'b' }]
        }
      },
      waving: {
        actionId: 'waving',
        ok: false,
        failureConditions: ['identity-descriptor-distance-high'],
        error: 'identity-descriptor-distance-high'
      }
    }
  }, null, 2)}\n`)

  const diagnostics = __testInternals.readWorkflowDiagnostics({
    pluginDataDir,
    runId
  })

  assert.equal(diagnostics.runStatus, 'failed')
  assert.equal(diagnostics.progress.phase, 'generate')
  assert.equal(diagnostics.progress.phaseLabel, '生成资源')
  assert.match(diagnostics.progress.summary, /row_identity_shape_drift/)
  assert.match(diagnostics.progress.summary, /waving/)
  assert.equal(diagnostics.progress.stages.find((stage) => stage.id === 'generate').status, 'failed')
  assert.equal(diagnostics.progress.stages.find((stage) => stage.id === 'quality-gate').status, 'failed')
  assert.equal(diagnostics.progress.actions.find((action) => action.actionId === 'idle').status, 'passed')
  assert.equal(diagnostics.progress.actions.find((action) => action.actionId === 'running-right').status, 'passed')
  assert.equal(diagnostics.progress.actions.find((action) => action.actionId === 'waving').status, 'failed')
  assert.match(diagnostics.progress.actions.find((action) => action.actionId === 'waving').reason, /identity-descriptor-distance-high/)
  assert.equal(JSON.stringify(diagnostics).includes(pluginDataDir), false)
})

test('creator workflow diagnostics mark generate active while checkpoints are partial', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-progress-running-'))
  const runId = 'run-progress-running'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'generating',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    backendStatus: { state: 'running', message: 'generating' }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: {
      idle: {
        actionId: 'idle',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: 'runs/run-progress-running/official-row-frames/idle/01.png', sha256: 'a' }]
        }
      }
    }
  }, null, 2)}\n`)

  const diagnostics = __testInternals.readWorkflowDiagnostics({
    pluginDataDir,
    runId
  })

  assert.equal(diagnostics.progress.stages.find((stage) => stage.id === 'confirm').status, 'completed')
  assert.equal(diagnostics.progress.stages.find((stage) => stage.id === 'generate').status, 'active')
  assert.equal(diagnostics.progress.actions.find((action) => action.actionId === 'idle').status, 'passed')
  assert.equal(diagnostics.progress.actions.find((action) => action.actionId === 'running-right').status, 'running')
  assert.match(diagnostics.progress.summary, /running-right/)
})

test('creator workflow diagnostics enter review stage for ready_for_review runs', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-progress-review-'))
  const runId = 'run-progress-review'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'ready_for_review',
    taskStatus: 'confirmed',
    currentStep: 'review',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    backendStatus: { state: 'ready', message: 'ready' },
    artifacts: {
      generatedImage: {
        outputs: [{ dataRelativePath: 'runs/run-progress-review/frames/base/0001.png' }],
        conditioning: {
          mode: 'image-edit',
          endpoint: '/images/edits',
          referenceImageCount: 1,
          multipartImageField: 'image',
          requestedOutputCount: 1
        }
      }
    }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: Object.fromEntries([
      'idle',
      'running-right',
      'running-left',
      'waving',
      'jumping',
      'failed',
      'waiting',
      'running',
      'review'
    ].map((actionId) => [actionId, {
      actionId,
      ok: true,
      row: {
        quality: actionId === 'running-left' ? 'approved-mirror' : 'row-real',
        frames: [{ relativePath: `runs/${runId}/official-row-frames/${actionId}/01.png`, sha256: actionId }]
      }
    }]))
  }, null, 2)}\n`)

  const diagnostics = __testInternals.readWorkflowDiagnostics({
    pluginDataDir,
    runId
  })

  assert.equal(diagnostics.progress.phase, 'review')
  assert.equal(diagnostics.progress.stages.find((stage) => stage.id === 'quality-gate').status, 'completed')
  assert.equal(diagnostics.progress.stages.find((stage) => stage.id === 'review').status, 'active')
  assert.equal(diagnostics.progress.actions.find((action) => action.actionId === 'running-left').status, 'mirrored')
  assert.match(diagnostics.progress.summary, /人工复查/)
})

test('creator workflow service rejects overlapping workflow starts while one run is active', async () => {
  let releaseDraft = null
  const draftStarted = new Promise((resolve) => {
    releaseDraft = resolve
  })
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    assetPath: '/tmp/reference.png',
    assetUrl: 'file:///tmp/reference.png',
    fileName: 'reference.png',
    width: 512,
    height: 512,
    contentHash: 'hash',
    createdAt: '2026-07-02T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z'
  }
  const commandCalls = []

  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => '/tmp/openpet-plugin-data',
      runCommand: async (_pluginId, commandId) => {
        commandCalls.push(commandId)
        if (commandId === 'draft-task') {
          await draftStarted
          return {
            commandId,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId: 'run-003',
                taskStatus: 'confirmed',
                status: 'approved'
              }
            }
          }
        }
        if (commandId === 'run-step') {
          return {
            commandId,
            result: {
              ok: true,
              message: 'generated',
              run: {
                runId: 'run-003',
                status: 'approved'
              }
            }
          }
        }
        if (commandId === 'import-approved-action') {
          return {
            commandId,
            result: {
              ok: true,
              message: 'imported',
              run: {
                runId: 'run-003',
                status: 'imported',
                importedActionId: 'spin'
              },
              importedAction: {
                id: 'spin'
              },
              triggerProposalSubmission: {
                ok: true,
                proposal: {
                  id: 'proposal:click:spin:deferred'
                }
              }
            }
          }
        }
        throw new Error(`Unexpected command: ${commandId}`)
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'spin' } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const firstRunPromise = service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin quickly'
  })

  await new Promise((resolve) => setImmediate(resolve))

  const overlapping = await service.generateExistingAction({
    actionName: 'wave',
    motionPrompt: 'wave slowly'
  })

  assert.equal(overlapping.ok, true)
  assert.equal(overlapping.state, 'generating')
  assert.equal(overlapping.code, 'workflow_in_progress')
  assert.match(overlapping.message, /正在进行/i)
  assert.equal(overlapping.run.state, 'generating')
  assert.equal(commandCalls.length, 1)

  releaseDraft()
  const firstRun = await firstRunPromise
  assert.equal(firstRun.state, 'review-required')
  assert.equal(firstRun.code, 'human_review_required')
  assert.equal(firstRun.clickAction, '')
  assert.deepEqual(commandCalls, ['draft-task', 'run-step'])
})

test('creator workflow service clears transient generating state when a locked workflow exits before drafting', async () => {
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => '/tmp/openpet-plugin-data',
      runCommand: async () => {
        throw new Error('runCommand should not be reached for invalid reference input')
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => {
        throw new Error('Creator reference source image does not exist')
      },
      copyReferenceIntoRun: () => ({})
    }
  })

  const result = await service.generateExistingAction({
    actionName: 'spin',
    motionPrompt: 'spin quickly',
    referenceImageToken: 'token-missing-reference'
  })

  assert.equal(result.state, 'missing-input')
  assert.equal(result.code, 'invalid_reference_image')

  const lastRun = await service.getLastRun()
  assert.deepEqual(lastRun, {
    ok: true,
    run: null
  })
})

test('creator workflow service blocks existing-action default flow when the stored reference looks like a multi-view collage', async () => {
  const reference = {
    targetType: EDITABLE_TARGET_TYPE,
    targetId: EDITABLE_TARGET_ID,
    assetPath: '/tmp/reference.png',
    assetUrl: 'file:///tmp/reference.png',
    fileName: 'reference.png',
    width: 512,
    height: 180,
    contentHash: 'hash',
    createdAt: '2026-07-05T00:00:00.000Z',
    updatedAt: '2026-07-05T00:00:00.000Z'
  }
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async () => {
        throw new Error('should not draft when the stored reference is unsupported')
      },
      getPluginCreatorDataDir: () => '/tmp/openpet-plugin-data'
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      inspectReference: async () => ({
        defaultPathEligible: false,
        code: 'unsupported_multi_view_reference',
        message: '默认一键生成暂只支持单张干净正面图，请改用一张清晰的正面图，不要使用拼图、三视图或多视图合成图。'
      }),
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const result = await service.generateExistingAction({
    actionName: 'shy-spin',
    motionPrompt: 'spin shyly'
  })

  assert.equal(result.state, 'missing-input')
  assert.equal(result.code, 'unsupported_reference_image')
  assert.match(result.message, /单张干净正面图/)
})


test('creator workflow progress polling attaches diagnostics onto lastRun during generation', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-progress-live-'))
  const runId = 'run-progress-live'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'generating',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    backendStatus: { state: 'running', message: 'generating' }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: {
      idle: {
        actionId: 'idle',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: 'runs/run-progress-live/official-row-frames/idle/01.png', sha256: 'a' }]
        }
      }
    }
  }, null, 2)}\n`)

  let releaseGenerate
  const generateGate = new Promise((resolve) => {
    releaseGenerate = resolve
  })

  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => pluginDataDir,
     runCommand: async (_pluginId, commandId) => {
       if (commandId === 'draft-task') {
         return {
           ok: true,
           commandId,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId,
                status: 'draft',
                taskStatus: 'ready_for_confirmation',
                currentStep: 'confirm'
              }
            }
         }
       }
       if (commandId === 'confirm-task') {
         return {
           ok: true,
           commandId,
            result: {
              ok: true,
              message: 'confirmed',
              run: {
                runId,
                status: 'draft',
                taskStatus: 'confirmed',
                currentStep: 'generate'
              }
            }
         }
       }
       if (commandId === 'run-step') {
         await generateGate
         return {
           ok: true,
           commandId,
            result: {
              ok: true,
              message: 'generated',
              run: {
                runId,
                status: 'ready_for_review',
                taskStatus: 'confirmed',
                currentStep: 'review',
                reviewStatus: 'pending'
              }
            }
         }
       }
        throw new Error(`unexpected command ${commandId}`)
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { clickAction: 'wave' } })
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({ replaced: true, reference: { fileName: 'ref.png', updatedAt: '2026-07-19T00:00:00.000Z' } }),
      copyReferenceIntoRun: () => ({}),
      inspectApprovedSource: async () => ({ defaultPathEligible: true })
    },
    hatchPetAgentService: createReadyHatchPetAgentService()
  })

  const pending = service.generateNewCharacter({
    characterName: 'Live Progress Cat',
    stylePrompt: 'soft orange helper cat',
    referenceImageToken: 'token-live'
  })

  let sawDiagnostics = false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    const lastRun = (await service.getLastRun()).run
    if (lastRun?.diagnostics?.progress?.actions?.length) {
      assert.equal(lastRun.state, 'generating')
      assert.equal(lastRun.runId, runId)
      assert.equal(lastRun.diagnostics.progress.actions.find((action) => action.actionId === 'idle').status, 'passed')
      assert.equal(lastRun.diagnostics.progress.actions.find((action) => action.actionId === 'running-right').status, 'running')
      assert.ok(String(lastRun.message || '').length > 0)
      sawDiagnostics = true
      break
    }
  }

 releaseGenerate()
 const result = await pending
 assert.equal(sawDiagnostics, true)
  assert.ok(['review-required', 'preview-ready'].includes(result.state))
 assert.ok(result.diagnostics?.progress)
})


test('creator workflow diagnostics expose failed assets and prompt metadata without absolute paths', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-assets-'))
  const runId = 'run-assets-failed'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const frameDir = path.join(runDir, 'official-row-frames', 'waving')
  const promptPath = path.join(runDir, 'prompts', 'rows', 'waving.md')
  const retryPromptPath = path.join(runDir, 'prompts', 'keyframes', 'actions', 'waving-peak-keyframe-soft-retry.md')
  const framePath = path.join(frameDir, '01.png')
  fs.mkdirSync(frameDir, { recursive: true })
  fs.mkdirSync(path.dirname(promptPath), { recursive: true })
  fs.mkdirSync(path.dirname(retryPromptPath), { recursive: true })
  // minimal PNG
  fs.writeFileSync(framePath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  ))
  fs.writeFileSync(promptPath, 'Keep identity stable while waving the front paw.\n')
  fs.writeFileSync(retryPromptPath, 'Soft retry: strengthen canonical identity lock for the waving peak.\n')
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    backendStatus: { state: 'failed', message: 'identity-descriptor-distance-high' },
    error: 'Official full-pet row waving failed QA: identity-descriptor-distance-high',
    artifacts: {
      generatedImage: {
        outputs: [{ dataRelativePath: `runs/${runId}/frames/base/0001.png` }],
        conditioning: {
          mode: 'image-edit',
          endpoint: '/images/edits',
          referenceImageCount: 1,
          multipartImageField: 'image',
          requestedOutputCount: 1
        }
      }
    }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: {
      idle: {
        actionId: 'idle',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: `runs/${runId}/official-row-frames/idle/01.png`, sha256: 'a' }]
        }
      },
      waving: {
        actionId: 'waving',
        ok: false,
        failureConditions: ['identity-descriptor-distance-high'],
        error: 'identity-descriptor-distance-high',
        keyframes: [{
          relativePath: `runs/${runId}/official-row-frames/waving/01.png`,
          role: 'peak',
          promptRelativePath: `runs/${runId}/prompts/keyframes/actions/waving-peak-keyframe-soft-retry.md`
        }],
        row: {
          quality: 'failed',
          frames: [{ relativePath: `runs/${runId}/official-row-frames/waving/01.png`, sha256: 'b' }]
        }
      }
    }
  }, null, 2)}\n`)

  // also create idle frame for completeness of file existence in collect
  const idleDir = path.join(runDir, 'official-row-frames', 'idle')
  fs.mkdirSync(idleDir, { recursive: true })
  fs.writeFileSync(path.join(idleDir, '01.png'), fs.readFileSync(framePath))

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
  const waving = diagnostics.progress.actions.find((action) => action.actionId === 'waving')
  assert.equal(waving.status, 'failed')
  assert.equal(waving.importable, false)
  assert.ok(Array.isArray(waving.assets) && waving.assets.length > 0)
  assert.ok(waving.assets.some((asset) => asset.kind === 'frame' || asset.kind === 'keyframe'))
  assert.match(waving.promptText, /Soft retry: strengthen canonical identity lock/)
  assert.ok(Array.isArray(diagnostics.progress.actionAssets))
  assert.ok(diagnostics.progress.actionAssets.some((asset) => asset.actionId === 'waving' && asset.relativePath.includes('official-row-frames/waving')))
  assert.equal(diagnostics.progress.failedActionIds.includes('waving'), true)
  assert.equal(diagnostics.progress.availableActionIds.includes('idle'), true)
  assert.equal(diagnostics.progress.completeness, 'partial')
  assert.equal(JSON.stringify(diagnostics).includes(pluginDataDir), false)
  assert.equal(JSON.stringify(diagnostics).includes(runDir), false)
})

test('creator workflow diagnostics expose renderer-safe quality-first identity candidates', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-quality-first-review-'))
  const runId = 'run-quality-first-review'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const candidateDir = path.join(runDir, 'candidates', 'canonical', 'canonical-1', 'raw')
  const warnedCandidateDir = path.join(runDir, 'candidates', 'canonical', 'canonical-4', 'raw')
  const actionCandidateDir = path.join(runDir, 'candidates', 'idle', 'candidate-2', 'raw')
  const actionRecordDir = path.join(runDir, 'candidates', 'action-idle', 'candidate-2')
  fs.mkdirSync(candidateDir, { recursive: true })
  fs.mkdirSync(warnedCandidateDir, { recursive: true })
  fs.mkdirSync(actionCandidateDir, { recursive: true })
  fs.mkdirSync(actionRecordDir, { recursive: true })
  fs.mkdirSync(path.join(runDir, 'budgets'), { recursive: true })
  fs.writeFileSync(path.join(candidateDir, 'candidate.png'), LEGACY_PNG_BYTES)
  fs.writeFileSync(path.join(warnedCandidateDir, 'candidate.png'), LEGACY_PNG_BYTES)
  fs.writeFileSync(path.join(actionCandidateDir, 'candidate.png'), LEGACY_PNG_BYTES)
  const retainedImageHash = crypto.createHash('sha256').update(LEGACY_PNG_BYTES).digest('hex')
  fs.writeFileSync(path.join(actionRecordDir, 'candidate.json'), `${JSON.stringify({
    version: 1,
    runId,
    scope: 'action-idle',
    candidate: {
      candidateId: 'candidate-2',
      sha256: retainedImageHash,
      technicalEligible: true,
      recommended: false,
      technicalFailureCodes: [],
      qualityWarningCodes: ['visual-defect-motion-unreadable'],
      model: 'gpt-image-2',
      bindings: {
        planHash: 'p'.repeat(64),
        canonicalHash: retainedImageHash,
        profileHash: '',
        processorVersion: 1,
        qualityProfileHash: getQualityFirstQualityProfile().hash
      },
      artifacts: [{ role: 'raw-sheet', relativePath: `runs/${runId}/candidates/idle/candidate-2/raw/candidate.png`, sha256: retainedImageHash }]
    }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'budgets', 'ledger.json'), `${JSON.stringify({
    version: 1,
    startedAtMs: Date.now() - 1000,
    limits: { maxProviderCalls: 72, maxPlannerCalls: 34, maxEvaluatorCalls: 68, maxElapsedMs: 43200000, maxEstimatedCost: null },
    usage: { providerCalls: 5, providerFailures: 1, plannerCalls: 1, evaluatorCalls: 3, estimatedCost: 0.4, costKnown: true },
    reservations: {}
  })}\n`)
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'ready_for_review',
    currentStep: 'review',
    reviewStatus: 'pending',
    generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1' },
    qualityFirst: {
      version: 1,
      phase: 'ready_for_review',
      planHash: 'p'.repeat(64),
      nextAction: 'human-review',
      package: {
        visualEvaluation: {
          recommended: false,
          qualityWarningCodes: ['visual-score-overall-below-minimum'],
          evidenceRelativePath: `runs/${runId}/evaluations/final-package.json`,
          boardRelativePath: `runs/${runId}/evaluations/final-package-review-board.png`
        }
      },
      requireIdentityReviewBeforeActions: false,
      selectedCanonical: { candidateId: 'canonical-1', sha256: retainedImageHash },
      acceptedCanonical: { candidateId: 'canonical-1', sha256: retainedImageHash },
      actionResults: {
        idle: {
          ok: true,
          disposition: 'accepted',
          selectedCandidateId: 'candidate-1',
          diversityStatus: 'degraded',
          warningCodes: ['action_candidate_diversity_insufficient'],
          distinctCandidateCount: 1,
          evaluatedCandidateCount: 2,
          candidates: [{ candidateId: 'candidate-1' }, {
            candidateId: 'candidate-2',
            sha256: retainedImageHash,
            technicalEligible: true,
            recommended: false,
            qualityWarningCodes: ['visual-defect-motion-unreadable'],
            candidateRecordRelativePath: `runs/${runId}/candidates/action-idle/candidate-2/candidate.json`
          }]
        }
      },
      canonicalCandidates: [{
        candidateId: 'canonical-1',
        eligible: true,
        disposition: 'selected-anchor',
        sha256: retainedImageHash,
        score: 94,
        model: 'gpt-image-2',
        relativePath: `runs/${runId}/candidates/canonical/canonical-1/raw/candidate.png`,
        promptRelativePath: `runs/${runId}/prompts/quality-first/canonical-1.txt`,
        failureCodes: []
      }, {
        candidateId: 'canonical-2',
        eligible: true,
        disposition: 'duplicate-alternate',
        sha256: 'b'.repeat(64),
        score: 58,
        relativePath: '/Users/private/should-not-leak.png',
        duplicateOfCandidateId: 'canonical-1',
        failureCodes: []
      }, {
        candidateId: 'canonical-4',
        eligible: false,
        technicalEligible: true,
        recommended: false,
        disposition: 'selectable-with-warning',
        sha256: retainedImageHash,
        score: 68,
        relativePath: `runs/${runId}/candidates/canonical/canonical-4/raw/candidate.png`,
        qualityWarningCodes: ['visual-defect-identity-drift', 'visual-score-overall-below-minimum'],
        failureCodes: ['visual-defect-identity-drift', 'visual-score-overall-below-minimum']
      }]
    }
  }, null, 2)}\n`)

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
  assert.equal(diagnostics.progress.phase, 'ready_for_review')
  assert.equal(diagnostics.progress.qualityFirst.phase, 'ready_for_review')
  assert.equal(diagnostics.progress.qualityFirst.nextAction, 'human-review')
  assert.equal(diagnostics.progress.qualityFirst.packageReview.recommended, false)
  assert.deepEqual(diagnostics.progress.qualityFirst.packageReview.qualityWarningCodes, ['visual-score-overall-below-minimum'])
  assert.equal(diagnostics.progress.qualityFirst.packageReview.evidenceRelativePath, `runs/${runId}/evaluations/final-package.json`)
  assert.equal(diagnostics.progress.qualityFirst.identityReview.status, 'selected')
  assert.equal(diagnostics.progress.qualityFirst.identityReview.selectedCandidateId, 'canonical-1')
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates.length, 3)
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[0].previewable, true)
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[0].disposition, 'selected-anchor')
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[1].disposition, 'duplicate-alternate')
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[1].relativePath, '')
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[2].technicalEligible, true)
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[2].recommended, false)
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[2].selectionState, 'selectable-with-warning')
  assert.deepEqual(diagnostics.progress.qualityFirst.identityReview.candidates[2].qualityWarningCodes, ['visual-defect-identity-drift', 'visual-score-overall-below-minimum'])
  assert.equal(diagnostics.progress.qualityFirst.budget.usage.providerCalls, 5)
  assert.equal(diagnostics.progress.qualityFirst.budget.usage.providerFailures, 1)
  assert.equal(diagnostics.progress.qualityFirst.budget.remaining.providerCalls, 67)
  assert.equal(diagnostics.progress.qualityFirst.budget.remaining.evaluatorCalls, 65)
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.ok, true)
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.diversityStatus, 'degraded')
  assert.deepEqual(diagnostics.progress.qualityFirst.actionResults.idle.warningCodes, ['action_candidate_diversity_insufficient'])
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.distinctCandidateCount, 1)
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.evaluatedCandidateCount, 2)
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.candidates.length, 2)
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.candidates[1].technicalEligible, true)
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.candidates[1].recommended, false)
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.candidates[1].selectionState, 'selectable-with-warning')
  assert.equal(diagnostics.progress.qualityFirst.actionResults.idle.candidates[1].relativePath, `runs/${runId}/candidates/idle/candidate-2/raw/candidate.png`)
  assert.doesNotMatch(JSON.stringify(diagnostics), /\/Users\/private/)
})

test('creator workflow diagnostics reconstruct legacy action eligibility only from complete verified artifacts', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-legacy-candidate-'))
  const runId = 'run-legacy-candidate-review'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const planHash = 'p'.repeat(64)
  const canonicalHash = 'c'.repeat(64)
  const profileHash = 's'.repeat(64)
  const createLegacyCandidate = ({ candidateId, complete, bound = true }) => {
    const roles = complete ? ['raw-sheet', 'processed-sheet', 'contact-sheet', 'gif'] : ['raw-sheet']
    const artifacts = roles.map((role) => {
      const relativePath = `runs/${runId}/candidates/waving/${candidateId}/${role}.${role === 'gif' ? 'gif' : 'png'}`
      const bytes = role === 'gif' ? LEGACY_GIF_BYTES : LEGACY_PNG_BYTES
      const absolutePath = path.join(pluginDataDir, relativePath)
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
      fs.writeFileSync(absolutePath, bytes)
      return { role, relativePath, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
    })
    const recordRelativePath = `runs/${runId}/candidates/action-waving/${candidateId}/candidate.json`
    const recordPath = path.join(pluginDataDir, recordRelativePath)
    fs.mkdirSync(path.dirname(recordPath), { recursive: true })
    fs.writeFileSync(recordPath, `${JSON.stringify({
      version: 1,
      runId,
      scope: 'action-waving',
      candidate: {
        candidateId,
        sha256: artifacts[0].sha256,
        eligible: true,
        ...(bound ? {
          bindings: {
            planHash,
            canonicalHash,
            profileHash,
            processorVersion: 1,
            qualityProfileHash: getQualityFirstQualityProfile().hash
          }
        } : {}),
        artifacts,
        qa: { ok: true, failures: [] },
        gate: { ok: false, outcome: 'reject', failures: ['visual-score-overall-below-minimum'] }
      }
    }, null, 2)}\n`)
    return { candidateId, sha256: artifacts[0].sha256, candidateRecordRelativePath: recordRelativePath }
  }
  const complete = createLegacyCandidate({ candidateId: 'candidate-complete', complete: true })
  const incomplete = createLegacyCandidate({ candidateId: 'candidate-incomplete', complete: false })
  const unbound = {
    ...createLegacyCandidate({ candidateId: 'candidate-unbound', complete: true, bound: false }),
    bindings: {
      planHash,
      canonicalHash,
      profileHash,
      processorVersion: 1,
      qualityProfileHash: getQualityFirstQualityProfile().hash
    }
  }
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'ready_for_review',
    currentStep: 'review',
    generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1' },
    qualityFirst: {
      phase: 'ready_for_review',
      planHash,
      acceptedCanonical: { candidateId: 'canonical-1', sha256: canonicalHash },
      scaleProfileHash: profileHash,
      actionResults: {
        waving: { ok: false, candidates: [complete, { ...incomplete, eligible: true }, unbound] }
      }
    }
  }, null, 2)}\n`)

  const candidates = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
    .progress.qualityFirst.actionResults.waving.candidates
  assert.equal(candidates[0].technicalEligible, true)
  assert.equal(candidates[0].recommended, false)
  assert.equal(candidates[0].selectionState, 'selectable-with-warning')
  assert.equal(candidates[1].technicalEligible, false)
  assert.equal(candidates[1].selectionState, 'technically-unusable')
  assert.equal(candidates[2].technicalEligible, false)
  assert.equal(candidates[2].selectionState, 'technically-unusable')
  assert.deepEqual(candidates[2].technicalFailureCodes, ['candidate-binding-stale'])
})

test('creator workflow diagnostics do not present hash-matched non-image legacy canonical bytes as selectable', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-legacy-canonical-decode-'))
  const runId = 'run-legacy-canonical-decode'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const relativePath = `runs/${runId}/candidates/canonical/canonical-broken/raw/0001.png`
  const absolutePath = path.join(pluginDataDir, relativePath)
  const bytes = Buffer.from('not-an-image')
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, bytes)
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1' },
    qualityFirst: {
      phase: 'awaiting_identity_review',
      canonicalCandidates: [{
        candidateId: 'canonical-broken',
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        relativePath,
        eligible: false,
        gate: { ok: false, failures: ['visual-score-overall-below-minimum'] }
      }]
    }
  }, null, 2)}\n`)

  const candidate = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
    .progress.qualityFirst.identityReview.candidates[0]
  assert.equal(candidate.previewable, false)
  assert.equal(candidate.technicalEligible, false)
  assert.equal(candidate.selectionState, 'technically-unusable')
})

test('creator workflow diagnostics revoke stored technical eligibility when the retained asset is missing', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-missing-selected-candidate-'))
  const runId = 'run-missing-selected-candidate'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const relativePath = `runs/${runId}/candidates/canonical/canonical-selected/raw/0001.png`
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'ready_for_review',
    currentStep: 'review',
    generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1' },
    qualityFirst: {
      phase: 'ready_for_review',
      acceptedCanonical: { candidateId: 'canonical-selected', sha256: 'a'.repeat(64) },
      canonicalCandidates: [{
        candidateId: 'canonical-selected',
        sha256: 'a'.repeat(64),
        relativePath,
        technicalEligible: true,
        recommended: true,
        selection: {
          candidateId: 'canonical-selected',
          sha256: 'a'.repeat(64),
          selectionAuthority: 'human-override',
          qualityOverride: false,
          acknowledgedWarningCodes: [],
          selectedAt: '2026-07-29T00:00:00.000Z'
        }
      }]
    }
  }, null, 2)}\n`)

  const candidate = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
    .progress.qualityFirst.identityReview.candidates[0]
  assert.equal(candidate.previewable, false)
  assert.equal(candidate.technicalEligible, false)
  assert.equal(candidate.selectionState, 'technically-unusable')
})

test('creator workflow diagnostics do not treat a running backend message as a failure reason', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-running-message-'))
  const runId = 'run-running-message'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'generating',
    taskStatus: 'confirmed',
    currentStep: 'canonical-candidates',
    backendStatus: { state: 'running', message: 'Generating canonical identity candidates' }
  }, null, 2)}\n`)

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })

  assert.equal(diagnostics.runStatus, 'generating')
  assert.equal(diagnostics.failureReason, '')
  assert.equal(diagnostics.progress.failureReason, '')
  assert.doesNotMatch(diagnostics.progress.summary, /生成失败|失败原因/)
})

test('creator workflow diagnostics expose a failed identity pool without absolute paths or prompt bodies', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-failed-identity-pool-'))
  const runId = 'run-failed-identity-pool'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const candidatePath = path.join(runDir, 'candidates', 'canonical', 'canonical-1', 'raw', '0001.png')
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true })
  fs.writeFileSync(candidatePath, LEGACY_PNG_BYTES)
  const candidateRecordRelativePath = `runs/${runId}/candidates/canonical/canonical-1/candidate.json`
  fs.writeFileSync(path.join(pluginDataDir, candidateRecordRelativePath), `${JSON.stringify({
    version: 1,
    runId,
    scope: 'canonical',
    candidate: {
      candidateId: 'canonical-1',
      failureCodes: ['provider_http_error'],
      modelAttempts: [{
        model: 'gpt-image-2',
        ok: false,
        errorCode: 'provider_http_error',
        httpStatus: 524,
        timeoutMs: 120000,
        durationMs: 119000,
        requestId: 'request-524'
      }]
    }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'canonical-candidates',
    error: 'canonical_identity_candidates_unusable',
    backendStatus: { state: 'failed', message: 'canonical_identity_candidates_unusable' },
    qualityFirst: {
      version: 1,
      phase: 'identity-generation-failed',
      failureCode: 'canonical_identity_candidates_unusable',
      dispatchCount: 4,
      passingCandidateCount: 0,
      nextAction: 'retry-identity',
      canonicalCandidates: [{
        candidateId: 'canonical-1',
        eligible: false,
        disposition: 'unusable',
        sha256: 'a'.repeat(64),
        relativePath: `runs/${runId}/candidates/canonical/canonical-1/raw/0001.png`,
        candidateRecordRelativePath,
        attemptKind: 'initial',
        diversityProfileId: 'identity-faithful-balanced-v1',
        failureCodes: ['identity-gate-failed'],
        promptText: 'secret prompt body'
      }, {
        candidateId: 'canonical-2',
        eligible: false,
        disposition: 'unusable',
        sha256: 'b'.repeat(64),
        relativePath: '/Users/mango/private.png',
        attemptKind: 'duplicate-replacement',
        diversityProfileId: 'identity-safe-alternate-neutral-v1',
        duplicateOfCandidateId: 'canonical-1',
        failureCodes: ['incomplete-subject'],
        previewDataUrl: 'data:image/png;base64,secret'
      }]
    }
  }, null, 2)}\n`)

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
  const qualityFirst = diagnostics.progress.qualityFirst

  assert.equal(diagnostics.runStatus, 'failed')
  assert.match(diagnostics.failureReason, /没有|0 个|不可用/)
  assert.match(diagnostics.failureReason, /身份候选|canonical identity/i)
  assert.equal(qualityFirst.phase, 'identity-generation-failed')
  assert.equal(qualityFirst.failureCode, 'canonical_identity_candidates_unusable')
  assert.equal(qualityFirst.dispatchCount, 4)
  assert.equal(qualityFirst.passingCandidateCount, 0)
  assert.equal(qualityFirst.nextAction, 'retry-identity')
  assert.equal(qualityFirst.identityReview.status, 'failed')
  assert.equal(qualityFirst.identityReview.candidates[0].previewable, true)
  assert.deepEqual(qualityFirst.identityReview.candidates[0].modelAttempts, [{
    model: 'gpt-image-2',
    ok: false,
    errorCode: 'provider_http_error',
    httpStatus: 524,
    timeoutMs: 120000,
    durationMs: 119000,
    requestId: 'request-524'
  }])
  assert.equal(qualityFirst.identityReview.candidates[1].relativePath, '')
  assert.equal(qualityFirst.identityReview.candidates[1].duplicateOfCandidateId, 'canonical-1')
  assert.equal(qualityFirst.identityReview.candidates[1].attemptKind, 'duplicate-replacement')
  assert.equal(qualityFirst.identityReview.candidates[1].diversityProfileId, 'identity-safe-alternate-neutral-v1')
  assert.match(diagnostics.progress.summary, /没有|0 个|不可用/)
  assert.doesNotMatch(JSON.stringify(diagnostics), /\/Users\/mango|data:image|secret prompt body/i)
})

test('creator workflow accepts a warned canonical identity through an exact hash-bound command', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-accept-identity-'))
  const runId = 'run-accept-identity'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1' },
    qualityFirst: {
      phase: 'awaiting_identity_review',
      canonicalCandidates: [{ candidateId: 'canonical-1', eligible: true, sha256: 'a'.repeat(64) }]
    }
  }, null, 2)}\n`)
  const calls = []
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView({ commands: [{ id: 'accept-identity' }] })],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId, payload) => {
        calls.push({ commandId, payload })
        return {
          commandId,
          result: {
            message: 'identity accepted',
            run: {
              runId,
              status: 'ready_for_review',
              currentStep: 'review',
              generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1' },
              qualityFirst: { phase: 'ready_for_review', actionResults: {} }
            }
          }
        }
      }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'ok', message: 'ready' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'waving', actions: [] }),
      acceptTriggerProposalItem: () => ({ animations: {} })
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({ replaced: false, reference: null }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const result = await service.acceptCreatorIdentity({
    runId,
    candidateId: 'canonical-1',
    sha256: 'a'.repeat(64),
    qualityOverride: true,
    acknowledgedWarningCodes: ['visual-score-overall-below-minimum']
  })
  assert.equal(result.state, 'review-required')
  assert.equal(result.code, 'identity_accepted_review_required')
  assert.deepEqual(calls, [{
    commandId: 'accept-identity',
    payload: {
      runId,
      candidateId: 'canonical-1',
      sha256: 'a'.repeat(64),
      qualityOverride: true,
      acknowledgedWarningCodes: ['visual-score-overall-below-minimum']
    }
  }])
})

test('creator workflow selects a retained action candidate through the dedicated command', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-accept-action-candidate-'))
  const runId = 'run-accept-action-candidate'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({ runId, status: 'ready_for_review', currentStep: 'review', qualityFirst: { phase: 'ready_for_review', actionResults: {} } })}\n`)
  const calls = []
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView({ commands: [{ id: 'accept-action-candidate' }] })],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId, payload) => {
        calls.push({ commandId, payload })
        return { commandId, result: { run: { runId, status: 'ready_for_review', currentStep: 'review', qualityFirst: { phase: 'ready_for_review', actionResults: {} } } } }
      }
    },
    imageGenerationModelService: { checkHealth: async () => ({ ok: true }), getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' }) },
    actionService: { getConfig: () => ({ defaultAction: 'idle', clickAction: 'waving', actions: [] }), acceptTriggerProposalItem: () => ({ animations: {} }) },
    creatorReferenceService: { getReference: () => null, bindReference: async () => ({ replaced: false, reference: null }), copyReferenceIntoRun: () => ({}) }
  })

  const result = await service.acceptCreatorActionCandidate({
    runId,
    actionId: 'waving',
    candidateId: 'candidate-2',
    sha256: 'c'.repeat(64),
    qualityOverride: true,
    acknowledgedWarningCodes: ['visual-defect-motion-unreadable']
  })

  assert.equal(result.state, 'review-required')
  assert.equal(result.code, 'action_candidate_accepted_review_required')
  assert.deepEqual(calls, [{
    commandId: 'accept-action-candidate',
    payload: {
      runId,
      actionId: 'waving',
      candidateId: 'candidate-2',
      sha256: 'c'.repeat(64),
      qualityOverride: true,
      acknowledgedWarningCodes: ['visual-defect-motion-unreadable']
    }
  }])
})

test('creator workflow exports only a hash-verified recovery bundle inside the run directory', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-recovery-export-'))
  const runId = 'run-recovery-export'
  const recoveryDir = path.join(pluginDataDir, 'runs', runId, 'recovery')
  fs.mkdirSync(recoveryDir, { recursive: true })
  const bundlePath = path.join(recoveryDir, 'recovery.json')
  fs.writeFileSync(bundlePath, '{"version":1}\n')
  const sha256 = require('node:crypto').createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex')
  fs.writeFileSync(path.join(pluginDataDir, 'runs', runId, 'run.json'), `${JSON.stringify({
    runId,
    status: 'recovery-required',
    qualityFirst: {
      phase: 'recovery-required',
      recovery: {
        relativePath: `runs/${runId}/recovery/recovery.json`,
        sha256
      }
    }
  }, null, 2)}\n`)
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async () => { throw new Error('not expected') }
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'waving', actions: [] }),
      acceptTriggerProposalItem: () => ({ animations: {} })
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({ replaced: false, reference: null }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const result = await service.exportRecoveryBundle({ runId })
  assert.equal(result.ok, true)
  assert.equal(result.relativePath, `runs/${runId}/recovery/recovery.json`)
  assert.equal(result.sha256, sha256)
  assert.equal(Object.hasOwn(result, 'path'), false)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(pluginDataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('quality-first identity retry returns to awaiting identity review instead of generic review', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-retry-identity-review-'))
  const runId = 'run-retry-identity-review'
  fs.mkdirSync(path.join(pluginDataDir, 'runs', runId), { recursive: true })
  fs.writeFileSync(path.join(pluginDataDir, 'runs', runId, 'run.json'), `${JSON.stringify({
    runId,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1' },
    qualityFirst: { phase: 'awaiting_identity_review', canonicalCandidates: [] }
  })}\n`)
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => pluginDataDir,
      runCommand: async (_pluginId, commandId) => ({ commandId, result: { message: 'retry ready', run: { runId, status: 'awaiting_identity_review', qualityFirst: { phase: 'awaiting_identity_review' } } } })
    },
    imageGenerationModelService: { checkHealth: async () => ({ ok: true }), getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2' }) },
    actionService: { getConfig: () => ({ actions: [] }), acceptTriggerProposalItem: () => ({ animations: {} }) },
    creatorReferenceService: { getReference: () => null, bindReference: async () => ({ replaced: false, reference: null }), copyReferenceIntoRun: () => ({}) }
  })
  const result = await service.retryFullPetIdentity({ runId })
  assert.equal(result.state, 'awaiting-identity-review')
  assert.equal(result.code, 'identity_review_required')
})

test('quality-first diagnostics keep raw and processed paid action candidates visible', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-quality-assets-'))
  const runId = 'run-quality-assets'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const candidateDir = path.join(runDir, 'candidates', 'waving', 'candidate-1')
  fs.mkdirSync(path.join(candidateDir, 'raw'), { recursive: true })
  fs.mkdirSync(path.join(candidateDir, 'processed', 'frames'), { recursive: true })
  fs.mkdirSync(path.join(runDir, 'prompts', 'quality-first'), { recursive: true })
  fs.writeFileSync(path.join(candidateDir, 'raw', 'sheet.png'), 'png')
  fs.writeFileSync(path.join(candidateDir, 'processed', 'frames', '01.png'), 'png')
  fs.writeFileSync(path.join(runDir, 'prompts', 'quality-first', 'waving-candidate-1.txt'), 'provider-neutral prompt')
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({ runId, status: 'ready_for_review', currentStep: 'review', qualityFirst: { phase: 'ready_for_review' } })}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: { waving: { actionId: 'waving', ok: false, error: 'action_quality_gate_failed', failureConditions: ['identity-drift'] } }
  })}\n`)

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
  const waving = diagnostics.progress.actions.find((action) => action.actionId === 'waving')
  assert.ok(waving.assets.some((asset) => asset.relativePath.includes('/candidates/waving/candidate-1/raw/sheet.png')))
  assert.ok(waving.assets.some((asset) => asset.relativePath.includes('/candidates/waving/candidate-1/processed/frames/01.png')))
  assert.equal(waving.promptRelativePath, `runs/${runId}/prompts/quality-first/waving-candidate-1.txt`)
})

test('creator workflow service imports available actions as partial pack when idle failed frames are absent', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-partial-import-'))
  const runId = 'run-partial-import'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const rightDir = path.join(runDir, 'official-row-frames', 'running-right')
  const leftDir = path.join(runDir, 'official-row-frames', 'running-left')
  const wavingDir = path.join(runDir, 'official-row-frames', 'waving')
  const archivedPromptDir = path.join(runDir, 'repairs', '2026-07-25-action-waving', 'prompts', 'quality-first')
  fs.mkdirSync(rightDir, { recursive: true })
  fs.mkdirSync(leftDir, { recursive: true })
  fs.mkdirSync(wavingDir, { recursive: true })
  fs.mkdirSync(archivedPromptDir, { recursive: true })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  fs.writeFileSync(path.join(rightDir, '01.png'), png)
  fs.writeFileSync(path.join(rightDir, '02.png'), png)
  fs.writeFileSync(path.join(leftDir, '01.png'), png)
  fs.writeFileSync(path.join(leftDir, '02.png'), png)
  fs.writeFileSync(path.join(wavingDir, '01.png'), 'not-an-image')
  fs.writeFileSync(path.join(archivedPromptDir, 'waving-candidate-old.txt'), 'Archived waving repair prompt.\n')
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    petId: 'partial-cat',
    input: { petName: 'Partial Cat', prompt: 'demo' },
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    backendStatus: { state: 'failed', message: 'idle failed' },
    error: 'idle failed',
    artifacts: {}
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: {
      idle: {
        actionId: 'idle',
        ok: false,
        failureConditions: ['row_identity_shape_drift'],
        error: 'row_identity_shape_drift'
      },
      'running-right': {
        actionId: 'running-right',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [
            { relativePath: `runs/${runId}/official-row-frames/running-right/01.png`, sha256: 'r1' },
            { relativePath: `runs/${runId}/official-row-frames/running-right/02.png`, sha256: 'r2' }
          ]
        }
      },
      'running-left': {
        actionId: 'running-left',
        ok: true,
        row: {
          quality: 'approved-mirror',
          frames: [
            { relativePath: `runs/${runId}/official-row-frames/running-left/01.png`, sha256: 'l1' },
            { relativePath: `runs/${runId}/official-row-frames/running-left/02.png`, sha256: 'l2' }
          ]
        }
      },
      waving: {
        actionId: 'waving',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: `runs/${runId}/official-row-frames/waving/01.png`, sha256: 'corrupt' }]
        }
      }
    }
  }, null, 2)}\n`)

  const importedPacks = []
  let inspectedManifest = null
  let inspectedSourcePath = ''
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => ([{ id: 'openpet.creator-studio', enabled: true, runnable: true, commands: [{ id: 'draft-task' }] }]),
      runCommand: async () => { throw new Error('should not need creator studio commands for partial import') },
      getPluginCreatorDataDir: () => pluginDataDir
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2', creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'] } })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'waving', actions: [] }),
      acceptTriggerProposalItem: () => ({})
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({ replaced: false, reference: null }),
      copyReferenceIntoRun: () => ({})
    },
    petPackService: {
      inspectPackSource: (sourcePath) => {
        inspectedSourcePath = sourcePath
        assert.equal(fs.existsSync(path.join(sourcePath, 'pet.json')), true)
        const manifest = JSON.parse(fs.readFileSync(path.join(sourcePath, 'pet.json'), 'utf-8'))
        inspectedManifest = manifest
        assert.equal(manifest.defaultAction, 'idle')
        assert.equal(manifest.actions.some((action) => action.id === 'idle'), true)
        assert.equal(manifest.availableActionIds.includes('running-right'), true)
        return {
          selectionId: 'sel-partial',
          valid: true,
          errors: [],
          pack: { id: manifest.id, displayName: manifest.displayName }
        }
      },
      importPack: (selectionId) => {
        assert.equal(selectionId, 'sel-partial')
        const pack = { id: 'partial-cat', displayName: 'Partial Cat', defaultAction: 'idle', clickAction: 'idle' }
        importedPacks.push(pack)
        return { pack }
      },
      setActivePack: (packId) => ({ activePackId: packId, pack: importedPacks[0] })
    }
  })

  const result = await service.importAvailableActions({ runId, activate: true })
  assert.equal(result.state, 'completed')
  assert.equal(result.code, 'partial_actions_imported')
  assert.equal(result.completeness, 'partial')
  assert.equal(result.availableActionIds.includes('idle'), true)
  assert.equal(result.availableActionIds.includes('running-right'), true)
  assert.equal(result.availableActionIds.includes('waving'), false)
  assert.equal(result.failedActionIds.includes('waving'), true)
  assert.equal(result.omittedActionIds.includes('waving'), true)
  assert.equal(inspectedManifest.actions.some((action) => action.id === 'waving'), false)
  const wavingProgress = result.diagnostics.progress.actions.find((action) => action.actionId === 'waving')
  assert.equal(wavingProgress.status, 'failed')
  assert.equal(wavingProgress.importable, false)
  assert.equal(result.diagnostics.progress.availableActionIds.includes('waving'), false)
  assert.equal(result.diagnostics.progress.failedActionIds.includes('waving'), true)
  assert.equal(result.failedActionIds.includes('idle') || result.importNotes.includes('idle'), true)
  const archivedPrompt = result.processAssets.find((asset) => asset.kind === 'prompt' && asset.actionId === 'waving')
  assert.equal(archivedPrompt.promptText, 'Archived waving repair prompt.')
  assert.match(archivedPrompt.promptRelativePath, /^runs\/run-partial-import\/repairs\//)
  assert.equal(inspectedManifest.actionAvailability.idle.available, false)
  assert.equal(inspectedManifest.actionAvailability.idle.quality, 'placeholder')
  assert.match(inspectedManifest.actionAvailability.idle.reason, /placeholder|fallback/i)
  assert.deepEqual(inspectedManifest.creatorStudio.degradedActionIds, ['idle'])
  for (const actionId of ['running-right', 'running-left']) {
    const action = inspectedManifest.actions.find((item) => item.id === actionId)
    assert.equal(action.frameCount, 2)
    assert.match(action.sprite, /^sprites\/.+\.png$/)
    const metadata = await sharp(path.join(inspectedSourcePath, action.sprite)).metadata()
    assert.equal(metadata.width, action.frameWidth * action.frameCount)
    assert.equal(metadata.height, action.frameHeight)
  }
  assert.equal(result.run.importedPackId, 'partial-cat')
  assert.equal(importedPacks.length, 1)
  assert.equal(JSON.stringify(result).includes(pluginDataDir), false)
  assert.equal(result.persistFailed, false)
  const persistedRun = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf-8'))
  assert.equal(persistedRun.status, 'imported')
  assert.equal(persistedRun.importStatus, 'imported')
  assert.equal(persistedRun.importedPackId, 'partial-cat')

  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    petId: 'partial-cat',
    input: { petName: 'Partial Cat', prompt: 'demo' },
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    error: 'all remaining assets are corrupt'
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: {
      idle: { actionId: 'idle', ok: false, error: 'row_identity_shape_drift' },
      waving: {
        actionId: 'waving',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: `runs/${runId}/official-row-frames/waving/01.png`, sha256: 'corrupt' }]
        }
      }
    }
  }, null, 2)}\n`)

  const noValidFrames = await service.importAvailableActions({ runId, activate: true })
  assert.equal(noValidFrames.state, 'review-required')
  assert.equal(noValidFrames.code, 'no_importable_action_frames')
  assert.deepEqual(noValidFrames.availableActionIds, [])
  assert.equal(noValidFrames.failedActionIds.includes('waving'), true)
  assert.equal(noValidFrames.omittedActionIds.includes('waving'), true)
})

test('creator workflow import surfaces run.json persist failure instead of swallowing it', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-persist-fail-'))
  const runId = 'run-persist-fail'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const runPath = path.join(runDir, 'run.json')
  const rightDir = path.join(runDir, 'official-row-frames', 'running-right')
  const leftDir = path.join(runDir, 'official-row-frames', 'running-left')
  const idleDir = path.join(runDir, 'official-row-frames', 'idle')
  fs.mkdirSync(rightDir, { recursive: true })
  fs.mkdirSync(leftDir, { recursive: true })
  fs.mkdirSync(idleDir, { recursive: true })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  fs.writeFileSync(path.join(rightDir, '01.png'), png)
  fs.writeFileSync(path.join(leftDir, '01.png'), png)
  fs.writeFileSync(path.join(idleDir, '01.png'), png)
  fs.writeFileSync(runPath, `${JSON.stringify({
    runId,
    petId: 'persist-cat',
    input: { petName: 'Persist Cat', prompt: 'demo' },
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    artifacts: {}
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
    version: 1,
    runId,
    actions: {
      idle: {
        actionId: 'idle',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: `runs/${runId}/official-row-frames/idle/01.png`, sha256: 'i1' }]
        }
      },
      'running-right': {
        actionId: 'running-right',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: `runs/${runId}/official-row-frames/running-right/01.png`, sha256: 'r1' }]
        }
      },
      'running-left': {
        actionId: 'running-left',
        ok: true,
        row: {
          quality: 'row-real',
          frames: [{ relativePath: `runs/${runId}/official-row-frames/running-left/01.png`, sha256: 'l1' }]
        }
      }
    }
  }, null, 2)}\n`)

  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => ([{ id: 'openpet.creator-studio', enabled: true, runnable: true, commands: [{ id: 'draft-task' }] }]),
      runCommand: async () => { throw new Error('should not need creator studio commands for partial import') },
      getPluginCreatorDataDir: () => pluginDataDir
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2', creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'] } })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'waving', actions: [] }),
      acceptTriggerProposalItem: () => ({})
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({ replaced: false, reference: null }),
      copyReferenceIntoRun: () => ({})
    },
    petPackService: {
      inspectPackSource: () => ({ selectionId: 'sel-persist', valid: true, errors: [], pack: { id: 'persist-cat' } }),
      importPack: () => {
        // 导入成功后、run.json 状态回写前，把 run.json 换成目录：
        // 原子写的 rename 会失败，用于验证失败被上报而不是被吞掉。
        fs.rmSync(runPath, { force: true })
        fs.mkdirSync(runPath)
        return { pack: { id: 'persist-cat', displayName: 'Persist Cat' } }
      },
      setActivePack: (packId) => ({ activePackId: packId, pack: { id: 'persist-cat' } })
    }
  })

  const result = await service.importAvailableActions({ runId, activate: true })
  assert.equal(result.state, 'completed')
  assert.equal(result.persistFailed, true)
  assert.match(result.importNotes, /run\.json/)
  assert.equal(result.run.importedPackId, 'persist-cat')
})

test('creator workflow diagnostics keep process assets without embedding preview data urls by default', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-process-assets-'))
  const runId = 'run-process-assets'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const anchorDir = path.join(runDir, 'inputs', 'anchors')
  const conditioningDir = path.join(runDir, 'inputs', 'keyframes', 'actions')
  const frameDir = path.join(runDir, 'official-row-frames', 'waving')
  fs.mkdirSync(anchorDir, { recursive: true })
  fs.mkdirSync(conditioningDir, { recursive: true })
  fs.mkdirSync(frameDir, { recursive: true })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  fs.writeFileSync(path.join(anchorDir, 'full-pet-action-identity-board.png'), png)
  fs.writeFileSync(path.join(conditioningDir, 'waving-peak-conditioning-board.png'), png)
  fs.writeFileSync(path.join(frameDir, '01.png'), png)
  fs.writeFileSync(path.join(runDir, 'spritesheet.webp'), png)
  const runJson = {
    runId,
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    error: 'waving failed',
    artifacts: {
      spritesheet: 'runs/' + runId + '/spritesheet.webp',
      generatedImage: {
        outputs: [],
        conditioning: {
          mode: 'image-edit',
          endpoint: '/images/edits',
          referenceImageCount: 1,
          multipartImageField: 'image',
          requestedOutputCount: 1
        }
      }
    }
  }
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runJson, null, 2) + '\n')
  const checkpoints = {
    version: 1,
    runId,
    actions: {
      waving: {
        actionId: 'waving',
        ok: false,
        failureConditions: ['identity-descriptor-distance-high'],
        error: 'identity-descriptor-distance-high',
        row: {
          quality: 'failed',
          frames: [{ relativePath: 'runs/' + runId + '/official-row-frames/waving/01.png', sha256: 'b' }]
        }
      }
    }
  }
  fs.writeFileSync(path.join(runDir, 'full-pet-action-checkpoints.json'), JSON.stringify(checkpoints, null, 2) + '\n')

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
  assert.ok(Array.isArray(diagnostics.progress.processAssets))
  assert.ok(diagnostics.progress.processAssets.some((asset) => asset.kind === 'identity' || asset.kind === 'anchor'))
  assert.ok(diagnostics.progress.processAssets.some((asset) => asset.kind === 'conditioning-board' || String(asset.role || '').includes('conditioning')))
  assert.ok(diagnostics.progress.processAssets.some((asset) => asset.kind === 'sheet' || /sprite/i.test(asset.label || '')))
  assert.equal(JSON.stringify(diagnostics).includes('data:image'), false)
  assert.equal(JSON.stringify(diagnostics).includes(pluginDataDir), false)

  const waving = diagnostics.progress.actions.find((action) => action.actionId === 'waving')
  assert.equal(waving.status, 'failed')
  assert.ok(waving.failureEvidence?.[0]?.message.includes('身份') || waving.reason.includes('身份'))
  assert.ok(waving.assets.some((asset) => asset.kind === 'identity' || asset.kind === 'anchor'))
  assert.ok(waving.assets.some((asset) => asset.kind === 'frame' || asset.kind === 'keyframe'))
  assert.equal(waving.assets.some((asset) => asset.previewDataUrl), false)
})

test('creator workflow diagnostics keep archived paid retry assets visible after replacement generation', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-retry-assets-'))
  const runId = 'run-retry-assets'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const identityArchive = path.join(runDir, 'repairs', '2026-07-25-identity', 'candidates', 'canonical', 'canonical-old')
  const actionArchive = path.join(runDir, 'repairs', '2026-07-25-action-waving', 'candidates', 'action-waving', 'candidate-old', 'raw')
  const promptArchive = path.join(runDir, 'repairs', '2026-07-25-action-waving', 'prompts', 'quality-first')
  fs.mkdirSync(identityArchive, { recursive: true })
  fs.mkdirSync(actionArchive, { recursive: true })
  fs.mkdirSync(promptArchive, { recursive: true })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  fs.writeFileSync(path.join(identityArchive, 'raw.png'), png)
  fs.writeFileSync(path.join(actionArchive, 'sheet.png'), png)
  fs.writeFileSync(path.join(promptArchive, 'waving-candidate-old.txt'), 'Draw the archived waving candidate.\n')
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
    runId,
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    error: 'retry failed'
  }, null, 2) + '\n')

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
  const archived = diagnostics.progress.processAssets.filter((asset) => asset.role === 'repair-archive' && asset.kind !== 'prompt')
  assert.deepEqual(
    archived.map((asset) => asset.relativePath).sort(),
    [
      `runs/${runId}/repairs/2026-07-25-action-waving/candidates/action-waving/candidate-old/raw/sheet.png`,
      `runs/${runId}/repairs/2026-07-25-identity/candidates/canonical/canonical-old/raw.png`
    ]
  )
  assert.equal(archived.filter((asset) => asset.kind !== 'prompt').every((asset) => asset.previewable), true)
  assert.equal(archived.some((asset) => asset.actionId === 'waving'), true)
  assert.equal(JSON.stringify(archived).includes(pluginDataDir), false)
  const archivedPrompts = diagnostics.progress.processAssets.filter((asset) => asset.kind === 'prompt' && asset.role === 'repair-archive')
  assert.equal(archivedPrompts.length, 1)
  assert.equal(archivedPrompts[0].actionId, 'waving')
  assert.equal(archivedPrompts[0].promptText, 'Draw the archived waving candidate.')
  assert.match(archivedPrompts[0].promptRelativePath, /^runs\/run-retry-assets\/repairs\//)
})

test('creator workflow diagnostics do not truncate current or archived candidate assets within the run budget', () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-candidate-volume-'))
  const runId = 'run-candidate-volume'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const currentDir = path.join(runDir, 'candidates', 'action-waving', 'candidate-1', 'processed', 'frames')
  const archivedDir = path.join(runDir, 'repairs', '2026-07-25-action-waving', 'candidates', 'action-waving', 'candidate-1', 'processed', 'frames')
  fs.mkdirSync(currentDir, { recursive: true })
  fs.mkdirSync(archivedDir, { recursive: true })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  for (let index = 1; index <= 300; index += 1) {
    const fileName = `${String(index).padStart(3, '0')}.png`
    fs.writeFileSync(path.join(currentDir, fileName), png)
    fs.writeFileSync(path.join(archivedDir, fileName), png)
  }
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
    runId,
    status: 'failed',
    taskStatus: 'confirmed',
    currentStep: 'generate',
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    backend: 'provider',
    error: 'waving failed'
  }, null, 2) + '\n')

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
  const current = diagnostics.progress.processAssets.filter((asset) => asset.role === 'processed-candidate')
  const archived = diagnostics.progress.processAssets.filter((asset) => asset.role === 'repair-archive')

  assert.equal(current.length, 300)
  assert.equal(archived.length, 300)
  assert.equal(current.every((asset) => asset.actionId === 'waving' && asset.previewable), true)
  assert.equal(archived.every((asset) => asset.actionId === 'waving' && asset.previewable), true)
})

test('creator workflow asset preview loads on demand and rejects path escape', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-asset-preview-'))
  const runId = 'run-preview-on-demand'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const frameDir = path.join(runDir, 'official-row-frames', 'idle')
  fs.mkdirSync(frameDir, { recursive: true })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  const relativePath = 'runs/' + runId + '/official-row-frames/idle/01.png'
  fs.writeFileSync(path.join(frameDir, '01.png'), png)
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({ runId, status: 'failed' }, null, 2) + '\n')

  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => ([{ id: 'openpet.creator-studio', enabled: true, runnable: true, commands: [{ id: 'draft-task' }] }]),
      runCommand: async () => ({ ok: true }),
      getPluginCreatorDataDir: () => pluginDataDir
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2', creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'] } })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'waving', actions: [] }),
      acceptTriggerProposalItem: () => ({})
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({ replaced: false, reference: null }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const okPreview = await service.getAssetPreview({ runId, relativePath })
  assert.equal(okPreview.ok, true)
  assert.match(okPreview.previewDataUrl, /^data:image\/png;base64,/)
  assert.equal(okPreview.relativePath, relativePath)

  const escaped = await service.getAssetPreview({ runId, relativePath: '../secret.png' })
  assert.equal(escaped.ok, false)
  assert.equal(escaped.previewDataUrl, '')

  const outside = await service.getAssetPreview({ runId, relativePath: 'runs/other/01.png' })
  assert.equal(outside.ok, false)
  assert.equal(JSON.stringify(okPreview).includes(pluginDataDir), false)
})

test('creator workflow creates a bounded on-demand preview for a large paid image asset', async () => {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-large-preview-'))
  const runId = 'run-large-preview'
  const runDir = path.join(pluginDataDir, 'runs', runId)
  const candidateDir = path.join(runDir, 'candidates', 'canonical', 'canonical-1', 'raw')
  fs.mkdirSync(candidateDir, { recursive: true })
  const width = 900
  const height = 900
  const pixels = Buffer.alloc(width * height * 4)
  for (let index = 0; index < pixels.length; index += 4) {
    const value = (index * 31 + Math.floor(index / 7) * 17) % 256
    pixels[index] = value
    pixels[index + 1] = (value * 3 + 19) % 256
    pixels[index + 2] = (value * 7 + 43) % 256
    pixels[index + 3] = 255
  }
  const imagePath = path.join(candidateDir, 'large.png')
  await sharp(pixels, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 0 }).toFile(imagePath)
  assert.ok(fs.statSync(imagePath).size > 1_500_000)
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({ runId, status: 'failed' }, null, 2) + '\n')

  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => ([{ id: 'openpet.creator-studio', enabled: true, runnable: true, commands: [{ id: 'draft-task' }] }]),
      runCommand: async () => ({ ok: true }),
      getPluginCreatorDataDir: () => pluginDataDir
    },
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' }),
      getConfig: () => ({ provider: 'openai-compatible', model: 'gpt-image-2', creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'] } })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'waving', actions: [] }),
      acceptTriggerProposalItem: () => ({})
    },
    creatorReferenceService: {
      getReference: () => null,
      bindReference: async () => ({ replaced: false, reference: null }),
      copyReferenceIntoRun: () => ({})
    }
  })

  const relativePath = `runs/${runId}/candidates/canonical/canonical-1/raw/large.png`
  const preview = await service.getAssetPreview({ runId, relativePath })
  assert.equal(preview.ok, true)
  assert.match(preview.previewDataUrl, /^data:image\/webp;base64,/)
  assert.ok(Buffer.from(preview.previewDataUrl.split(',')[1], 'base64').length < 1_500_000)
  assert.equal(JSON.stringify(preview).includes(pluginDataDir), false)
})

test('creator workflow rejects unsafe run ids before reading outside the creator data boundary', () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-run-boundary-'))
  const pluginDataDir = path.join(workspaceDir, 'data')
  const escapedRunDir = path.join(workspaceDir, 'outside-run')
  fs.mkdirSync(path.join(escapedRunDir), { recursive: true })
  fs.writeFileSync(path.join(escapedRunDir, 'run.json'), JSON.stringify({
    runId: '../../outside-run',
    status: 'failed',
    error: 'outside data must not be read'
  }) + '\n')

  const diagnostics = __testInternals.readWorkflowDiagnostics({
    pluginDataDir,
    runId: '../../outside-run'
  })
  const assets = __testInternals.collectActionAssetsForRun({
    pluginDataDir,
    runId: '../../outside-run'
  })

  assert.equal(diagnostics, null)
  assert.deepEqual(assets.actions, [])
  assert.deepEqual(assets.actionAssets, [])
})
