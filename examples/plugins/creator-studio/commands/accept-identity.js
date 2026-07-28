const fs = require('fs')
const path = require('path')
const { runCommand } = require('../lib/command-io')
const { acceptQualityFirstCanonicalIdentity } = require('../lib/backend-runner')
const { createQualityFirstHostRuntime } = require('../lib/host-model-bridge')
const { recoverStaleGeneratingRuns, readRun, resolveRunId } = require('../lib/run-store')

runCommand(async (context) => {
  const dataDir = process.env.OPENPET_DATA_DIR
  recoverStaleGeneratingRuns({ dataDir })
  const runId = resolveRunId({ dataDir, runId: context.payload?.runId, statuses: ['awaiting_identity_review'], description: 'identity-review' })
  const run = readRun({ dataDir, runId })
  const planPath = path.join(dataDir, 'runs', runId, 'sprite-plan.json')
  if (!fs.existsSync(planPath)) throw new Error('Quality-first sprite plan is missing')
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
  const runtime = await createQualityFirstHostRuntime({ dataDir, run, planOverride: plan })
  const output = await acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId,
    candidateId: context.payload?.candidateId,
    expectedHash: context.payload?.sha256,
    qualityOverride: context.payload?.qualityOverride === true,
    acknowledgedWarningCodes: Array.isArray(context.payload?.acknowledgedWarningCodes)
      ? context.payload.acknowledgedWarningCodes
      : [],
    orchestrator: runtime.orchestrator,
    plan,
    actions: plan.actions.map((action) => action.actionId)
  })
  return { message: `Accepted canonical identity for ${runId}`, run: output.run, outputDir: output.outputDir }
})
