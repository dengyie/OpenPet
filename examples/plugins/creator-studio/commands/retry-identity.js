const { runCommand } = require('../lib/command-io')
const { runFullPetIdentityRepair } = require('../lib/backend-runner')
const { runQualityFirstIdentityStage } = require('../lib/backend-runner')
const { createQualityFirstHostRuntime } = require('../lib/host-model-bridge')
const { recoverStaleGeneratingRuns, readRun, resolveRunId } = require('../lib/run-store')
const fs = require('node:fs')
const path = require('node:path')

runCommand(async (context) => {
  recoverStaleGeneratingRuns({ dataDir: process.env.OPENPET_DATA_DIR })
  const runId = resolveRunId({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId: context.payload?.runId,
    statuses: ['failed', 'ready_for_review', 'recovery-required', 'awaiting_identity_review'],
    description: 'failed or reviewable full-pet'
  })
  const run = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  let output
  if (run.generationTask?.pipeline === 'quality-first-v1') {
    const planPath = path.join(process.env.OPENPET_DATA_DIR, 'runs', runId, 'sprite-plan.json')
    if (!fs.existsSync(planPath)) throw new Error('Quality-first sprite plan is missing')
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
    const runtime = await createQualityFirstHostRuntime({ dataDir: process.env.OPENPET_DATA_DIR, run, planOverride: plan })
    output = await runQualityFirstIdentityStage({
      dataDir: process.env.OPENPET_DATA_DIR,
      runId,
      orchestrator: runtime.orchestrator,
      plan,
      sourceReference: runtime.sourceReference
    })
  } else {
    output = await runFullPetIdentityRepair({
      dataDir: process.env.OPENPET_DATA_DIR,
      runId
    })
  }
  return {
    message: `Regenerated canonical identity for ${runId}`,
    run: output.run,
    repair: output.repair,
    outputDir: output.outputDir
  }
})
