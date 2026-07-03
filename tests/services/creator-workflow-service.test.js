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
        requiredRealActionIds: ['idle', 'waving'],
        realActionIds: ['idle', 'waving'],
        fallbackActionIds: ['waiting'],
        missingRequiredActionIds: [],
        rows: [
          { actionId: 'idle', sourceActionId: 'idle', sourceRelativePath: 'runs/run-002/frames/base/idle/0001.png', fallback: false },
          { actionId: 'waving', sourceActionId: 'waving', sourceRelativePath: 'runs/run-002/frames/base/waving/0001.png', fallback: false },
          { actionId: 'waiting', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-002/frames/base/0001.png', fallback: true }
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
  assert.deepEqual(result.basicActions.realActionIds, ['idle', 'waving'])
  assert.deepEqual(result.basicActions.fallbackActionIds, ['waiting'])
  assert.deepEqual(result.basicActions.missingRequiredActionIds, [])
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
