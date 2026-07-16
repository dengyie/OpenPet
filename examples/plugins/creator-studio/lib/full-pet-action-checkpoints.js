const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const CHECKPOINT_VERSION = 1

const checkpointPath = ({ dataDir, runId }) => path.join(dataDir, 'runs', runId, 'full-pet-action-checkpoints.json')

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

const ensureDataRelativePath = (dataDir, filePath) => {
  const absolute = path.resolve(dataDir, filePath)
  const relative = path.relative(path.resolve(dataDir), absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Action checkpoint frame path escapes Creator Studio data directory: ${filePath}`)
  }
  return { absolute, relative: relative.split(path.sep).join('/') }
}

const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const normalizeResult = ({ dataDir, result }) => {
  const normalized = {
    actionId: result.actionId,
    ok: result.ok === true,
    outputCount: Number(result.outputCount || 0),
    ...(result.model ? { model: result.model } : {}),
    ...(Array.isArray(result.modelAttempts) ? { modelAttempts: result.modelAttempts } : {}),
    ...(Array.isArray(result.failureConditions) ? { failureConditions: result.failureConditions } : {}),
    ...(Array.isArray(result.generationStages) ? { generationStages: result.generationStages } : {}),
    ...(Array.isArray(result.keyframes) ? { keyframes: result.keyframes } : {}),
    ...(result.error ? { error: result.error } : {})
  }
  if (!result.row || !Array.isArray(result.row.frames)) return normalized

  normalized.row = {
    ...result.row,
    frames: result.row.frames.map((frame) => {
      const resolved = ensureDataRelativePath(dataDir, frame.path)
      if (!fs.statSync(resolved.absolute).isFile()) throw new Error(`Action checkpoint frame is not a file: ${frame.path}`)
      const { path: _unsafeAbsolutePath, ...safeFrame } = frame
      return {
        ...safeFrame,
        relativePath: resolved.relative,
        sha256: sha256File(resolved.absolute)
      }
    })
  }
  return normalized
}

const readActionCheckpoints = ({ dataDir, runId }) => readJson(checkpointPath({ dataDir, runId }), {
  version: CHECKPOINT_VERSION,
  runId,
  actions: {},
  invalidations: []
})

const writeCheckpointFile = ({ dataDir, runId, checkpoints, now = () => new Date().toISOString() }) => {
  const filePath = checkpointPath({ dataDir, runId })
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const next = {
    ...checkpoints,
    version: CHECKPOINT_VERSION,
    runId,
    updatedAt: now(),
    actions: checkpoints.actions || {},
    invalidations: Array.isArray(checkpoints.invalidations)
      ? checkpoints.invalidations.slice(-100)
      : []
  }
  const temporaryPath = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`)
  fs.renameSync(temporaryPath, filePath)
  return next
}

const writeActionCheckpoint = ({ dataDir, runId, result, now = () => new Date().toISOString() }) => {
  const checkpoints = readActionCheckpoints({ dataDir, runId })
  checkpoints.actions = checkpoints.actions || {}
  checkpoints.actions[result.actionId] = {
    ...normalizeResult({ dataDir, result }),
    updatedAt: now()
  }
  const written = writeCheckpointFile({ dataDir, runId, checkpoints, now })
  return written.actions[result.actionId]
}

const normalizeInvalidationReason = (value, fallback) => (
  String(value || '').trim().slice(0, 160) || fallback
)

const invalidateActionCheckpoint = ({
  dataDir,
  runId,
  actionId,
  reason = 'manual-repair',
  now = () => new Date().toISOString()
}) => {
  const normalizedActionId = String(actionId || '').trim()
  if (!normalizedActionId) throw new Error('Action checkpoint invalidation requires an actionId')
  const checkpoints = readActionCheckpoints({ dataDir, runId })
  checkpoints.actions = checkpoints.actions || {}
  delete checkpoints.actions[normalizedActionId]
  checkpoints.invalidations = Array.isArray(checkpoints.invalidations) ? checkpoints.invalidations : []
  checkpoints.invalidations.push({
    scope: 'action',
    actionIds: [normalizedActionId],
    reason: normalizeInvalidationReason(reason, 'manual-repair'),
    invalidatedAt: now()
  })
  return writeCheckpointFile({ dataDir, runId, checkpoints, now })
}

const invalidateAllActionCheckpoints = ({
  dataDir,
  runId,
  reason = 'identity-repair',
  now = () => new Date().toISOString()
}) => {
  const checkpoints = readActionCheckpoints({ dataDir, runId })
  const invalidatedActionIds = Object.keys(checkpoints.actions || {}).sort()
  checkpoints.actions = {}
  checkpoints.invalidations = Array.isArray(checkpoints.invalidations) ? checkpoints.invalidations : []
  checkpoints.invalidations.push({
    scope: 'identity',
    actionIds: invalidatedActionIds,
    reason: normalizeInvalidationReason(reason, 'identity-repair'),
    invalidatedAt: now()
  })
  return writeCheckpointFile({ dataDir, runId, checkpoints, now })
}

const resolveReusableActionResult = ({ dataDir, runId, actionId }) => {
  const record = readActionCheckpoints({ dataDir, runId }).actions?.[actionId]
  if (!record || record.ok !== true || !record.row || !Array.isArray(record.row.frames)) return null
  try {
    const frames = record.row.frames.map((frame) => {
      const resolved = ensureDataRelativePath(dataDir, frame.relativePath)
      if (!fs.statSync(resolved.absolute).isFile() || sha256File(resolved.absolute) !== frame.sha256) throw new Error('frame hash mismatch')
      return { ...frame, path: resolved.absolute }
    })
    return { ...record, row: { ...record.row, frames } }
  } catch {
    return null
  }
}

module.exports = {
  CHECKPOINT_VERSION,
  invalidateActionCheckpoint,
  invalidateAllActionCheckpoints,
  readActionCheckpoints,
  resolveReusableActionResult,
  writeActionCheckpoint
}
