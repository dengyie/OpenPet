const crypto = require('node:crypto')

const { createActionVideoTask } = require('./action-video-task')

const PROVIDER_VIDEO_TASK_SCHEMA_VERSION = 1
const PROVIDER_VIDEO_TASK_TYPE = 'provider-video-generation'
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const SAFE_PROVIDER = /^[a-z0-9][a-z0-9._-]{0,79}$/
const MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

const providerVideoTaskError = (message) => Object.assign(new Error(`Invalid provider video task: ${message}`), {
  code: 'provider_video_task_invalid'
})

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))

const assertExactKeys = (value, expected, label) => {
  if (!isPlainObject(value) || Object.keys(value).sort().join('\n') !== expected.slice().sort().join('\n')) {
    throw providerVideoTaskError(`${label} fields are invalid`)
  }
}

const safeId = (value, label, pattern = SAFE_ID) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!pattern.test(normalized)) throw providerVideoTaskError(`${label} is invalid`)
  return normalized
}

const positiveInteger = (value, label, min, max) => {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) throw providerVideoTaskError(`${label} is invalid`)
  return normalized
}

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

const createProviderVideoTask = (input = {}) => {
  assertExactKeys(input, ['schemaVersion', 'taskType', 'providerId', 'model', 'actionTask', 'request', 'retryPolicy'], 'task')
  if (input.schemaVersion !== PROVIDER_VIDEO_TASK_SCHEMA_VERSION) throw providerVideoTaskError('schemaVersion is invalid')
  if (input.taskType !== PROVIDER_VIDEO_TASK_TYPE) throw providerVideoTaskError('taskType is invalid')
  const providerId = safeId(input.providerId, 'providerId', SAFE_PROVIDER)
  const model = safeId(input.model, 'model', SAFE_PROVIDER)
  const actionTask = createActionVideoTask(input.actionTask)
  assertExactKeys(input.request, ['backgroundColor', 'backgroundMode', 'camera', 'durationMs', 'fps', 'outputMimeType'], 'request')
  const backgroundMode = String(input.request.backgroundMode || '')
  if (!['solid', 'transparent'].includes(backgroundMode)) throw providerVideoTaskError('request.backgroundMode is invalid')
  const backgroundColor = String(input.request.backgroundColor || '').trim().toLowerCase()
  if (backgroundMode === 'solid' && !/^#[0-9a-f]{6}$/.test(backgroundColor)) throw providerVideoTaskError('request.backgroundColor is invalid')
  if (backgroundMode === 'transparent' && backgroundColor !== '') throw providerVideoTaskError('transparent request cannot carry a background color')
  if (input.request.camera !== actionTask.camera) throw providerVideoTaskError('request.camera must match actionTask.camera')
  const fps = positiveInteger(input.request.fps, 'request.fps', 1, 60)
  const durationMs = positiveInteger(input.request.durationMs, 'request.durationMs', 100, 30_000)
  if (fps !== actionTask.fps || durationMs !== actionTask.durationMs) throw providerVideoTaskError('request timing must match actionTask')
  const outputMimeType = String(input.request.outputMimeType || '')
  if (!MIME_TYPES.has(outputMimeType)) throw providerVideoTaskError('request.outputMimeType is invalid')
  assertExactKeys(input.retryPolicy, ['maxAttempts', 'backoffMs'], 'retryPolicy')
  const maxAttempts = positiveInteger(input.retryPolicy.maxAttempts, 'retryPolicy.maxAttempts', 1, 3)
  const backoffMs = positiveInteger(input.retryPolicy.backoffMs, 'retryPolicy.backoffMs', 0, 60_000)
  const payload = {
    schemaVersion: PROVIDER_VIDEO_TASK_SCHEMA_VERSION,
    taskType: PROVIDER_VIDEO_TASK_TYPE,
    providerId,
    model,
    actionTask,
    request: { backgroundColor, backgroundMode, camera: actionTask.camera, durationMs, fps, outputMimeType },
    retryPolicy: { maxAttempts, backoffMs }
  }
  return deepFreeze({
    ...payload,
    requestHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  })
}

module.exports = {
  PROVIDER_VIDEO_TASK_SCHEMA_VERSION,
  PROVIDER_VIDEO_TASK_TYPE,
  createProviderVideoTask,
  providerVideoTaskError
}
