const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const sharp = require('sharp')
const { getRunDir, readRun, writeRun } = require('./run-store')
const { buildActionFramesFromGeneratedImage } = require('./action-frame-builder')

const DEFAULT_ATLAS_WIDTH = 1536
const DEFAULT_ATLAS_HEIGHT = 1872
const VISIBLE_ATLAS_WEBP_BASE64 = 'UklGRrIAAABXRUJQVlA4TKUAAAAv/8XTEQ8wUPM/UPMf8FDUtg1U/qT3G4HLEf2fgPA///M///M///M///M///M///M///M///M///M///M///M///M///M///M///M///M///M///M///M///M//4/gavIf//Hf44//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//+Z//ORMA'

const createMinimalWebp = ({ width = DEFAULT_ATLAS_WIDTH, height = DEFAULT_ATLAS_HEIGHT } = {}) => {
  if (width !== DEFAULT_ATLAS_WIDTH || height !== DEFAULT_ATLAS_HEIGHT) {
    throw new Error(`Fixture atlas must be ${DEFAULT_ATLAS_WIDTH}x${DEFAULT_ATLAS_HEIGHT}`)
  }
  return Buffer.from(VISIBLE_ATLAS_WEBP_BASE64, 'base64')
}

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const writeZip = (sourceDir, outputPath) => {
  fs.rmSync(outputPath, { force: true })
  execFileSync('zip', ['-qr', outputPath, '.'], { cwd: sourceDir })
}

const createCreatorStudioMetadata = (run) => {
  if (!run.generationTask) return null
  const importPolicy = {
    importsFrames: true,
    appliesTriggerAutomatically: false,
    triggerProposalOwner: 'openpet-host'
  }
  return {
    mode: run.generationTask.mode,
    targetPet: run.generationTask.targetPet,
    styleSource: run.generationTask.styleSource,
    generationTask: run.generationTask,
    actions: (run.generationTask.actions || []).map((action) => ({
      actionId: action.actionId,
      name: action.name,
      loop: Boolean(action.loop),
      frameCount: action.frameCount,
      triggerProposal: action.triggerProposal
    })),
    importPolicy
  }
}

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const createFixtureSourcePng = async ({ outputPath, frameCount = 12 }) => {
  const columns = Math.max(1, Math.min(4, Number(frameCount) || 1))
  const rows = Math.max(1, Math.ceil((Number(frameCount) || 1) / columns))
  const cellWidth = 256
  const cellHeight = 256
  const composites = Array.from({ length: frameCount }, (_entry, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const headOffsetX = ((index % 4) - 1.5) * 7
    const bodyOffsetY = (index % 2) * -10
    const pawArc = 12 + ((index % 3) * 8)
    const tailLift = 182 - ((index % 4) * 6)
    return {
      input: Buffer.from(`
        <svg width="${cellWidth}" height="${cellHeight}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
          <rect width="256" height="256" fill="transparent"/>
          <path d="M78 66 L104 32 L124 78 Z" fill="#f0b26d"/>
          <path d="M178 66 L152 32 L132 78 Z" fill="#f0b26d"/>
          <ellipse cx="${128 + headOffsetX}" cy="${142 + bodyOffsetY}" rx="74" ry="70" fill="#f4c27c"/>
          <ellipse cx="${100 + headOffsetX}" cy="${136 + bodyOffsetY}" rx="10" ry="12" fill="#17202a"/>
          <ellipse cx="${156 + headOffsetX}" cy="${136 + bodyOffsetY}" rx="10" ry="12" fill="#17202a"/>
          <ellipse cx="${128 + headOffsetX}" cy="${164 + bodyOffsetY}" rx="16" ry="10" fill="#f7e7c6"/>
          <path d="M118 162 Q128 ${172 + (index % 3) * 2} 138 162" stroke="#9f4726" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M82 172 Q${70 - pawArc} ${178 + bodyOffsetY} 48 194" stroke="#9f4726" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M174 172 Q${186 + pawArc} ${178 + bodyOffsetY} 208 194" stroke="#9f4726" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M184 178 Q214 ${tailLift} 220 204" stroke="#9f4726" stroke-width="6" fill="none" stroke-linecap="round"/>
        </svg>
      `),
      left: column * cellWidth,
      top: row * cellHeight
    }
  })
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)
}

const generateFixtureActionOutput = async ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  const run = readRun({ dataDir, runId })
  const action = Array.isArray(run.generationTask?.actions) ? run.generationTask.actions[0] : null
  if (!action) throw new Error('Fixture single-action generation requires one planned action')
  const runDir = getRunDir({ dataDir, runId })
  const qaDir = path.join(runDir, 'qa')
  const sourceDir = path.join(runDir, 'frames', 'base')
  const sourcePath = path.join(sourceDir, '0001.png')
  const sourceRelativePath = path.relative(path.resolve(dataDir), sourcePath).split(path.sep).join('/')
  const creatorStudio = createCreatorStudioMetadata(run)

  await createFixtureSourcePng({ outputPath: sourcePath, frameCount: action.frameCount })
  const generationResult = {
    ok: true,
    backend: 'fixture',
    model: 'fixture-image',
    generatedAt: now(),
    outputs: [{
      dataRelativePath: sourceRelativePath,
      mimeType: 'image/png',
      sha256: sha256(sourcePath)
    }]
  }
  const actionFrames = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult,
    action,
    outputFramesDir: path.join(runDir, 'frames', 'actions', action.actionId),
    qaDir
  })
  if (creatorStudio) {
    writeJson(path.join(qaDir, 'action-generation-task.json'), {
      ok: true,
      mode: creatorStudio.mode,
      targetPet: creatorStudio.targetPet,
      styleSource: creatorStudio.styleSource,
      actions: creatorStudio.actions,
      importPolicy: creatorStudio.importPolicy
    })
  }
  const nextRun = {
    ...run,
    status: 'ready_for_review',
    currentStep: 'review',
    updatedAt: now(),
    artifacts: {
      ...run.artifacts,
      outputDir: actionFrames.framesDir,
      actionFrames: {
        actionId: actionFrames.actionId,
        name: action.name,
        framesDir: actionFrames.framesDir,
        qa: actionFrames.qaPath,
        contactSheet: actionFrames.contactSheetPath,
        frameCount: actionFrames.frameCount,
        frameWidth: actionFrames.frameWidth,
        frameHeight: actionFrames.frameHeight,
        triggerProposal: action.triggerProposal || { type: 'unbound' }
      },
      generatedImage: generationResult,
      ...(creatorStudio ? { actionTaskQa: path.join(qaDir, 'action-generation-task.json') } : {})
    },
    reviewStatus: 'pending',
    error: ''
  }
  writeRun({ dataDir, run: nextRun })
  return {
    outputDir: actionFrames.framesDir,
    bundlePath: '',
    sha256: '',
    run: nextRun
  }
}

const generateFixturePetOutput = async ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  const run = readRun({ dataDir, runId })
  if (run.generationTask?.mode === 'single-action') {
    return generateFixtureActionOutput({ dataDir, runId, now })
  }
  const runDir = getRunDir({ dataDir, runId })
  const outputDir = path.join(runDir, 'outputs')
  const creatorStudio = createCreatorStudioMetadata(run)
  fs.mkdirSync(outputDir, { recursive: true })
  const spritesheetPath = path.join(outputDir, 'spritesheet.webp')
  fs.writeFileSync(spritesheetPath, createMinimalWebp())
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
    width: DEFAULT_ATLAS_WIDTH,
    height: DEFAULT_ATLAS_HEIGHT,
    visiblePixels: 6400,
    warnings: []
  }, null, 2)}\n`)
  if (creatorStudio) {
    fs.writeFileSync(path.join(qaDir, 'action-generation-task.json'), `${JSON.stringify({
      ok: true,
      mode: creatorStudio.mode,
      targetPet: creatorStudio.targetPet,
      styleSource: creatorStudio.styleSource,
      actions: creatorStudio.actions,
      importPolicy: creatorStudio.importPolicy
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
      spritesheet: spritesheetPath,
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
