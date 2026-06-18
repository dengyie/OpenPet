const { runCommand } = require('../lib/command-io')
const { readRun, updateRunStatus } = require('../lib/run-store')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
  const current = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  if (current.status !== 'ready_for_review') throw new Error(`Run must be ready_for_review before approval: ${current.status}`)
  const run = updateRunStatus({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId,
    status: 'approved',
    patch: { reviewStatus: 'approved', currentStep: 'approved' }
  })
  return { message: `Approved run ${runId}`, run }
})
