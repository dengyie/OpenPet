const fs = require('fs')
const path = require('path')
const { getBackendAdapter } = require('./backend-adapters')
const { appendRunLog, readRun, updateRunStatus, writeRun } = require('./run-store')
const { generateViaHostModelBridge } = require('./host-model-bridge')
const { buildActionFramesFromGeneratedImage } = require('./action-frame-builder')
const { buildRealAtlasFromGeneratedImage } = require('./real-atlas-builder')
const { FIXTURE_BACKEND, normalizeCreatorBackend } = require('./backend-mode')
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
  const atlas = await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult,
    outputDir,
    qaDir
  })
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: run.petId,
    displayName: run.input.petName,
    description: run.input.prompt || `A generated OpenPet pet named ${run.input.petName}.`,
    spritesheetPath: 'spritesheet.webp',
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

const buildHostGeneratedActionOutput = async ({ dataDir, run, generationResult, now }) => {
  const completedAt = now()
  const action = run.generationTask.actions[0]
  const runDir = path.join(dataDir, 'runs', run.runId)
  const framesDir = path.join(runDir, 'frames', 'actions', action.actionId)
  const qaDir = path.join(runDir, 'qa')
  const actionFrames = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult,
    action,
    outputFramesDir: framesDir,
    qaDir
  })
  const nextRun = {
    ...run,
    status: 'ready_for_review',
    currentStep: 'review',
    updatedAt: completedAt,
    artifacts: {
      ...run.artifacts,
      actionFrames: {
        actionId: actionFrames.actionId,
        name: action.name,
        framesDir: actionFrames.framesDir,
        qa: actionFrames.qaPath,
        contactSheet: actionFrames.contactSheetPath,
        frameCount: actionFrames.frameCount,
        frameWidth: actionFrames.frameWidth,
        frameHeight: actionFrames.frameHeight,
        triggerProposal: action.triggerProposal || { type: 'unbound' }
      },
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

const runGenerationStep = async ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  const run = readRun({ dataDir, runId })
  const backend = normalizeCreatorBackend(run.backend || run.input?.backend, FIXTURE_BACKEND)
  const startedAt = now()
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
      backendStatus: createBackendStatus({
        backend,
        state: 'running',
        updatedAt: startedAt
      }),
      error: ''
    }
  })

  try {
    assertTaskReadyForGeneration(run)
    let output
    if (backend === FIXTURE_BACKEND) {
      output = await getBackendAdapter(backend).run({ dataDir, runId, now })
    } else {
      const generationResult = await generateViaHostModelBridge({ backend, run })
      output = isHostGeneratedSingleActionRun(run)
        ? await buildHostGeneratedActionOutput({ dataDir, run, generationResult, now })
        : await buildHostGeneratedRunOutput({ dataDir, run, generationResult, now })
    }
    const completedAt = now()
    const completedRun = {
      ...output.run,
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
        error: error.message || 'Creator Studio generation failed'
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
  }
}

module.exports = {
  runGenerationStep
}
