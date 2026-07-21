const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  __testInternals,
  CREATOR_STUDIO_PLUGIN_ID,
  EDITABLE_TARGET_ID,
  EDITABLE_TARGET_TYPE,
  createCreatorWorkflowService
} = require('../../src/main/services/creator-workflow-service')

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
  const service = createCreatorWorkflowService({
    pluginService: {
      listPlugins: () => [createPluginView()],
      getPluginCreatorDataDir: () => '/tmp/openpet-health-coordination',
      runCommand: async (...args) => {
        commandCalls.push(args)
        return runCommand(...args)
      }
    },
    imageGenerationModelService: { checkHealth, getConfig },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] }),
      acceptTriggerProposalItem: () => ({ animations: { defaultAction: 'idle', clickAction: 'wave', actions: [{ id: 'idle' }, { id: 'wave' }] } })
    },
    creatorReferenceService: {
      getReference: () => reference,
      bindReference: async () => ({ replaced: false, reference }),
      copyReferenceIntoRun: () => ({})
    },
    nowMs
  })
  return { service, commandCalls }
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
    hatchPetAgentService: { createShadowDecision },
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
    }
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
    }
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
    }
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
  fs.mkdirSync(candidateDir, { recursive: true })
  fs.mkdirSync(path.join(runDir, 'budgets'), { recursive: true })
  fs.writeFileSync(path.join(candidateDir, 'candidate.png'), 'png')
  fs.writeFileSync(path.join(runDir, 'budgets', 'ledger.json'), `${JSON.stringify({
    version: 1,
    startedAtMs: Date.now() - 1000,
    limits: { maxProviderCalls: 72, maxPlannerCalls: 34, maxEvaluatorCalls: 68, maxElapsedMs: 43200000, maxEstimatedCost: null },
    usage: { providerCalls: 5, providerFailures: 1, plannerCalls: 1, evaluatorCalls: 3, estimatedCost: 0.4, costKnown: true },
    reservations: {}
  })}\n`)
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({
    runId,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    reviewStatus: 'identity-pending',
    generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1' },
    qualityFirst: {
      version: 1,
      phase: 'awaiting_identity_review',
      planHash: 'p'.repeat(64),
      nextAction: 'accept-canonical-identity',
      canonicalCandidates: [{
        candidateId: 'canonical-1',
        eligible: true,
        sha256: 'a'.repeat(64),
        score: 94,
        model: 'gpt-image-2',
        relativePath: `runs/${runId}/candidates/canonical/canonical-1/raw/candidate.png`,
        promptRelativePath: `runs/${runId}/prompts/quality-first/canonical-1.txt`,
        failureCodes: []
      }, {
        candidateId: 'canonical-2',
        eligible: false,
        sha256: 'b'.repeat(64),
        score: 58,
        relativePath: '/Users/private/should-not-leak.png',
        failureCodes: ['canonical-edge-touch']
      }]
    }
  }, null, 2)}\n`)

  const diagnostics = __testInternals.readWorkflowDiagnostics({ pluginDataDir, runId })
  assert.equal(diagnostics.progress.phase, 'awaiting_identity_review')
  assert.equal(diagnostics.progress.qualityFirst.phase, 'awaiting_identity_review')
  assert.equal(diagnostics.progress.qualityFirst.nextAction, 'accept-canonical-identity')
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates.length, 2)
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[0].previewable, true)
  assert.equal(diagnostics.progress.qualityFirst.identityReview.candidates[1].relativePath, '')
  assert.equal(diagnostics.progress.qualityFirst.budget.usage.providerCalls, 5)
  assert.equal(diagnostics.progress.qualityFirst.budget.usage.providerFailures, 1)
  assert.equal(diagnostics.progress.qualityFirst.budget.remaining.providerCalls, 67)
  assert.equal(diagnostics.progress.qualityFirst.budget.remaining.evaluatorCalls, 65)
  assert.doesNotMatch(JSON.stringify(diagnostics), /\/Users\/private/)
})

test('creator workflow accepts an eligible canonical identity through an exact hash-bound command', async () => {
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
    sha256: 'a'.repeat(64)
  })
  assert.equal(result.state, 'review-required')
  assert.equal(result.code, 'identity_accepted_review_required')
  assert.deepEqual(calls, [{
    commandId: 'accept-identity',
    payload: { runId, candidateId: 'canonical-1', sha256: 'a'.repeat(64) }
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
  fs.mkdirSync(rightDir, { recursive: true })
  fs.mkdirSync(leftDir, { recursive: true })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  fs.writeFileSync(path.join(rightDir, '01.png'), png)
  fs.writeFileSync(path.join(leftDir, '01.png'), png)
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
          frames: [{ relativePath: `runs/${runId}/official-row-frames/running-right/01.png`, sha256: 'r' }]
        }
      },
      'running-left': {
        actionId: 'running-left',
        ok: true,
        row: {
          quality: 'approved-mirror',
          frames: [{ relativePath: `runs/${runId}/official-row-frames/running-left/01.png`, sha256: 'l' }]
        }
      }
    }
  }, null, 2)}\n`)

  const importedPacks = []
  let inspectedManifest = null
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
  assert.equal(result.failedActionIds.includes('idle') || result.importNotes.includes('idle'), true)
  assert.equal(inspectedManifest.actionAvailability.idle.available, false)
  assert.equal(inspectedManifest.actionAvailability.idle.quality, 'placeholder')
  assert.match(inspectedManifest.actionAvailability.idle.reason, /placeholder|fallback/i)
  assert.deepEqual(inspectedManifest.creatorStudio.degradedActionIds, ['idle'])
  assert.equal(result.run.importedPackId, 'partial-cat')
  assert.equal(importedPacks.length, 1)
  assert.equal(JSON.stringify(result).includes(pluginDataDir), false)
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
