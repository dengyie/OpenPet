const fs = require('fs')
const path = require('path')
const { getBackendAdapter } = require('./backend-adapters')
const { appendRunLog, readRun, updateRunStatus, writeRun } = require('./run-store')
const { generateViaHostModelBridge } = require('./host-model-bridge')
const {
  buildActionFramesFromGeneratedImage,
  buildCanonicalActionFramesFromGeneratedImage
} = require('./action-frame-builder')
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

const getActionFrameBuilder = (action = {}) => (
  action?.synthesisMode === 'canonical-frame'
    ? buildCanonicalActionFramesFromGeneratedImage
    : buildActionFramesFromGeneratedImage
)

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

const assertRepairableFullPetRun = ({ run, operation }) => {
  if (run?.generationTask?.mode !== 'full-pet') {
    throw new Error(`Creator Studio ${operation} requires a full-pet run`)
  }
  if (normalizeCreatorBackend(run.backend || run.input?.backend, FIXTURE_BACKEND) !== PROVIDER_BACKEND) {
    throw new Error(`Creator Studio ${operation} requires a Provider run`)
  }
  if (!['failed', 'ready_for_review'].includes(String(run.status || ''))) {
    throw new Error(`Creator Studio ${operation} requires a failed or reviewable run: ${run.status}`)
  }
}

const createRepairBaseRun = ({ run, preserveGeneratedImage }) => {
  const preservedArtifacts = preserveGeneratedImage
    ? {
        ...(run.artifacts?.generatedImage ? { generatedImage: run.artifacts.generatedImage } : {}),
        ...(run.artifacts?.anchorReferences ? { anchorReferences: run.artifacts.anchorReferences } : {})
      }
    : {}
  const {
    activatedPackId: _discardedActivatedPackId,
    humanApproval: _discardedHumanApproval,
    importedActionId: _discardedImportedActionId,
    importedPackId: _discardedImportedPackId,
    modelSnapshot: _discardedModelSnapshot,
    triggerProposalSubmission: _discardedTriggerProposalSubmission,
    ...baseRun
  } = run
  return {
    ...baseRun,
    status: 'failed',
    currentStep: 'generate',
    artifacts: preservedArtifacts,
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    error: ''
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
        'official-row-frames'
      ]
    : [
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

const runFullPetActionRepair = async ({
  dataDir,
  runId,
  actionId,
  now = () => new Date().toISOString()
}) => {
  const run = readRun({ dataDir, runId })
  assertRepairableFullPetRun({ run, operation: 'action repair' })
  const normalizedActionId = String(actionId || '').trim()
  if (!GENERATED_FULL_PET_ACTION_IDS.includes(normalizedActionId)) {
    throw new Error(
      normalizedActionId === 'running-left'
        ? 'Creator Studio running-left repair must regenerate running-right and derive its mirror'
        : `Creator Studio cannot repair unknown generated action: ${normalizedActionId || '(missing)'}`
    )
  }
  const startedAt = now()
  const evidenceArchive = archiveRepairEvidence({
    dataDir,
    run,
    scope: 'action',
    actionId: normalizedActionId,
    archivedAt: startedAt
  })
  invalidateActionCheckpoint({
    dataDir,
    runId,
    actionId: normalizedActionId,
    reason: 'scoped-action-repair',
    now
  })
  const repairRun = {
    ...createRepairBaseRun({ run, preserveGeneratedImage: true }),
    status: 'generating',
    updatedAt: startedAt,
    generationLease: createGenerationLease({
      commandId: 'retry-action',
      startedAt,
      leaseId: `${runId}-retry-action-${startedAt}`
    }),
    backendStatus: createBackendStatus({
      backend: PROVIDER_BACKEND,
      state: 'running',
      message: `Repairing action ${normalizedActionId}`,
      updatedAt: startedAt
    })
  }
  writeRun({ dataDir, run: repairRun })
  const stopLeaseHeartbeat = createGenerationLeaseHeartbeat({
    dataDir,
    runId,
    leaseId: repairRun.generationLease.leaseId,
    now
  })
  appendRunLog({
    dataDir,
    runId,
    level: 'info',
    event: 'repair.action.started',
    message: `Scoped repair started for ${normalizedActionId}`,
    data: { scope: 'action', actionId: normalizedActionId, evidenceArchive },
    now: () => startedAt
  })
  try {
    const generationResult = await regenerateFullPetActionsViaHostModelBridge({
      dataDir,
      run: repairRun,
      actionIds: [normalizedActionId]
    })
    const runWithGeneratedImage = persistGeneratedImageAttempt({
      dataDir,
      run: repairRun,
      generationResult,
      now
    })
    const output = await buildHostGeneratedRunOutput({
      dataDir,
      run: runWithGeneratedImage,
      generationResult,
      now
    })
    const completedAt = now()
    const { generationLease: _generationLease, ...outputRun } = output.run
    const completedRun = {
      ...outputRun,
      backendStatus: createBackendStatus({
        backend: PROVIDER_BACKEND,
        state: 'ready',
        message: `Action repair completed for ${normalizedActionId}`,
        updatedAt: completedAt
      }),
      updatedAt: completedAt
    }
    writeRun({ dataDir, run: completedRun })
    appendRunLog({
      dataDir,
      runId,
      level: 'info',
      event: 'repair.action.completed',
      message: `Scoped repair completed for ${normalizedActionId}`,
      data: { scope: 'action', actionId: normalizedActionId },
      now: () => completedAt
    })
    return {
      ...output,
      run: completedRun,
      repair: { scope: 'action', actionId: normalizedActionId, evidenceArchive }
    }
  } catch (error) {
    const failedAt = now()
    const failedRun = updateRunStatus({
      dataDir,
      runId,
      status: 'failed',
      patch: {
        currentStep: 'generate',
        reviewStatus: 'pending',
        importStatus: 'not-imported',
        backendStatus: createBackendStatus({
          backend: PROVIDER_BACKEND,
          state: 'failed',
          message: error?.message || 'Creator Studio action repair failed',
          updatedAt: failedAt
        }),
        error: error?.message || 'Creator Studio action repair failed',
        generationLease: undefined
      },
      now: () => failedAt
    })
    appendRunLog({
      dataDir,
      runId,
      level: 'error',
      event: 'repair.action.failed',
      message: error?.message || 'Creator Studio action repair failed',
      data: { scope: 'action', actionId: normalizedActionId },
      now: () => failedAt
    })
    error.run = failedRun
    throw error
  } finally {
    stopLeaseHeartbeat()
  }
}

const runFullPetIdentityRepair = async ({
  dataDir,
  runId,
  now = () => new Date().toISOString()
}) => {
  const run = readRun({ dataDir, runId })
  assertRepairableFullPetRun({ run, operation: 'identity repair' })
  const repairStartedAt = now()
  const evidenceArchive = archiveRepairEvidence({
    dataDir,
    run,
    scope: 'identity',
    archivedAt: repairStartedAt
  })
  invalidateAllActionCheckpoints({
    dataDir,
    runId,
    reason: 'identity-repair',
    now
  })
  const resetRun = {
    ...createRepairBaseRun({ run, preserveGeneratedImage: false }),
    updatedAt: repairStartedAt,
    backendStatus: createBackendStatus({
      backend: PROVIDER_BACKEND,
      state: 'idle',
      message: 'Canonical identity invalidated for regeneration',
      updatedAt: repairStartedAt
    })
  }
  writeRun({ dataDir, run: resetRun })
  appendRunLog({
    dataDir,
    runId,
    level: 'info',
    event: 'repair.identity.started',
    message: 'Identity-scoped repair invalidated all dependent actions',
    data: { scope: 'identity', evidenceArchive },
    now: () => repairStartedAt
  })
  const output = await runGenerationStep({ dataDir, runId, now })
  appendRunLog({
    dataDir,
    runId,
    level: 'info',
    event: 'repair.identity.completed',
    message: 'Identity-scoped repair completed and requires full visual review',
    data: { scope: 'identity' },
    now
  })
  return {
    ...output,
    repair: { scope: 'identity', actionId: '', evidenceArchive }
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
  persistGeneratedImageAttempt,
  runGenerationStep
}
