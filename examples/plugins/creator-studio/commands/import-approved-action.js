const fs = require('fs')
const path = require('path')
const { runCommand } = require('../lib/command-io')
const { callBridge } = require('../lib/bridge-client')
const { readRun, resolveRunId, updateRunStatus } = require('../lib/run-store')

const toDataRelativePath = ({ dataDir, targetPath }) => {
  const root = path.resolve(dataDir)
  const target = path.resolve(targetPath)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Generated action frames must stay inside Creator Studio data directory')
  }
  const realRoot = fs.realpathSync.native(root)
  const realTarget = fs.realpathSync.native(target)
  const realRelative = path.relative(realRoot, realTarget)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error('Generated action frames must stay inside Creator Studio data directory')
  }
  return relative.replace(/\\/g, '/')
}

runCommand(async (context) => {
  const dataDir = process.env.OPENPET_DATA_DIR
  const runId = resolveRunId({
    dataDir,
    runId: context.payload?.runId,
    statuses: ['approved'],
    description: 'approved single-action'
  })
  const current = readRun({ dataDir, runId })
  if (current.status !== 'approved') throw new Error(`Run must be approved before action import: ${current.status}`)
  if (current.generationTask?.mode !== 'single-action') throw new Error('Only single-action runs can be imported as action frames')
  const actionFrames = current.artifacts?.actionFrames
  if (!actionFrames?.framesDir || !actionFrames?.actionId) {
    throw new Error('Approved run does not contain generated action frames')
  }

  const imported = await callBridge('/creator/assets/import-frames', {
    dataRelativePath: toDataRelativePath({ dataDir, targetPath: actionFrames.framesDir }),
    actionId: actionFrames.actionId,
    label: actionFrames.name || actionFrames.actionId
  })
  const run = updateRunStatus({
    dataDir,
    runId,
    status: 'imported',
    patch: {
      importStatus: 'imported',
      importedActionId: actionFrames.actionId,
      currentStep: 'imported'
    }
  })
  return {
    message: `Imported action ${actionFrames.actionId}`,
    run,
    imported,
    triggerProposal: actionFrames.triggerProposal || { type: 'unbound' }
  }
})
