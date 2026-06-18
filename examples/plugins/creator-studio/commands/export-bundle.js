const fs = require('fs')
const crypto = require('crypto')
const { runCommand } = require('../lib/command-io')
const { readRun } = require('../lib/run-store')

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
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
