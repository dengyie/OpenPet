const test = require('node:test')
const assert = require('node:assert/strict')

const { createCreatorStudioDefaultFlowService } = require('../../src/main/services/creator-studio-default-flow-service')

const createPluginView = ({
  enabled = true,
  runnable = true,
  blocked = false,
  serviceStatus = 'running',
  commands = [{ id: 'draft-task' }]
} = {}) => ({
  id: 'openpet.creator-studio',
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

test('creator studio default flow blocks before generation when provider health is unavailable', async () => {
  const commands = []
  const service = createCreatorStudioDefaultFlowService({
    imageGenerationModelService: {
      checkHealth: async () => ({
        ok: false,
        code: 'missing_api_key',
        message: 'missing'
      })
    },
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async (pluginId, commandId, payload) => {
        commands.push({ pluginId, commandId, payload })
        return { ok: true }
      }
    }
  })

  const result = await service.runDefaultFlow({ prompt: '新增一个害羞转圈动作' })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'blocked')
  assert.match(result.message, /AI -> 模型 Provider -> 图片模型 配置/i)
  assert.equal(result.runId, '')
  assert.equal(commands.length, 0)
})

test('creator studio default flow auto-answers trigger, confirms, generates, approves, and imports action runs without requiring the Creator Studio service to be running', async () => {
  const commandCalls = []
  const service = createCreatorStudioDefaultFlowService({
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' })
    },
    pluginService: {
      listPlugins: () => [createPluginView({ serviceStatus: 'stopped' })],
      runCommand: async (pluginId, commandId, payload) => {
        commandCalls.push({ pluginId, commandId, payload })
        if (commandId === 'draft-task') {
          return {
            ok: true,
            pluginId,
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId: 'run-001',
                taskStatus: 'needs_input',
                generationTask: {
                  questions: [{ id: 'trigger', options: ['manual', 'click'] }]
                }
              }
            }
          }
        }
        if (commandId === 'answer-question') {
          return {
            ok: true,
            pluginId,
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'answered',
              run: {
                runId: 'run-001',
                taskStatus: 'ready_for_confirmation',
                generationTask: { questions: [] }
              }
            }
          }
        }
        if (commandId === 'confirm-task') {
          return {
            ok: true,
            pluginId,
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'confirmed',
              run: {
                runId: 'run-001',
                taskStatus: 'confirmed',
                generationTask: { questions: [] }
              }
            }
          }
        }
        if (commandId === 'run-step') {
          return {
            ok: true,
            pluginId,
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'generated',
              run: {
                runId: 'run-001',
                status: 'ready_for_review',
                generationTask: { questions: [] },
                artifacts: {
                  actionFrames: {
                    actionId: 'shy-spin'
                  }
                }
              }
            }
          }
        }
        if (commandId === 'approve-run') {
          return {
            ok: true,
            pluginId,
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'approved',
              run: {
                runId: 'run-001',
                status: 'approved',
                generationTask: { questions: [] },
                artifacts: {
                  actionFrames: {
                    actionId: 'shy-spin'
                  }
                }
              }
            }
          }
        }
        if (commandId === 'import-approved-action') {
          return {
            ok: true,
            pluginId,
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'imported',
              run: {
                runId: 'run-001',
                status: 'imported',
                importedActionId: 'shy-spin',
                generationTask: { questions: [] }
              },
              triggerProposalSubmission: {
                ok: true,
                proposal: {
                  id: 'proposal:click:shy-spin:test'
                }
              }
            }
          }
        }
        throw new Error(`Unexpected command ${commandId}`)
      }
    }
  })

  const result = await service.runDefaultFlow({ prompt: '新增一个害羞转圈动作' })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'completed')
  assert.equal(result.runId, 'run-001')
  assert.equal(result.lastCommandResult?.commandId, 'import-approved-action')
  assert.deepEqual(commandCalls.map((entry) => entry.commandId), [
    'draft-task',
    'answer-question',
    'confirm-task',
    'run-step',
    'approve-run',
    'import-approved-action'
  ])
  assert.equal(commandCalls[0].payload.backend, 'provider')
  assert.equal(commandCalls[1].payload.answer, 'manual')
})

test('creator studio default flow routes to details when unresolved questions are not safe to auto-answer', async () => {
  const service = createCreatorStudioDefaultFlowService({
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' })
    },
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async () => ({
        ok: true,
        pluginId: 'openpet.creator-studio',
        commandId: 'draft-task',
        exitCode: 0,
        result: {
          ok: true,
          message: 'drafted',
          run: {
            runId: 'run-need-details',
            taskStatus: 'needs_input',
            generationTask: {
              questions: [{ id: 'styleSource', options: ['currentPet', 'textOnly'] }]
            }
          }
        }
      })
    }
  })

  const result = await service.runDefaultFlow({ prompt: '帮我做个新动作' })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'needs_details')
  assert.equal(result.runId, 'run-need-details')
  assert.match(result.message, /查看任务详情/)
  assert.equal(result.lastCommandResult?.commandId, 'draft-task')
})

test('creator studio default flow routes action imports with failed trigger handoff to details', async () => {
  const service = createCreatorStudioDefaultFlowService({
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' })
    },
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async (_pluginId, commandId) => {
        if (commandId === 'draft-task') {
          return {
            ok: true,
            pluginId: 'openpet.creator-studio',
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId: 'run-trigger-fail',
                taskStatus: 'confirmed',
                generationTask: { questions: [] }
              }
            }
          }
        }
        if (commandId === 'run-step') {
          return {
            ok: true,
            pluginId: 'openpet.creator-studio',
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'generated',
              run: {
                runId: 'run-trigger-fail',
                status: 'ready_for_review',
                generationTask: { questions: [] },
                artifacts: {
                  actionFrames: {
                    actionId: 'shy-spin'
                  }
                }
              }
            }
          }
        }
        if (commandId === 'approve-run') {
          return {
            ok: true,
            pluginId: 'openpet.creator-studio',
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'approved',
              run: {
                runId: 'run-trigger-fail',
                status: 'approved',
                generationTask: { questions: [] },
                artifacts: {
                  actionFrames: {
                    actionId: 'shy-spin'
                  }
                }
              }
            }
          }
        }
        if (commandId === 'import-approved-action') {
          return {
            ok: true,
            pluginId: 'openpet.creator-studio',
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'imported',
              run: {
                runId: 'run-trigger-fail',
                status: 'imported',
                importedActionId: 'shy-spin',
                generationTask: { questions: [] }
              },
              triggerProposalSubmission: {
                ok: false,
                error: 'handoff failed'
              }
            }
          }
        }
        throw new Error(`Unexpected command ${commandId}`)
      }
    }
  })

  const result = await service.runDefaultFlow({ prompt: '新增一个害羞转圈动作' })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'needs_details')
  assert.equal(result.runId, 'run-trigger-fail')
  assert.match(result.message, /触发建议交接失败/)
  assert.equal(result.lastCommandResult?.commandId, 'import-approved-action')
})

test('creator studio default flow routes action imports with missing trigger handoff records to details', async () => {
  const service = createCreatorStudioDefaultFlowService({
    imageGenerationModelService: {
      checkHealth: async () => ({ ok: true, code: 'provider_healthy', message: 'ok' })
    },
    pluginService: {
      listPlugins: () => [createPluginView()],
      runCommand: async (_pluginId, commandId) => {
        if (commandId === 'draft-task') {
          return {
            ok: true,
            pluginId: 'openpet.creator-studio',
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'drafted',
              run: {
                runId: 'run-trigger-missing',
                taskStatus: 'confirmed',
                generationTask: { questions: [] }
              }
            }
          }
        }
        if (commandId === 'run-step') {
          return {
            ok: true,
            pluginId: 'openpet.creator-studio',
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'generated',
              run: {
                runId: 'run-trigger-missing',
                status: 'ready_for_review',
                generationTask: { questions: [] },
                artifacts: {
                  actionFrames: {
                    actionId: 'shy-spin'
                  }
                }
              }
            }
          }
        }
        if (commandId === 'approve-run') {
          return {
            ok: true,
            pluginId: 'openpet.creator-studio',
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'approved',
              run: {
                runId: 'run-trigger-missing',
                status: 'approved',
                generationTask: { questions: [] },
                artifacts: {
                  actionFrames: {
                    actionId: 'shy-spin'
                  }
                }
              }
            }
          }
        }
        if (commandId === 'import-approved-action') {
          return {
            ok: true,
            pluginId: 'openpet.creator-studio',
            commandId,
            exitCode: 0,
            result: {
              ok: true,
              message: 'imported',
              run: {
                runId: 'run-trigger-missing',
                status: 'imported',
                importedActionId: 'shy-spin',
                generationTask: { questions: [] }
              }
            }
          }
        }
        throw new Error(`Unexpected command ${commandId}`)
      }
    }
  })

  const result = await service.runDefaultFlow({ prompt: '新增一个害羞转圈动作' })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'needs_details')
  assert.equal(result.runId, 'run-trigger-missing')
  assert.match(result.message, /缺少触发建议交接记录/)
  assert.equal(result.lastCommandResult?.commandId, 'import-approved-action')
})
