const fs = require('fs')
const path = require('path')
const { getBackendAdapter } = require('./backend-adapters')
const { appendRunLog, readRun, updateRunStatus, writeRun } = require('./run-store')
const { generateViaHostModelBridge } = require('./host-model-bridge')
const {
  createCreatorStudioMetadata,
  createMinimalWebp,
  sha256,
  writeZip
} = require('./fake-hatch-pet')

const createBackendStatus = ({ backend, state, message = '', updatedAt }) => ({
  backend,
  state,
  message,
  updatedAt
})

const writeHostGeneratedStandardOutputs = ({ dataDir, run, generationResult, now }) => {
  const runDir = path.join(dataDir, 'runs', run.runId)
  const outputDir = path.join(runDir, 'outputs')
  const qaDir = path.join(runDir, 'qa')
  const creatorStudio = createCreatorStudioMetadata(run)
  const firstOutput = Array.isArray(generationResult.outputs) ? generationResult.outputs[0] : null

  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
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
      generatedAt: generationResult.generatedAt || now()
    }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
    ok: true,
    width: 1536,
    height: 1872,
    warnings: ['Host-generated output is using placeholder spritesheet packaging.']
  }, null, 2)}\n`)
  if (creatorStudio) {
    fs.writeFileSync(path.join(qaDir, 'action-generation-task.json'), `${JSON.stringify({
      ok: true,
      originalPrompt: run.input.originalPrompt || run.input.prompt || '',
      ...creatorStudio
    }, null, 2)}\n`)
  }
  const bundlePath = path.join(outputDir, `${run.petId}.codex-pet.zip`)
  writeZip(outputDir, bundlePath)
  return {
    outputDir,
    bundlePath,
    sha256: sha256(bundlePath),
    qaPath: path.join(qaDir, 'atlas-validation.json'),
    actionTaskQaPath: creatorStudio ? path.join(qaDir, 'action-generation-task.json') : ''
  }
}

const buildHostGeneratedRunOutput = ({ dataDir, run, generationResult, now }) => {
  const completedAt = now()
  const standardOutput = writeHostGeneratedStandardOutputs({ dataDir, run, generationResult, now })
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
      ...(standardOutput.actionTaskQaPath ? { actionTaskQa: standardOutput.actionTaskQaPath } : {}),
      generatedImage: generationResult
    },
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
  const backend = run.backend || run.input?.backend || 'fixture'
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
    const output = backend === 'fixture'
      ? getBackendAdapter(backend).run({ dataDir, runId, now })
      : buildHostGeneratedRunOutput({
          dataDir,
          run,
          generationResult: await generateViaHostModelBridge({ backend, run }),
          now
        })
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
