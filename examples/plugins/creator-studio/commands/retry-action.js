const { runCommand } = require('../lib/command-io')
const fs = require('node:fs')
const path = require('node:path')
const { runQualityFirstActionRepair } = require('../lib/backend-runner')
const { createQualityFirstHostRuntime } = require('../lib/host-model-bridge')
const { recoverStaleGeneratingRuns, readRun, resolveRunId } = require('../lib/run-store')

runCommand(async (context) => {
  recoverStaleGeneratingRuns({ dataDir: process.env.OPENPET_DATA_DIR })
  const runId = resolveRunId({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId: context.payload?.runId,
    statuses: ['failed', 'ready_for_review', 'recovery-required'],
    description: 'failed or reviewable full-pet'
  })
  const actionId = String(context.payload?.actionId || '').trim()
  const run = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  if (run.generationTask?.pipeline !== 'quality-first-v1') throw new Error('Legacy full-pet action repair has been removed')
  const planPath = path.join(process.env.OPENPET_DATA_DIR, 'runs', runId, 'sprite-plan.json')
  const profilePath = path.join(process.env.OPENPET_DATA_DIR, 'runs', runId, 'character-scale-profile.json')
  if (!fs.existsSync(planPath) || (actionId !== 'idle' && !fs.existsSync(profilePath))) throw new Error('Quality-first action repair requires a sprite plan and non-idle actions require a scale profile')
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
  const profile = fs.existsSync(profilePath) ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : null
  const runtime = await createQualityFirstHostRuntime({ dataDir: process.env.OPENPET_DATA_DIR, run, planOverride: plan })
  const output = await runQualityFirstActionRepair({ dataDir: process.env.OPENPET_DATA_DIR, runId, actionId, runtime, plan, profile })
  return {
    message: `Repaired action ${actionId} for ${runId}`,
    run: output.run,
    repair: output.repair,
    outputDir: output.outputDir
  }
})
