const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { getOfficialFullPetRow } = require('./full-pet-row-contract')

const CELL_WIDTH = 192
const CELL_HEIGHT = 208

const padFrameNumber = (index) => String(index + 1).padStart(2, '0')

const ensureOfficialRow = (actionId) => {
  const row = getOfficialFullPetRow(actionId)
  if (!row) {
    throw new Error(`Unknown official full-pet row: ${String(actionId || '').trim() || '(missing)'}`)
  }
  return row
}

const ensureOutputDir = (outputDir) => {
  fs.mkdirSync(outputDir, { recursive: true })
}

const createFramePath = ({ outputDir, index }) => (
  path.join(outputDir, `${padFrameNumber(index)}.png`)
)

const extractRowStripFrames = async ({ stripPath, actionId, outputDir }) => {
  const row = ensureOfficialRow(actionId)
  ensureOutputDir(outputDir)
  const metadata = await sharp(stripPath).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('Official row strip could not be decoded')
  }
  const slotWidth = metadata.width / row.frameCount
  const frames = []
  for (let index = 0; index < row.frameCount; index += 1) {
    const left = Math.round(index * slotWidth)
    const right = index === row.frameCount - 1
      ? metadata.width
      : Math.round((index + 1) * slotWidth)
    const width = Math.max(1, right - left)
    const framePath = createFramePath({ outputDir, index })
    await sharp(stripPath)
      .extract({ left, top: 0, width, height: metadata.height })
      .ensureAlpha()
      .resize({
        width: CELL_WIDTH,
        height: CELL_HEIGHT,
        fit: 'fill',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(framePath)
    frames.push({
      index,
      actionId: row.id,
      path: framePath
    })
  }
  return {
    actionId: row.id,
    frames,
    extraction: {
      sourcePath: stripPath,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      frameWidth: CELL_WIDTH,
      frameHeight: CELL_HEIGHT,
      frameCount: row.frameCount,
      slotWidth
    }
  }
}

const mirrorRowFrames = async ({ frames, actionId, outputDir }) => {
  const row = ensureOfficialRow(actionId)
  if (row.id !== 'running-left') {
    throw new Error('Only running-left may be derived by mirroring row frames')
  }
  ensureOutputDir(outputDir)
  const mirroredFrames = []
  for (const [index, frame] of frames.entries()) {
    const sourcePath = frame.path || frame
    const framePath = createFramePath({ outputDir, index })
    await sharp(sourcePath)
      .ensureAlpha()
      .flop()
      .png()
      .toFile(framePath)
    mirroredFrames.push({
      index,
      actionId: row.id,
      path: framePath,
      sourcePath
    })
  }
  return {
    actionId: row.id,
    frames: mirroredFrames,
    extraction: {
      sourceKind: 'approved-mirror',
      sourceActionId: 'running-right',
      frameWidth: CELL_WIDTH,
      frameHeight: CELL_HEIGHT,
      frameCount: mirroredFrames.length
    }
  }
}

module.exports = {
  extractRowStripFrames,
  mirrorRowFrames
}
