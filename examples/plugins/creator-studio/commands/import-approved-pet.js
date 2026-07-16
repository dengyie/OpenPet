const path = require('path')
const { runCommand } = require('../lib/command-io')
const { callBridge } = require('../lib/bridge-client')
const { assertRunFullPetQaPassed } = require('../lib/full-pet-qa')
const { readRun, resolveRunId, updateRunStatus } = require('../lib/run-store')

const inspectOutput = async ({ outputDir }) => {
  const dataRelativePath = path.relative(process.env.OPENPET_DATA_DIR, outputDir).replace(/\\/g, '/')
  return callBridge('/creator/pet-pack/inspect-output', { dataRelativePath })
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
  assertRunFullPetQaPassed({
    dataDir: process.env.OPENPET_DATA_DIR,
    run: current,
    operation: 'import'
  })
  const inspection = await inspectOutput({ outputDir })
  if (!inspection.inspection?.valid) throw new Error((inspection.inspection?.errors || []).join('; ') || 'Pet pack inspection failed')
  const imported = await callBridge('/creator/pet-pack/import-output', {
    selectionId: inspection.inspection.selectionId,
    activate: context.payload?.activate === true
  })
  const run = updateRunStatus({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId,
    status: 'imported',
    patch: {
      importStatus: 'imported',
      importedPackId: imported.imported?.pack?.id || '',
      activatedPackId: imported.activated?.activePackId || '',
      currentStep: 'imported'
    }
  })
  return { message: `Imported run ${runId}`, run, imported }
})
