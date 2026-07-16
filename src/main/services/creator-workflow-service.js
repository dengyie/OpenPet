const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { CODEX_ROWS } = require('../pet-pack/codex-pet')
const { sanitizeLogText } = require('./log-safety')
const { inferAnimationType } = require('../../../examples/plugins/creator-studio/lib/action-semantics')

const CREATOR_STUDIO_PLUGIN_ID = 'openpet.creator-studio'
const CREATOR_STUDIO_SERVICE_ID = 'studio'
const CREATOR_STUDIO_DASHBOARD_ID = 'main'
const DEFAULT_CREATOR_STUDIO_COMMAND_ID = 'draft-task'
const LEGACY_CREATOR_STUDIO_COMMAND_ID = 'create-run'
const CREATOR_STUDIO_CONFIRM_COMMAND_ID = 'confirm-task'
const CREATOR_STUDIO_GENERATE_COMMAND_ID = 'run-step'
const CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID = 'retry-action'
const CREATOR_STUDIO_RETRY_IDENTITY_COMMAND_ID = 'retry-identity'
const CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID = 'import-approved-action'
const CREATOR_STUDIO_IMPORT_PET_COMMAND_ID = 'import-approved-pet'

const EDITABLE_TARGET_TYPE = 'editable-action-host'
const EDITABLE_TARGET_ID = 'legacy-editable-host'
const EDITABLE_TARGET_NAME = 'Current Editable Character'
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/
const DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS = 3000

const normalizeText = (value) => String(value || '').trim()

const normalizeSafeRelativePath = (value) => {
  const normalized = normalizeText(value).replace(/\\/g, '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) {
    return ''
  }
  return normalized
}

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

const createUniqueTextList = (values) => {
  const seen = new Set()
  const items = []
  for (const value of Array.isArray(values) ? values : []) {
    const item = normalizeText(value)
    if (!item || seen.has(item)) continue
    seen.add(item)
    items.push(item)
  }
  return items
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

const createProviderView = ({ config = {}, health = {} }) => {
  const readiness = createCreatorProviderReadiness({ config, health })
  return {
    ready: readiness.ok === true,
    code: normalizeText(readiness.code),
    message: normalizeText(readiness.message),
    provider: normalizeText(config.provider),
    model: normalizeText(config.model)
  }
}

const getCreatorVerifiedModels = (config = {}) => {
  const policy = config?.creatorWorkflowModelPolicy
  if (!policy || !Array.isArray(policy.verifiedModels)) return null
  return policy.verifiedModels.map(normalizeText).filter(Boolean)
}

const createCreatorProviderReadiness = ({ config = {}, health = {} }) => {
  if (health?.ok !== true) {
    return {
      ok: false,
      code: normalizeText(health?.code) || 'provider_not_ready',
      message: normalizeText(health?.message) || 'Image Provider is not ready'
    }
  }
  const verifiedModels = getCreatorVerifiedModels(config)
  if (verifiedModels && verifiedModels.length === 0) {
    return {
      ok: false,
      code: 'no_verified_creator_image_model',
      message: '图片 Provider 可达，但 Create 一键默认链路没有已确认可用模型。请到 AI -> 模型 Provider -> 图片模型选择并保存 gpt-image-2，或完成模型发现后再生成。'
    }
  }
  return {
    ok: true,
    code: normalizeText(health?.code) || 'provider_healthy',
    message: normalizeText(health?.message) || 'Image Provider is reachable'
  }
}

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

const createWorkflowResult = ({
  state,
  code,
  message,
  run = null,
  reference = null,
  activePet = null,
  importedAction = null,
  clickAction = '',
  clickActionChange = null,
  basicActions = null,
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
  clickActionChange: clickActionChange && typeof clickActionChange === 'object'
    ? {
        previousActionId: normalizeText(clickActionChange.previousActionId),
        currentActionId: normalizeText(clickActionChange.currentActionId),
        importedActionId: normalizeText(clickActionChange.importedActionId),
        canRestore: Boolean(clickActionChange.canRestore)
      }
    : null,
  basicActions: basicActions && typeof basicActions === 'object'
    ? {
        baseIdentityCoverage: Boolean(basicActions.baseIdentityCoverage),
        requiredRealActionIds: Array.isArray(basicActions.requiredRealActionIds)
          ? basicActions.requiredRealActionIds.map(normalizeText).filter(Boolean)
          : [],
        realActionIds: Array.isArray(basicActions.realActionIds)
          ? basicActions.realActionIds.map(normalizeText).filter(Boolean)
          : [],
        fallbackActionIds: Array.isArray(basicActions.fallbackActionIds)
          ? basicActions.fallbackActionIds.map(normalizeText).filter(Boolean)
          : [],
        missingRequiredActionIds: Array.isArray(basicActions.missingRequiredActionIds)
          ? basicActions.missingRequiredActionIds.map(normalizeText).filter(Boolean)
          : [],
        requiredOfficialActionIds: Array.isArray(basicActions.requiredOfficialActionIds)
          ? basicActions.requiredOfficialActionIds.map(normalizeText).filter(Boolean)
          : [],
        previewFallbackActionIds: Array.isArray(basicActions.previewFallbackActionIds)
          ? basicActions.previewFallbackActionIds.map(normalizeText).filter(Boolean)
          : [],
        missingRequiredOfficialActionIds: Array.isArray(basicActions.missingRequiredOfficialActionIds)
          ? basicActions.missingRequiredOfficialActionIds.map(normalizeText).filter(Boolean)
          : [],
        rows: Array.isArray(basicActions.rows)
          ? basicActions.rows.map((row) => ({
              actionId: normalizeText(row?.actionId),
              sourceActionId: normalizeText(row?.sourceActionId),
              sourceRelativePath: normalizeSafeRelativePath(row?.sourceRelativePath),
              fallback: Boolean(row?.fallback),
              quality: normalizeText(row?.quality)
            })).filter((row) => row.actionId)
          : []
      }
    : null,
  diagnostics: diagnostics && typeof diagnostics === 'object'
    ? diagnostics
    : null
})

const readBasicActionCoverage = ({ pluginDataDir, runId }) => {
  const normalizedRunId = normalizeText(runId)
  if (!pluginDataDir || !normalizedRunId) return null
  const qaPath = path.join(path.resolve(pluginDataDir), 'runs', normalizedRunId, 'qa', 'atlas-validation.json')
  if (!fs.existsSync(qaPath)) return null
  try {
    const qa = JSON.parse(fs.readFileSync(qaPath, 'utf-8'))
    if (qa?.ok !== true) return null
    const basicActions = qa?.basicActions
    return basicActions && typeof basicActions === 'object' && !Array.isArray(basicActions)
      ? basicActions
      : null
  } catch (_) {
    return null
  }
}

const resolveOfficialActionCoverage = (basicActions) => {
  const requiredOfficialActionIds = createUniqueTextList(CODEX_ROWS.map((row) => row.id))
  if (!basicActions || typeof basicActions !== 'object' || Array.isArray(basicActions)) {
    return {
      basicActions: null,
      missingOfficialActionIds: requiredOfficialActionIds
    }
  }
  const realActionIds = new Set(createUniqueTextList(basicActions.realActionIds))
  const reportedMissingActionIds = createUniqueTextList(basicActions.missingRequiredOfficialActionIds)
  const computedMissingActionIds = requiredOfficialActionIds.filter((actionId) => !realActionIds.has(actionId))
  const missingOfficialActionIds = createUniqueTextList([...reportedMissingActionIds, ...computedMissingActionIds])
  return {
    basicActions: {
      ...basicActions,
      requiredOfficialActionIds,
      missingRequiredOfficialActionIds: missingOfficialActionIds
    },
    missingOfficialActionIds
  }
}

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
            multipartImageField: normalizeText(conditioning.multipartImageField),
            requestedOutputCount: Number(conditioning.requestedOutputCount) || 0
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
  characterBrief: normalizeText(stylePrompt) || 'Preserve the selected reference as one reusable full-body animated character.',
  actions: CODEX_ROWS.map((row) => ({
    actionId: row.id,
    name: row.label,
    motionPrompt: `${row.label} motion`,
    loop: Boolean(row.loop),
    frameCount: row.durations.length,
    transparentBackground: true,
    ...(row.id === 'running'
      ? {
          animationType: 'stationary_loop',
          viewDirection: 'preserve the canonical viewpoint',
          animatedParts: ['visible attention features and one small identity-safe processing or scanning motion'],
          lockedParts: ['body root', 'viewpoint', 'character scale', 'identity-bearing features'],
          forbiddenMotion: ['foot-running gait', 'body translation across the canvas', 'camera or viewpoint change']
        }
      : {}),
    triggerProposal: row.id === 'waving'
      ? { type: 'click', binding: 'clickAction', notes: 'Default click action for the generated character.' }
      : row.id === 'idle'
        ? { type: 'state', binding: 'idle', notes: 'Default idle state for the generated character.' }
        : { type: 'manual', notes: `Generated ${row.label} action for the character set.` }
  })),
  questions: []
})

const createExistingActionTask = ({ actionName, motionPrompt }) => {
  const action = {
    actionId: normalizeActionId(actionName, 'custom-action'),
    name: normalizeText(actionName),
    motionPrompt: normalizeText(motionPrompt) || normalizeText(actionName),
    loop: false
  }
  return {
  mode: 'single-action',
  targetPet: 'current',
  styleSource: 'referenceImage',
  characterBrief: `Preserve the selected character identity and visual style while adding the ${normalizeText(actionName)} action.`,
  actions: [{
    ...action,
    animationType: inferAnimationType(action),
    synthesisMode: 'canonical-frame',
    frameCount: 6,
    transparentBackground: true,
    triggerProposal: {
      type: 'click',
      binding: 'clickAction',
      notes: 'Default one-click trigger for the generated custom action.'
    }
  }],
  questions: []
  }
}

const createCreatorWorkflowService = ({
  pluginService,
  imageGenerationModelService,
  actionService,
  creatorReferenceService,
  hatchPetAgentService = null,
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
    const config = imageGenerationModelService.getConfig()
    return {
      ok: true,
      provider: createProviderView({
        config,
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

  const createUnsupportedReferenceImageResult = (message) => createWorkflowResult({
    state: 'missing-input',
    code: 'unsupported_reference_image',
    message: normalizeText(message) || '默认一键生成暂只支持单张干净正面图'
  })

  const inspectApprovedReferenceForDefaultPath = async (referenceToken) => {
    if (!creatorReferenceService?.inspectApprovedSource) return null
    return creatorReferenceService.inspectApprovedSource({ referenceToken })
  }

  const inspectBoundReferenceForDefaultPath = async ({ targetType, targetId }) => {
    if (!creatorReferenceService?.inspectReference) return null
    return creatorReferenceService.inspectReference({ targetType, targetId })
  }

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
    isFullPet = false
  }) => {
    const requestId = idFactory()
    const startedAt = Date.now()
    const plugin = assertPluginReady()
    const health = await getProviderHealth()
    const providerConfig = imageGenerationModelService.getConfig()
    const providerReadiness = createCreatorProviderReadiness({
      config: providerConfig,
      health
    })
    recordLog({
      level: 'info',
      event: 'creator.workflow.started',
      message: 'Creator workflow started',
      details: {
        requestId,
        mode,
        importCommandId,
        providerModel: normalizeText(providerConfig?.model),
        serviceStatus: getPluginServiceRuntimeStatus(plugin, CREATOR_STUDIO_SERVICE_ID)
      }
    })
    if (!providerReadiness.ok) {
      recordLog({
        level: 'error',
        event: 'creator.workflow.blocked',
        message: 'Creator workflow blocked by image provider health',
        details: {
          requestId,
          mode,
          providerCode: normalizeText(providerReadiness.code),
          providerMessage: sanitizeLogText(providerReadiness.message || '', { maxChars: 240 })
        }
      })
      const result = createWorkflowResult({
        state: 'provider-not-ready',
        code: normalizeText(providerReadiness.code) || 'provider_not_ready',
        message: providerReadiness.code === 'no_verified_creator_image_model'
          ? providerReadiness.message
          : '请先到 AI -> 模型 Provider -> 图片模型 配置并保存可用模型，然后再使用生成流程'
      })
      setLastRun(result.run)
      return result
    }

    const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
    const commandId = resolveCommandId(plugin)
    let runId = ''
    let lastCommandResult = null
    let hatchPetAgentShadow = null
    const createHatchPetAgentDiagnostics = () => hatchPetAgentShadow
      ? {
          mode: 'shadow',
          status: normalizeText(hatchPetAgentShadow.status).slice(0, 80),
          code: normalizeText(hatchPetAgentShadow.code).slice(0, 80),
          decision: normalizeText(hatchPetAgentShadow.decision?.decision).slice(0, 80),
          decisionId: normalizeText(hatchPetAgentShadow.decisionId).slice(0, 128)
        }
      : null
    const getWorkflowDiagnostics = () => {
      const diagnostics = readWorkflowDiagnostics({ pluginDataDir, runId })
      if (!runId) return diagnostics
      return {
        ...(diagnostics || {}),
        hatchPetAgent: createHatchPetAgentDiagnostics()
      }
    }
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
      void Promise.resolve()
        .then(() => hatchPetAgentService?.createShadowDecision?.({
          runId,
          mode,
          userIntent: normalizeText(payload.originalPrompt || payload.prompt || task?.characterBrief || task?.actions?.[0]?.description),
          stage: 'planning',
          scope: {},
          workflowEvidence: {
            provider: createProviderView({
              config: imageGenerationModelService.getConfig(),
              health
            })
          }
        }))
        .then((result) => {
          hatchPetAgentShadow = result || null
        })
        .catch((error) => {
          hatchPetAgentShadow = {
            status: 'shadow-failed',
            code: 'hatch_pet_shadow_failed',
            decision: null,
            decisionId: ''
          }
          recordLog({
            level: 'warn',
            event: 'creator.workflow.shadow-planning-failed',
            message: 'Hatch-pet shadow planning failed without delaying the fixed workflow',
            details: {
              requestId,
              mode,
              runId,
              errorName: normalizeText(error?.name),
              errorCode: normalizeText(error?.code),
              errorMessage: sanitizeLogText(error?.message || '', { maxChars: 240 })
            }
          })
        })
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

      const generatedCoverage = importCommandId === CREATOR_STUDIO_IMPORT_PET_COMMAND_ID
        ? readBasicActionCoverage({ pluginDataDir, runId })
        : null
      const {
        basicActions: generatedBasicActions,
        missingOfficialActionIds
      } = resolveOfficialActionCoverage(generatedCoverage)
      if (
        importCommandId === CREATOR_STUDIO_IMPORT_PET_COMMAND_ID &&
        normalizeText(run?.status) === 'ready_for_review' &&
        missingOfficialActionIds.length > 0
      ) {
        const result = createWorkflowResult({
          state: 'preview-ready',
          code: 'preview_ready',
          message: `角色预览已生成，但缺少官方动作行，不能自动批准或导入。请到 Creator Studio 继续处理 run ${runId}`,
          run: createRunView({
            state: 'preview-ready',
            mode,
            runId,
            commandId: generated?.commandId || CREATOR_STUDIO_GENERATE_COMMAND_ID,
            message: getCommandMessage(generated, 'Preview output requires official action rows before import')
          }),
          reference: creatorReferenceService.getReference(referenceTarget),
          basicActions: generatedBasicActions,
          diagnostics: getWorkflowDiagnostics()
        })
        recordLog({
          level: 'info',
          event: 'creator.workflow.preview-ready',
          message: 'Creator workflow produced preview-only full-pet output',
          details: {
            requestId,
            mode,
            runId,
            missingOfficialActionIds,
            elapsedMs: Date.now() - startedAt
          }
        })
        setLastRun(result.run)
        return result
      }

      const result = createWorkflowResult({
        state: 'review-required',
        code: 'human_review_required',
        message: `生成已完成，请在 Creator Studio 人工复查 run ${runId}；批准、导入和激活必须分别明确执行。`,
        run: createRunView({
          state: 'review-required',
          mode,
          runId,
          commandId: generated?.commandId || CREATOR_STUDIO_GENERATE_COMMAND_ID,
          message: getCommandMessage(generated, 'Generation completed and requires human review')
        }),
        reference: creatorReferenceService.getReference(referenceTarget),
        basicActions: generatedBasicActions,
        diagnostics: getWorkflowDiagnostics()
      })
      recordLog({
        level: 'info',
        event: 'creator.workflow.human-review-required',
        message: 'Creator workflow stopped for explicit human review',
        details: {
          requestId,
          mode,
          runId,
          lastCommandId: normalizeText(generated?.commandId || CREATOR_STUDIO_GENERATE_COMMAND_ID),
          elapsedMs: Date.now() - startedAt
        }
      })
      setLastRun(result.run)
      return result
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'creator.workflow.failed',
        message: 'Creator workflow failed',
        details: {
          requestId,
          mode,
          runId,
          lastCommandId: normalizeText(lastCommandResult?.commandId),
          errorName: normalizeText(error?.name),
          errorCode: normalizeText(error?.code),
          errorMessage: sanitizeLogText(error?.message || '', { maxChars: 240 }),
          elapsedMs: Date.now() - startedAt
        }
      })
      const failureState = lastCommandResult?.commandId === CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID || lastCommandResult?.commandId === CREATOR_STUDIO_IMPORT_PET_COMMAND_ID
        ? 'import-failed'
        : 'review-required'
      const contractFailureCodes = new Set([
        'reference_image_required',
        'reference_image_count_invalid',
        'reference_image_invalid',
        'reference_image_unusable',
        'image_prompt_contract_invalid',
        'image_prompt_internal_term'
      ])
      const failureCode = contractFailureCodes.has(normalizeText(error?.code))
        ? normalizeText(error.code)
        : failureState === 'import-failed'
          ? 'import_failed'
          : 'workflow_failed'
      const result = createWorkflowResult({
        state: failureState,
        code: failureCode,
        message: runId
          ? `生成流程在 run ${runId} 失败：${error.message || '未知错误'}。可到 Creator Studio 查看详情。`
          : (error.message || 'Creator workflow failed'),
        run: runId
          ? createRunView({
              state: 'review-required',
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
        const inspection = await inspectApprovedReferenceForDefaultPath(normalizedReferenceImageToken)
        if (inspection && inspection.defaultPathEligible === false) {
          return createUnsupportedReferenceImageResult(inspection.message)
        }
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
          prompt: normalizeText(stylePrompt) || 'Preserve the selected reference as one reusable full-body animated character.',
          originalPrompt: normalizeText(stylePrompt) || 'Preserve the selected reference as one reusable full-body animated character.'
        },
        referenceTarget: {
          targetType: 'pet-pack',
          targetId: petId
        },
        isFullPet: true
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
          const inspection = await inspectApprovedReferenceForDefaultPath(normalizedReferenceImageToken)
          if (inspection && inspection.defaultPathEligible === false) {
            return createUnsupportedReferenceImageResult(inspection.message)
          }
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
        if (reference) {
          const inspection = await inspectBoundReferenceForDefaultPath({
            targetType: EDITABLE_TARGET_TYPE,
            targetId: EDITABLE_TARGET_ID
          })
          if (inspection && inspection.defaultPathEligible === false) {
            return createUnsupportedReferenceImageResult(inspection.message)
          }
        }
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
        isFullPet: false
      })
    })
  }

  const runRepairWorkflow = async ({ runId, actionId = '', commandId, label }) => {
    const normalizedRunId = normalizeText(runId)
    const normalizedActionId = normalizeText(actionId)
    if (!normalizedRunId) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_run_id',
        message: 'Creator repair requires a run id'
      })
    }
    if (commandId === CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID && !normalizedActionId) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_action_id',
        message: 'Creator action repair requires an action id'
      })
    }
    return runExclusively({
      mode: 'full-pet',
      message: label
    }, async () => {
      assertPluginReady()
      const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
      const commandResult = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, commandId, {
        runId: normalizedRunId,
        ...(normalizedActionId ? { actionId: normalizedActionId } : {})
      })
      const run = getCreatorStudioRun(commandResult)
      if (!run?.runId) throw new Error('Creator Studio repair did not return a run')
      const coverage = readBasicActionCoverage({ pluginDataDir, runId: run.runId })
      const { basicActions } = resolveOfficialActionCoverage(coverage)
      return createWorkflowResult({
        state: 'review-required',
        code: commandId === CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID
          ? 'action_repair_review_required'
          : 'identity_repair_review_required',
        message: commandId === CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID
          ? `动作 ${normalizedActionId} 已重新生成，请在 Creator Studio 复查 run ${run.runId}`
          : `Canonical identity 已重新生成，请在 Creator Studio 复查全部动作 run ${run.runId}`,
        run: createRunView({
          state: 'review-required',
          mode: 'full-pet',
          runId: run.runId,
          commandId,
          message: getCommandMessage(commandResult, label)
        }),
        basicActions,
        diagnostics: readWorkflowDiagnostics({ pluginDataDir, runId: run.runId })
      })
    })
  }

  const retryFullPetAction = ({ runId, actionId }) => runRepairWorkflow({
    runId,
    actionId,
    commandId: CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID,
    label: `正在修复动作 ${normalizeText(actionId)}`
  })

  const retryFullPetIdentity = ({ runId }) => runRepairWorkflow({
    runId,
    commandId: CREATOR_STUDIO_RETRY_IDENTITY_COMMAND_ID,
    label: '正在重新生成 canonical identity'
  })

  return {
    approveReferenceSourcePath,
    getState,
    getLastRun,
    bindReference,
    generateNewCharacter,
    generateExistingAction,
    retryFullPetAction,
    retryFullPetIdentity
  }
}

module.exports = {
  __testInternals: {
    readBasicActionCoverage,
    resolveOfficialActionCoverage
  },
  CREATOR_STUDIO_DASHBOARD_ID,
  CREATOR_STUDIO_PLUGIN_ID,
  EDITABLE_TARGET_ID,
  EDITABLE_TARGET_NAME,
  EDITABLE_TARGET_TYPE,
  createCreatorWorkflowService
}
