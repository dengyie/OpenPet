const { runCommand } = require('../lib/command-io')
const { runGenerationStep } = require('../lib/backend-runner')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
  const output = runGenerationStep({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId
  })
  return { message: `Generated pet output for ${runId}`, run: output.run, outputDir: output.outputDir }
})
