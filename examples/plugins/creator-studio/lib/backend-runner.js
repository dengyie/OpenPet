const { getBackendAdapter } = require('./backend-adapters')
const { readRun, updateRunStatus, writeRun } = require('./run-store')

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
    error.run = failedRun
    throw error
  }
}

module.exports = {
  runGenerationStep
}
