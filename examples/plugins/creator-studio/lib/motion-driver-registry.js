const crypto = require('node:crypto')
const {
  expandMotionPreset,
  getDefaultMotionPresetId,
  getMotionPreset
} = require('./action-semantics')

const DRIVER_FPS = 12
const LOOP_ACTIONS = new Set(['idle', 'running-right', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'])

const createMotionDriver = ({ actionId, motionPresetId = '', motionParameters = {}, fps = DRIVER_FPS } = {}) => {
  const normalizedActionId = String(actionId || '').trim()
  const presetId = String(motionPresetId || getDefaultMotionPresetId(normalizedActionId)).trim()
  // `expandMotionPreset` deliberately requires an exact frame count so that a
  // caller cannot silently stretch a registered action. Resolve that count
  // from the same registry used by the expander, avoiding a second list that
  // could drift when a preset changes.
  const preset = getMotionPreset(presetId)
  if (!preset || preset.actionId !== normalizedActionId) throw new Error(`Unsupported motion preset ${presetId || 'unknown'}`)
  const expanded = expandMotionPreset({
    actionId: normalizedActionId,
    motionPresetId: presetId,
    motionParameters,
    frameCount: preset.frameCount
  })
  const normalizedFps = Number(fps)
  if (!Number.isInteger(normalizedFps) || normalizedFps < 1 || normalizedFps > 60) {
    throw new Error('Motion driver fps is invalid')
  }
  const payload = {
    schemaVersion: 1,
    actionId: normalizedActionId,
    motionPresetId: presetId,
    fps: normalizedFps,
    frameCount: expanded.framePlan.length,
    loop: LOOP_ACTIONS.has(normalizedActionId),
    motionParameters: expanded.motionParameters,
    framePlan: expanded.framePlan,
    semanticChecks: expanded.semanticChecks
  }
  const sha256 = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return Object.freeze({ ...payload, sha256 })
}

const createOfficialMotionDrivers = ({ fps = DRIVER_FPS, motionParameters = {} } = {}) => Object.freeze(
  ['idle', 'waving', 'jumping'].map((actionId) => createMotionDriver({
    actionId,
    fps,
    motionParameters: {
      intensity: motionParameters.intensity || 'normal',
      leadSide: motionParameters.leadSide || 'viewer-left'
    }
  }))
)

module.exports = {
  DRIVER_FPS,
  createMotionDriver,
  createOfficialMotionDrivers
}
