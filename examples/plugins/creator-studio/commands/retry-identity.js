const { runCommand } = require('../lib/command-io')
const { runFullPetIdentityRepair } = require('../lib/backend-runner')
const { recoverStaleGeneratingRuns, resolveRunId } = require('../lib/run-store')

runCommand(async (context) => {
  recoverStaleGeneratingRuns({ dataDir: process.env.OPENPET_DATA_DIR })
  const runId = resolveRunId({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId: context.payload?.runId,
    statuses: ['failed', 'ready_for_review'],
    description: 'failed or reviewable full-pet'
  })
  const output = await runFullPetIdentityRepair({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId
  })
  return {
    message: `Regenerated canonical identity for ${runId}`,
    run: output.run,
    repair: output.repair,
    outputDir: output.outputDir
  }
})
