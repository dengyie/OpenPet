const { runCommand } = require('../lib/command-io')
const { runFullPetActionRepair } = require('../lib/backend-runner')
const { resolveRunId } = require('../lib/run-store')

runCommand(async (context) => {
  const runId = resolveRunId({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId: context.payload?.runId,
    statuses: ['failed', 'ready_for_review'],
    description: 'failed or reviewable full-pet'
  })
  const actionId = String(context.payload?.actionId || '').trim()
  const output = await runFullPetActionRepair({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId,
    actionId
  })
  return {
    message: `Repaired action ${actionId} for ${runId}`,
    run: output.run,
    repair: output.repair,
    outputDir: output.outputDir
  }
})
