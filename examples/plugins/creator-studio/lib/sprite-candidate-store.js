const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/
const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
const normalizeSegment = (value, label) => {
  const normalized = String(value || '').trim()
  if (!SAFE_SEGMENT.test(normalized)) throw new Error(`Candidate ${label} is invalid`)
  return normalized
}
const resolveInsideDataDir = ({ dataDir, filePath }) => {
  const root = path.resolve(String(dataDir || ''))
  const target = path.resolve(String(filePath || ''))
  if (!fs.existsSync(root) || !fs.existsSync(target)) throw new Error('Candidate asset does not exist')
  const realRoot = fs.realpathSync.native(root)
  const realTarget = fs.realpathSync.native(target)
  const relative = path.relative(realRoot, realTarget)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Candidate asset path escaped Creator Studio data directory')
  return { absolute: realTarget, relative: relative.split(path.sep).join('/') }
}
const writeAtomic = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
    fs.renameSync(temporaryPath, filePath)
  } finally {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
    } catch (_) {}
  }
}
const sanitizeFailures = (value) => Array.isArray(value) ? value.slice(0, 32).map((entry) => String(entry).slice(0, 120)) : []
const sanitizeQuality = (value) => {
  if (!value || typeof value !== 'object') return undefined
  return {
    ok: value.ok === true,
    failures: sanitizeFailures(value.failures),
    metrics: Object.fromEntries(Object.entries(value.metrics || {}).filter(([, entry]) => typeof entry === 'number' && Number.isFinite(entry)).slice(0, 64)),
    ...(value.error ? { error: String(value.error).replace(/\s+/g, ' ').slice(0, 240) } : {})
  }
}
const sanitizeGate = (value) => {
  if (!value || typeof value !== 'object') return undefined
  return {
    ok: value.ok === true,
    outcome: ['pass', 'repair', 'reject', 'cannot-evaluate'].includes(value.outcome) ? value.outcome : (value.ok === true ? 'pass' : 'reject'),
    failures: sanitizeFailures(value.failures),
    ...(value.error ? { error: String(value.error).replace(/\s+/g, ' ').slice(0, 240) } : {})
  }
}
const sanitizeCandidate = ({ dataDir, candidate }) => {
  const source = candidate && typeof candidate === 'object' ? candidate : {}
  const artifacts = Array.isArray(source.artifacts) ? source.artifacts.map((artifact) => {
    const resolved = resolveInsideDataDir({ dataDir, filePath: artifact?.path })
    const actualHash = sha256File(resolved.absolute)
    if (String(artifact?.sha256 || '').toLowerCase() !== actualHash) throw new Error(`Candidate asset hash mismatch for ${artifact?.role || 'artifact'}`)
    return {
      role: String(artifact?.role || 'artifact').slice(0, 80),
      relativePath: resolved.relative,
      sha256: actualHash
    }
  }) : []
  const descriptors = source.descriptors && typeof source.descriptors === 'object' ? {
    perceptualHash: String(source.descriptors.perceptualHash || '').slice(0, 256),
    identityDescriptor: Array.isArray(source.descriptors.identityDescriptor) ? source.descriptors.identityDescriptor.filter((value) => Number.isFinite(value)).slice(0, 64) : [],
    alphaMaskDescriptor: Array.isArray(source.descriptors.alphaMaskDescriptor) ? source.descriptors.alphaMaskDescriptor.filter((value) => Number.isFinite(value)).slice(0, 64) : [],
    meanColorDescriptor: Array.isArray(source.descriptors.meanColorDescriptor) ? source.descriptors.meanColorDescriptor.filter((value) => Number.isFinite(value)).slice(0, 8) : []
  } : undefined
  return {
    candidateId: normalizeSegment(source.candidateId, 'candidateId'),
    attemptKind: ['initial', 'duplicate-replacement', 'repair'].includes(source.attemptKind) ? source.attemptKind : 'initial',
    dispatchIndex: Number.isInteger(source.dispatchIndex) ? source.dispatchIndex : 0,
    provider: String(source.provider || '').slice(0, 160),
    model: String(source.model || '').slice(0, 160),
    ...(source.identityDistance == null ? {} : { identityDistance: Number(source.identityDistance) || 0 }),
    ...(descriptors ? { descriptors } : {}),
    ...(source.duplicateOfCandidateId ? { duplicateOfCandidateId: String(source.duplicateOfCandidateId).slice(0, 128) } : {}),
    ...(artifacts.length ? { artifacts } : {}),
    ...(sanitizeQuality(source.qa) ? { qa: sanitizeQuality(source.qa) } : {}),
    ...(sanitizeGate(source.gate) ? { gate: sanitizeGate(source.gate) } : {}),
    ...(source.failureCodes ? { failureCodes: sanitizeFailures(source.failureCodes) } : {}),
    ...(source.evaluation && typeof source.evaluation === 'object' ? { evaluation: {
      recommendation: String(source.evaluation.recommendation || '').slice(0, 32),
      confidence: Number(source.evaluation.confidence) || 0,
      scores: Object.fromEntries(Object.entries(source.evaluation.scores || {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)).slice(0, 16)),
      defects: Array.isArray(source.evaluation.defects) ? source.evaluation.defects.slice(0, 32).map((defect) => ({ code: String(defect?.code || '').slice(0, 80), severity: String(defect?.severity || '').slice(0, 32), regionId: String(defect?.regionId || '').slice(0, 128) })) : []
    } } : {})
  }
}

const writeCandidateRecord = ({ dataDir, runId, scope, candidate } = {}) => {
  const normalizedRunId = normalizeSegment(runId, 'runId')
  const normalizedScope = normalizeSegment(scope, 'scope')
  const safeCandidate = sanitizeCandidate({ dataDir, candidate })
  const relativePath = path.join('runs', normalizedRunId, 'candidates', normalizedScope, safeCandidate.candidateId, 'candidate.json').replace(/\\/g, '/')
  const targetPath = path.resolve(dataDir, relativePath)
  writeAtomic(targetPath, { version: 1, runId: normalizedRunId, scope: normalizedScope, candidate: safeCandidate })
  return { relativePath, candidate: safeCandidate }
}

const archiveCandidateRevision = ({ dataDir, runId, scope, reason = 'repair', now = () => new Date().toISOString() } = {}) => {
  const normalizedRunId = normalizeSegment(runId, 'runId')
  const normalizedScope = normalizeSegment(scope, 'scope')
  const currentRelative = path.join('runs', normalizedRunId, 'candidates', normalizedScope)
  const currentPath = path.resolve(dataDir, currentRelative)
  if (!fs.existsSync(currentPath)) return ''
  const revision = String(now()).replace(/[^a-zA-Z0-9.-]/g, '-')
  const archiveRelative = path.join('runs', normalizedRunId, 'candidate-archives', normalizedScope, revision)
  const archivePath = path.resolve(dataDir, archiveRelative)
  fs.mkdirSync(path.dirname(archivePath), { recursive: true })
  fs.renameSync(currentPath, archivePath)
  writeAtomic(path.join(archivePath, 'archive.json'), {
    version: 1,
    runId: normalizedRunId,
    scope: normalizedScope,
    reason: String(reason || 'repair').slice(0, 160),
    archivedAt: now()
  })
  return archiveRelative.replace(/\\/g, '/')
}

const selectBestPassingCandidate = ({ candidates = [] } = {}) => candidates
  .filter((candidate) => candidate?.qa?.ok === true && candidate?.gate?.ok === true)
  .slice()
  .sort((left, right) => {
    const leftScore = Number(left.evaluation?.scores?.overall) || 0
    const rightScore = Number(right.evaluation?.scores?.overall) || 0
    if (rightScore !== leftScore) return rightScore - leftScore
    const leftIdentity = Number(left.identityDistance) || 0
    const rightIdentity = Number(right.identityDistance) || 0
    if (leftIdentity !== rightIdentity) return leftIdentity - rightIdentity
    return String(left.candidateId).localeCompare(String(right.candidateId))
  })[0] || null

module.exports = {
  archiveCandidateRevision,
  selectBestPassingCandidate,
  writeCandidateRecord
}
