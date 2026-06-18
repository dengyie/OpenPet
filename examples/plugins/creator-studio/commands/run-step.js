const { runCommand } = require('../lib/command-io')
const { generateFixturePetOutput } = require('../lib/fake-hatch-pet')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
  const output = generateFixturePetOutput({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId
  })
  return { message: `Generated fixture pet output for ${runId}`, run: output.run, outputDir: output.outputDir }
})
