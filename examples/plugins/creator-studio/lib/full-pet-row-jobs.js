const {
  FULL_PET_ROW_QUALITY,
  OFFICIAL_FULL_PET_ROWS,
  getOfficialFullPetRow
} = require('./full-pet-row-contract')

const MANIFEST_VERSION = 1
const MANIFEST_MODE = 'official-full-pet'

const asTrimmedString = (value) => String(value || '').trim()

const createPendingJob = ({ runId, row }) => ({
  actionId: row.id,
  row: row.row,
  frameCount: row.frameCount,
  durations: row.durations.slice(),
  status: 'pending',
  quality: FULL_PET_ROW_QUALITY.PENDING,
  promptRelativePath: `runs/${runId}/prompts/rows/${row.id}.txt`,
  outputRelativePath: `runs/${runId}/rows/${row.id}/strip.png`
})

const createFullPetRowJobManifest = ({
  runId,
  baseSourceRelativePath,
  canonicalReferenceRelativePath
}) => {
  const safeRunId = asTrimmedString(runId)
  if (!safeRunId) {
    throw new Error('Full pet row job manifest requires a run id')
  }
  return normalizeFullPetRowJobManifest({
    version: MANIFEST_VERSION,
    mode: MANIFEST_MODE,
    runId: safeRunId,
    base: {
      sourceRelativePath: asTrimmedString(baseSourceRelativePath),
      canonicalReferenceRelativePath: asTrimmedString(canonicalReferenceRelativePath)
    },
    jobs: OFFICIAL_FULL_PET_ROWS.map((row) => createPendingJob({ runId: safeRunId, row }))
  })
}

const normalizeDerivation = ({ actionId, derivation }) => {
  if (!derivation) return null
  const normalized = {
    type: asTrimmedString(derivation.type),
    sourceActionId: asTrimmedString(derivation.sourceActionId),
    decisionNote: asTrimmedString(derivation.decisionNote)
  }
  if (
    actionId !== 'running-left' ||
    normalized.type !== 'approved-mirror' ||
    normalized.sourceActionId !== 'running-right'
  ) {
    throw new Error('Only running-left may be derived from running-right as an approved mirror')
  }
  return normalized
}

const normalizeFullPetRowJob = ({ manifestRunId, job }) => {
  const actionId = asTrimmedString(job?.actionId)
  const row = getOfficialFullPetRow(actionId)
  if (!row) {
    throw new Error(`Unknown official full-pet row: ${actionId || '(missing)'}`)
  }

  const status = asTrimmedString(job.status || 'pending')
  const quality = asTrimmedString(job.quality || FULL_PET_ROW_QUALITY.PENDING)
  const derivation = normalizeDerivation({ actionId, derivation: job.derivation })
  if ((status === 'derived' || quality === FULL_PET_ROW_QUALITY.APPROVED_MIRROR) && !derivation) {
    throw new Error('Only running-left may be derived from running-right as an approved mirror')
  }

  return {
    actionId,
    row: row.row,
    frameCount: row.frameCount,
    durations: row.durations.slice(),
    status,
    quality,
    promptRelativePath: asTrimmedString(job.promptRelativePath) || `runs/${manifestRunId}/prompts/rows/${row.id}.txt`,
    outputRelativePath: asTrimmedString(job.outputRelativePath) || `runs/${manifestRunId}/rows/${row.id}/strip.png`,
    ...(derivation ? { derivation } : {})
  }
}

const normalizeFullPetRowJobManifest = (manifest) => {
  const runId = asTrimmedString(manifest?.runId)
  if (!runId) {
    throw new Error('Full pet row job manifest requires a run id')
  }
  const inputJobs = Array.isArray(manifest.jobs) ? manifest.jobs : []
  const jobsByActionId = new Map(inputJobs.map((job) => [asTrimmedString(job?.actionId), job]))
  const jobs = OFFICIAL_FULL_PET_ROWS.map((row) => normalizeFullPetRowJob({
    manifestRunId: runId,
    job: jobsByActionId.get(row.id) || createPendingJob({ runId, row })
  }))

  return {
    version: MANIFEST_VERSION,
    mode: MANIFEST_MODE,
    runId,
    base: {
      sourceRelativePath: asTrimmedString(manifest?.base?.sourceRelativePath),
      canonicalReferenceRelativePath: asTrimmedString(manifest?.base?.canonicalReferenceRelativePath)
    },
    jobs
  }
}

const markRunningLeftApprovedMirror = ({ manifest, decisionNote }) => {
  const normalized = normalizeFullPetRowJobManifest(manifest)
  return {
    ...normalized,
    jobs: normalized.jobs.map((job) => job.actionId === 'running-left'
      ? {
          ...job,
          status: 'derived',
          quality: FULL_PET_ROW_QUALITY.APPROVED_MIRROR,
          derivation: {
            type: 'approved-mirror',
            sourceActionId: 'running-right',
            decisionNote: asTrimmedString(decisionNote)
          }
        }
      : job)
  }
}

module.exports = {
  createFullPetRowJobManifest,
  markRunningLeftApprovedMirror,
  normalizeFullPetRowJobManifest
}
