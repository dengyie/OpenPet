const { expandMotionPreset } = require('./action-semantics')
const { createMotionDriver } = require('./motion-driver-registry')

const ACTION_VIDEO_TASK_SCHEMA_VERSION = 1
const ACTION_VIDEO_TASK_TYPE = 'action-video-v1'
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const SHA256 = /^[a-f0-9]{64}$/i
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const VALID_BACKGROUND_MODES = new Set(['solid', 'transparent'])
const VALID_BACKGROUND_PURPOSES = new Set(['matting-assist', 'native-alpha'])

const taskError = (message) => Object.assign(new Error(`Invalid action video task: ${message}`), {
  code: 'action_video_task_invalid'
})

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))

const assertExactKeys = (value, expected, label) => {
  if (!isPlainObject(value) || Object.keys(value).sort().join('\n') !== expected.slice().sort().join('\n')) {
    throw taskError(`${label} fields are invalid`)
  }
}

const assertSafeId = (value, label) => {
  const normalized = String(value || '').trim()
  if (!SAFE_ID.test(normalized)) throw taskError(`${label} is invalid`)
  return normalized
}

const assertSha256 = (value, label) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA256.test(normalized)) throw taskError(`${label} must be a sha256`)
  return normalized
}

const normalizePositiveInteger = (value, label, { min, max } = {}) => {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    throw taskError(`${label} is invalid`)
  }
  return normalized
}

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

const normalizeBackground = (value) => {
  assertExactKeys(value, ['mode', 'color', 'purpose'], 'background')
  const mode = String(value.mode || '')
  if (!VALID_BACKGROUND_MODES.has(mode)) throw taskError('background.mode is invalid')
  const purpose = String(value.purpose || '')
  if (!VALID_BACKGROUND_PURPOSES.has(purpose)) throw taskError('background.purpose is invalid')
  const color = String(value.color || '').toLowerCase()
  if (mode === 'solid' && !HEX_COLOR.test(color)) throw taskError('background.color is invalid')
  if (mode === 'transparent' && color !== '') throw taskError('transparent background cannot carry a color')
  if (mode === 'solid' && purpose === 'native-alpha') throw taskError('solid background cannot use native-alpha purpose')
  if (mode === 'transparent' && purpose !== 'native-alpha') throw taskError('transparent background requires native-alpha purpose')
  return { mode, color, purpose }
}

const createActionVideoTask = (input = {}) => {
  assertExactKeys(input, [
    'schemaVersion',
    'taskType',
    'actionId',
    'motionPresetId',
    'motionParameters',
    'reference',
    'motionDriver',
    'canvas',
    'fps',
    'durationMs',
    'background',
    'camera',
    'output'
  ], 'task')
  if (input.schemaVersion !== ACTION_VIDEO_TASK_SCHEMA_VERSION) throw taskError('schemaVersion is invalid')
  if (input.taskType !== ACTION_VIDEO_TASK_TYPE) throw taskError('taskType is invalid')
  const actionId = assertSafeId(input.actionId, 'actionId')
  const motionPresetId = assertSafeId(input.motionPresetId, 'motionPresetId')
  const motionParameters = input.motionParameters
  assertExactKeys(motionParameters, ['intensity', 'leadSide'], 'motionParameters')
  const intensity = String(motionParameters.intensity || '')
  const leadSide = String(motionParameters.leadSide || '')
  if (!['subtle', 'normal'].includes(intensity)) throw taskError('motionParameters.intensity is invalid')
  if (!['viewer-left', 'viewer-right'].includes(leadSide)) throw taskError('motionParameters.leadSide is invalid')

  const reference = input.reference
  assertExactKeys(reference, ['sha256', 'role'], 'reference')
  const referenceSha256 = assertSha256(reference.sha256, 'reference.sha256')
  if (reference.role !== 'canonical-identity') throw taskError('reference.role is invalid')

  const motionDriver = input.motionDriver
  assertExactKeys(motionDriver, ['sha256', 'fps', 'frameCount', 'loop'], 'motionDriver')
  const motionDriverSha256 = assertSha256(motionDriver.sha256, 'motionDriver.sha256')
  const driverFps = normalizePositiveInteger(motionDriver.fps, 'motionDriver.fps', { min: 1, max: 60 })
  const frameCount = normalizePositiveInteger(motionDriver.frameCount, 'motionDriver.frameCount', { min: 1, max: 32 })
  if (typeof motionDriver.loop !== 'boolean') throw taskError('motionDriver.loop is invalid')
  let expanded
  try {
    expanded = expandMotionPreset({
      actionId,
      motionPresetId,
      motionParameters: { intensity, leadSide },
      frameCount
    })
  } catch (error) {
    throw taskError(error.message.replace(/^.*?: /, ''))
  }
  const canvas = input.canvas
  assertExactKeys(canvas, ['width', 'height'], 'canvas')
  const width = normalizePositiveInteger(canvas.width, 'canvas.width', { min: 64, max: 2048 })
  const height = normalizePositiveInteger(canvas.height, 'canvas.height', { min: 64, max: 2048 })
  const fps = normalizePositiveInteger(input.fps, 'fps', { min: 1, max: 60 })
  const durationMs = normalizePositiveInteger(input.durationMs, 'durationMs', { min: 100, max: 30_000 })
  if (input.camera !== 'locked') throw taskError('camera must be locked')
  if (input.output !== 'video') throw taskError('output must be video')
  const background = normalizeBackground(input.background)
  let registeredDriver
  try {
    registeredDriver = createMotionDriver({
      actionId,
      motionPresetId,
      motionParameters: { intensity, leadSide },
      fps: driverFps
    })
  } catch (error) {
    throw taskError(error.message)
  }
  if (registeredDriver.sha256 !== motionDriverSha256) throw taskError('motionDriver.sha256 does not match the registered driver')
  if (registeredDriver.frameCount !== frameCount) throw taskError('motionDriver.frameCount does not match the registered driver')
  if (registeredDriver.loop !== motionDriver.loop) throw taskError('motionDriver.loop does not match the registered driver')
  if (fps !== driverFps) throw taskError('fps must match motionDriver.fps')
  const expectedDurationMs = Math.round((frameCount / driverFps) * 1000)
  if (Math.abs(expectedDurationMs - durationMs) > 1) {
    throw taskError('durationMs does not match the motion driver duration')
  }
  return deepFreeze({
    schemaVersion: ACTION_VIDEO_TASK_SCHEMA_VERSION,
    taskType: ACTION_VIDEO_TASK_TYPE,
    actionId,
    motionPresetId,
    motionParameters: { intensity, leadSide },
    reference: { sha256: referenceSha256, role: reference.role },
    motionDriver: {
      sha256: motionDriverSha256,
      fps: driverFps,
      frameCount,
      loop: motionDriver.loop
    },
    canvas: { width, height },
    fps,
    durationMs,
    background,
    camera: 'locked',
    output: 'video',
    framePlanHash: expanded.hash
  })
}

module.exports = {
  ACTION_VIDEO_TASK_SCHEMA_VERSION,
  ACTION_VIDEO_TASK_TYPE,
  createActionVideoTask,
  taskError
}
