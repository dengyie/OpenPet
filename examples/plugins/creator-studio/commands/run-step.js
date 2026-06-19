const { runCommand } = require('../lib/command-io')
const { runGenerationStep } = require('../lib/backend-runner')
const { resolveRunId } = require('../lib/run-store')

runCommand(async (context) => {
  const runId = resolveRunId({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId: context.payload?.runId,
    statuses: ['draft', 'failed'],
    description: 'draft or failed'
  })
  const output = await runGenerationStep({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId
  })
  return { message: `Generated pet output for ${runId}`, run: output.run, outputDir: output.outputDir }
})
