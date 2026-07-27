const fs = require('fs')
const path = require('path')
const { getBackendAdapter } = require('./backend-adapters')
const {
  appendRunLog,
  createGenerationLease,
  createGenerationLeaseHeartbeat,
  readRun,
  updateRunStatus,
  writeRun
} = require('./run-store')
const {
  createQualityFirstHostRuntime,
  generateViaHostModelBridge
} = require('./host-model-bridge')
const {
  buildCanonicalActionFramesFromGeneratedImage
} = require('./action-frame-builder')
const { assertActionFrameQaPassed } = require('./action-frame-qa')
const { buildRealAtlasFromGeneratedImage } = require('./real-atlas-builder')
const { loadPetGenerationGovernance } = require('./pet-generation-governance')
const { FIXTURE_BACKEND, PROVIDER_BACKEND, normalizeCreatorBackend } = require('./backend-mode')
const { GENERATED_FULL_PET_ACTION_IDS } = require('./full-pet-basic-actions')
const {
  invalidateActionCheckpoint,
  invalidateAllActionCheckpoints
} = require('./full-pet-action-checkpoints')
const {
  createCreatorStudioMetadata,
  sha256,
  writeZip
} = require('./fake-hatch-pet')

const createBackendStatus = ({ backend, state, message = '', updatedAt }) => ({
  backend,
  state,
  message,
  updatedAt
})

const appendDiagnosticRunLog = (entry) => {
  try {
    return appendRunLog(entry)
  } catch (_) {
    return null
  }
}

const assertTaskReadyForGeneration = (run) => {
  if (!run.generationTask) return
  if (!run.taskStatus || run.taskStatus === 'confirmed') return
  if (run.taskStatus === 'ready_for_confirmation' && (run.generationTask.questions || []).length === 0) return
  const error = new Error('Creator Studio task must be confirmed before generation')
  error.backend = normalizeCreatorBackend(run.backend || run.input?.backend, FIXTURE_BACKEND)
  error.state = 'failed'
  throw error
}

const writeHostGeneratedStandardOutputs = async ({ dataDir, run, generationResult, now }) => {
  const runDir = path.join(dataDir, 'runs', run.runId)
  const outputDir = path.join(runDir, 'outputs')
  const qaDir = path.join(runDir, 'qa')
  const creatorStudio = createCreatorStudioMetadata(run)
  const firstOutput = Array.isArray(generationResult.outputs) ? generationResult.outputs[0] : null

  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  const governance = loadPetGenerationGovernance()
  const atlas = await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult,
    outputDir,
    qaDir,
    officialRows: generationResult.officialRows || null,
    qualityProfile: governance.qualityProfile
  })
  if (atlas.previewOnly) {
    return {
      outputDir,
      bundlePath: '',
      sha256: '',
      qaPath: atlas.atlasQaPath,
      sourceQaPath: atlas.sourceQaPath,
      previewPath: atlas.previewPath,
      previewOnly: true
    }
  }
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: run.petId,
    displayName: run.input.petName,
    description: run.input.prompt || `A generated OpenPet pet named ${run.input.petName}.`,
    spritesheetPath: 'spritesheet.webp',
    ...(atlas.basicActions ? {
      requiredActionIds: atlas.basicActions.requiredRealActionIds,
      availableActionIds: atlas.basicActions.availableActionIds,
      omittedActionIds: atlas.basicActions.omittedActionIds,
      actionAvailability: atlas.basicActions.actionAvailability
    } : {}),
    ...(creatorStudio ? { creatorStudio } : {}),
    generatedImage: firstOutput || null,
    imageGeneration: {
      backend: generationResult.backend,
      model: generationResult.model,
      ...(generationResult.modelSnapshot ? { modelSnapshot: generationResult.modelSnapshot } : {}),
      generatedAt: generationResult.generatedAt || now()
    }
  }, null, 2)}\n`)
  if (creatorStudio) {
    fs.writeFileSync(path.join(qaDir, 'action-generation-task.json'), `${JSON.stringify({
      ok: true,
      ...creatorStudio
    }, null, 2)}\n`)
  }
  const bundlePath = path.join(outputDir, `${run.petId}.codex-pet.zip`)
  writeZip(outputDir, bundlePath)
  return {
    outputDir,
    bundlePath,
    sha256: sha256(bundlePath),
    qaPath: atlas.atlasQaPath,
    sourceQaPath: atlas.sourceQaPath,
    actionTaskQaPath: creatorStudio ? path.join(qaDir, 'action-generation-task.json') : ''
  }
}

const isHostGeneratedSingleActionRun = (run) => (
  run.generationTask?.mode === 'single-action' &&
  Array.isArray(run.generationTask.actions) &&
  run.generationTask.actions.length > 0
)

const getActionFrameBuilder = () => buildCanonicalActionFramesFromGeneratedImage

const persistGeneratedImageAttempt = ({ dataDir, run, generationResult, now }) => {
  const currentRun = readRun({ dataDir, runId: run.runId })
  const promptPreviewText = String(generationResult?.promptBuilder?.promptPreview?.text || '')
  if (promptPreviewText) {
    fs.writeFileSync(path.join(dataDir, 'runs', run.runId, 'inputs', 'provider-prompt.md'), `${promptPreviewText}\n`)
  }
  const nextRun = {
    ...currentRun,
    updatedAt: now(),
    artifacts: {
      ...currentRun.artifacts,
      generatedImage: generationResult,
      ...(generationResult?.anchorReferences ? { anchorReferences: generationResult.anchorReferences } : {})
    },
    ...(generationResult.modelSnapshot ? { modelSnapshot: generationResult.modelSnapshot } : {})
  }
  writeRun({ dataDir, run: nextRun })
  return nextRun
}

const createFailedGenerationAttempt = ({ generationResult, error, failedAt }) => {
  if (!generationResult || typeof generationResult !== 'object') return null
  return {
    ...generationResult,
    outputs: Array.isArray(generationResult.outputs) ? generationResult.outputs : [],
    failure: {
      message: String(error?.message || 'Creator Studio generation failed'),
      backend: String(error?.backend || generationResult.backend || ''),
      state: String(error?.state || 'failed')
    },
    failedAt
  }
}

const buildHostGeneratedActionOutput = async ({ dataDir, run, generationResult, now }) => {
  const completedAt = now()
  const action = run.generationTask.actions[0]
  const runDir = path.join(dataDir, 'runs', run.runId)
  const framesDir = path.join(runDir, 'frames', 'actions', action.actionId)
  const qaDir = path.join(runDir, 'qa')
  const actionFrames = await getActionFrameBuilder(action)({
    dataDir,
    generationResult,
    action,
    outputFramesDir: framesDir,
    qaDir
  })
  const actionFrameArtifact = {
    actionId: actionFrames.actionId,
    name: action.name,
    framesDir: actionFrames.framesDir,
    qa: actionFrames.qaPath,
    contactSheet: actionFrames.contactSheetPath,
    frameCount: actionFrames.frameCount,
    frameWidth: actionFrames.frameWidth,
    frameHeight: actionFrames.frameHeight,
    triggerProposal: action.triggerProposal || { type: 'unbound' }
  }
  assertActionFrameQaPassed({
    dataDir,
    actionFrames: actionFrameArtifact,
    operation: 'review'
  })
  const nextRun = {
    ...run,
    status: 'ready_for_review',
    currentStep: 'review',
    updatedAt: completedAt,
    artifacts: {
      ...run.artifacts,
      actionFrames: actionFrameArtifact,
      generatedImage: generationResult
    },
    ...(generationResult.modelSnapshot ? { modelSnapshot: generationResult.modelSnapshot } : {}),
    reviewStatus: 'pending',
    error: ''
  }
  return {
    outputDir: framesDir,
    bundlePath: '',
    sha256: '',
    run: nextRun
  }
}

const buildHostGeneratedRunOutput = async ({ dataDir, run, generationResult, now }) => {
  const completedAt = now()
  const standardOutput = await writeHostGeneratedStandardOutputs({ dataDir, run, generationResult, now })
  if (standardOutput.previewOnly) {
    const nextRun = {
      ...run,
      status: 'ready_for_review',
      currentStep: 'review',
      updatedAt: completedAt,
      artifacts: {
        ...run.artifacts,
        outputDir: standardOutput.outputDir,
        basePreview: standardOutput.previewPath,
        qa: standardOutput.qaPath,
        sourceImageQa: standardOutput.sourceQaPath,
        generatedImage: generationResult
      },
      reviewStatus: 'pending',
      error: ''
    }
    return { outputDir: standardOutput.outputDir, bundlePath: '', sha256: '', run: nextRun }
  }
  const nextRun = {
    ...run,
    status: 'ready_for_review',
    currentStep: 'review',
    updatedAt: completedAt,
    artifacts: {
      ...run.artifacts,
      outputDir: standardOutput.outputDir,
      petJson: path.join(standardOutput.outputDir, 'pet.json'),
      spritesheet: path.join(standardOutput.outputDir, 'spritesheet.webp'),
      bundle: standardOutput.bundlePath,
      qa: standardOutput.qaPath,
      sourceImageQa: standardOutput.sourceQaPath,
      ...(standardOutput.actionTaskQaPath ? { actionTaskQa: standardOutput.actionTaskQaPath } : {}),
      generatedImage: generationResult
    },
    ...(generationResult.modelSnapshot ? { modelSnapshot: generationResult.modelSnapshot } : {}),
    reviewStatus: 'pending',
    error: ''
  }
  return {
    outputDir: standardOutput.outputDir,
    bundlePath: standardOutput.bundlePath,
    sha256: standardOutput.sha256,
    run: nextRun
  }
}

const createSafeArchiveSegment = (value) => String(value || '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-|-$/g, '')
  || 'repair'

const copyRepairEvidencePath = ({ sourcePath, archiveDir, relativePath }) => {
  if (!fs.existsSync(sourcePath)) return
  const targetPath = path.join(archiveDir, relativePath)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true })
}

const archiveRepairEvidence = ({ dataDir, run, scope, actionId = '', archivedAt }) => {
  const runDir = path.join(dataDir, 'runs', run.runId)
  const baseArchiveId = `${createSafeArchiveSegment(archivedAt)}-${scope}${actionId ? `-${createSafeArchiveSegment(actionId)}` : ''}`
  let archiveRelativePath = ''
  let archiveDir = ''
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const archiveId = attempt === 1 ? baseArchiveId : `${baseArchiveId}-${attempt}`
    archiveRelativePath = path.join('runs', run.runId, 'repairs', archiveId).replace(/\\/g, '/')
    archiveDir = path.join(dataDir, archiveRelativePath)
    if (!fs.existsSync(archiveDir)) break
  }
  if (!archiveDir || fs.existsSync(archiveDir)) throw new Error('Creator Studio could not allocate a repair evidence archive')
  fs.mkdirSync(archiveDir, { recursive: true })
  fs.writeFileSync(path.join(archiveDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`)
  copyRepairEvidencePath({
    sourcePath: path.join(runDir, 'full-pet-action-checkpoints.json'),
    archiveDir,
    relativePath: 'full-pet-action-checkpoints.json'
  })
  const commonPaths = ['outputs', 'qa']
  const scopedPaths = scope === 'identity'
    ? [
        'anchors',
        path.join('inputs', 'anchors'),
        path.join('inputs', 'keyframes'),
        'keyframes',
        'prompts',
        path.join('frames', 'base'),
        'official-row-frames',
        'candidates',
        'candidate-archives',
        'evaluations',
        'quality-first',
        'recovery',
        'character-scale-profile.json',
        'sprite-plan.json'
      ]
    : [
        path.join('candidates', actionId),
        path.join('candidates', `action-${actionId}`),
        path.join('candidate-archives', `action-${actionId}`),
        path.join('references', actionId),
        path.join('quality-first', 'frames', actionId),
        path.join('prompts', 'quality-first'),
        'evaluations',
        path.join('keyframes', 'actions', `${actionId}-start-keyframe`),
        path.join('keyframes', 'actions', `${actionId}-peak-keyframe`),
        path.join('inputs', 'keyframes', 'actions'),
        path.join('prompts', 'keyframes', 'actions'),
        path.join('prompts', 'anchors', 'actions'),
        path.join('frames', 'base', `${actionId}-keyframe-row`),
        path.join('official-row-frames', actionId),
        ...(actionId === 'running-right' ? [path.join('official-row-frames', 'running-left')] : [])
      ]
  for (const relativePath of [...commonPaths, ...scopedPaths]) {
    copyRepairEvidencePath({
      sourcePath: path.join(runDir, relativePath),
      archiveDir,
      relativePath
    })
  }
  return archiveRelativePath
}

const runQualityFirstIdentityStage = async ({
  dataDir,
  runId,
  orchestrator,
  plan,
  sourceReference = null,
  actions = [],
  requireIdentityReviewBeforeActions = false,
  now = () => new Date().toISOString()
} = {}) => {
  if (!orchestrator?.start) throw new Error('Quality-first identity stage requires an orchestrator')
  const run = readRun({ dataDir, runId })
  assertTaskReadyForGeneration(run)
  if (run.generationTask?.mode !== 'full-pet') throw new Error('Quality-first identity stage requires a full-pet run')
  const startedAt = now()
  const lease = createGenerationLease({ commandId: 'quality-first-identity', startedAt, leaseId: `${runId}-quality-first-identity-${startedAt}` })
  const generatingRun = {
    ...run,
    status: 'generating',
    currentStep: 'canonical-candidates',
    updatedAt: startedAt,
    generationLease: lease,
    backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: 'running', message: 'Generating canonical identity candidates', updatedAt: startedAt }),
    error: ''
  }
  writeRun({ dataDir, run: generatingRun })
  appendRunLog({ dataDir, runId, event: 'quality-first.identity.started', message: 'Canonical identity candidate generation started', now: () => startedAt })
  const stopLeaseHeartbeat = createGenerationLeaseHeartbeat({ dataDir, runId, leaseId: lease.leaseId, now })
  try {
    const requestedActions = Array.isArray(actions) && actions.length
      ? actions
      : (Array.isArray(plan?.actions) ? plan.actions.map((action) => action?.actionId).filter(Boolean) : [])
    const next = await orchestrator.start({
      run: generatingRun,
      plan,
      sourceReference,
      actions: requestedActions,
      requireIdentityReviewBeforeActions: requireIdentityReviewBeforeActions === true,
      persistRunState: async (nextRun) => {
        if (!nextRun || String(nextRun.runId || '') !== runId) throw new Error('Quality-first durable run state is invalid')
        writeRun({ dataDir, run: nextRun })
      }
    })
    const { generationLease: _generationLease, ...pendingRun } = next
    const awaitingIdentityReview = pendingRun.status === 'awaiting_identity_review'
    const readyForReview = pendingRun.status === 'ready_for_review'
    const persisted = {
      ...pendingRun,
      backendStatus: createBackendStatus({
        backend: PROVIDER_BACKEND,
        state: awaitingIdentityReview ? 'awaiting-review' : (readyForReview ? 'ready' : 'recovery-required'),
        message: awaitingIdentityReview
          ? 'Canonical identity review required'
          : (readyForReview ? 'Quality-first actions ready for review' : 'Asset recovery required'),
        updatedAt: now()
      })
    }
    writeRun({ dataDir, run: persisted })
    appendDiagnosticRunLog({ dataDir, runId, event: 'quality-first.identity.completed', message: 'Canonical identity candidate generation completed', data: { candidateCount: Array.isArray(persisted.qualityFirst?.canonicalCandidates) ? persisted.qualityFirst.canonicalCandidates.length : 0 }, now })
    if (awaitingIdentityReview) {
      appendDiagnosticRunLog({ dataDir, runId, event: 'quality-first.identity.awaiting-review', message: 'Canonical identity candidates require human selection', now })
    } else {
      appendDiagnosticRunLog({
        dataDir,
        runId,
        event: 'quality-first.identity.selected',
        message: 'Canonical identity selected and action generation continued',
        data: { candidateId: String(persisted.qualityFirst?.acceptedCanonical?.candidateId || '').slice(0, 128) },
        now
      })
    }
    return { outputDir: '', bundlePath: '', sha256: '', run: persisted }
  } catch (error) {
    const latestRun = readRun({ dataDir, runId })
    const identityWasSelected = Boolean(latestRun?.qualityFirst?.acceptedCanonical) || ['generating-idle', 'generating-actions', 'ready_for_review', 'recovery-required'].includes(String(latestRun?.qualityFirst?.phase || ''))
    appendDiagnosticRunLog({
      dataDir,
      runId,
      level: 'error',
      event: identityWasSelected ? 'quality-first.actions.failed' : 'quality-first.identity.failed',
      message: identityWasSelected ? 'Quality-first action generation failed' : 'Canonical identity candidate generation failed',
      data: { failureCode: String(error?.code || (identityWasSelected ? 'action_generation_error' : 'identity_generation_error')).replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 120) },
      now
    })
    const canonicalPool = error?.code === 'canonical_identity_candidates_unusable' && Array.isArray(error?.canonicalPool?.candidates)
      ? error.canonicalPool
      : null
    updateRunStatus({
      dataDir,
      runId,
      status: 'failed',
      patch: {
        generationLease: undefined,
        error: error.message,
        backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: 'failed', message: error.message, updatedAt: now() }),
        ...(canonicalPool
          ? {
              qualityFirst: {
                version: 1,
                phase: 'identity-generation-failed',
                planHash: String(plan?.hash || '').slice(0, 128),
                canonicalCandidates: canonicalPool.candidates,
                acceptedCanonical: null,
                actionResults: {},
                dispatchCount: Math.max(0, Math.min(4, Number(canonicalPool.dispatchCount) || canonicalPool.candidates.length)),
                passingCandidateCount: Math.max(0, Number(canonicalPool.passingCandidateCount) || 0),
                requireIdentityReviewBeforeActions: requireIdentityReviewBeforeActions === true,
                failureCode: 'canonical_identity_candidates_unusable',
                nextAction: 'retry-identity'
              }
            }
          : {})
      },
      now
    })
    throw error
  } finally {
    stopLeaseHeartbeat()
  }
}

const runQualityFirstIdentityRetry = async ({
  dataDir,
  runId,
  orchestrator,
  plan,
  sourceReference = null,
  actions = [],
  requireIdentityReviewBeforeActions,
  now = () => new Date().toISOString()
} = {}) => {
  const run = readRun({ dataDir, runId })
  if (run.generationTask?.pipeline !== 'quality-first-v1' || run.generationTask?.mode !== 'full-pet') {
    throw new Error('Quality-first identity retry requires a quality-first full-pet run')
  }
  const startedAt = now()
  const evidenceArchive = archiveRepairEvidence({ dataDir, run, scope: 'identity', archivedAt: startedAt })
  invalidateAllActionCheckpoints({ dataDir, runId, reason: 'quality-first-identity-retry', now })
  const { qualityFirst: _qualityFirst, generationLease: _generationLease, ...baseRun } = run
  writeRun({
    dataDir,
    run: {
      ...baseRun,
      status: 'confirmed',
      currentStep: 'confirmed',
      reviewStatus: 'pending',
      importStatus: 'not-imported',
      error: '',
      updatedAt: startedAt,
      backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: 'idle', message: 'Canonical identity candidates archived for regeneration', updatedAt: startedAt })
    }
  })
  const output = await runQualityFirstIdentityStage({
    dataDir,
    runId,
    orchestrator,
    plan,
    sourceReference,
    actions,
    requireIdentityReviewBeforeActions: typeof requireIdentityReviewBeforeActions === 'boolean'
      ? requireIdentityReviewBeforeActions
      : run.qualityFirst?.requireIdentityReviewBeforeActions === true,
    now
  })
  return {
    ...output,
    repair: { scope: 'identity', actionId: '', evidenceArchive }
  }
}

const acceptQualityFirstCanonicalIdentity = async ({
  dataDir,
  runId,
  candidateId,
  expectedHash,
  orchestrator,
  plan,
  actions = [],
  now = () => new Date().toISOString()
} = {}) => {
  if (!orchestrator?.acceptCanonicalIdentity) throw new Error('Quality-first identity acceptance requires an orchestrator')
  const run = readRun({ dataDir, runId })
  if (run.status !== 'awaiting_identity_review' || run.qualityFirst?.phase !== 'awaiting_identity_review') {
    throw new Error('Creator Studio canonical identity review is not pending')
  }
  const candidate = run.qualityFirst.canonicalCandidates?.find((entry) => entry.candidateId === String(candidateId || ''))
  if (!candidate || candidate.eligible !== true || candidate.sha256 !== String(expectedHash || '')) {
    throw new Error('Creator Studio canonical identity candidate or hash is invalid')
  }
  const startedAt = now()
  const lease = createGenerationLease({ commandId: 'accept-identity', startedAt, leaseId: `${runId}-accept-identity-${startedAt}` })
  const generatingRun = {
    ...run,
    status: 'generating',
    currentStep: 'idle',
    updatedAt: startedAt,
    generationLease: lease,
    backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: 'running', message: 'Canonical identity accepted; generating actions', updatedAt: startedAt })
  }
  writeRun({ dataDir, run: generatingRun })
  const stopLeaseHeartbeat = createGenerationLeaseHeartbeat({ dataDir, runId, leaseId: lease.leaseId, now })
  try {
    const next = await orchestrator.acceptCanonicalIdentity({
      run: generatingRun,
      candidateId,
      sha256: expectedHash,
      plan,
      actions,
      persistRunState: async (nextRun) => {
        if (!nextRun || String(nextRun.runId || '') !== runId) throw new Error('Quality-first durable run state is invalid')
        writeRun({ dataDir, run: nextRun })
      }
    })
    const { generationLease: _generationLease, ...completedRun } = next
    const persisted = {
      ...completedRun,
      backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: completedRun.status === 'ready_for_review' ? 'ready' : 'recovery-required', message: completedRun.status === 'ready_for_review' ? 'Quality-first actions ready for review' : 'Asset recovery required', updatedAt: now() })
    }
    writeRun({ dataDir, run: persisted })
    appendDiagnosticRunLog({ dataDir, runId, event: 'quality-first.identity.accepted', message: 'Canonical identity accepted and dependent action stage completed', data: { candidateId: String(candidateId) }, now })
    return { outputDir: '', bundlePath: '', sha256: '', run: persisted }
  } catch (error) {
    appendDiagnosticRunLog({ dataDir, runId, level: 'error', event: 'quality-first.actions.failed', message: 'Quality-first action generation failed', data: { failureCode: String(error?.code || 'action_generation_error').replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 120) }, now })
    updateRunStatus({ dataDir, runId, status: 'failed', patch: { generationLease: undefined, error: error.message, backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: 'failed', message: error.message, updatedAt: now() }) }, now })
    throw error
  } finally {
    stopLeaseHeartbeat()
  }
}

const createQualityFirstActionResultView = (result) => ({
  ok: result?.ok === true,
  actionId: String(result?.actionId || ''),
  disposition: String(result?.disposition || ''),
  selectedCandidateId: String(result?.selectedCandidateId || ''),
  failureCode: String(result?.failureCode || ''),
  diversityStatus: result?.diversityStatus === 'degraded' ? 'degraded' : 'sufficient',
  warningCodes: [...new Set((Array.isArray(result?.warningCodes) ? result.warningCodes : []).map(String))].slice(0, 16),
  distinctCandidateCount: Math.max(0, Number(result?.distinctCandidateCount) || 0),
  evaluatedCandidateCount: Math.max(0, Number(result?.evaluatedCandidateCount) || 0),
  candidates: Array.isArray(result?.candidates) ? result.candidates.map((candidate) => ({
    candidateId: String(candidate?.candidateId || ''),
    attemptKind: String(candidate?.attemptKind || ''),
    ok: candidate?.qa?.ok === true && candidate?.gate?.ok === true,
    failureCodes: [...new Set([...(candidate?.qa?.failures || []), ...(candidate?.gate?.failures || []), ...(candidate?.failureCodes || [])])].map(String).slice(0, 32),
    score: Number(candidate?.evaluation?.scores?.overall) || 0,
    candidateRecordRelativePath: String(candidate?.candidateRecordRelativePath || '').replace(/\\/g, '/')
  })) : []
})

const runQualityFirstActionRepair = async ({
  dataDir,
  runId,
  actionId,
  runtime,
  plan,
  profile,
  now = () => new Date().toISOString()
} = {}) => {
  if (!runtime?.runAction || !runtime?.persistActionResult || !runtime?.finalizePackage) {
    throw new Error('Quality-first action repair requires a complete host runtime')
  }
  const run = readRun({ dataDir, runId })
  const normalizedActionId = String(actionId || '').trim()
  if (run.generationTask?.pipeline !== 'quality-first-v1' || run.generationTask?.mode !== 'full-pet') {
    throw new Error('Quality-first action repair requires a quality-first full-pet run')
  }
  if (!GENERATED_FULL_PET_ACTION_IDS.includes(normalizedActionId)) {
    throw new Error(normalizedActionId === 'running-left'
      ? 'Creator Studio running-left repair must regenerate running-right and derive its mirror'
      : `Creator Studio cannot repair unknown generated action: ${normalizedActionId || '(missing)'}`)
  }
  const canonical = run.qualityFirst?.acceptedCanonical
  if (!canonical?.candidateId || !canonical?.sha256) {
    throw new Error('Quality-first action repair requires accepted canonical identity')
  }
  if (normalizedActionId !== 'idle' && !profile?.hash) {
    throw new Error('Quality-first non-idle action repair requires a scale profile')
  }
  if (normalizedActionId === 'idle' && !profile?.hash && (
    typeof runtime.createCharacterScaleProfile !== 'function' || typeof runtime.persistScaleProfile !== 'function'
  )) {
    throw new Error('Quality-first idle recovery requires scale-profile reconstruction support')
  }
  const startedAt = now()
  const evidenceArchive = archiveRepairEvidence({ dataDir, run, scope: 'action', actionId: normalizedActionId, archivedAt: startedAt })
  invalidateActionCheckpoint({ dataDir, runId, actionId: normalizedActionId, reason: 'quality-first-action-repair', now })
  if (normalizedActionId === 'running-right') {
    invalidateActionCheckpoint({ dataDir, runId, actionId: 'running-left', reason: 'quality-first-running-mirror-repair', now })
  }
  const lease = createGenerationLease({ commandId: 'retry-action', startedAt, leaseId: `${runId}-retry-action-${startedAt}` })
  const generatingRun = {
    ...run,
    status: 'generating',
    currentStep: normalizedActionId,
    generationLease: lease,
    backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: 'running', message: `Regenerating ${normalizedActionId}`, updatedAt: startedAt })
  }
  writeRun({ dataDir, run: generatingRun })
  const stopLeaseHeartbeat = createGenerationLeaseHeartbeat({ dataDir, runId, leaseId: lease.leaseId, now })
  appendDiagnosticRunLog({ dataDir, runId, event: 'quality-first.action.repair-started', message: `Quality-first action ${normalizedActionId} repair started`, data: { actionId: normalizedActionId }, now })
  try {
    let effectiveProfile = profile
    const result = await runtime.runAction({ actionId: normalizedActionId, canonical, profile: effectiveProfile, plan })
    if (normalizedActionId === 'idle' && result?.ok === true && !effectiveProfile?.hash) {
      effectiveProfile = await runtime.createCharacterScaleProfile({ canonical, idle: result })
      if (!effectiveProfile?.hash) throw new Error('Quality-first idle recovery produced an invalid scale profile')
      await runtime.persistScaleProfile({ profile: effectiveProfile, canonical, idle: result })
    }
    await runtime.persistActionResult({ actionId: normalizedActionId, result, canonical, profile: effectiveProfile })
    const actionResults = {
      ...(run.qualityFirst?.actionResults || {}),
      [normalizedActionId]: createQualityFirstActionResultView(result)
    }
    if (
      normalizedActionId === 'idle' &&
      result?.ok === true &&
      run.qualityFirst?.actionResults?.idle?.ok !== true &&
      typeof runtime.orchestrator?.continueWithCanonicalIdentity === 'function'
    ) {
      const resumed = await runtime.orchestrator.continueWithCanonicalIdentity({
        run: generatingRun,
        candidate: canonical,
        plan,
        actions: Array.isArray(plan?.actions) ? plan.actions.map((entry) => String(entry?.actionId || '')).filter(Boolean) : ['idle'],
        persistRunState: async (nextRun) => {
          if (!nextRun || String(nextRun.runId || '') !== runId) throw new Error('Quality-first idle recovery produced an invalid durable run state')
          writeRun({ dataDir, run: nextRun })
        }
      })
      const { generationLease: _generationLease, ...completedRun } = resumed
      const persisted = {
        ...completedRun,
        backendStatus: createBackendStatus({
          backend: PROVIDER_BACKEND,
          state: completedRun.status === 'ready_for_review' ? 'ready' : 'recovery-required',
          message: completedRun.status === 'ready_for_review' ? 'Idle recovered and remaining actions completed' : 'Idle recovery still requires attention',
          updatedAt: now()
        })
      }
      writeRun({ dataDir, run: persisted })
      appendDiagnosticRunLog({ dataDir, runId, event: 'quality-first.action.repaired', message: 'Quality-first idle recovery resumed the remaining action pipeline', data: { actionId: normalizedActionId, evidenceArchive }, now })
      return { outputDir: '', bundlePath: '', sha256: '', run: persisted, repair: { scope: 'action', actionId: normalizedActionId, evidenceArchive } }
    }
    if (normalizedActionId === 'running-right' && result?.ok === true) {
      if (typeof runtime.mirrorRunningLeft !== 'function') throw new Error('Quality-first running-right repair requires mirror runtime')
      const mirrored = await runtime.mirrorRunningLeft({ source: result, profile: effectiveProfile, canonical })
      await runtime.persistActionResult({ actionId: 'running-left', result: mirrored, canonical, profile: effectiveProfile })
      actionResults['running-left'] = createQualityFirstActionResultView(mirrored)
    }
    const idleOk = normalizedActionId === 'idle' ? result?.ok === true : actionResults.idle?.ok === true
    const packageResult = idleOk ? await runtime.finalizePackage({ run, canonical, profile: effectiveProfile, actionResults }) : null
    if (idleOk && (!packageResult || typeof packageResult !== 'object' || !packageResult.artifacts || typeof packageResult.artifacts !== 'object')) {
      const error = new Error('Quality-first final package artifacts are missing')
      error.code = 'quality_first_final_package_missing'
      throw error
    }
    const { artifacts: packageArtifacts, ...publicPackageResult } = packageResult && typeof packageResult === 'object'
      ? packageResult
      : {}
    const recovery = !idleOk && typeof runtime.createRecoveryBundle === 'function'
      ? await runtime.createRecoveryBundle({ run, actionResults, reason: 'idle_generation_failed' })
      : null
    const status = idleOk ? 'ready_for_review' : 'recovery-required'
    const completedRun = {
      ...generatingRun,
      ...(packageArtifacts && typeof packageArtifacts === 'object'
        ? { artifacts: { ...(generatingRun.artifacts || {}), ...packageArtifacts } }
        : {}),
      status,
      currentStep: status === 'ready_for_review' ? 'review' : 'recovery',
      reviewStatus: status === 'ready_for_review' ? 'pending' : 'recovery-required',
      generationLease: undefined,
      backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: status === 'ready_for_review' ? 'ready' : 'recovery-required', message: status === 'ready_for_review' ? `Action ${normalizedActionId} repaired` : 'Idle recovery required', updatedAt: now() }),
      qualityFirst: {
        ...run.qualityFirst,
        phase: status === 'ready_for_review' ? 'ready_for_review' : 'recovery-required',
        actionResults,
        ...(packageResult ? { package: publicPackageResult } : {}),
        ...(recovery ? { recovery } : {}),
        nextAction: status === 'ready_for_review' ? 'human-review' : 'export-recovery-bundle'
      }
    }
    writeRun({ dataDir, run: completedRun })
    appendDiagnosticRunLog({ dataDir, runId, event: 'quality-first.action.repaired', message: `Quality-first action ${normalizedActionId} repair completed`, data: { actionId: normalizedActionId, evidenceArchive }, now })
    return { outputDir: '', bundlePath: '', sha256: '', run: completedRun, repair: { scope: 'action', actionId: normalizedActionId, evidenceArchive } }
  } catch (error) {
    appendDiagnosticRunLog({ dataDir, runId, level: 'error', event: 'quality-first.action.repair-failed', message: `Quality-first action ${normalizedActionId} repair failed`, data: { actionId: normalizedActionId, failureCode: String(error?.code || 'action_repair_failed').replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 120) }, now })
    updateRunStatus({ dataDir, runId, status: 'failed', patch: { generationLease: undefined, error: error.message, backendStatus: createBackendStatus({ backend: PROVIDER_BACKEND, state: 'failed', message: error.message, updatedAt: now() }) }, now })
    throw error
  } finally {
    stopLeaseHeartbeat()
  }
}

const runGenerationStep = async ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  const run = readRun({ dataDir, runId })
  const backend = normalizeCreatorBackend(run.backend || run.input?.backend, FIXTURE_BACKEND)
  if (run.status === 'generating') {
    const error = new Error(`Creator Studio run is already generating: ${runId}`)
    error.statusCode = 409
    error.run = run
    throw error
  }
  if (backend === PROVIDER_BACKEND && run.generationTask?.mode === 'full-pet' && run.generationTask?.pipeline !== 'quality-first-v1') {
    const error = new Error('Creator Studio legacy full-pet keyframe pipeline has been removed; create a quality-first-v1 run')
    error.code = 'legacy_full_pet_pipeline_removed'
    error.statusCode = 409
    throw error
  }
  if (backend === PROVIDER_BACKEND && run.generationTask?.mode === 'full-pet' && run.generationTask?.pipeline === 'quality-first-v1') {
    const runtime = await createQualityFirstHostRuntime({ dataDir, run })
    return runQualityFirstIdentityStage({
      dataDir,
      runId,
      orchestrator: runtime.orchestrator,
      plan: runtime.plan,
      sourceReference: runtime.sourceReference,
      actions: runtime.plan.actions.map((action) => action.actionId),
      requireIdentityReviewBeforeActions: runtime.requireIdentityReviewBeforeActions,
      now
    })
  }
  const startedAt = now()
  const generationLease = createGenerationLease({
    commandId: 'run-step',
    startedAt,
    leaseId: `${runId}-run-step-${startedAt}`
  })
  appendRunLog({
    dataDir,
    runId,
    level: 'info',
    event: 'generate.start',
    message: `Generation started with ${backend} backend`,
    data: { backend },
    now: () => startedAt
  })
  writeRun({
    dataDir,
    run: {
      ...run,
      status: 'generating',
      currentStep: 'generate',
      updatedAt: startedAt,
      humanApproval: undefined,
      importedActionId: '',
      importedPackId: '',
      activatedPackId: '',
      triggerProposalSubmission: undefined,
      reviewStatus: 'pending',
      importStatus: 'not-imported',
      generationLease,
      backendStatus: createBackendStatus({
        backend,
        state: 'running',
        updatedAt: startedAt
      }),
      error: ''
    }
  })
  const stopLeaseHeartbeat = createGenerationLeaseHeartbeat({
    dataDir,
    runId,
    leaseId: generationLease.leaseId,
    now
  })

  try {
    assertTaskReadyForGeneration(run)
    let output
    if (backend === FIXTURE_BACKEND) {
      output = await getBackendAdapter(backend).run({ dataDir, runId, now })
    } else {
      const generationResult = await generateViaHostModelBridge({ backend, run, dataDir })
      const runWithGeneratedImage = persistGeneratedImageAttempt({ dataDir, run, generationResult, now })
      output = isHostGeneratedSingleActionRun(runWithGeneratedImage)
        ? await buildHostGeneratedActionOutput({ dataDir, run: runWithGeneratedImage, generationResult, now })
        : await buildHostGeneratedRunOutput({ dataDir, run: runWithGeneratedImage, generationResult, now })
    }
    const completedAt = now()
    const { generationLease: _generationLease, ...outputRun } = output.run
    const completedRun = {
      ...outputRun,
      backendStatus: createBackendStatus({
        backend,
        state: 'ready',
        updatedAt: completedAt
      }),
      updatedAt: completedAt,
      error: ''
    }
    writeRun({ dataDir, run: completedRun })
    appendRunLog({
      dataDir,
      runId,
      level: 'info',
      event: 'generate.complete',
      message: `Generation completed with ${backend} backend`,
      data: {
        backend,
        outputDir: output.outputDir || '',
        bundlePath: output.bundlePath || ''
      },
      now: () => completedAt
    })
    return { ...output, run: completedRun }
  } catch (error) {
    const failedAt = now()
    const failedGenerationAttempt = createFailedGenerationAttempt({
      generationResult: error?.partialGenerationResult,
      error,
      failedAt
    })
    if (failedGenerationAttempt) {
      persistGeneratedImageAttempt({
        dataDir,
        run,
        generationResult: failedGenerationAttempt,
        now: () => failedAt
      })
    }
    const failedRun = updateRunStatus({
      dataDir,
      runId,
      status: 'failed',
      patch: {
        currentStep: 'generate',
        backendStatus: createBackendStatus({
          backend: error.backend || backend,
          state: error.state || 'failed',
          message: error.message || 'Creator Studio generation failed',
          updatedAt: failedAt
        }),
        error: error.message || 'Creator Studio generation failed',
        generationLease: undefined
      },
      now: () => failedAt
    })
    appendRunLog({
      dataDir,
      runId,
      level: 'error',
      event: 'generate.failed',
      message: error.message || 'Creator Studio generation failed',
      data: {
        backend: error.backend || backend,
        state: error.state || 'failed'
      },
      now: () => failedAt
    })
    error.run = failedRun
    throw error
  } finally {
    stopLeaseHeartbeat()
  }
}

module.exports = {
  acceptQualityFirstCanonicalIdentity,
  buildHostGeneratedActionOutput,
  persistGeneratedImageAttempt,
  runGenerationStep,
  runQualityFirstActionRepair,
  runQualityFirstIdentityRetry,
  runQualityFirstIdentityStage
}
