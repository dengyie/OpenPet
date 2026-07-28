const fs = require('fs')
const path = require('path')
const { runCommand } = require('../lib/command-io')
const { acceptQualityFirstActionCandidate } = require('../lib/backend-runner')
const { createQualityFirstHostRuntime } = require('../lib/host-model-bridge')
const { recoverStaleGeneratingRuns, readRun, resolveRunId } = require('../lib/run-store')

runCommand(async (context) => {
  const dataDir = process.env.OPENPET_DATA_DIR
  recoverStaleGeneratingRuns({ dataDir })
  const runId = resolveRunId({
    dataDir,
    runId: context.payload?.runId,
    statuses: ['ready_for_review', 'recovery-required', 'failed'],
    description: 'action-candidate-review'
  })
  const run = readRun({ dataDir, runId })
  const planPath = path.join(dataDir, 'runs', runId, 'sprite-plan.json')
  if (!fs.existsSync(planPath)) throw new Error('Quality-first sprite plan is missing')
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
  const profilePath = path.join(dataDir, 'runs', runId, 'character-scale-profile.json')
  const profile = fs.existsSync(profilePath) ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : null
  const runtime = await createQualityFirstHostRuntime({ dataDir, run, planOverride: plan })
  const output = await acceptQualityFirstActionCandidate({
    dataDir,
    runId,
    actionId: context.payload?.actionId,
    candidateId: context.payload?.candidateId,
    expectedHash: context.payload?.sha256,
    qualityOverride: context.payload?.qualityOverride === true,
    acknowledgedWarningCodes: Array.isArray(context.payload?.acknowledgedWarningCodes)
      ? context.payload.acknowledgedWarningCodes
      : [],
    runtime,
    plan,
    profile
  })
  return {
    message: `Accepted retained ${context.payload?.actionId || 'action'} candidate for ${runId}`,
    run: output.run,
    outputDir: output.outputDir
  }
})
