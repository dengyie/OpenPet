const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
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

test('creator workflow service imports an existing action and auto-applies clickAction even when the Creator Studio service is stopped', async () => {
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
        if (commandId === 'approve-run') {
          writeRunRecord({
            runId: 'run-001',
            status: 'approved',
            currentStep: 'approved',
            reviewStatus: 'approved',
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
              message: 'approved',
              run: {
                runId: 'run-001',
                status: 'approved'
              }
            }
          }
        }
        if (commandId === 'import-approved-action') {
          writeRunRecord({
            runId: 'run-001',
            status: 'imported',
            currentStep: 'imported',
            reviewStatus: 'approved',
            importStatus: 'imported',
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
              message: 'imported',
              run: {
                runId: 'run-001',
                status: 'imported',
                importedActionId: 'spin'
              },
              importedAction: {
                id: 'spin'
              },
              triggerProposalSubmission: {
                ok: true,
                proposal: {
                  id: 'proposal:click:spin:test'
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
  assert.equal(result.state, 'completed')
  assert.equal(result.code, 'action_imported')
  assert.equal(result.importedAction.actionId, 'spin')
  assert.equal(result.clickAction, 'spin')
  assert.deepEqual(result.clickActionChange, {
    previousActionId: 'wave',
    currentActionId: 'spin',
    importedActionId: 'spin',
    canRestore: true
  })
  assert.equal(result.run.runId, 'run-001')
  assert.equal(result.run.importedActionId, 'spin')
  assert.equal(result.diagnostics.runStatus, 'imported')
  assert.equal(result.diagnostics.attemptStatus, 'completed')
  assert.equal(result.diagnostics.outputCount, 1)
  assert.equal(result.diagnostics.conditioning.mode, 'image-edit')
  assert.deepEqual(result.diagnostics.conditioning.referenceFileNames, ['canonical-reference.png'])
  assert.deepEqual(commandCalls.map((entry) => entry.commandId), [
    'draft-task',
    'confirm-task',
    'run-step',
    'approve-run',
    'import-approved-action'
  ])
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
    'creator.workflow.stage.completed',
    'creator.workflow.stage.completed',
    'creator.workflow.completed'
  ])
  assert.equal(logs[0].details.requestId, 'creator-workflow-1')
  assert.equal(logs.at(-1).details.importedActionId, 'spin')
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

test('creator workflow service binds a new character reference and completes a full-pet import', async () => {
  const bindCalls = []
  const copyCalls = []
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
        requiredOfficialActionIds: ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'],
        previewFallbackActionIds: ['idle', 'waving', 'waiting'],
        missingRequiredOfficialActionIds: ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'],
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
          return {
            commandId,
            result: {
              ok: true,
              message: 'approved',
              run: {
                runId: 'run-002',
                status: 'approved'
              }
            }
          }
        }
        if (commandId === 'import-approved-pet') {
          writeAtlasQa()
          return {
            commandId,
            result: {
              ok: true,
              message: 'imported',
              run: {
                runId: 'run-002',
                status: 'imported',
                importedPackId: 'mango-cat',
                activatedPackId: 'mango-cat'
              },
              imported: {
                pack: {
                  id: 'mango-cat',
                  displayName: 'Mango Cat',
                  version: '1.0.0',
                  source: 'creator-studio',
                  rootPath: '/tmp/pet-packs/mango-cat',
                  actionCount: 9,
                  defaultAction: 'idle',
                  clickAction: 'waving'
                }
              },
              activated: {
                activePackId: 'mango-cat'
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
  assert.equal(result.state, 'completed')
  assert.equal(result.code, 'pet_imported')
  assert.equal(result.activePet.id, 'mango-cat')
  assert.equal(result.run.activatedPackId, 'mango-cat')
  assert.equal(result.basicActions.baseIdentityCoverage, true)
  assert.deepEqual(result.basicActions.realActionIds, [])
  assert.deepEqual(result.basicActions.fallbackActionIds, ['idle', 'waving', 'waiting'])
  assert.deepEqual(result.basicActions.missingRequiredActionIds, [])
  assert.deepEqual(
    result.basicActions.missingRequiredOfficialActionIds,
    ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review']
  )
  assert.equal(result.basicActions.rows.find((row) => row.actionId === 'idle').quality, 'base-preview')
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
          writeAtlasQa()
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
  assert.equal(firstRun.state, 'completed')
  assert.equal(firstRun.clickAction, 'spin')
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
