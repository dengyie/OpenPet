const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { CODEX_ROWS } = require('../pet-pack/codex-pet')

const CREATOR_STUDIO_PLUGIN_ID = 'openpet.creator-studio'
const CREATOR_STUDIO_SERVICE_ID = 'studio'
const CREATOR_STUDIO_DASHBOARD_ID = 'main'
const DEFAULT_CREATOR_STUDIO_COMMAND_ID = 'draft-task'
const LEGACY_CREATOR_STUDIO_COMMAND_ID = 'create-run'
const CREATOR_STUDIO_CONFIRM_COMMAND_ID = 'confirm-task'
const CREATOR_STUDIO_GENERATE_COMMAND_ID = 'run-step'
const CREATOR_STUDIO_APPROVE_COMMAND_ID = 'approve-run'
const CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID = 'import-approved-action'
const CREATOR_STUDIO_IMPORT_PET_COMMAND_ID = 'import-approved-pet'

const EDITABLE_TARGET_TYPE = 'editable-action-host'
const EDITABLE_TARGET_ID = 'legacy-editable-host'
const EDITABLE_TARGET_NAME = 'Current Editable Character'
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/
const DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS = 3000

const normalizeText = (value) => String(value || '').trim()

const withTimeout = async (promise, timeoutMs, message) => {
  const effectiveTimeoutMs = Math.max(1, Number(timeoutMs) || DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS)
  let timeoutHandle = null
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(message))
        }, effectiveTimeoutMs)
      })
    ])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

const slugify = (value) => normalizeText(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-|-$/g, '')
  || 'pet'

const normalizeActionId = (value, fallback = 'custom-action') => {
  const slug = slugify(value || fallback)
  return SAFE_ID_PATTERN.test(slug) ? slug : fallback
}

const findPluginById = (plugins = [], pluginId) => (
  Array.isArray(plugins)
    ? plugins.find((plugin) => plugin?.id === pluginId) || null
    : null
)

const getPluginServiceRuntimeStatus = (plugin, serviceId) => (
  plugin?.entries?.services?.find((service) => service.id === serviceId)?.runtime?.status || 'stopped'
)

const getCreatorStudioRun = (result) => {
  const candidate = result?.result
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) && candidate.run && typeof candidate.run === 'object'
    ? candidate.run
    : null
}

const getCreatorStudioRunId = (run) => normalizeText(run?.runId)

const getCommandMessage = (result, fallback) => {
  const message = result?.result && typeof result.result === 'object' && !Array.isArray(result.result)
    ? result.result.message
    : ''
  return normalizeText(message || fallback)
}

const getTriggerProposalSubmission = (result) => {
  const candidate = result?.result
  return candidate &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    candidate.triggerProposalSubmission &&
    typeof candidate.triggerProposalSubmission === 'object' &&
    !Array.isArray(candidate.triggerProposalSubmission)
    ? candidate.triggerProposalSubmission
    : null
}

const createDashboardView = (plugin) => {
  const serviceStatus = getPluginServiceRuntimeStatus(plugin, CREATOR_STUDIO_SERVICE_ID)
  return {
    available: Boolean(plugin?.enabled && plugin?.runnable),
    pluginId: CREATOR_STUDIO_PLUGIN_ID,
    dashboardId: CREATOR_STUDIO_DASHBOARD_ID,
    serviceStatus,
    reason: !plugin
      ? 'Creator Studio plugin is not installed'
      : (!plugin.enabled || !plugin.runnable || plugin.blockStatus?.blocked)
        ? 'Creator Studio plugin is not ready'
        : serviceStatus !== 'running'
          ? 'Creator Studio Service 当前未启动；你仍然可以直接生成并导入，只有查看高级任务详情时才需要启动它。'
          : ''
  }
}

const createEditableTargetView = (actionsConfig = {}) => ({
  targetType: EDITABLE_TARGET_TYPE,
  targetId: EDITABLE_TARGET_ID,
  displayName: EDITABLE_TARGET_NAME,
  defaultAction: normalizeText(actionsConfig.defaultAction),
  clickAction: normalizeText(actionsConfig.clickAction),
  actionCount: Array.isArray(actionsConfig.actions) ? actionsConfig.actions.length : 0
})

const createProviderView = ({ config = {}, health = {} }) => ({
  ready: health?.ok === true,
  code: normalizeText(health?.code),
  message: normalizeText(health?.message),
  provider: normalizeText(config.provider),
  model: normalizeText(config.model)
})

const createRunView = ({
  state,
  mode = '',
  runId = '',
  commandId = '',
  message = '',
  importedActionId = '',
  importedPackId = '',
  activatedPackId = ''
} = {}) => ({
  state,
  mode: normalizeText(mode),
  runId: normalizeText(runId),
  commandId: normalizeText(commandId),
  message: normalizeText(message),
  importedActionId: normalizeText(importedActionId),
  importedPackId: normalizeText(importedPackId),
  activatedPackId: normalizeText(activatedPackId)
})

const createGeneratingRunView = ({
  mode = '',
  runId = '',
  commandId = '',
  message = ''
} = {}) => createRunView({
  state: 'generating',
  mode,
  runId,
  commandId,
  message: normalizeText(message) || '生成任务进行中'
})

const getImportedActionId = (run = {}, result = {}) => normalizeText(
  run?.importedActionId ||
  result?.importedAction?.id ||
  result?.imported?.action?.id
)

const getImportedPackId = (run = {}, result = {}) => normalizeText(
  run?.importedPackId ||
  result?.imported?.pack?.id
)

const createWorkflowResult = ({
  state,
  code,
  message,
  run = null,
  reference = null,
  activePet = null,
  importedAction = null,
  clickAction = '',
  diagnostics = null
}) => ({
  ok: true,
  state,
  code: normalizeText(code),
  message: normalizeText(message),
  run,
  reference,
  activePet,
  importedAction,
  clickAction: normalizeText(clickAction),
  diagnostics: diagnostics && typeof diagnostics === 'object'
    ? diagnostics
    : null
})

const readWorkflowDiagnostics = ({ pluginDataDir, runId }) => {
  const normalizedRunId = normalizeText(runId)
  if (!pluginDataDir || !normalizedRunId) return null
  const runPath = path.join(path.resolve(pluginDataDir), 'runs', normalizedRunId, 'run.json')
  if (!fs.existsSync(runPath)) return null
  try {
    const run = JSON.parse(fs.readFileSync(runPath, 'utf-8'))
    const generatedImage = run?.artifacts?.generatedImage
    const conditioning = generatedImage?.conditioning && typeof generatedImage.conditioning === 'object'
      ? generatedImage.conditioning
      : null
    const references = Array.isArray(conditioning?.references) ? conditioning.references : []
    const outputCount = Array.isArray(generatedImage?.outputs) ? generatedImage.outputs.length : 0
    return {
      runStatus: normalizeText(run?.status),
      currentStep: normalizeText(run?.currentStep),
      reviewStatus: normalizeText(run?.reviewStatus),
      importStatus: normalizeText(run?.importStatus),
      backend: normalizeText(run?.backend || run?.input?.backend),
      backendState: normalizeText(run?.backendStatus?.state),
      attemptStatus: normalizeText(
        generatedImage?.failure?.message
          ? 'failed'
          : outputCount > 0
            ? 'completed'
            : generatedImage
              ? 'attempted'
              : 'unavailable'
      ),
      outputCount,
      generatedAt: normalizeText(generatedImage?.generatedAt),
      failedAt: normalizeText(generatedImage?.failedAt),
      failureReason: normalizeText(generatedImage?.failure?.message || run?.error || run?.backendStatus?.message),
      conditioning: conditioning
        ? {
            mode: normalizeText(conditioning.mode),
            endpoint: normalizeText(conditioning.endpoint),
            referenceImageCount: Number(conditioning.referenceImageCount) || 0,
            referenceFileNames: references.map((reference) => (
              normalizeText(reference?.fileName || reference?.relativePath)
            )).filter(Boolean)
          }
        : null
    }
  } catch (_) {
    return null
  }
}

const createFullPetTask = ({ characterName, stylePrompt = '' }) => ({
  mode: 'full-pet',
  targetPet: 'new',
  styleSource: 'referenceImage',
  characterBrief: normalizeText(stylePrompt) || `Create a reusable OpenPet character named ${normalizeText(characterName)}.`,
  actions: CODEX_ROWS.map((row) => ({
    actionId: row.id,
    name: row.label,
    motionPrompt: `${row.label} motion for ${normalizeText(characterName)}`,
    loop: Boolean(row.loop),
    frameCount: row.durations.length,
    transparentBackground: true,
    triggerProposal: row.id === 'waving'
      ? { type: 'click', binding: 'clickAction', notes: 'Default click action for the generated character.' }
      : row.id === 'idle'
        ? { type: 'state', binding: 'idle', notes: 'Default idle state for the generated character.' }
        : { type: 'manual', notes: `Generated ${row.label} action for the character set.` }
  })),
  questions: []
})

const createExistingActionTask = ({ actionName, motionPrompt }) => ({
  mode: 'single-action',
  targetPet: 'current',
  styleSource: 'referenceImage',
  characterBrief: `Keep the current editable OpenPet character identity and style consistent while adding the ${normalizeText(actionName)} action.`,
  actions: [{
    actionId: normalizeActionId(actionName, 'custom-action'),
    name: normalizeText(actionName),
    motionPrompt: normalizeText(motionPrompt) || normalizeText(actionName),
    loop: false,
    frameCount: 16,
    transparentBackground: true,
    triggerProposal: {
      type: 'click',
      binding: 'clickAction',
      notes: 'Default one-click trigger for the generated custom action.'
    }
  }],
  questions: []
})

const createCreatorWorkflowService = ({
  pluginService,
  imageGenerationModelService,
  actionService,
  creatorReferenceService,
  appLogService = null,
  providerHealthTimeoutMs = DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS,
  idFactory = () => crypto.randomUUID()
}) => {
  if (!pluginService?.listPlugins || !pluginService?.runCommand || !pluginService?.getPluginCreatorDataDir) {
    throw new Error('Plugin service is required for creator workflow service')
  }
  if (!imageGenerationModelService?.checkHealth || !imageGenerationModelService?.getConfig) {
    throw new Error('Image generation model service is required for creator workflow service')
  }
  if (!actionService?.getConfig || !actionService?.acceptTriggerProposalItem) {
    throw new Error('Action service is required for creator workflow service')
  }
  if (!creatorReferenceService?.getReference || !creatorReferenceService?.bindReference || !creatorReferenceService?.copyReferenceIntoRun) {
    throw new Error('Creator reference service is required for creator workflow service')
  }

  let lastRun = null
  let activeWorkflow = null

  const recordLog = (entry) => {
    try {
      appLogService?.record?.({
        scope: 'creator-workflow',
        actor: 'system',
        ...entry
      })
    } catch (_) {
      // Diagnostics must never break workflow execution.
    }
  }

  const getPluginState = () => findPluginById(pluginService.listPlugins(), CREATOR_STUDIO_PLUGIN_ID)

  const getProviderHealth = async () => {
    try {
      return await withTimeout(
        imageGenerationModelService.checkHealth({ timeoutMs: providerHealthTimeoutMs }),
        providerHealthTimeoutMs,
        `Image Provider health check timed out after ${providerHealthTimeoutMs}ms`
      )
    } catch (error) {
      const message = normalizeText(error?.message || 'Provider health check failed')
      const isTimeout = /timed out/i.test(message)
      return {
        ok: false,
        code: isTimeout ? 'health_check_timeout' : 'health_check_failed',
        message
      }
    }
  }

  const getState = async () => {
    const plugin = getPluginState()
    const health = await getProviderHealth()
    return {
      ok: true,
      provider: createProviderView({
        config: imageGenerationModelService.getConfig(),
        health
      }),
      editableTarget: createEditableTargetView(actionService.getConfig()),
      editableReference: creatorReferenceService.getReference({
        targetType: EDITABLE_TARGET_TYPE,
        targetId: EDITABLE_TARGET_ID
      }),
      lastRun,
      dashboard: createDashboardView(plugin)
    }
  }

  const getLastRun = async () => ({ ok: true, run: lastRun })

  const approveReferenceSourcePath = (sourcePath) => {
    if (!creatorReferenceService?.approveSourcePath) {
      throw new Error('Creator reference picker is not available')
    }
    return creatorReferenceService.approveSourcePath(sourcePath)
  }

  const bindReference = async ({ targetType, targetId, referenceToken }) => {
    const result = await creatorReferenceService.bindReference({ targetType, targetId, referenceToken })
    return {
      ok: true,
      replaced: result.replaced,
      reference: result.reference
    }
  }

  const assertPluginReady = () => {
    const plugin = getPluginState()
    if (!plugin) {
      throw new Error('未找到 Creator Studio 插件')
    }
    if (!plugin.enabled || !plugin.runnable || plugin.blockStatus?.blocked) {
      throw new Error('请先启用 Creator Studio 插件')
    }
    return plugin
  }

  const resolveCommandId = (plugin) => (
    Array.isArray(plugin?.commands) && plugin.commands.some((command) => command.id === DEFAULT_CREATOR_STUDIO_COMMAND_ID)
      ? DEFAULT_CREATOR_STUDIO_COMMAND_ID
      : LEGACY_CREATOR_STUDIO_COMMAND_ID
  )

  const setLastRun = (run) => {
    lastRun = run ? { ...run } : null
    return lastRun
  }

  const beginWorkflow = ({ mode, message = '' }) => {
    activeWorkflow = {
      mode: normalizeText(mode),
      runId: '',
      commandId: '',
      message: normalizeText(message) || '生成任务进行中'
    }
    return setLastRun(createGeneratingRunView(activeWorkflow))
  }

  const updateWorkflowProgress = ({ runId = '', commandId = '', message = '' } = {}) => {
    if (!activeWorkflow) return null
    activeWorkflow = {
      ...activeWorkflow,
      runId: normalizeText(runId) || activeWorkflow.runId,
      commandId: normalizeText(commandId) || activeWorkflow.commandId,
      message: normalizeText(message) || activeWorkflow.message
    }
    return setLastRun(createGeneratingRunView(activeWorkflow))
  }

  const clearWorkflow = () => {
    activeWorkflow = null
  }

  const createWorkflowInProgressResult = () => createWorkflowResult({
    state: 'generating',
    code: 'workflow_in_progress',
    message: '已有生成任务正在进行，请等待当前流程完成',
    run: lastRun || createGeneratingRunView(activeWorkflow || {})
  })

  const runExclusively = async ({ mode, message }, execute) => {
    if (activeWorkflow) {
      return createWorkflowInProgressResult()
    }
    beginWorkflow({ mode, message })
    try {
      const result = await execute()
      if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'run') && result.state !== 'generating') {
        setLastRun(result.run)
      }
      return result
    } finally {
      clearWorkflow()
    }
  }

  const runWorkflow = async ({
    mode,
    task,
    payload,
    referenceTarget,
    importCommandId
  }) => {
    const requestId = idFactory()
    const plugin = assertPluginReady()
    const health = await getProviderHealth()
    recordLog({
      level: 'info',
      event: 'creator.workflow.started',
      message: 'Creator workflow started',
      details: {
        requestId,
        mode,
        importCommandId,
        providerModel: normalizeText(imageGenerationModelService.getConfig()?.model),
        serviceStatus: getPluginServiceRuntimeStatus(plugin, CREATOR_STUDIO_SERVICE_ID)
      }
    })
    if (!health?.ok) {
      recordLog({
        level: 'error',
        event: 'creator.workflow.blocked',
        message: 'Creator workflow blocked by image provider health',
        details: {
          requestId,
          mode,
          providerCode: normalizeText(health?.code)
        }
      })
      const result = createWorkflowResult({
        state: 'provider-not-ready',
        code: normalizeText(health?.code) || 'provider_not_ready',
        message: '请先到 AI -> 模型 Provider -> 图片模型 配置并保存可用模型，然后再使用生成流程'
      })
      setLastRun(result.run)
      return result
    }

    const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
    const commandId = resolveCommandId(plugin)
    let runId = ''
    let lastCommandResult = null
    const getWorkflowDiagnostics = () => readWorkflowDiagnostics({ pluginDataDir, runId })
    const recordStage = ({ stage, result, run }) => {
      recordLog({
        level: 'info',
        event: 'creator.workflow.stage.completed',
        message: `Creator workflow stage completed: ${stage}`,
        details: {
          requestId,
          mode,
          stage,
          runId: getCreatorStudioRunId(run),
          commandId: normalizeText(result?.commandId),
          taskStatus: normalizeText(run?.taskStatus),
          runStatus: normalizeText(run?.status)
        }
      })
    }

    try {
      const drafted = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, commandId, {
        ...payload,
        generationTask: task,
        backend: 'provider'
      })
      lastCommandResult = drafted
      const draftRun = getCreatorStudioRun(drafted)
      runId = getCreatorStudioRunId(draftRun)
      if (!runId) throw new Error('Creator Studio did not return a run id')
      recordStage({ stage: 'draft', result: drafted, run: draftRun })
      updateWorkflowProgress({
        runId,
        commandId: drafted?.commandId || commandId,
        message: getCommandMessage(drafted, '草稿任务已创建')
      })

      creatorReferenceService.copyReferenceIntoRun({
        targetType: referenceTarget.targetType,
        targetId: referenceTarget.targetId,
        pluginDataDir,
        runId
      })

      let run = draftRun
      if (normalizeText(run?.taskStatus) !== 'confirmed') {
        const confirmed = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, CREATOR_STUDIO_CONFIRM_COMMAND_ID, { runId })
        lastCommandResult = confirmed
        run = getCreatorStudioRun(confirmed)
        recordStage({ stage: 'confirm', result: confirmed, run })
        updateWorkflowProgress({
          runId,
          commandId: confirmed?.commandId || CREATOR_STUDIO_CONFIRM_COMMAND_ID,
          message: getCommandMessage(confirmed, '任务已确认')
        })
      }

      const generated = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, CREATOR_STUDIO_GENERATE_COMMAND_ID, { runId })
      lastCommandResult = generated
      run = getCreatorStudioRun(generated)
      recordStage({ stage: 'generate', result: generated, run })
      updateWorkflowProgress({
        runId,
        commandId: generated?.commandId || CREATOR_STUDIO_GENERATE_COMMAND_ID,
        message: getCommandMessage(generated, '生成步骤已完成')
      })

      if (normalizeText(run?.status) === 'ready_for_review') {
        const approved = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, CREATOR_STUDIO_APPROVE_COMMAND_ID, { runId })
        lastCommandResult = approved
        run = getCreatorStudioRun(approved)
        recordStage({ stage: 'approve', result: approved, run })
        updateWorkflowProgress({
          runId,
          commandId: approved?.commandId || CREATOR_STUDIO_APPROVE_COMMAND_ID,
          message: getCommandMessage(approved, 'Run 已批准')
        })
      }

      if (normalizeText(run?.status) !== 'approved') {
        const result = createWorkflowResult({
          state: 'review-required',
          code: 'run_not_approved',
          message: `生成流程未进入 approved 状态，请到 Creator Studio 继续处理 run ${runId}`,
          run: createRunView({
            state: 'review-required',
            mode,
            runId,
            commandId: lastCommandResult?.commandId,
            message: getCommandMessage(lastCommandResult, 'Run requires review')
          }),
          reference: creatorReferenceService.getReference(referenceTarget),
          diagnostics: getWorkflowDiagnostics()
        })
        recordLog({
          level: 'info',
          event: 'creator.workflow.review-required',
          message: 'Creator workflow requires manual review',
          details: {
            requestId,
            mode,
            runId,
            lastCommandId: normalizeText(lastCommandResult?.commandId)
          }
        })
        setLastRun(result.run)
        return result
      }

      const imported = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, importCommandId, {
        runId,
        activate: true
      })
      lastCommandResult = imported
      recordStage({ stage: 'import', result: imported, run: getCreatorStudioRun(imported) || run })
      updateWorkflowProgress({
        runId,
        commandId: imported?.commandId || importCommandId,
        message: getCommandMessage(imported, '导入步骤已完成')
      })
      const importRun = getCreatorStudioRun(imported) || run
      const importResult = imported?.result && typeof imported.result === 'object' && !Array.isArray(imported.result)
        ? imported.result
        : {}

      if (importCommandId === CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID) {
        const submission = getTriggerProposalSubmission(imported)
        const importedActionId = getImportedActionId(importRun, importResult)
        if (!submission?.ok || !submission?.proposal?.id) {
          const result = createWorkflowResult({
            state: 'import-failed',
            code: submission?.ok === false ? 'trigger_proposal_submit_failed' : 'trigger_proposal_missing',
          message: `动作已导入，但默认 clickAction 绑定未完成。请到 Creator Studio 或 Actions 面板继续处理 run ${runId}`,
            run: createRunView({
              state: 'import-failed',
              mode,
              runId,
              commandId: imported.commandId,
              message: getCommandMessage(imported, 'Imported action requires trigger follow-up'),
              importedActionId
            }),
            reference: creatorReferenceService.getReference(referenceTarget),
            importedAction: {
              actionId: importedActionId,
              label: normalizeText(task.actions?.[0]?.name)
            },
            diagnostics: getWorkflowDiagnostics()
          })
          recordLog({
            level: 'error',
            event: 'creator.workflow.import-follow-up-required',
            message: 'Creator workflow imported an action but trigger follow-up is still required',
            details: {
              requestId,
              mode,
              runId,
              importedActionId
            }
          })
          setLastRun(result.run)
          return result
        }

        const accepted = actionService.acceptTriggerProposalItem(submission.proposal.id)
        const clickAction = normalizeText(accepted?.animations?.clickAction) || importedActionId
        const runView = createRunView({
          state: 'completed',
          mode,
          runId,
          commandId: imported.commandId,
          message: getCommandMessage(imported, '动作已生成并导入'),
          importedActionId
        })
        const result = createWorkflowResult({
          state: 'completed',
          code: 'action_imported',
          message: `动作 ${runView.importedActionId || task.actions?.[0]?.actionId || ''} 已生成、导入并绑定到 clickAction`,
          run: runView,
          reference: creatorReferenceService.getReference(referenceTarget),
          importedAction: {
            actionId: runView.importedActionId,
            label: normalizeText(task.actions?.[0]?.name)
          },
          clickAction: clickAction || runView.importedActionId,
          diagnostics: getWorkflowDiagnostics()
        })
        recordLog({
          level: 'info',
          event: 'creator.workflow.completed',
          message: 'Creator workflow completed with imported action',
          details: {
            requestId,
            mode,
            runId,
            importedActionId: runView.importedActionId,
            clickAction
          }
        })
        setLastRun(result.run)
        return result
      }

      const activePackId = normalizeText(importResult?.activated?.activePackId || importRun?.activatedPackId)
      const pack = importResult?.activated?.pack || importResult?.imported?.pack || null
      const runView = createRunView({
        state: 'completed',
        mode,
        runId,
        commandId: imported.commandId,
        message: getCommandMessage(imported, '角色已生成并导入'),
        importedPackId: getImportedPackId(importRun, importResult),
        activatedPackId: activePackId
      })
      const result = createWorkflowResult({
        state: 'completed',
        code: 'pet_imported',
        message: `角色 ${activePackId || runView.importedPackId || payload.petId || ''} 已生成、导入并激活`,
        run: runView,
        reference: creatorReferenceService.getReference(referenceTarget),
        activePet: pack
          ? {
              id: normalizeText(pack.id),
              displayName: normalizeText(pack.displayName),
              version: normalizeText(pack.version),
              source: normalizeText(pack.source),
              rootPath: normalizeText(pack.rootPath),
              active: true,
              actionCount: Number(pack.actionCount) || 0,
              defaultAction: normalizeText(pack.defaultAction),
              clickAction: normalizeText(pack.clickAction)
            }
          : null,
        diagnostics: getWorkflowDiagnostics()
      })
      recordLog({
        level: 'info',
        event: 'creator.workflow.completed',
        message: 'Creator workflow completed with imported pet',
        details: {
          requestId,
          mode,
          runId,
          importedPackId: runView.importedPackId,
          activatedPackId: runView.activatedPackId
        }
      })
      setLastRun(result.run)
      return result
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'creator.workflow.failed',
        message: error?.message || 'Creator workflow failed',
        details: {
          requestId,
          mode,
          runId,
          lastCommandId: normalizeText(lastCommandResult?.commandId)
        }
      })
      const failureState = lastCommandResult?.commandId === CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID || lastCommandResult?.commandId === CREATOR_STUDIO_IMPORT_PET_COMMAND_ID
        ? 'import-failed'
        : 'review-required'
      const result = createWorkflowResult({
        state: failureState,
        code: failureState === 'import-failed' ? 'import_failed' : 'workflow_failed',
        message: runId
          ? `生成流程在 run ${runId} 失败：${error.message || '未知错误'}。可到 Creator Studio 查看详情。`
          : (error.message || 'Creator workflow failed'),
        run: runId
          ? createRunView({
              state: failureState,
              mode,
              runId,
              commandId: lastCommandResult?.commandId,
              message: error.message || getCommandMessage(lastCommandResult, 'Workflow failed')
            })
          : null,
        reference: creatorReferenceService.getReference(referenceTarget),
        diagnostics: getWorkflowDiagnostics()
      })
      setLastRun(result.run)
      return result
    }
  }

  const generateNewCharacter = async ({ characterName, stylePrompt = '', referenceImageToken }) => {
    const normalizedCharacterName = normalizeText(characterName)
    const normalizedReferenceImageToken = normalizeText(referenceImageToken)
    if (!normalizedCharacterName) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_character_name',
        message: '请先输入角色名称'
      })
    }
    if (!normalizedReferenceImageToken) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_reference_image',
        message: '请先选择参考图片'
      })
    }
    const petId = slugify(normalizedCharacterName)
    return runExclusively({
      mode: 'full-pet',
      message: `正在生成角色 ${normalizedCharacterName}`
    }, async () => {
      try {
        await creatorReferenceService.bindReference({
          targetType: 'pet-pack',
          targetId: petId,
          referenceToken: normalizedReferenceImageToken
        })
      } catch (error) {
        return createWorkflowResult({
          state: 'missing-input',
          code: 'invalid_reference_image',
          message: error?.message || '参考图片不可用'
        })
      }
      return runWorkflow({
        mode: 'full-pet',
        task: createFullPetTask({ characterName: normalizedCharacterName, stylePrompt }),
        payload: {
          petName: normalizedCharacterName,
          petId,
          prompt: normalizeText(stylePrompt) || `Create a new OpenPet character named ${normalizedCharacterName}.`,
          originalPrompt: normalizeText(stylePrompt) || `Create a new OpenPet character named ${normalizedCharacterName}.`
        },
        referenceTarget: {
          targetType: 'pet-pack',
          targetId: petId
        },
        importCommandId: CREATOR_STUDIO_IMPORT_PET_COMMAND_ID
      })
    })
  }

  const generateExistingAction = async ({ actionName, motionPrompt, referenceImageToken = '' }) => {
    const normalizedActionName = normalizeText(actionName)
    const normalizedMotionPrompt = normalizeText(motionPrompt)
    const normalizedReferenceImageToken = normalizeText(referenceImageToken)
    if (!normalizedActionName) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_action_name',
        message: '请先输入动作名称'
      })
    }
    if (!normalizedMotionPrompt) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_motion_prompt',
        message: '请先输入动作描述'
      })
    }

    return runExclusively({
      mode: 'single-action',
      message: `正在生成动作 ${normalizedActionName}`
    }, async () => {
      let reference = null
      if (normalizedReferenceImageToken) {
        try {
          const bound = await creatorReferenceService.bindReference({
            targetType: EDITABLE_TARGET_TYPE,
            targetId: EDITABLE_TARGET_ID,
            referenceToken: normalizedReferenceImageToken
          })
          reference = bound.reference
        } catch (error) {
          return createWorkflowResult({
            state: 'missing-input',
            code: 'invalid_reference_image',
            message: error?.message || '参考图片不可用'
          })
        }
      } else {
        reference = creatorReferenceService.getReference({
          targetType: EDITABLE_TARGET_TYPE,
          targetId: EDITABLE_TARGET_ID
        })
      }

      if (!reference) {
        return createWorkflowResult({
          state: 'missing-input',
          code: 'missing_reference_image',
          message: '当前可编辑角色还没有绑定参考图片，请先完成一次参考图绑定'
        })
      }

      return runWorkflow({
        mode: 'single-action',
        task: createExistingActionTask({ actionName: normalizedActionName, motionPrompt: normalizedMotionPrompt }),
        payload: {
          petName: EDITABLE_TARGET_NAME,
          petId: EDITABLE_TARGET_ID,
          prompt: normalizedMotionPrompt,
          originalPrompt: normalizedMotionPrompt
        },
        referenceTarget: {
          targetType: EDITABLE_TARGET_TYPE,
          targetId: EDITABLE_TARGET_ID
        },
        importCommandId: CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID
      })
    })
  }

  return {
    approveReferenceSourcePath,
    getState,
    getLastRun,
    bindReference,
    generateNewCharacter,
    generateExistingAction
  }
}

module.exports = {
  CREATOR_STUDIO_DASHBOARD_ID,
  CREATOR_STUDIO_PLUGIN_ID,
  EDITABLE_TARGET_ID,
  EDITABLE_TARGET_NAME,
  EDITABLE_TARGET_TYPE,
  createCreatorWorkflowService
}
