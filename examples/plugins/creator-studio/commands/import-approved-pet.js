const path = require('path')
const { runCommand } = require('../lib/command-io')
const { callBridge } = require('../lib/bridge-client')
const { runGenerationStep } = require('../lib/backend-runner')
const { readRun, resolveRunId, updateRunStatus } = require('../lib/run-store')

const STALE_FIXTURE_ATLAS_ERROR = /Codex pet atlas must contain visible pixels/

const inspectOutput = async ({ outputDir }) => {
  const dataRelativePath = path.relative(process.env.OPENPET_DATA_DIR, outputDir).replace(/\\/g, '/')
  return callBridge('/creator/pet-pack/inspect-output', { dataRelativePath })
}

const regenerateApprovedFixtureOutput = async ({ current, runId }) => {
  const backend = current.backend || current.input?.backend || 'fixture'
  if (backend !== 'fixture') return null
  const regenerated = await runGenerationStep({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId
  })
  updateRunStatus({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId,
    status: 'approved',
    patch: { reviewStatus: 'approved', currentStep: 'approved' }
  })
  return regenerated
}

runCommand(async (context) => {
  const runId = resolveRunId({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId: context.payload?.runId,
    statuses: ['approved'],
    description: 'approved pet bundle',
    filter: (run) => Boolean(run.artifacts?.outputDir)
  })
  const current = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  if (current.status !== 'approved') throw new Error(`Run must be approved before import: ${current.status}`)
  const outputDir = current.artifacts?.outputDir
  if (!outputDir) throw new Error('Run has no output directory')
  let inspection
  try {
    inspection = await inspectOutput({ outputDir })
  } catch (error) {
    if (!STALE_FIXTURE_ATLAS_ERROR.test(String(error.message || ''))) throw error
    const regenerated = await regenerateApprovedFixtureOutput({ current, runId })
    if (!regenerated) throw error
    inspection = await inspectOutput({ outputDir: regenerated.outputDir || outputDir })
  }
  if (!inspection.inspection?.valid) throw new Error((inspection.inspection?.errors || []).join('; ') || 'Pet pack inspection failed')
  const imported = await callBridge('/creator/pet-pack/import-output', {
    selectionId: inspection.inspection.selectionId,
    activate: context.payload?.activate ?? context.config?.autoActivateAfterImport ?? true
  })
  const run = updateRunStatus({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId,
    status: 'imported',
    patch: {
      importStatus: 'imported',
      importedPackId: imported.imported?.pack?.id || '',
      currentStep: 'imported'
    }
  })
  return { message: `Imported run ${runId}`, run, imported }
})
