const { getBackendAdapter } = require('./backend-adapters')
const { appendRunLog, readRun, updateRunStatus, writeRun } = require('./run-store')

const createBackendStatus = ({ backend, state, message = '', updatedAt }) => ({
  backend,
  state,
  message,
  updatedAt
})

const runGenerationStep = ({ dataDir, runId, now = () => new Date().toISOString() }) => {
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
    const output = getBackendAdapter(backend).run({ dataDir, runId, now })
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
