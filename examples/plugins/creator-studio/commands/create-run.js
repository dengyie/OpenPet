const { runCommand } = require('../lib/command-io')
const { createRun } = require('../lib/run-store')

runCommand(async (context) => {
  const run = createRun({
    dataDir: process.env.OPENPET_DATA_DIR,
    input: {
      ...context.payload,
      backend: context.payload?.backend || context.config?.backend || 'fixture'
    }
  })
  return { message: `Created run ${run.runId}`, run }
})
