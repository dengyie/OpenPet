const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { getRunDir, readRun, writeRun } = require('./run-store')

const createMinimalWebp = ({ width = 1536, height = 1872 } = {}) => {
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(22, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8X', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  buffer.writeUInt8(0, 20)
  buffer.writeUIntLE(width - 1, 24, 3)
  buffer.writeUIntLE(height - 1, 27, 3)
  return buffer
}

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const writeZip = (sourceDir, outputPath) => {
  fs.rmSync(outputPath, { force: true })
  execFileSync('zip', ['-qr', outputPath, '.'], { cwd: sourceDir })
}

const createCreatorStudioMetadata = (run) => {
  if (!run.generationTask) return null
  return {
    mode: run.generationTask.mode,
    targetPet: run.generationTask.targetPet,
    styleSource: run.generationTask.styleSource,
    actions: (run.generationTask.actions || []).map((action) => ({
      actionId: action.actionId,
      name: action.name,
      loop: Boolean(action.loop),
      frameCount: action.frameCount,
      triggerProposal: action.triggerProposal
    }))
  }
}

const generateFixturePetOutput = ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  const run = readRun({ dataDir, runId })
  const runDir = getRunDir({ dataDir, runId })
  const outputDir = path.join(runDir, 'outputs')
  const creatorStudio = createCreatorStudioMetadata(run)
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: run.petId,
    displayName: run.input.petName,
    description: run.input.prompt || `A generated OpenPet pet named ${run.input.petName}.`,
    spritesheetPath: 'spritesheet.webp',
    ...(creatorStudio ? { creatorStudio } : {})
  }, null, 2)}\n`)
  const qaDir = path.join(runDir, 'qa')
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
    ok: true,
    width: 1536,
    height: 1872,
    warnings: []
  }, null, 2)}\n`)
  if (creatorStudio) {
    fs.writeFileSync(path.join(qaDir, 'action-generation-task.json'), `${JSON.stringify({
      ok: true,
      originalPrompt: run.input.originalPrompt || run.input.prompt || '',
      ...creatorStudio
    }, null, 2)}\n`)
  }
  const bundlePath = path.join(outputDir, `${run.petId}.codex-pet.zip`)
  writeZip(outputDir, bundlePath)
  const nextRun = {
    ...run,
    status: 'ready_for_review',
    currentStep: 'review',
    updatedAt: now(),
    artifacts: {
      ...run.artifacts,
      outputDir,
      petJson: path.join(outputDir, 'pet.json'),
      spritesheet: path.join(outputDir, 'spritesheet.webp'),
      bundle: bundlePath,
      qa: path.join(qaDir, 'atlas-validation.json'),
      ...(creatorStudio ? { actionTaskQa: path.join(qaDir, 'action-generation-task.json') } : {})
    },
    reviewStatus: 'pending',
    error: ''
  }
  writeRun({ dataDir, run: nextRun })
  return {
    outputDir,
    bundlePath,
    sha256: sha256(bundlePath),
    run: nextRun
  }
}

module.exports = {
  createCreatorStudioMetadata,
  createMinimalWebp,
  generateFixturePetOutput,
  sha256,
  writeZip
}
