const path = require('path')
const { runCommand } = require('../lib/command-io')
const { callBridge } = require('../lib/bridge-client')
const { readRun, updateRunStatus } = require('../lib/run-store')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
  const current = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  if (current.status !== 'approved') throw new Error(`Run must be approved before import: ${current.status}`)
  const outputDir = current.artifacts?.outputDir
  if (!outputDir) throw new Error('Run has no output directory')
  const dataRelativePath = path.relative(process.env.OPENPET_DATA_DIR, outputDir).replace(/\\/g, '/')
  const inspection = await callBridge('/creator/pet-pack/inspect-output', { dataRelativePath })
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
