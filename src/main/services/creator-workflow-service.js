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
const CREATOR_STUDIO_ACCEPT_IDENTITY_COMMAND_ID = 'accept-identity'
const CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID = 'retry-action'
const CREATOR_STUDIO_RETRY_IDENTITY_COMMAND_ID = 'retry-identity'

const EDITABLE_TARGET_TYPE = 'editable-action-host'
const EDITABLE_TARGET_ID = 'legacy-editable-host'
const EDITABLE_TARGET_NAME = 'Current Editable Character'
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/
const SAFE_RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const SAFE_PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS = 10000
const CREATOR_PROVIDER_HEALTH_CACHE_TTL_MS = 30000

const normalizeText = (value) => String(value || '').trim()

const createProviderHealthKey = (config = {}) => JSON.stringify([
  normalizeText(config.provider),
  normalizeText(config.baseUrl).replace(/\/+$/, ''),
  normalizeText(config.model),
  normalizeText(config.apiKeyRef),
  normalizeText(config.organization),
  normalizeText(config.project)
])

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

const isSafeRunId = (value) => SAFE_RUN_ID_PATTERN.test(normalizeText(value))

const isSafePathSegment = (value) => SAFE_PATH_SEGMENT_PATTERN.test(normalizeText(value))

const isPathInsideDirectory = ({ rootPath, targetPath, requireExisting = false }) => {
  try {
    const root = path.resolve(rootPath)
    const target = path.resolve(targetPath)
    const relative = path.relative(root, target)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false
    if (!requireExisting) return true
    if (!fs.existsSync(root) || !fs.existsSync(target)) return false
    const rootStat = fs.lstatSync(root)
    const targetStat = fs.lstatSync(target)
    if (rootStat.isSymbolicLink() || targetStat.isSymbolicLink()) return false
    const realRoot = fs.realpathSync.native(root)
    const realTarget = fs.realpathSync.native(target)
    const realRelative = path.relative(realRoot, realTarget)
    return realRelative !== '..' && !realRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(realRelative)
  } catch (_) {
    return false
  }
}

const getSafeCreatorRunDir = ({ pluginDataDir, runId, requireExisting = false }) => {
  const normalizedRunId = normalizeText(runId)
  if (!pluginDataDir || !isSafeRunId(normalizedRunId)) return null
  const dataRoot = path.resolve(pluginDataDir)
  const runsRoot = path.join(dataRoot, 'runs')
  const runDir = path.join(runsRoot, normalizedRunId)
  if (!isPathInsideDirectory({ rootPath: runsRoot, targetPath: runDir })) return null
  if (requireExisting && !isPathInsideDirectory({ rootPath: runsRoot, targetPath: runDir, requireExisting: true })) return null
  return { dataRoot, runsRoot, runDir, runId: normalizedRunId }
}

const isRunRelativePath = ({ runId, relativePath }) => {
  const normalizedRunId = normalizeText(runId)
  const normalizedPath = normalizeSafeRelativePath(relativePath)
  return Boolean(
    isSafeRunId(normalizedRunId) &&
    normalizedPath.startsWith(`runs/${normalizedRunId}/`)
  )
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

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))

const createActionAvailabilityView = (value) => {
  if (!isPlainObject(value)) return {}
  return Object.fromEntries(Object.entries(value)
    .map(([actionId, evidence]) => {
      const normalizedActionId = normalizeText(actionId)
      if (!normalizedActionId || !isPlainObject(evidence)) return null
      return [normalizedActionId, {
        available: evidence.available === true,
        quality: normalizeText(evidence.quality).slice(0, 80),
        reason: normalizeText(evidence.reason).slice(0, 160)
      }]
    })
    .filter(Boolean))
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

const createProviderBlockedMessage = (readiness = {}) => {
  const code = normalizeText(readiness.code)
  if (code === 'no_verified_creator_image_model') return normalizeText(readiness.message)
  if (code === 'health_check_timeout') {
    return '图片 Provider 响应较慢，健康检查已超时；这不代表配置或图片模型失效，请稍后重试'
  }
  if (code === 'provider_config_changed') {
    return '图片 Provider 配置刚刚发生变化，请重新发起生成'
  }
  return '请先到 AI -> 模型 Provider -> 图片模型 配置并保存可用模型，然后再使用生成流程'
}

const createRunView = ({
  state,
  mode = '',
  runId = '',
  commandId = '',
  message = '',
  importedActionId = '',
  importedPackId = '',
  activatedPackId = '',
  diagnostics = null
} = {}) => ({
  state,
  mode: normalizeText(mode),
  runId: normalizeText(runId),
  commandId: normalizeText(commandId),
  message: normalizeText(message),
  importedActionId: normalizeText(importedActionId),
  importedPackId: normalizeText(importedPackId),
  activatedPackId: normalizeText(activatedPackId),
  diagnostics: diagnostics && typeof diagnostics === 'object' ? diagnostics : null
})

const createGeneratingRunView = ({
  mode = '',
  runId = '',
  commandId = '',
  message = '',
  diagnostics = null
} = {}) => createRunView({
  state: 'generating',
  mode,
  runId,
  commandId,
  message: normalizeText(message) || '生成任务进行中',
  diagnostics
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
  diagnostics = null,
  actionAssets = null,
  processAssets = null,
  completeness = '',
  availableActionIds = null,
  failedActionIds = null,
  omittedActionIds = null,
  degradedActionIds = null,
  importNotes = ''
}) => finalizeWorkflowResult({
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
        requiredActionIds: Array.isArray(basicActions.requiredActionIds)
          ? basicActions.requiredActionIds.map(normalizeText).filter(Boolean)
          : [],
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
        availableActionIds: Array.isArray(basicActions.availableActionIds)
          ? basicActions.availableActionIds.map(normalizeText).filter(Boolean)
          : [],
        omittedActionIds: Array.isArray(basicActions.omittedActionIds)
          ? basicActions.omittedActionIds.map(normalizeText).filter(Boolean)
          : [],
        actionAvailability: createActionAvailabilityView(basicActions.actionAvailability),
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
    : null,
  actionAssets: Array.isArray(actionAssets)
    ? actionAssets.map((asset) => ({
        actionId: normalizeText(asset?.actionId),
        kind: normalizeText(asset?.kind) || 'frame',
        relativePath: normalizeSafeRelativePath(asset?.relativePath),
        label: normalizeText(asset?.label).slice(0, 80),
        role: normalizeText(asset?.role).slice(0, 80),
        previewable: Boolean(asset?.previewable),
        ...(asset?.promptText ? { promptText: String(asset.promptText).slice(0, 12000) } : {}),
        ...(normalizeSafeRelativePath(asset?.promptRelativePath)
          ? { promptRelativePath: normalizeSafeRelativePath(asset.promptRelativePath) }
          : {}),
        failureEvidence: asset?.failureEvidence && typeof asset.failureEvidence === 'object'
          ? describeFailureEvidence(asset.failureEvidence)
          : null
      })).filter((asset) => asset.actionId && asset.relativePath)
    : [],
  processAssets: Array.isArray(processAssets)
    ? processAssets.map((asset) => ({
        actionId: normalizeText(asset?.actionId) || 'process',
        kind: normalizeText(asset?.kind) || 'process',
        relativePath: normalizeSafeRelativePath(asset?.relativePath),
        label: normalizeText(asset?.label).slice(0, 80),
        role: normalizeText(asset?.role).slice(0, 80),
        previewable: Boolean(asset?.previewable),
        failureEvidence: asset?.failureEvidence && typeof asset.failureEvidence === 'object'
          ? describeFailureEvidence(asset.failureEvidence)
          : null
      })).filter((asset) => asset.relativePath)
    : [],
  completeness: ['full', 'partial', 'none'].includes(normalizeText(completeness))
    ? normalizeText(completeness)
    : (['full', 'partial', 'none'].includes(normalizeText(diagnostics?.progress?.completeness))
      ? normalizeText(diagnostics.progress.completeness)
      : ''),
  availableActionIds: Array.isArray(availableActionIds)
    ? availableActionIds.map(normalizeText).filter(Boolean)
    : (Array.isArray(diagnostics?.progress?.availableActionIds)
      ? diagnostics.progress.availableActionIds.map(normalizeText).filter(Boolean)
      : []),
  failedActionIds: Array.isArray(failedActionIds)
    ? failedActionIds.map(normalizeText).filter(Boolean)
    : (Array.isArray(diagnostics?.progress?.failedActionIds)
      ? diagnostics.progress.failedActionIds.map(normalizeText).filter(Boolean)
      : []),
  omittedActionIds: Array.isArray(omittedActionIds)
    ? omittedActionIds.map(normalizeText).filter(Boolean)
    : [],
  degradedActionIds: Array.isArray(degradedActionIds)
    ? degradedActionIds.map(normalizeText).filter(Boolean)
    : [],
  importNotes: normalizeText(importNotes).slice(0, 400)
})

const readBasicActionCoverage = ({ pluginDataDir, runId }) => {
  const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId, requireExisting: true })
  if (!safeRun) return null
  const qaPath = path.join(safeRun.runDir, 'qa', 'atlas-validation.json')
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
  const defaultRequiredActionIds = ['idle']
  if (!isPlainObject(basicActions)) {
    return {
      basicActions: null,
      missingOfficialActionIds: defaultRequiredActionIds
    }
  }

  const hasPartialCoverageEvidence = (
    Array.isArray(basicActions.availableActionIds) ||
    Array.isArray(basicActions.omittedActionIds) ||
    isPlainObject(basicActions.actionAvailability)
  )
  const explicitRequiredActionIds = createUniqueTextList(basicActions.requiredActionIds)
  const legacyRequiredActionIds = !hasPartialCoverageEvidence
    ? createUniqueTextList(basicActions.requiredOfficialActionIds)
    : []
  const requiredActionIds = explicitRequiredActionIds.length > 0
    ? explicitRequiredActionIds
    : legacyRequiredActionIds.length > 0
      ? legacyRequiredActionIds
      : defaultRequiredActionIds

  const availableActionIds = new Set(createUniqueTextList(
    Array.isArray(basicActions.availableActionIds)
      ? basicActions.availableActionIds
      : basicActions.realActionIds
  ))
  const omittedActionIds = new Set(createUniqueTextList(basicActions.omittedActionIds))
  const actionAvailability = createActionAvailabilityView(basicActions.actionAvailability)

  for (const [sourceActionId, derivedActionId] of [['running-right', 'running-left']]) {
    if (availableActionIds.has(sourceActionId) === availableActionIds.has(derivedActionId)) continue
    availableActionIds.delete(sourceActionId)
    availableActionIds.delete(derivedActionId)
    omittedActionIds.add(sourceActionId)
    omittedActionIds.add(derivedActionId)
    actionAvailability[sourceActionId] = { available: false, quality: '', reason: 'directional-pair-incomplete' }
    actionAvailability[derivedActionId] = { available: false, quality: '', reason: 'directional-pair-incomplete' }
  }

  const reportedMissingActionIds = createUniqueTextList(
    explicitRequiredActionIds.length > 0
      ? basicActions.missingRequiredActionIds
      : legacyRequiredActionIds.length > 0
        ? basicActions.missingRequiredOfficialActionIds
        : []
  )
  const computedMissingActionIds = requiredActionIds.filter((actionId) => !availableActionIds.has(actionId))
  const missingOfficialActionIds = createUniqueTextList([...reportedMissingActionIds, ...computedMissingActionIds])
  return {
    basicActions: {
      ...basicActions,
      requiredActionIds,
      availableActionIds: [...availableActionIds],
      omittedActionIds: [...omittedActionIds].filter((actionId) => !availableActionIds.has(actionId)),
      actionAvailability,
      missingRequiredActionIds: missingOfficialActionIds
    },
    missingOfficialActionIds
  }
}

const OFFICIAL_PROGRESS_ACTION_IDS = [
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

const WORKFLOW_STAGE_DEFS = [
  { id: 'draft', label: '起草任务' },
  { id: 'confirm', label: '确认任务' },
  { id: 'generate', label: '生成资源' },
  { id: 'quality-gate', label: '质量门' },
  { id: 'review', label: '人工复查' },
  { id: 'import', label: '导入激活' }
]

const sanitizeProgressReason = (value) => sanitizeLogText(normalizeText(value), { maxChars: 180 })

const MIME_BY_EXT = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
})

const IMAGE_PREVIEW_MAX_BYTES = 1_500_000
const PROMPT_TEXT_MAX_CHARS = 12000

const FAILURE_CODE_PLAIN_MESSAGES = Object.freeze({
  'identity-descriptor-distance-high': '角色身份特征偏离参考太多（轮廓/五官/配色不一致）',
  'identity-descriptor-distance': '角色身份特征偏离参考太多',
  identityDescriptorDistance: '角色身份特征偏离参考太多',
  'identity-drift': '角色身份漂移，和参考图不是同一只角色',
  identity_drift: '角色身份漂移，和参考图不是同一只角色',
  row_identity_shape_drift: '动作帧外形相对参考变化过大',
  row_identity_reference_mismatch: '动作帧与身份参考不匹配',
  row_identity_descriptor_mismatch: '动作帧身份描述符不匹配',
  'semantic-mismatch': '动作语义不清晰，看不出目标动作',
  semantic_mismatch: '动作语义不清晰，看不出目标动作',
  'static-motion': '几乎没有真正的动作变化（帧太静）',
  static_motion: '几乎没有真正的动作变化（帧太静）',
  'transform-only-motion': '只是平移/缩放/旋转，没有真实姿态变化',
  transform_only_motion: '只是平移/缩放/旋转，没有真实姿态变化',
  'edge-contact': '角色贴边或裁切，身体不完整',
  edge_contact: '角色贴边或裁切，身体不完整',
  'background-contamination': '背景不干净（有地面/阴影/场景/文字）',
  background_contamination: '背景不干净（有地面/阴影/场景/文字）',
  'baseline-instability': '落脚点/根部位置不稳定',
  baseline_instability: '落脚点/根部位置不稳定',
  'scale-instability': '角色比例在序列中忽大忽小',
  scale_instability: '角色比例在序列中忽大忽小',
  'direction-mismatch': '朝向与目标方向不一致',
  direction_mismatch: '朝向与目标方向不一致',
  action_failed: '动作生成失败',
  workflow_failed: '工作流失败',
  identity_repair_review_required: '身份修复后仍需复查',
  action_repair_review_required: '动作修复后仍需复查'
})

const describeFailureCode = (code) => {
  const normalized = normalizeText(code)
  if (!normalized) return ''
  if (FAILURE_CODE_PLAIN_MESSAGES[normalized]) return FAILURE_CODE_PLAIN_MESSAGES[normalized]
  const dashed = normalized.replace(/_/g, '-')
  if (FAILURE_CODE_PLAIN_MESSAGES[dashed]) return FAILURE_CODE_PLAIN_MESSAGES[dashed]
  const underscored = normalized.replace(/-/g, '_')
  if (FAILURE_CODE_PLAIN_MESSAGES[underscored]) return FAILURE_CODE_PLAIN_MESSAGES[underscored]
  return sanitizeProgressReason(normalized.replace(/[-_]+/g, ' '))
}

const describeFailureEvidence = (input = {}) => {
  const normalizedCode = normalizeText(input.code)
  const rawMessage = sanitizeProgressReason(input.message)
  const plain = describeFailureCode(normalizedCode)
  let plainMessage = plain
  if (rawMessage && plain && rawMessage.toLowerCase() !== normalizedCode.toLowerCase() && rawMessage !== plain) {
    if (!plain.includes(rawMessage) && rawMessage.length <= 80 && !/^[a-z0-9._-]+$/i.test(rawMessage)) {
      plainMessage = `${plain}（${rawMessage}）`
    }
  } else if (!plain && rawMessage) {
    plainMessage = rawMessage
  } else if (!plainMessage) {
    plainMessage = '动作未通过质量检查'
  }
  return {
    code: normalizedCode.slice(0, 80),
    message: plainMessage.slice(0, 180),
    score: Number.isFinite(Number(input.score)) ? Number(input.score) : null
  }
}

const canPreviewImageFile = (absolutePath) => {
  try {
    if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return false
    const size = fs.statSync(absolutePath).size
    if (!Number.isFinite(size) || size <= 0 || size > IMAGE_PREVIEW_MAX_BYTES) return false
    const ext = path.extname(absolutePath).toLowerCase()
    return Boolean(MIME_BY_EXT[ext])
  } catch (_) {
    return false
  }
}

const stripPreviewDataUrlsFromValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => stripPreviewDataUrlsFromValue(item))
  }
  if (!value || typeof value !== 'object') return value
  const next = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'previewDataUrl') continue
    next[key] = stripPreviewDataUrlsFromValue(item)
  }
  return next
}

const toRunRelativePath = ({ pluginDataDir, runId, absolutePath }) => {
  const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId, requireExisting: true })
  if (!safeRun) return ''
  const runRoot = safeRun.runDir
  const absolute = path.resolve(absolutePath)
  const relative = path.relative(runRoot, absolute).split(path.sep).join('/')
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return ''
  if (!isPathInsideDirectory({ rootPath: runRoot, targetPath: absolute, requireExisting: true })) return ''
  return `runs/${safeRun.runId}/${relative}`
}

const fileToPreviewDataUrl = (absolutePath) => {
  try {
    if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return ''
    const size = fs.statSync(absolutePath).size
    if (!Number.isFinite(size) || size <= 0 || size > IMAGE_PREVIEW_MAX_BYTES) return ''
    const ext = path.extname(absolutePath).toLowerCase()
    const mime = MIME_BY_EXT[ext]
    if (!mime) return ''
    return `data:${mime};base64,${fs.readFileSync(absolutePath).toString('base64')}`
  } catch (_) {
    return ''
  }
}

const readPromptTextIfExists = (absolutePath) => {
  try {
    if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return ''
    const text = fs.readFileSync(absolutePath, 'utf-8')
    return sanitizeLogText(String(text || ''), { maxChars: PROMPT_TEXT_MAX_CHARS })
  } catch (_) {
    return ''
  }
}

const listImageFilesRecursive = (dirPath, limit = 24) => {
  const results = []
  if (!dirPath || !fs.existsSync(dirPath)) return results
  const stack = [dirPath]
  while (stack.length && results.length < limit) {
    const current = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (_) {
      continue
    }
    for (const entry of entries) {
      if (results.length >= limit) break
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!MIME_BY_EXT[ext]) continue
      results.push(full)
    }
  }
  return results.sort()
}

const createFailureEvidenceList = (record = {}) => {
  const items = []
  const failureConditions = Array.isArray(record.failureConditions)
    ? record.failureConditions.map((item) => normalizeText(item)).filter(Boolean)
    : []
  for (const code of failureConditions.slice(0, 8)) {
    items.push(describeFailureEvidence({ code, message: code, score: null }))
  }
  const errorText = sanitizeProgressReason(record.error)
  if (errorText && !items.some((item) => item.message === errorText || item.code === errorText || item.code === normalizeText(record.error))) {
    items.unshift(describeFailureEvidence({
      code: failureConditions[0] || 'action_failed',
      message: errorText,
      score: null
    }))
  }
  const scoreCandidates = [
    record?.quality?.score,
    record?.row?.qualityScore,
    record?.score
  ]
  for (const candidate of scoreCandidates) {
    const score = Number(candidate)
    if (Number.isFinite(score) && items[0]) {
      items[0].score = score
      break
    }
  }
  return items
}

const collectProcessAssetsForRun = ({ pluginDataDir, runId, includePreviews = false }) => {
  const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId, requireExisting: true })
  if (!safeRun) return []
  const { runDir, runId: normalizedRunId } = safeRun
  const processAssets = []
  const seen = new Set()

  const add = ({ absolutePath, kind, label, role = '', actionId = 'process' }) => {
    if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return
    const relative = toRunRelativePath({ pluginDataDir, runId: normalizedRunId, absolutePath })
    if (!relative || seen.has(relative)) return
    seen.add(relative)
    const previewable = canPreviewImageFile(absolutePath)
    const previewDataUrl = includePreviews && previewable ? fileToPreviewDataUrl(absolutePath) : ''
    processAssets.push({
      actionId: normalizeText(actionId) || 'process',
      kind: normalizeText(kind) || 'process',
      relativePath: relative,
      label: normalizeText(label).slice(0, 80),
      role: normalizeText(role).slice(0, 80),
      previewable,
      ...(previewDataUrl ? { previewDataUrl } : {}),
      failureEvidence: null
    })
  }

  const anchorDir = path.join(runDir, 'inputs', 'anchors')
  for (const absolute of listImageFilesRecursive(anchorDir, 12)) {
    const base = path.basename(absolute).toLowerCase()
    const isIdentity = /identity|canonical|character-anchor/.test(base)
    add({
      absolutePath: absolute,
      kind: isIdentity ? 'identity' : 'anchor',
      label: isIdentity ? '身份参考' : '锚定板',
      role: isIdentity ? 'identity-reference' : 'anchor-board'
    })
  }

  const keyframeActionDir = path.join(runDir, 'inputs', 'keyframes', 'actions')
  for (const absolute of listImageFilesRecursive(keyframeActionDir, 24)) {
    const base = path.basename(absolute).toLowerCase()
    if (!/conditioning|reference-board|identity-board/.test(base)) continue
    const actionIdGuess = base.split('-')[0]
    const kind = /conditioning/.test(base)
      ? 'conditioning-board'
      : (/identity/.test(base) ? 'identity' : 'anchor')
    add({
      absolutePath: absolute,
      kind,
      label: kind === 'conditioning-board' ? '条件板' : (kind === 'identity' ? '身份板' : '参考板'),
      role: base.replace(/\.(png|webp|jpe?g|gif)$/i, ''),
      actionId: isSafePathSegment(actionIdGuess) ? actionIdGuess : 'process'
    })
  }

  const qualityReferenceDir = path.join(runDir, 'references')
  for (const absolute of listImageFilesRecursive(qualityReferenceDir, 32)) {
    const relativeToReferences = path.relative(qualityReferenceDir, absolute).split(path.sep)
    const actionId = isSafePathSegment(relativeToReferences[0]) ? relativeToReferences[0] : 'process'
    const base = path.basename(absolute).toLowerCase()
    add({
      absolutePath: absolute,
      kind: /action-reference-board/.test(base) ? 'conditioning-board' : 'anchor',
      label: /action-reference-board/.test(base) ? `${actionId} 条件板` : `${actionId} 角色锚定板`,
      role: base.replace(/\.(png|webp|jpe?g|gif)$/i, ''),
      actionId
    })
  }

  const qualityCandidateDir = path.join(runDir, 'candidates')
  for (const absolute of listImageFilesRecursive(qualityCandidateDir, 128)) {
    const relativeToCandidates = path.relative(qualityCandidateDir, absolute).split(path.sep)
    const scope = normalizeText(relativeToCandidates[0])
    const actionId = scope.startsWith('action-') ? scope.slice('action-'.length) : scope
    if (!isSafePathSegment(actionId) || actionId === 'canonical') continue
    const relativeText = relativeToCandidates.join('/').toLowerCase()
    const base = path.basename(absolute).toLowerCase()
    const kind = /\/frames\//.test(`/${relativeText}`)
      ? 'frame'
      : /contact-sheet/.test(base)
        ? 'process'
        : /animation\.gif$/.test(base)
          ? 'process'
          : /sheet/.test(base) || /\/raw\//.test(`/${relativeText}`)
            ? 'sheet'
            : 'process'
    add({
      absolutePath: absolute,
      kind,
      label: kind === 'frame' ? `${actionId} 候选帧` : kind === 'sheet' ? `${actionId} 候选原图` : `${actionId} 处理产物`,
      role: relativeText.includes('/raw/') ? 'raw-candidate' : relativeText.includes('/processed/') ? 'processed-candidate' : 'candidate-evidence',
      actionId
    })
  }

  const qualityPackageDir = path.join(runDir, 'quality-first')
  for (const absolute of listImageFilesRecursive(qualityPackageDir, 32)) {
    const base = path.basename(absolute).toLowerCase()
    add({
      absolutePath: absolute,
      kind: /sprite/.test(base) ? 'sheet' : 'process',
      label: /sprite/.test(base) ? 'Quality-first Sprite Sheet' : 'Quality-first review artifact',
      role: 'quality-first-package'
    })
  }

  const runJson = readJsonIfExists(path.join(runDir, 'run.json'), null)
  const artifactCandidates = [
    runJson?.artifacts?.spritesheet,
    runJson?.artifacts?.spriteSheet,
    runJson?.artifacts?.contactSheet,
    path.join(runDir, 'spritesheet.webp'),
    path.join(runDir, 'spritesheet.png'),
    path.join(runDir, 'output', 'spritesheet.webp'),
    path.join(runDir, 'qa', 'full-pet-contact-sheet.png'),
    path.join(runDir, 'qa', 'previews', 'full-pet-contact-sheet.png')
  ]
  for (const candidate of artifactCandidates) {
    if (!candidate) continue
    const absolute = path.isAbsolute(String(candidate))
      ? String(candidate)
      : path.join(path.resolve(pluginDataDir), normalizeSafeRelativePath(candidate) || String(candidate))
    const base = path.basename(String(absolute)).toLowerCase()
    const isSheet = /sprite/.test(base)
    add({
      absolutePath: absolute,
      kind: isSheet ? 'sheet' : 'process',
      label: isSheet ? 'Sprite Sheet' : 'Contact Sheet',
      role: isSheet ? 'spritesheet' : 'contact-sheet'
    })
  }

  for (const actionId of OFFICIAL_PROGRESS_ACTION_IDS) {
    for (const name of ['strip.png', 'strip.webp']) {
      add({
        absolutePath: path.join(runDir, 'rows', actionId, name),
        kind: 'row',
        label: actionId + ' 动作条',
        role: 'row-strip',
        actionId
      })
    }
  }

  return processAssets.filter((asset) => normalizeSafeRelativePath(asset.relativePath))
}

const collectActionAssetsForRun = ({ pluginDataDir, runId, checkpoints = null, includePreviews = false }) => {
  const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId, requireExisting: true })
  if (!safeRun) {
    return {
      actions: [],
      actionAssets: [],
      processAssets: [],
      availableActionIds: [],
      failedActionIds: [],
      importableActionIds: [],
      completeness: 'none'
    }
  }
  const { dataRoot, runDir, runId: normalizedRunId } = safeRun
  const checkpointActions = isPlainObject(checkpoints?.actions)
    ? checkpoints.actions
    : readJsonIfExists(path.join(runDir, 'full-pet-action-checkpoints.json'), { actions: {} })?.actions || {}
  const actionIds = createUniqueTextList([
    ...OFFICIAL_PROGRESS_ACTION_IDS,
    ...Object.keys(isPlainObject(checkpointActions) ? checkpointActions : {})
  ]).filter(isSafePathSegment)
  const actionAssets = []
  const actionViews = []
  const availableActionIds = []
  const failedActionIds = []
  const importableActionIds = []
  const processAssets = collectProcessAssetsForRun({
    pluginDataDir,
    runId: normalizedRunId,
    includePreviews
  })
  const identityProcess = processAssets.find((asset) => asset.kind === 'identity')
    || processAssets.find((asset) => asset.kind === 'anchor')
    || null

  for (const actionId of actionIds) {
    const record = isPlainObject(checkpointActions?.[actionId]) ? checkpointActions[actionId] : null
    const assets = []
    const failureEvidence = createFailureEvidenceList(record || {})
    let promptRelativePath = ''
    let promptText = ''

    const promptCandidates = [
      ...(() => {
        const qualityPromptDir = path.join(runDir, 'prompts', 'quality-first')
        if (!fs.existsSync(qualityPromptDir)) return []
        return fs.readdirSync(qualityPromptDir)
          .filter((name) => name.startsWith(`${actionId}-`) && /\.(txt|md)$/i.test(name))
          .sort()
          .map((name) => path.join(qualityPromptDir, name))
      })(),
      path.join(runDir, 'prompts', 'rows', `${actionId}.txt`),
      path.join(runDir, 'prompts', 'rows', `${actionId}.md`),
      path.join(runDir, 'prompts', 'keyframes', 'actions', `${actionId}-sprite-row.md`),
      path.join(runDir, 'prompts', 'keyframes', 'actions', `${actionId}.md`)
    ]
    for (const candidate of promptCandidates) {
      if (!fs.existsSync(candidate)) continue
      promptRelativePath = toRunRelativePath({ pluginDataDir, runId: normalizedRunId, absolutePath: candidate })
      promptText = readPromptTextIfExists(candidate)
      if (promptRelativePath) {
        assets.push({
          actionId,
          kind: 'prompt',
          relativePath: promptRelativePath,
          label: '提示词',
          role: 'prompt',
          previewable: false,
          promptText,
          promptRelativePath,
          failureEvidence: null
        })
      }
      break
    }

    if (identityProcess) {
      assets.push({
        ...identityProcess,
        actionId,
        kind: 'identity',
        label: identityProcess.label || '参考身份',
        role: identityProcess.role || 'identity-reference',
        failureEvidence: null
      })
    }

    for (const processAsset of processAssets) {
      if (processAsset.actionId !== actionId) continue
      if (!['conditioning-board', 'anchor', 'sheet', 'row', 'frame', 'process'].includes(processAsset.kind)) continue
      if (assets.some((asset) => asset.relativePath === processAsset.relativePath)) continue
      assets.push({
        ...processAsset,
        actionId,
        failureEvidence: record?.ok === false ? (failureEvidence[0] || null) : null
      })
      if (processAsset.kind !== 'row') {
        actionAssets.push(assets[assets.length - 1])
      }
    }

    const keyframes = Array.isArray(record?.keyframes) ? record.keyframes : []
    for (const [index, keyframe] of keyframes.slice(0, 4).entries()) {
      const relative = normalizeSafeRelativePath(
        keyframe?.relativePath || keyframe?.dataRelativePath || keyframe?.outputRelativePath
      )
      if (!relative) continue
      if (!isRunRelativePath({ runId: normalizedRunId, relativePath: relative })) continue
      const absolute = path.join(dataRoot, relative)
      const previewable = canPreviewImageFile(absolute)
      const previewDataUrl = includePreviews && previewable ? fileToPreviewDataUrl(absolute) : ''
      const keyframePrompt = normalizeSafeRelativePath(keyframe?.promptRelativePath)
      const keyframePromptInRun = isRunRelativePath({ runId: normalizedRunId, relativePath: keyframePrompt })
      const keyframePromptText = keyframePromptInRun
        ? readPromptTextIfExists(path.join(dataRoot, keyframePrompt))
        : ''
      assets.push({
        actionId,
        kind: 'keyframe',
        relativePath: relative,
        label: `关键帧 ${index + 1}`,
        role: normalizeText(keyframe?.role || keyframe?.stage || `keyframe-${index + 1}`),
        previewable,
        ...(previewDataUrl ? { previewDataUrl } : {}),
        ...(keyframePromptInRun
          ? {
              promptRelativePath: keyframePrompt,
              ...(keyframePromptText ? { promptText: keyframePromptText } : {})
            }
          : {}),
        failureEvidence: failureEvidence[0] || null
      })
      actionAssets.push(assets[assets.length - 1])
    }

    const failedStage = Array.isArray(record?.generationStages)
      ? record.generationStages.find((stage) => stage?.ok === false && stage?.promptRelativePath)
      : null
    const failedStagePrompt = normalizeSafeRelativePath(failedStage?.promptRelativePath)
    const hasKeyframeFailure = record?.ok === false && (
      /keyframe/i.test(normalizeText(failedStage?.stage || failedStage?.id || record?.error)) ||
      assets.some((asset) => asset.kind === 'keyframe' && /soft-retry/i.test(asset.promptRelativePath || ''))
    )
    const failedKeyframePrompt = hasKeyframeFailure
      ? (
          assets.find((asset) => asset.kind === 'keyframe' && asset.promptRelativePath === failedStagePrompt && asset.promptText) ||
          assets.find((asset) => asset.kind === 'keyframe' && /soft-retry/i.test(asset.promptRelativePath || '') && asset.promptText) ||
          assets.find((asset) => asset.kind === 'keyframe' && asset.promptText && asset.promptRelativePath)
        )
      : null
    if (failedKeyframePrompt) {
      promptText = failedKeyframePrompt.promptText
      promptRelativePath = failedKeyframePrompt.promptRelativePath
      const promptAsset = assets.find((asset) => asset.kind === 'prompt')
      if (promptAsset) {
        promptAsset.promptText = promptText
        promptAsset.promptRelativePath = promptRelativePath
        promptAsset.relativePath = promptRelativePath
      }
    }

    const rowFrames = Array.isArray(record?.row?.frames) ? record.row.frames : []
    for (const [index, frame] of rowFrames.slice(0, 8).entries()) {
      const relative = normalizeSafeRelativePath(frame?.relativePath || frame?.path)
      if (!relative) continue
      if (!isRunRelativePath({ runId: normalizedRunId, relativePath: relative })) continue
      const absolute = path.join(dataRoot, relative)
      const previewable = canPreviewImageFile(absolute)
      const previewDataUrl = includePreviews && previewable ? fileToPreviewDataUrl(absolute) : ''
      assets.push({
        actionId,
        kind: 'frame',
        relativePath: relative,
        label: `帧 ${index + 1}`,
        role: 'official-row-frame',
        previewable,
        ...(previewDataUrl ? { previewDataUrl } : {}),
        failureEvidence: record?.ok === false ? (failureEvidence[0] || null) : null
      })
      actionAssets.push(assets[assets.length - 1])
    }

    // Disk fallback for failed actions that still wrote frames/prompts.
    const officialFrameDir = path.join(runDir, 'official-row-frames', actionId)
    if (rowFrames.length === 0 && fs.existsSync(officialFrameDir)) {
      for (const [index, absolute] of listImageFilesRecursive(officialFrameDir, 8).entries()) {
        const relative = toRunRelativePath({ pluginDataDir, runId: normalizedRunId, absolutePath: absolute })
        if (!relative) continue
        const previewable = canPreviewImageFile(absolute)
        const previewDataUrl = includePreviews && previewable ? fileToPreviewDataUrl(absolute) : ''
        assets.push({
          actionId,
          kind: 'frame',
          relativePath: relative,
          label: `磁盘帧 ${index + 1}`,
          role: 'official-row-frame',
          previewable,
          ...(previewDataUrl ? { previewDataUrl } : {}),
          failureEvidence: failureEvidence[0] || null
        })
        actionAssets.push(assets[assets.length - 1])
      }
    }

    const stripCandidates = [
      path.join(runDir, 'rows', actionId, 'strip.png'),
      path.join(runDir, 'rows', actionId, 'strip.webp')
    ]
    for (const absolute of stripCandidates) {
      if (!fs.existsSync(absolute)) continue
      const relative = toRunRelativePath({ pluginDataDir, runId: normalizedRunId, absolutePath: absolute })
      if (!relative) continue
      if (assets.some((asset) => asset.relativePath === relative)) break
      const previewable = canPreviewImageFile(absolute)
      const previewDataUrl = includePreviews && previewable ? fileToPreviewDataUrl(absolute) : ''
      assets.push({
        actionId,
        kind: 'row',
        relativePath: relative,
        label: '动作条',
        role: 'row-strip',
        previewable,
        ...(previewDataUrl ? { previewDataUrl } : {}),
        failureEvidence: failureEvidence[0] || null
      })
      actionAssets.push(assets[assets.length - 1])
      break
    }

    const hasRow = rowFrames.length > 0 || assets.some((asset) => asset.kind === 'frame')
    const quality = normalizeText(record?.row?.quality || record?.quality)
    let status = 'pending'
    let reason = ''
    if (record?.ok === true && hasRow) {
      status = actionId === 'running-left' || quality === 'approved-mirror' ? 'mirrored' : 'passed'
      reason = status === 'mirrored' ? '已从 running-right 镜像' : '已通过'
    } else if (record?.ok === false || failureEvidence.length > 0) {
      status = 'failed'
      reason = failureEvidence[0]?.message || '动作生成失败'
    } else if (record) {
      status = hasRow ? 'passed' : 'pending'
      reason = hasRow ? '已通过' : ''
    }

    const importable = status === 'passed' || status === 'mirrored'
    const previewable = assets.some((asset) => asset.previewable)
    if (importable) {
      availableActionIds.push(actionId)
      importableActionIds.push(actionId)
    }
    if (status === 'failed') failedActionIds.push(actionId)

    actionViews.push({
      actionId,
      status,
      reason,
      quality,
      updatedAt: normalizeText(record?.updatedAt),
      importable,
      previewable,
      score: failureEvidence[0]?.score ?? null,
      promptText,
      promptRelativePath,
      assets,
      failureEvidence
    })
  }

  // Directional pair consistency for importables.
  const availableSet = new Set(importableActionIds)
  if (availableSet.has('running-right') !== availableSet.has('running-left')) {
    for (const actionId of ['running-right', 'running-left']) {
      availableSet.delete(actionId)
      const view = actionViews.find((item) => item.actionId === actionId)
      if (view && view.importable) {
        view.importable = false
        if (view.status === 'passed' || view.status === 'mirrored') {
          view.reason = view.reason
            ? `${view.reason}；方向配对不完整，暂不可导入`
            : '方向配对不完整，暂不可导入'
        }
      }
    }
  }

  const finalImportable = actionViews.filter((item) => item.importable).map((item) => item.actionId)
  const finalAvailable = finalImportable.slice()
  const finalFailed = actionViews.filter((item) => item.status === 'failed').map((item) => item.actionId)
  const completeness = finalAvailable.length === 0
    ? 'none'
    : (finalFailed.length > 0 || finalAvailable.length < OFFICIAL_PROGRESS_ACTION_IDS.length)
      ? 'partial'
      : 'full'

  return {
    actions: actionViews,
    actionAssets: actionAssets.filter((asset) => normalizeSafeRelativePath(asset.relativePath)),
    processAssets,
    availableActionIds: finalAvailable,
    failedActionIds: finalFailed,
    importableActionIds: finalImportable,
    completeness
  }
}

const readJsonIfExists = (filePath, fallback = null) => {
  if (!filePath || !fs.existsSync(filePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (_) {
    return fallback
  }
}

const createStageViews = ({
  runStatus = '',
  taskStatus = '',
  currentStep = '',
  reviewStatus = '',
  importStatus = '',
  failureReason = ''
} = {}) => {
  const status = normalizeText(runStatus)
  const task = normalizeText(taskStatus)
  const step = normalizeText(currentStep)
  const review = normalizeText(reviewStatus)
  const imported = normalizeText(importStatus)
  const failed = status === 'failed'
  const readyForReview = status === 'ready_for_review'
  const approved = status === 'approved'
  const isImported = status === 'imported' || imported === 'imported'
  const generating = status === 'generating' || (
    task === 'confirmed' &&
    !readyForReview &&
    !failed &&
    !approved &&
    !isImported &&
    (status === 'draft' || status === '' || step === 'generate')
  )
  const confirmed = task === 'confirmed' || readyForReview || approved || isImported || generating || failed
  const drafted = confirmed || task === 'ready_for_confirmation' || Boolean(status)

  const stageStatus = {
    draft: drafted ? 'completed' : 'pending',
    confirm: confirmed
      ? 'completed'
      : (task === 'ready_for_confirmation' ? 'active' : 'pending'),
    generate: 'pending',
    'quality-gate': 'pending',
    review: 'pending',
    import: 'pending'
  }

  if (confirmed && !readyForReview && !approved && !isImported && !failed) {
    stageStatus.generate = generating || step === 'generate' ? 'active' : 'pending'
  }

  if (readyForReview || approved || isImported) {
    stageStatus.generate = 'completed'
    stageStatus['quality-gate'] = 'completed'
    stageStatus.review = review === 'approved' || approved || isImported ? 'completed' : 'active'
  }

  if (approved || isImported) {
    stageStatus.review = 'completed'
    stageStatus.import = isImported ? 'completed' : 'active'
  }

  if (failed) {
    if (step === 'review') {
      stageStatus.generate = 'completed'
      stageStatus['quality-gate'] = 'completed'
      stageStatus.review = 'failed'
      stageStatus.import = 'skipped'
    } else {
      stageStatus.generate = 'failed'
      stageStatus['quality-gate'] = failureReason ? 'failed' : 'pending'
      stageStatus.review = 'pending'
      stageStatus.import = 'skipped'
    }
  }

  return WORKFLOW_STAGE_DEFS.map((stage) => ({
    id: stage.id,
    label: stage.label,
    status: stageStatus[stage.id] || 'pending',
    ...((stage.id === 'generate' || stage.id === 'quality-gate') && failed && failureReason
      ? { message: sanitizeProgressReason(failureReason) }
      : {})
  }))
}

const createActionProgressViews = ({ checkpoints = null, runStatus = '', currentStep = '' } = {}) => {
  const actions = isPlainObject(checkpoints?.actions) ? checkpoints.actions : {}
  const hasAnyCheckpoint = Object.keys(actions).length > 0
  if (!hasAnyCheckpoint) return []

  const status = normalizeText(runStatus)
  const generating = status === 'generating' || (
    status !== 'failed' &&
    status !== 'ready_for_review' &&
    status !== 'approved' &&
    status !== 'imported' &&
    normalizeText(currentStep) === 'generate'
  )
  let markedRunning = false

  return OFFICIAL_PROGRESS_ACTION_IDS.map((actionId) => {
    const record = actions[actionId]
    if (!record || typeof record !== 'object') {
      if (generating && !markedRunning) {
        markedRunning = true
        return {
          actionId,
          status: 'running',
          reason: '生成中',
          quality: '',
          updatedAt: ''
        }
      }
      return {
        actionId,
        status: 'pending',
        reason: '',
        quality: '',
        updatedAt: ''
      }
    }

    const failureConditions = Array.isArray(record.failureConditions)
      ? record.failureConditions.map((item) => normalizeText(item)).filter(Boolean)
      : []
    const errorText = sanitizeProgressReason(record.error || failureConditions.join(', '))
    const quality = normalizeText(record?.row?.quality || record.quality)
    const updatedAt = normalizeText(record.updatedAt)
    const hasRow = Boolean(record.row && Array.isArray(record.row.frames) && record.row.frames.length > 0)

    if (record.ok === true && hasRow) {
      const mirrored = actionId === 'running-left' || quality === 'approved-mirror'
      return {
        actionId,
        status: mirrored ? 'mirrored' : 'passed',
        reason: mirrored ? '已从 running-right 镜像' : '已通过',
        quality,
        updatedAt
      }
    }

    if (record.ok === false || errorText || failureConditions.length > 0) {
      return {
        actionId,
        status: 'failed',
        reason: errorText || '动作生成失败',
        quality,
        updatedAt
      }
    }

    if (generating && !markedRunning) {
      markedRunning = true
      return {
        actionId,
        status: 'running',
        reason: '生成中',
        quality,
        updatedAt
      }
    }

    return {
      actionId,
      status: 'pending',
      reason: '',
      quality,
      updatedAt
    }
  })
}

const createQualityFirstCandidateView = ({ candidate = {}, pluginDataDir = '', runId = '' } = {}) => {
  const relativePath = normalizeSafeRelativePath(candidate.relativePath)
  const promptRelativePath = normalizeSafeRelativePath(candidate.promptRelativePath)
  const safeAssetPath = relativePath && isRunRelativePath({ runId, relativePath }) ? relativePath : ''
  const safePromptPath = promptRelativePath && isRunRelativePath({ runId, relativePath: promptRelativePath })
    ? promptRelativePath
    : ''
  const absolutePath = safeAssetPath && pluginDataDir ? path.resolve(pluginDataDir, safeAssetPath) : ''
  const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId, requireExisting: true })
  const previewable = Boolean(
    safeAssetPath &&
    safeRun &&
    isPathInsideDirectory({
      rootPath: safeRun.runDir,
      targetPath: absolutePath,
      requireExisting: true
    }) &&
    canPreviewImageFile(absolutePath)
  )
  const artifacts = Array.isArray(candidate.artifacts)
    ? candidate.artifacts.map((artifact) => {
        const artifactPath = normalizeSafeRelativePath(artifact?.relativePath || artifact?.path)
        return artifactPath && isRunRelativePath({ runId, relativePath: artifactPath })
          ? {
              role: normalizeText(artifact?.role).slice(0, 80),
              relativePath: artifactPath,
              sha256: normalizeText(artifact?.sha256).slice(0, 128)
            }
          : null
      }).filter(Boolean)
    : []
  return {
    candidateId: normalizeText(candidate.candidateId),
    eligible: candidate.eligible === true,
    sha256: normalizeText(candidate.sha256).slice(0, 128),
    score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
    model: normalizeText(candidate.model).slice(0, 160),
    relativePath: safeAssetPath,
    promptRelativePath: safePromptPath,
    previewable,
    failureCodes: createUniqueTextList(candidate.failureCodes).slice(0, 12),
    artifacts,
    canonicalMetrics: isPlainObject(candidate.canonicalMetrics) ? candidate.canonicalMetrics : null,
    descriptors: isPlainObject(candidate.descriptors) ? candidate.descriptors : null
  }
}

const createQualityFirstBudgetView = ({ pluginDataDir = '', runId = '' } = {}) => {
  const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId, requireExisting: true })
  if (!safeRun) return null
  const ledger = readJsonIfExists(path.join(safeRun.runDir, 'budgets', 'ledger.json'), null)
  if (!isPlainObject(ledger) || ledger.version !== 1 || !isPlainObject(ledger.limits) || !isPlainObject(ledger.usage)) return null
  const count = (value) => Math.max(0, Math.trunc(Number(value) || 0))
  const amount = (value) => Math.max(0, Number(value) || 0)
  const limits = {
    providerCalls: count(ledger.limits.maxProviderCalls),
    plannerCalls: count(ledger.limits.maxPlannerCalls),
    evaluatorCalls: count(ledger.limits.maxEvaluatorCalls),
    elapsedMs: count(ledger.limits.maxElapsedMs),
    estimatedCost: ledger.limits.maxEstimatedCost == null ? null : amount(ledger.limits.maxEstimatedCost)
  }
  const usage = {
    providerCalls: Math.min(limits.providerCalls, count(ledger.usage.providerCalls)),
    providerFailures: Math.min(limits.providerCalls, count(ledger.usage.providerFailures)),
    plannerCalls: Math.min(limits.plannerCalls, count(ledger.usage.plannerCalls)),
    evaluatorCalls: Math.min(limits.evaluatorCalls, count(ledger.usage.evaluatorCalls)),
    elapsedMs: Math.min(limits.elapsedMs, Math.max(0, Date.now() - count(ledger.startedAtMs))),
    estimatedCost: amount(ledger.usage.estimatedCost),
    costKnown: ledger.usage.costKnown !== false,
    lastProviderCode: normalizeText(ledger.usage.lastProviderCode).slice(0, 80)
  }
  return {
    limits,
    usage,
    remaining: {
      providerCalls: Math.max(0, limits.providerCalls - usage.providerCalls),
      plannerCalls: Math.max(0, limits.plannerCalls - usage.plannerCalls),
      evaluatorCalls: Math.max(0, limits.evaluatorCalls - usage.evaluatorCalls),
      elapsedMs: Math.max(0, limits.elapsedMs - usage.elapsedMs)
    }
  }
}

const createQualityFirstIdentityReviewView = ({ run = null, pluginDataDir = '' } = {}) => {
  const qualityFirst = isPlainObject(run?.qualityFirst) ? run.qualityFirst : null
  if (!qualityFirst) return null
  const runId = normalizeText(run?.runId)
  const candidates = Array.isArray(qualityFirst.canonicalCandidates)
    ? qualityFirst.canonicalCandidates
      .map((candidate) => createQualityFirstCandidateView({ candidate, pluginDataDir, runId }))
      .filter((candidate) => candidate.candidateId)
    : []
  const phase = normalizeText(qualityFirst.phase)
  const selectedCandidateId = normalizeText(qualityFirst.selectedCandidateId || qualityFirst.acceptedCanonical?.candidateId)
  const acceptedCandidateId = normalizeText(qualityFirst.acceptedCanonical?.candidateId)
  const acceptedSha256 = normalizeText(qualityFirst.acceptedCanonical?.sha256).slice(0, 128)
  const nextAction = normalizeText(qualityFirst.nextAction)
  return {
    pipeline: 'quality-first-v1',
    phase,
    planHash: normalizeText(qualityFirst.planHash).slice(0, 128),
    candidateCount: candidates.length,
    eligibleCandidateCount: candidates.filter((candidate) => candidate.eligible).length,
    currentAction: normalizeText(run?.currentStep),
    nextAction,
    budget: createQualityFirstBudgetView({ pluginDataDir, runId }),
    identityReview: {
      status: phase === 'awaiting_identity_review' ? 'pending' : (acceptedCandidateId ? 'accepted' : 'unavailable'),
      candidates,
      selectedCandidateId,
      acceptedCandidateId,
      acceptedSha256
    },
    recovery: isPlainObject(qualityFirst.recovery)
      ? (() => {
          const value = normalizeSafeRelativePath(qualityFirst.recovery.relativePath)
          const relativePath = isRunRelativePath({ runId, relativePath: value }) ? value : ''
          return {
            reason: normalizeText(qualityFirst.recovery.reason || qualityFirst.recovery.failureCode).slice(0, 200),
            relativePath,
            exportable: Boolean(relativePath && /^[a-f0-9]{64}$/i.test(normalizeText(qualityFirst.recovery.sha256)))
          }
        })()
      : null,
    actionResults: isPlainObject(qualityFirst.actionResults)
      ? Object.fromEntries(Object.entries(qualityFirst.actionResults).map(([actionId, result]) => [
          normalizeText(actionId), {
            ok: result?.ok === true,
            disposition: normalizeText(result?.disposition),
            selectedCandidateId: normalizeText(result?.selectedCandidateId),
            failureCode: normalizeText(result?.failureCode),
            candidateCount: Array.isArray(result?.candidates) ? result.candidates.length : 0
          }
        ]).filter(([actionId]) => actionId))
      : {}
  }
}

const createWorkflowProgressView = ({
  run = null,
  checkpoints = null,
  pluginDataDir = ''
} = {}) => {
  if (!isPlainObject(run)) return null
  const runStatus = normalizeText(run.status)
  const taskStatus = normalizeText(run.taskStatus)
  const currentStep = normalizeText(run.currentStep)
  const reviewStatus = normalizeText(run.reviewStatus)
  const importStatus = normalizeText(run.importStatus)
  const failureReason = sanitizeProgressReason(
    run?.artifacts?.generatedImage?.failure?.message || run?.error || run?.backendStatus?.message
  )
  const stages = createStageViews({
    runStatus,
    taskStatus,
    currentStep,
    reviewStatus,
    importStatus,
    failureReason
  })
  const progressActions = createActionProgressViews({
    checkpoints,
    runStatus,
    currentStep
  })
  const qualityFirst = createQualityFirstIdentityReviewView({ run, pluginDataDir })
  const assetBundle = collectActionAssetsForRun({
    pluginDataDir,
    runId: normalizeText(run?.runId),
    checkpoints,
    includePreviews: false
  })
  // Prefer live progress status, then enrich with assets/import flags from disk.
  const actionsById = new Map(progressActions.map((action) => [action.actionId, action]))
  for (const assetAction of assetBundle.actions) {
    const current = actionsById.get(assetAction.actionId)
    if (!current) {
      actionsById.set(assetAction.actionId, assetAction)
      continue
    }
    actionsById.set(assetAction.actionId, {
      ...current,
      importable: assetAction.importable,
      previewable: assetAction.previewable,
      score: assetAction.score,
      promptText: assetAction.promptText,
      promptRelativePath: assetAction.promptRelativePath,
      assets: assetAction.assets,
      failureEvidence: assetAction.failureEvidence,
      ...(current.status === 'pending' && assetAction.status !== 'pending'
        ? {
            status: assetAction.status,
            reason: assetAction.reason || current.reason,
            quality: assetAction.quality || current.quality
          }
        : {}),
      ...(current.status === 'failed' && !current.reason && assetAction.reason
        ? { reason: assetAction.reason }
        : {})
    })
  }
  const actions = OFFICIAL_PROGRESS_ACTION_IDS
    .map((actionId) => actionsById.get(actionId))
    .filter(Boolean)
    .concat([...actionsById.values()].filter((action) => !OFFICIAL_PROGRESS_ACTION_IDS.includes(action.actionId)))
  const activeStage = stages.find((stage) => stage.status === 'active')
    || stages.find((stage) => stage.status === 'failed')
    || stages.find((stage) => stage.status === 'completed')
    || stages[0]
  const passedActions = actions.filter((action) => action.status === 'passed' || action.status === 'mirrored')
  const failedActions = actions.filter((action) => action.status === 'failed')
  const runningAction = actions.find((action) => action.status === 'running')

  let summary = ''
  if (qualityFirst?.phase === 'awaiting_identity_review') {
    summary = `等待人工确认 canonical identity（${qualityFirst.eligibleCandidateCount}/${qualityFirst.candidateCount} 个候选可用）`
  } else if (qualityFirst?.phase === 'recovery-required') {
    summary = 'idle 未通过质量门，已保留资产并生成恢复包；请导出恢复包或重新生成身份'
  } else if (failureReason && runStatus === 'failed') {
    const failedList = failedActions
      .slice(0, 4)
      .map((action) => (action.reason ? (action.actionId + '（' + action.reason + '）') : action.actionId))
      .join('；')
    summary = failedList
      ? ('生成失败：' + failureReason + '。失败动作：' + failedList)
      : ('生成失败：' + failureReason)
  } else if (runningAction) {
    summary = '正在生成 ' + runningAction.actionId + '… 已通过 ' + passedActions.length + '/' + Math.max(actions.length, 1)
  } else if (runStatus === 'ready_for_review') {
    summary = failedActions.length > 0
      ? ('已进入人工复查；通过 ' + passedActions.length + ' 个动作，失败 ' + failedActions.length + ' 个')
      : '已进入人工复查；官方动作检查完成'
  } else if (runStatus === 'imported') {
    summary = '已导入并完成激活准备'
  } else if (runStatus === 'approved') {
    summary = '已批准，等待导入激活'
  } else if (taskStatus === 'ready_for_confirmation') {
    summary = '任务已起草，等待确认'
  } else if (taskStatus === 'confirmed') {
    summary = '任务已确认，准备生成'
  } else {
    summary = activeStage ? ('当前阶段：' + activeStage.label) : '生成进度更新中'
  }

  const importableActionIds = actions.filter((action) => action.importable).map((action) => action.actionId)
  const availableActionIds = importableActionIds.slice()
  const failedActionIds = failedActions.map((action) => action.actionId)
  const completeness = availableActionIds.length === 0
    ? 'none'
    : (failedActionIds.length > 0 || availableActionIds.length < OFFICIAL_PROGRESS_ACTION_IDS.length)
      ? 'partial'
      : 'full'

  return {
    phase: qualityFirst?.phase || normalizeText(activeStage?.id) || 'generate',
    phaseLabel: qualityFirst?.phase === 'awaiting_identity_review'
      ? '身份候选审查'
      : qualityFirst?.phase === 'recovery-required'
        ? '资产恢复'
        : normalizeText(activeStage?.label) || '生成资源',
    summary: sanitizeProgressReason(summary) || '生成进度更新中',
    stages,
    actions,
    actionAssets: assetBundle.actionAssets,
    processAssets: assetBundle.processAssets || [],
    availableActionIds,
    failedActionIds,
    importableActionIds,
    completeness,
    runStatus,
    currentStep,
    failureReason,
    qualityFirst
  }
}

const readWorkflowDiagnostics = ({ pluginDataDir, runId }) => {
  const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId, requireExisting: true })
  if (!safeRun) return null
  const runDir = safeRun.runDir
  const runPath = path.join(runDir, 'run.json')
  if (!fs.existsSync(runPath)) return null
  try {
    const run = JSON.parse(fs.readFileSync(runPath, 'utf-8'))
    if (!isPlainObject(run) || normalizeText(run.runId) !== safeRun.runId) return null
    const generatedImage = run?.artifacts?.generatedImage
    const conditioning = generatedImage?.conditioning && typeof generatedImage.conditioning === 'object'
      ? generatedImage.conditioning
      : null
    const outputCount = Array.isArray(generatedImage?.outputs) ? generatedImage.outputs.length : 0
    const checkpoints = readJsonIfExists(path.join(runDir, 'full-pet-action-checkpoints.json'), null)
    const failureReason = normalizeText(generatedImage?.failure?.message || run?.error || run?.backendStatus?.message)
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
      failureReason,
      conditioning: conditioning
        ? {
            mode: normalizeText(conditioning.mode),
            endpoint: normalizeText(conditioning.endpoint),
            referenceImageCount: Number(conditioning.referenceImageCount) || 0,
            multipartImageField: normalizeText(conditioning.multipartImageField),
            requestedOutputCount: Number(conditioning.requestedOutputCount) || 0
          }
        : null,
      progress: createWorkflowProgressView({ run, checkpoints, pluginDataDir })
    }
  } catch (_) {
    return null
  }
}

const createFullPetTask = ({ characterName, stylePrompt = '' }) => ({
  mode: 'full-pet',
  pipeline: 'quality-first-v1',
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


const finalizeWorkflowResult = (result) => {
  const diagnostics = result?.diagnostics || null
  const progress = diagnostics?.progress || null
  const base = progress
    ? {
        ...result,
        actionAssets: Array.isArray(result.actionAssets) && result.actionAssets.length
          ? result.actionAssets
          : (Array.isArray(progress.actionAssets) ? progress.actionAssets : []),
        processAssets: Array.isArray(result.processAssets) && result.processAssets.length
          ? result.processAssets
          : (Array.isArray(progress.processAssets) ? progress.processAssets : []),
        completeness: result.completeness || progress.completeness || '',
        availableActionIds: Array.isArray(result.availableActionIds) && result.availableActionIds.length
          ? result.availableActionIds
          : (Array.isArray(progress.availableActionIds) ? progress.availableActionIds : []),
        failedActionIds: Array.isArray(result.failedActionIds) && result.failedActionIds.length
          ? result.failedActionIds
          : (Array.isArray(progress.failedActionIds) ? progress.failedActionIds : []),
        omittedActionIds: Array.isArray(result.omittedActionIds) && result.omittedActionIds.length
          ? result.omittedActionIds
          : (Array.isArray(progress.failedActionIds) ? progress.failedActionIds : []),
        importNotes: result.importNotes || ''
      }
    : result
  return stripPreviewDataUrlsFromValue(base)
}

const withActionAssetFields = (result, diagnostics = null) => {
  const progress = diagnostics?.progress || result?.diagnostics?.progress || null
  if (!progress) return result
  return {
    ...result,
    actionAssets: Array.isArray(result.actionAssets) && result.actionAssets.length
      ? result.actionAssets
      : (Array.isArray(progress.actionAssets) ? progress.actionAssets : []),
    completeness: result.completeness || progress.completeness || '',
    availableActionIds: Array.isArray(result.availableActionIds) && result.availableActionIds.length
      ? result.availableActionIds
      : (Array.isArray(progress.availableActionIds) ? progress.availableActionIds : []),
    failedActionIds: Array.isArray(result.failedActionIds) && result.failedActionIds.length
      ? result.failedActionIds
      : (Array.isArray(progress.failedActionIds) ? progress.failedActionIds : []),
    omittedActionIds: Array.isArray(result.omittedActionIds) && result.omittedActionIds.length
      ? result.omittedActionIds
      : (Array.isArray(progress.failedActionIds) ? progress.failedActionIds : [])
  }
}

const createCreatorWorkflowService = ({
  pluginService,
  imageGenerationModelService,
  actionService,
  creatorReferenceService,
  petPackService = null,
  hatchPetAgentService = null,
  appLogService = null,
  providerHealthTimeoutMs = DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS,
  nowMs = () => Date.now(),
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
  let progressPollTimer = null
  let providerHealthCache = null
  let providerHealthInFlight = null

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

  const getProviderHealth = async ({ retryConfigChange = true } = {}) => {
    const configKey = createProviderHealthKey(imageGenerationModelService.getConfig())
    if (
      providerHealthCache?.key === configKey &&
      providerHealthCache.expiresAt > nowMs()
    ) {
      return providerHealthCache.result
    }
    if (providerHealthInFlight?.key === configKey) {
      return providerHealthInFlight.promise
    }

    const promise = (async () => {
      let result
      try {
        result = await withTimeout(
          imageGenerationModelService.checkHealth({ timeoutMs: providerHealthTimeoutMs }),
          providerHealthTimeoutMs,
          `Image Provider health check timed out after ${providerHealthTimeoutMs}ms`
        )
      } catch (error) {
        const message = normalizeText(error?.message || 'Provider health check failed')
        const isTimeout = /timed out/i.test(message)
        result = {
          ok: false,
          code: isTimeout ? 'health_check_timeout' : 'health_check_failed',
          message
        }
      }
      const currentConfigKey = createProviderHealthKey(imageGenerationModelService.getConfig())
      if (currentConfigKey !== configKey) {
        if (retryConfigChange) return getProviderHealth({ retryConfigChange: false })
        return {
          ok: false,
          code: 'provider_config_changed',
          message: 'Image Provider configuration changed during the health check; retry the request'
        }
      }
      if (result?.ok === true) {
        providerHealthCache = {
          key: configKey,
          result,
          expiresAt: nowMs() + CREATOR_PROVIDER_HEALTH_CACHE_TTL_MS
        }
      }
      return result
    })()
    const inFlight = { key: configKey, promise }
    providerHealthInFlight = inFlight
    try {
      return await promise
    } finally {
      if (providerHealthInFlight === inFlight) providerHealthInFlight = null
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
      lastRun: lastRun ? stripPreviewDataUrlsFromValue(lastRun) : null,
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
      message: normalizeText(message) || '生成任务进行中',
      diagnostics: null
    }
    return setLastRun(createGeneratingRunView(activeWorkflow))
  }

  const updateWorkflowProgress = ({ runId = '', commandId = '', message = '' } = {}) => {
    if (!activeWorkflow) return null
    const nextRunId = normalizeText(runId) || activeWorkflow.runId
    const nextCommandId = normalizeText(commandId) || activeWorkflow.commandId
    let nextMessage = normalizeText(message) || activeWorkflow.message
    let nextDiagnostics = activeWorkflow.diagnostics || null
    try {
      const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
      const diagnostics = readWorkflowDiagnostics({ pluginDataDir, runId: nextRunId })
      const progressSummary = normalizeText(diagnostics?.progress?.summary)
      if (progressSummary) nextMessage = progressSummary
      if (diagnostics) nextDiagnostics = diagnostics
    } catch (_) {
      // Progress enrichment is best-effort only.
    }
    activeWorkflow = {
      ...activeWorkflow,
      runId: nextRunId,
      commandId: nextCommandId,
      message: nextMessage,
      diagnostics: nextDiagnostics
    }
    return setLastRun(createGeneratingRunView(activeWorkflow))
  }

  const stopProgressPolling = () => {
    if (progressPollTimer) {
      clearInterval(progressPollTimer)
      progressPollTimer = null
    }
  }

  const startProgressPolling = () => {
    stopProgressPolling()
    progressPollTimer = setInterval(() => {
      if (!activeWorkflow?.runId) return
      try {
        updateWorkflowProgress({
          runId: activeWorkflow.runId,
          commandId: activeWorkflow.commandId,
          message: activeWorkflow.message
        })
      } catch (_) {
        // Progress polling must never interrupt the active workflow.
      }
    }, 1500)
    if (typeof progressPollTimer?.unref === 'function') progressPollTimer.unref()
  }

  const clearWorkflow = () => {
    stopProgressPolling()
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
        isFullPet,
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
        message: createProviderBlockedMessage(providerReadiness)
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
      startProgressPolling()

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

      if (
        normalizeText(run?.status) === 'awaiting_identity_review' ||
        normalizeText(run?.qualityFirst?.phase) === 'awaiting_identity_review'
      ) {
        const diagnostics = getWorkflowDiagnostics()
        const result = createWorkflowResult({
          state: 'awaiting-identity-review',
          code: 'identity_review_required',
          message: `已生成 canonical identity 候选，请选择一个可用候选后继续 run ${runId}`,
          run: createRunView({
            state: 'awaiting-identity-review',
            mode,
            runId,
            commandId: generated?.commandId || CREATOR_STUDIO_GENERATE_COMMAND_ID,
            message: getCommandMessage(generated, 'Canonical identity candidates require human review'),
            diagnostics
          }),
          reference: creatorReferenceService.getReference(referenceTarget),
          diagnostics
        })
        setLastRun(result.run)
        return result
      }

      if (
        normalizeText(run?.status) === 'recovery-required' ||
        normalizeText(run?.qualityFirst?.phase) === 'recovery-required'
      ) {
        const diagnostics = getWorkflowDiagnostics()
        const result = createWorkflowResult({
          state: 'recovery-required',
          code: 'idle_recovery_required',
          message: `idle 未通过质量门；已保留全部生成资产，请导出恢复包或重新生成身份 run ${runId}`,
          run: createRunView({
            state: 'recovery-required',
            mode,
            runId,
            commandId: generated?.commandId || CREATOR_STUDIO_GENERATE_COMMAND_ID,
            message: getCommandMessage(generated, 'Asset recovery required'),
            diagnostics
          }),
          reference: creatorReferenceService.getReference(referenceTarget),
          diagnostics
        })
        setLastRun(result.run)
        return result
      }

      const generatedCoverage = isFullPet
        ? readBasicActionCoverage({ pluginDataDir, runId })
        : null
      const {
        basicActions: generatedBasicActions,
        missingOfficialActionIds
      } = resolveOfficialActionCoverage(generatedCoverage)
      if (
        isFullPet &&
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
        : 'workflow_failed'
      const result = createWorkflowResult({
        state: 'review-required',
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
    if (!isSafeRunId(normalizedRunId)) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'invalid_run_id',
        message: 'Creator repair requires a safe run id'
      })
    }
    if (commandId === CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID && !normalizedActionId) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_action_id',
        message: 'Creator action repair requires an action id'
      })
    }
    if (commandId === CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID && !isSafePathSegment(normalizedActionId)) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'invalid_action_id',
        message: 'Creator action repair requires a safe action id'
      })
    }
    return runExclusively({
      mode: 'full-pet',
      message: label
    }, async () => {
      assertPluginReady()
      const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
      updateWorkflowProgress({ runId: normalizedRunId, commandId, message: label })
      startProgressPolling()
      const commandResult = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, commandId, {
        runId: normalizedRunId,
        ...(normalizedActionId ? { actionId: normalizedActionId } : {})
      })
      const run = getCreatorStudioRun(commandResult)
      if (!run?.runId) throw new Error('Creator Studio repair did not return a run')
      const coverage = readBasicActionCoverage({ pluginDataDir, runId: run.runId })
      const { basicActions } = resolveOfficialActionCoverage(coverage)
      const identityReviewPending = commandId === CREATOR_STUDIO_RETRY_IDENTITY_COMMAND_ID && (
        normalizeText(run.status) === 'awaiting_identity_review' ||
        normalizeText(run.qualityFirst?.phase) === 'awaiting_identity_review'
      )
      const recoveryRequired = normalizeText(run.status) === 'recovery-required' || normalizeText(run.qualityFirst?.phase) === 'recovery-required'
      const state = identityReviewPending
        ? 'awaiting-identity-review'
        : recoveryRequired
          ? 'recovery-required'
          : 'review-required'
      const code = identityReviewPending
        ? 'identity_review_required'
        : recoveryRequired
          ? 'idle_recovery_required'
          : commandId === CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID
            ? 'action_repair_review_required'
            : 'identity_repair_review_required'
      const message = identityReviewPending
        ? `Canonical identity 候选已重新生成，请选择一个可用候选继续 run ${run.runId}`
        : recoveryRequired
          ? `idle 仍未通过质量门；已保留资产，请导出恢复包或重新生成身份 run ${run.runId}`
          : commandId === CREATOR_STUDIO_RETRY_ACTION_COMMAND_ID
            ? `动作 ${normalizedActionId} 已重新生成，请在 Creator Studio 复查 run ${run.runId}`
            : `Canonical identity 已重新生成，请在 Creator Studio 复查全部动作 run ${run.runId}`
      return createWorkflowResult({
        state,
        code,
        message,
        run: createRunView({
          state,
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

  const acceptCreatorIdentity = async ({ runId, candidateId, sha256 } = {}) => {
    const normalizedRunId = normalizeText(runId)
    const normalizedCandidateId = normalizeText(candidateId)
    const normalizedSha256 = normalizeText(sha256).toLowerCase()
    if (!normalizedRunId || !normalizedCandidateId || !normalizedSha256) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_identity_acceptance',
        message: '接受身份候选需要 runId、candidateId 和 sha256'
      })
    }
    if (!isSafeRunId(normalizedRunId) || !isSafePathSegment(normalizedCandidateId) || !/^[a-f0-9]{64}$/.test(normalizedSha256)) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'invalid_identity_acceptance',
        message: '身份候选标识或 sha256 不符合安全契约'
      })
    }
    return runExclusively({
      mode: 'full-pet',
      message: `正在接受身份候选 ${normalizedCandidateId} 并生成动作`
    }, async () => {
      assertPluginReady()
      const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
      updateWorkflowProgress({
        runId: normalizedRunId,
        commandId: CREATOR_STUDIO_ACCEPT_IDENTITY_COMMAND_ID,
        message: `身份候选 ${normalizedCandidateId} 已接受，正在生成 idle 与后续动作`
      })
      startProgressPolling()
      const commandResult = await pluginService.runCommand(
        CREATOR_STUDIO_PLUGIN_ID,
        CREATOR_STUDIO_ACCEPT_IDENTITY_COMMAND_ID,
        { runId: normalizedRunId, candidateId: normalizedCandidateId, sha256: normalizedSha256 }
      )
      const run = getCreatorStudioRun(commandResult)
      if (!run?.runId) throw new Error('Creator Studio identity acceptance did not return a run')
      const diagnostics = readWorkflowDiagnostics({ pluginDataDir, runId: run.runId })
      const recoveryRequired = normalizeText(run.status) === 'recovery-required' || diagnostics?.progress?.qualityFirst?.phase === 'recovery-required'
      const state = recoveryRequired ? 'recovery-required' : 'review-required'
      return createWorkflowResult({
        state,
        code: recoveryRequired ? 'idle_recovery_required' : 'identity_accepted_review_required',
        message: recoveryRequired
          ? `身份候选已接受，但 idle 未通过质量门；请导出恢复包或重新生成身份 run ${run.runId}`
          : `身份候选已接受，动作候选已生成；请复查 run ${run.runId}`,
        run: createRunView({
          state,
          mode: 'full-pet',
          runId: run.runId,
          commandId: CREATOR_STUDIO_ACCEPT_IDENTITY_COMMAND_ID,
          message: getCommandMessage(commandResult, 'Identity accepted'),
          diagnostics
        }),
        diagnostics
      })
    })
  }

  const exportRecoveryBundle = async ({ runId } = {}) => {
    const normalizedRunId = normalizeText(runId)
    if (!isSafeRunId(normalizedRunId)) {
      return {
        ok: false,
        code: 'invalid_run_id',
        message: '导出恢复包需要安全的 runId',
        runId: normalizedRunId,
        relativePath: '',
        sha256: '',
        byteSize: 0
      }
    }
    try {
      assertPluginReady()
      const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
      const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId: normalizedRunId, requireExisting: true })
      const run = safeRun ? readJsonIfExists(path.join(safeRun.runDir, 'run.json'), null) : null
      const relativePath = normalizeSafeRelativePath(run?.qualityFirst?.recovery?.relativePath)
      const expectedSha256 = normalizeText(run?.qualityFirst?.recovery?.sha256).toLowerCase()
      if (
        !safeRun ||
        !relativePath ||
        !isRunRelativePath({ runId: normalizedRunId, relativePath }) ||
        !/^[a-f0-9]{64}$/.test(expectedSha256)
      ) {
        throw new Error('当前 run 没有可验证的资产恢复包')
      }
      const absolutePath = path.resolve(pluginDataDir, relativePath)
      if (!isPathInsideDirectory({ rootPath: safeRun.runDir, targetPath: absolutePath, requireExisting: true })) {
        throw new Error('资产恢复包路径越出当前 run')
      }
      const bytes = fs.readFileSync(absolutePath)
      const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      if (actualSha256 !== expectedSha256) throw new Error('资产恢复包 hash 校验失败')
      return {
        ok: true,
        code: 'recovery_bundle_ready',
        message: '资产恢复包已验证并保留在 Creator Studio run 中',
        runId: normalizedRunId,
        relativePath,
        sha256: actualSha256,
        byteSize: bytes.length
      }
    } catch (error) {
      return {
        ok: false,
        code: 'recovery_bundle_unavailable',
        message: sanitizeProgressReason(error?.message || '资产恢复包不可用'),
        runId: normalizedRunId,
        relativePath: '',
        sha256: '',
        byteSize: 0
      }
    }
  }

  const importAvailableActions = async ({ runId, activate = true } = {}) => {
    const normalizedRunId = normalizeText(runId)
    if (!normalizedRunId) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'missing_run_id',
        message: '导入可用动作需要 run id'
      })
    }
    if (!isSafeRunId(normalizedRunId)) {
      return createWorkflowResult({
        state: 'missing-input',
        code: 'invalid_run_id',
        message: '导入可用动作需要安全的 run id'
      })
    }

    return runExclusively({
      mode: 'full-pet',
      message: `正在导入 run ${normalizedRunId} 的可用动作`
    }, async () => {
      assertPluginReady()
      const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
      const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId: normalizedRunId, requireExisting: true })
      if (!safeRun) {
        return createWorkflowResult({
          state: 'missing-input',
          code: 'run_not_found',
          message: `找不到 run ${normalizedRunId}`
        })
      }
      const { dataRoot, runDir } = safeRun
      const runPath = path.join(runDir, 'run.json')
      const run = readJsonIfExists(runPath, null)
      if (!isPlainObject(run) || normalizeText(run.runId) !== normalizedRunId) {
        return createWorkflowResult({
          state: 'missing-input',
          code: 'run_not_found',
          message: `找不到 run ${normalizedRunId}`
        })
      }

      const checkpoints = readJsonIfExists(path.join(runDir, 'full-pet-action-checkpoints.json'), null)
      const diagnostics = readWorkflowDiagnostics({ pluginDataDir, runId: normalizedRunId })
      const assetBundle = collectActionAssetsForRun({
        pluginDataDir,
        runId: normalizedRunId,
        checkpoints
      })
      const progress = diagnostics?.progress || null
      let availableActionIds = createUniqueTextList(
        progress?.importableActionIds ||
        progress?.availableActionIds ||
        assetBundle.importableActionIds ||
        assetBundle.availableActionIds
      )
      const availableSet = new Set(availableActionIds)
      if (availableSet.has('running-right') !== availableSet.has('running-left')) {
        availableSet.delete('running-right')
        availableSet.delete('running-left')
      }
      availableActionIds = [...availableSet]
      const failedActionIds = createUniqueTextList(progress?.failedActionIds || assetBundle.failedActionIds)
      const omittedActionIds = createUniqueTextList([
        ...failedActionIds,
        ...OFFICIAL_PROGRESS_ACTION_IDS.filter((actionId) => !availableSet.has(actionId))
      ])

      if (availableActionIds.length === 0) {
        return createWorkflowResult({
          state: 'review-required',
          code: 'no_importable_actions',
          message: '当前没有可导入的可用动作。失败资产仍可在下方审查台查看。',
          run: createRunView({
            state: 'review-required',
            mode: 'full-pet',
            runId: normalizedRunId,
            commandId: 'import-available-actions',
            message: 'No importable actions',
            diagnostics
          }),
          diagnostics,
          actionAssets: assetBundle.actionAssets,
          processAssets: assetBundle.processAssets || [],
          completeness: 'none',
          availableActionIds: [],
          failedActionIds,
          omittedActionIds,
          importNotes: '没有可导入动作'
        })
      }

      let defaultActionNote = ''
      let importedPackId = ''
      let activatedPackId = ''
      let activePet = null
      let importMessage = ''
      let usedPartialComposer = false

      const collectFramePathsForAction = (actionId) => {
        const paths = []
        const record = isPlainObject(checkpoints?.actions?.[actionId]) ? checkpoints.actions[actionId] : null
        for (const frame of Array.isArray(record?.row?.frames) ? record.row.frames : []) {
          const relative = normalizeSafeRelativePath(frame?.relativePath || frame?.path)
          if (!relative) continue
          if (!isRunRelativePath({ runId: normalizedRunId, relativePath: relative })) continue
          const absolute = path.join(dataRoot, relative)
          if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) paths.push(absolute)
        }
        if (paths.length === 0) {
          paths.push(...listImageFilesRecursive(path.join(runDir, 'official-row-frames', actionId), 24))
        }
        return paths
      }

      const outputDirExisting = normalizeText(run?.artifacts?.outputDir)
      const hasExistingImportableOutput = Boolean(
        outputDirExisting &&
        isPathInsideDirectory({ rootPath: runDir, targetPath: outputDirExisting, requireExisting: true }) &&
        fs.existsSync(outputDirExisting) &&
        fs.existsSync(path.join(outputDirExisting, 'pet.json')) &&
        availableActionIds.includes('idle') &&
        ['ready_for_review', 'approved', 'imported'].includes(normalizeText(run?.status))
      )

      if (hasExistingImportableOutput && petPackService?.inspectPackSource && petPackService?.importPack) {
        if (normalizeText(run.status) === 'ready_for_review') {
          try {
            await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, 'approve-run', {
              runId: normalizedRunId,
              humanApproval: {
                approvedBy: 'create-ui',
                note: 'Import available actions from Create UI'
              }
            })
          } catch (_) {
            // Approval may fail QA for partial packages; fall through to partial composer.
          }
        }
        try {
          const imported = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, 'import-approved-pet', {
            runId: normalizedRunId,
            activate: activate !== false
          })
          const importedRun = getCreatorStudioRun(imported)
          importedPackId = normalizeText(importedRun?.importedPackId || imported?.result?.imported?.pack?.id)
          activatedPackId = normalizeText(importedRun?.activatedPackId || imported?.result?.activated?.activePackId)
          activePet = imported?.result?.imported?.pack || null
          importMessage = getCommandMessage(imported, `已导入可用动作：${availableActionIds.join(', ')}`)
        } catch (_) {
          // Fall through to partial directory import.
        }
      }

      const degradedActionIds = []
      if (!importedPackId) {
        if (!petPackService?.inspectPackSource || !petPackService?.importPack) {
          return createWorkflowResult({
            state: 'import-failed',
            code: 'pet_pack_import_unavailable',
            message: '当前 Host 未启用 pet pack 导入能力，无法导入可用动作',
            run: createRunView({
              state: 'import-failed',
              mode: 'full-pet',
              runId: normalizedRunId,
              commandId: 'import-available-actions',
              message: 'pet pack import unavailable',
              diagnostics
            }),
            diagnostics,
            actionAssets: assetBundle.actionAssets,
          processAssets: assetBundle.processAssets || [],
            completeness: 'partial',
            availableActionIds,
            failedActionIds,
            omittedActionIds
          })
        }

        const partialRoot = path.join(runDir, 'partial-import')
        const framesRoot = path.join(partialRoot, 'frames')
        fs.rmSync(partialRoot, { recursive: true, force: true })
        fs.mkdirSync(framesRoot, { recursive: true })

        const actions = []
        for (const actionId of availableActionIds) {
          if (!isSafePathSegment(actionId)) continue
          const framePaths = collectFramePathsForAction(actionId)
          if (framePaths.length === 0) continue
          const actionDir = path.join(framesRoot, actionId)
          fs.mkdirSync(actionDir, { recursive: true })
          framePaths.forEach((sourcePath, index) => {
            const ext = path.extname(sourcePath) || '.png'
            fs.copyFileSync(sourcePath, path.join(actionDir, `${String(index + 1).padStart(2, '0')}${ext}`))
          })
          const files = fs.readdirSync(actionDir).filter((name) => !name.startsWith('.')).sort()
          if (!files.length) continue
          actions.push({
            id: actionId,
            label: actionId,
            kind: actionId === 'idle' ? 'state' : 'action',
            loop: actionId === 'idle' || actionId.startsWith('running'),
            frameCount: files.length,
            frameMs: 100,
            frameWidth: 192,
            frameHeight: 208,
            frameRow: 0,
            frameColumn: 0,
            sprite: path.posix.join('frames', actionId, files[0])
          })
        }

        if (!actions.some((action) => action.id === 'idle')) {
          const donor = actions[0]
          if (!donor) {
            return createWorkflowResult({
              state: 'review-required',
              code: 'no_importable_action_frames',
              message: '可用动作缺少可导入帧文件。失败资产仍可在审查台查看。',
              run: createRunView({
                state: 'review-required',
                mode: 'full-pet',
                runId: normalizedRunId,
                commandId: 'import-available-actions',
                message: 'No importable frames',
                diagnostics
              }),
              diagnostics,
              actionAssets: assetBundle.actionAssets,
          processAssets: assetBundle.processAssets || [],
              completeness: 'none',
              availableActionIds: [],
              failedActionIds,
              omittedActionIds,
              importNotes: '缺少可导入帧'
            })
          }
          const idleDir = path.join(framesRoot, 'idle')
          fs.mkdirSync(idleDir, { recursive: true })
          const donorPath = path.join(partialRoot, donor.sprite)
          const idleName = '01' + path.extname(donorPath)
          fs.copyFileSync(donorPath, path.join(idleDir, idleName))
          actions.unshift({
            id: 'idle',
            label: 'idle',
            kind: 'state',
            loop: true,
            frameCount: 1,
            frameMs: 100,
            frameWidth: donor.frameWidth,
            frameHeight: donor.frameHeight,
            frameRow: 0,
            frameColumn: 0,
            sprite: path.posix.join('frames', 'idle', idleName)
          })
          if (!availableActionIds.includes('idle')) availableActionIds.unshift('idle')
          degradedActionIds.push('idle')
          defaultActionNote = 'idle 原生成失败，已用其他可用动作帧降级作为 defaultAction=idle（静帧占位），请尽快重生成 idle。'
        }

        const petId = normalizeText(run?.petId) || slugify(run?.input?.petName || normalizedRunId)
        const displayName = normalizeText(run?.input?.petName) || petId
        const clickAction = actions.some((action) => action.id === 'waving') ? 'waving' : 'idle'
        const actionAvailability = Object.fromEntries(OFFICIAL_PROGRESS_ACTION_IDS.map((actionId) => {
          const available = actions.some((action) => action.id === actionId)
          const degraded = degradedActionIds.includes(actionId)
          return [actionId, {
            available: available && !degraded,
            quality: degraded ? 'placeholder' : (available ? 'row-real' : ''),
            reason: degraded
              ? 'idle-placeholder-fallback'
              : (available ? '' : (failedActionIds.includes(actionId) ? 'failed' : 'omitted'))
          }]
        }))
        const manifest = {
          schemaVersion: 1,
          id: petId,
          displayName,
          version: '1.0.0-partial',
          defaultAction: 'idle',
          clickAction,
          requiredActionIds: ['idle'],
          availableActionIds: actions.map((action) => action.id),
          degradedActionIds,
          omittedActionIds: omittedActionIds.filter((actionId) => !actions.some((action) => action.id === actionId)),
          actionAvailability,
          actions,
          creatorStudio: {
            sourceRunId: normalizedRunId,
            importMode: 'available-actions',
            completeness: 'partial',
            failedActionIds,
            degradedActionIds,
            notes: defaultActionNote
          }
        }
        fs.writeFileSync(path.join(partialRoot, 'pet.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        usedPartialComposer = true

        const inspection = petPackService.inspectPackSource(partialRoot)
        if (!inspection?.valid || !inspection.selectionId) {
          const errors = Array.isArray(inspection?.errors) ? inspection.errors.join('; ') : 'partial pack inspection failed'
          return createWorkflowResult({
            state: 'import-failed',
            code: 'partial_pack_invalid',
            message: `可用动作包校验失败：${errors}`,
            run: createRunView({
              state: 'import-failed',
              mode: 'full-pet',
              runId: normalizedRunId,
              commandId: 'import-available-actions',
              message: errors,
              diagnostics
            }),
            diagnostics,
            actionAssets: assetBundle.actionAssets,
          processAssets: assetBundle.processAssets || [],
            completeness: 'partial',
            availableActionIds,
            failedActionIds,
            omittedActionIds,
            importNotes: errors
          })
        }

        const imported = petPackService.importPack(inspection.selectionId)
        importedPackId = normalizeText(imported?.pack?.id || imported?.manifest?.id)
        activePet = imported?.pack || null
        if (activate !== false && importedPackId && petPackService.setActivePack) {
          const activated = petPackService.setActivePack(importedPackId)
          activatedPackId = normalizeText(activated?.activePackId || importedPackId)
          activePet = activated?.pack || activePet
        }
        importMessage = `已导入可用动作（partial）：${availableActionIds.join(', ')}`
      }

      try {
        const latest = readJsonIfExists(runPath, run) || run
        fs.writeFileSync(runPath, `${JSON.stringify({
          ...latest,
          status: 'imported',
          importStatus: 'imported',
          currentStep: 'imported',
          importedPackId,
          activatedPackId,
          importCompleteness: failedActionIds.length ? 'partial' : 'full',
          availableActionIds,
          omittedActionIds,
          failedActionIds,
          importNotes: defaultActionNote || (failedActionIds.length
            ? `已导入可用动作，失败动作未导入：${failedActionIds.join(', ')}`
            : '已导入全部可用动作')
        }, null, 2)}\n`)
      } catch (_) {}

      const nextDiagnostics = readWorkflowDiagnostics({ pluginDataDir, runId: normalizedRunId })
      const notes = [
        failedActionIds.length ? `失败未导入：${failedActionIds.join(', ')}` : '',
        defaultActionNote,
        usedPartialComposer ? '使用了可用动作 partial 包导入' : ''
      ].filter(Boolean).join('；')

      return createWorkflowResult({
        state: 'completed',
        code: failedActionIds.length ? 'partial_actions_imported' : 'actions_imported',
        message: importMessage || `已导入可用动作：${availableActionIds.join(', ')}`,
        run: createRunView({
          state: 'completed',
          mode: 'full-pet',
          runId: normalizedRunId,
          commandId: 'import-available-actions',
          message: importMessage || 'imported available actions',
          importedPackId,
          activatedPackId,
          diagnostics: nextDiagnostics
        }),
        activePet,
        diagnostics: nextDiagnostics,
        actionAssets: assetBundle.actionAssets,
        processAssets: assetBundle.processAssets || [],
        completeness: failedActionIds.length || usedPartialComposer ? 'partial' : 'full',
        availableActionIds,
        failedActionIds,
        omittedActionIds,
        degradedActionIds,
        importNotes: notes
      })
    })
  }

  const getAssetPreview = async ({ runId, relativePath } = {}) => {
    const normalizedRunId = normalizeText(runId)
    const safeRelative = normalizeSafeRelativePath(relativePath)
    if (!normalizedRunId || !safeRelative) {
      return {
        ok: false,
        code: 'missing_asset_preview_target',
        message: '缺少 runId 或资源相对路径',
        relativePath: safeRelative,
        previewDataUrl: ''
      }
    }
    if (!isSafeRunId(normalizedRunId)) {
      return {
        ok: false,
        code: 'invalid_run_id',
        message: 'runId 不符合安全格式',
        relativePath: safeRelative,
        previewDataUrl: ''
      }
    }
    if (!safeRelative.startsWith(`runs/${normalizedRunId}/`)) {
      return {
        ok: false,
        code: 'asset_path_outside_run',
        message: '资源路径必须位于当前 run 目录内',
        relativePath: safeRelative,
        previewDataUrl: ''
      }
    }
    try {
      assertPluginReady()
      const pluginDataDir = pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
      const safeRun = getSafeCreatorRunDir({ pluginDataDir, runId: normalizedRunId, requireExisting: true })
      if (!safeRun) {
        return {
          ok: false,
          code: 'run_not_found',
          message: '当前 run 不存在或已越出数据边界',
          relativePath: safeRelative,
          previewDataUrl: ''
        }
      }
      const assetRelativePath = safeRelative.slice(`runs/${normalizedRunId}/`.length)
      const resolved = path.resolve(safeRun.runDir, assetRelativePath)
      if (!isPathInsideDirectory({ rootPath: safeRun.runDir, targetPath: resolved, requireExisting: true })) {
        return {
          ok: false,
          code: 'asset_path_outside_run',
          message: '资源路径越界',
          relativePath: safeRelative,
          previewDataUrl: ''
        }
      }
      if (!canPreviewImageFile(resolved)) {
        return {
          ok: false,
          code: 'asset_preview_unavailable',
          message: '该资源不可预览（不存在、过大或格式不支持）',
          relativePath: safeRelative,
          previewDataUrl: ''
        }
      }
      const previewDataUrl = fileToPreviewDataUrl(resolved)
      if (!previewDataUrl) {
        return {
          ok: false,
          code: 'asset_preview_unavailable',
          message: '资源预览生成失败',
          relativePath: safeRelative,
          previewDataUrl: ''
        }
      }
      return {
        ok: true,
        code: 'asset_preview_ready',
        message: 'ok',
        relativePath: safeRelative,
        previewDataUrl
      }
    } catch (error) {
      return {
        ok: false,
        code: 'asset_preview_failed',
        message: sanitizeProgressReason(error?.message || '资源预览失败'),
        relativePath: safeRelative,
        previewDataUrl: ''
      }
    }
  }

  return {
    approveReferenceSourcePath,
    getState,
    getLastRun,
    getAssetPreview,
    bindReference,
    generateNewCharacter,
    generateExistingAction,
    retryFullPetAction,
    retryFullPetIdentity,
    acceptCreatorIdentity,
    exportRecoveryBundle,
    importAvailableActions
  }
}

module.exports = {
  __testInternals: {
    readBasicActionCoverage,
    resolveOfficialActionCoverage,
    readWorkflowDiagnostics,
    createWorkflowProgressView,
    createQualityFirstIdentityReviewView,
    collectActionAssetsForRun,
    collectProcessAssetsForRun,
    describeFailureEvidence,
    stripPreviewDataUrlsFromValue
  },
  CREATOR_STUDIO_DASHBOARD_ID,
  CREATOR_STUDIO_PLUGIN_ID,
  EDITABLE_TARGET_ID,
  EDITABLE_TARGET_NAME,
  EDITABLE_TARGET_TYPE,
  createCreatorWorkflowService
}
