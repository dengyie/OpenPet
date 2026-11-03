const SHA256 = /^[a-f0-9]{64}$/i
const SAFE_RELATIVE_PATH = /^(?![\/])(?:[a-zA-Z0-9._-]+[\/])*[a-zA-Z0-9._-]+$/

const artifactError = (message) => Object.assign(new Error(`Invalid video artifact: ${message}`), {
  code: 'video_artifact_invalid'
})

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

const assertKeys = (value, expected, label) => {
  if (!isPlainObject(value) || Object.keys(value).sort().join('\n') !== expected.slice().sort().join('\n')) {
    throw artifactError(`${label} fields are invalid`)
  }
}

const sha256 = (value, label) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA256.test(normalized)) throw artifactError(`${label} must be a sha256`)
  return normalized
}

const relativePath = (value, label) => {
  const normalized = String(value || '').replace(/\\/g, '/')
  if (!SAFE_RELATIVE_PATH.test(normalized) || normalized.split('/').includes('..')) throw artifactError(`${label} must be a safe relative path`)
  return normalized
}

const positiveInteger = (value, label, max = 100_000) => {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > max) throw artifactError(`${label} is invalid`)
  return normalized
}

const validateVideoArtifact = (value) => {
  assertKeys(value, ['schemaVersion', 'runId', 'actionId', 'canonicalSha256', 'motionDriverSha256', 'rawVideo', 'frames', 'spriteSheet', 'sidecar', 'temporalQuality'], 'artifact')
  if (value.schemaVersion !== 1) throw artifactError('schemaVersion is invalid')
  const runId = String(value.runId || '').trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(runId)) throw artifactError('runId is invalid')
  const actionId = String(value.actionId || '').trim()
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(actionId)) throw artifactError('actionId is invalid')
  const canonicalSha256 = sha256(value.canonicalSha256, 'canonicalSha256')
  const motionDriverSha256 = sha256(value.motionDriverSha256, 'motionDriverSha256')
  assertKeys(value.rawVideo, ['relativePath', 'sha256', 'mimeType'], 'rawVideo')
  const rawVideo = {
    relativePath: relativePath(value.rawVideo.relativePath, 'rawVideo.relativePath'),
    sha256: sha256(value.rawVideo.sha256, 'rawVideo.sha256'),
    mimeType: String(value.rawVideo.mimeType || '')
  }
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(rawVideo.mimeType)) throw artifactError('rawVideo.mimeType is invalid')
  assertKeys(value.frames, ['fps', 'frameCount', 'width', 'height', 'relativePaths'], 'frames')
  const frames = {
    fps: positiveInteger(value.frames.fps, 'frames.fps', 240),
    frameCount: positiveInteger(value.frames.frameCount, 'frames.frameCount', 100_000),
    width: positiveInteger(value.frames.width, 'frames.width', 4096),
    height: positiveInteger(value.frames.height, 'frames.height', 4096),
    relativePaths: Array.isArray(value.frames.relativePaths)
      ? value.frames.relativePaths.map((entry, index) => relativePath(entry, `frames.relativePaths[${index}]`))
      : []
  }
  if (frames.relativePaths.length !== frames.frameCount) throw artifactError('frames.relativePaths must match frameCount')
  assertKeys(value.spriteSheet, ['relativePath', 'sha256', 'mimeType', 'columns', 'rows'], 'spriteSheet')
  const spriteSheet = {
    relativePath: relativePath(value.spriteSheet.relativePath, 'spriteSheet.relativePath'),
    sha256: sha256(value.spriteSheet.sha256, 'spriteSheet.sha256'),
    mimeType: String(value.spriteSheet.mimeType || ''),
    columns: positiveInteger(value.spriteSheet.columns, 'spriteSheet.columns', 128),
    rows: positiveInteger(value.spriteSheet.rows, 'spriteSheet.rows', 128)
  }
  if (!['image/png', 'image/webp'].includes(spriteSheet.mimeType)) throw artifactError('spriteSheet.mimeType is invalid')
  if (spriteSheet.columns * spriteSheet.rows < frames.frameCount) throw artifactError('spriteSheet layout cannot contain every frame')
  assertKeys(value.sidecar, ['relativePath', 'sha256'], 'sidecar')
  const sidecar = {
    relativePath: relativePath(value.sidecar.relativePath, 'sidecar.relativePath'),
    sha256: sha256(value.sidecar.sha256, 'sidecar.sha256')
  }
  if (!isPlainObject(value.temporalQuality)) throw artifactError('temporalQuality is invalid')
  return deepFreeze({
    schemaVersion: 1,
    runId,
    actionId,
    canonicalSha256,
    motionDriverSha256,
    rawVideo,
    frames,
    spriteSheet,
    sidecar,
    temporalQuality: value.temporalQuality
  })
}

const createVideoArtifact = (input = {}) => validateVideoArtifact(input)

module.exports = {
  artifactError,
  createVideoArtifact,
  validateVideoArtifact
}
