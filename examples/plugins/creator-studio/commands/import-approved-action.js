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

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

const validateActionFrameQa = ({ dataDir, actionFrames }) => {
  if (!actionFrames?.qa || !fs.existsSync(actionFrames.qa)) {
    throw new Error('Approved run is missing action frame QA')
  }
  toDataRelativePath({ dataDir, targetPath: actionFrames.qa })
  const qa = readJsonFile(actionFrames.qa)
  const frameCount = Number(actionFrames.frameCount)
  if (qa.ok !== true) throw new Error('Action frame QA must pass before import')
  if (qa.actionId !== actionFrames.actionId) throw new Error('Action frame QA actionId does not match generated action')
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error('Generated action frame count is invalid')
  if (Number(qa.frameCount) !== frameCount) throw new Error('Action frame QA frameCount does not match generated action')
  if (Number(qa.frameWidth) !== Number(actionFrames.frameWidth)) {
    throw new Error('Action frame QA frameWidth does not match generated action')
  }
  if (Number(qa.frameHeight) !== Number(actionFrames.frameHeight)) {
    throw new Error('Action frame QA frameHeight does not match generated action')
  }
  const frames = Array.isArray(qa.frames) ? qa.frames : []
  if (frames.length !== frameCount) throw new Error('Action frame QA is incomplete')
  frames.forEach((frame, index) => {
    const expectedFileName = `${String(index + 1).padStart(4, '0')}.png`
    if (frame?.fileName !== expectedFileName || Number(frame.visiblePixels) < 1) {
      throw new Error('Action frame QA is incomplete')
    }
  })
  return qa
}

runCommand(async (context) => {
  const dataDir = process.env.OPENPET_DATA_DIR
  const runId = resolveRunId({
    dataDir,
    runId: context.payload?.runId,
    statuses: ['approved'],
    description: 'approved single-action',
    filter: (run) => run.generationTask?.mode === 'single-action' && Boolean(run.artifacts?.actionFrames)
  })
  const current = readRun({ dataDir, runId })
  if (current.status !== 'approved') throw new Error(`Run must be approved before action import: ${current.status}`)
  if (current.generationTask?.mode !== 'single-action') throw new Error('Only single-action runs can be imported as action frames')
  const actionFrames = current.artifacts?.actionFrames
  if (!actionFrames?.framesDir || !actionFrames?.actionId) {
    throw new Error('Approved run does not contain generated action frames')
  }
  validateActionFrameQa({ dataDir, actionFrames })

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
