const fs = require('fs')
const crypto = require('crypto')
const { runCommand } = require('../lib/command-io')
const { readRun, resolveRunId } = require('../lib/run-store')

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

runCommand(async (context) => {
  const runId = resolveRunId({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId: context.payload?.runId,
    statuses: ['approved', 'imported'],
    description: 'approved or imported pet bundle',
    filter: (run) => Boolean(run.artifacts?.bundle)
  })
  const run = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  const bundlePath = run.artifacts?.bundle
  if (!bundlePath || !fs.existsSync(bundlePath)) throw new Error('Run has no export bundle')
  return {
    message: `Export bundle ready for ${runId}`,
    bundle: {
      path: bundlePath,
      sha256: sha256(bundlePath),
      byteSize: fs.statSync(bundlePath).size
    }
  }
})
