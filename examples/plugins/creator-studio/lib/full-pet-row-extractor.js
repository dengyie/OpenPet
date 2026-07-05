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

const resolveInsideDataDir = ({ dataDir, filePath, message, mustExist = true }) => {
  if (!dataDir) return path.resolve(filePath)
  const root = path.resolve(dataDir)
  const resolved = path.resolve(filePath)
  const relativeToRoot = path.relative(root, resolved)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(message)
  }
  if (mustExist) {
    if (!fs.existsSync(resolved)) {
      throw new Error(message)
    }
    const realRoot = fs.realpathSync.native(root)
    const realResolved = fs.realpathSync.native(resolved)
    const realRelativeToRoot = path.relative(realRoot, realResolved)
    if (realRelativeToRoot.startsWith('..') || path.isAbsolute(realRelativeToRoot)) {
      throw new Error(message)
    }
    return realResolved
  }
  const realRoot = fs.realpathSync.native(root)
  let existingAncestor = resolved
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor)
    if (parent === existingAncestor) break
    existingAncestor = parent
  }
  const realAncestor = fs.realpathSync.native(existingAncestor)
  const realRelativeToRoot = path.relative(realRoot, realAncestor)
  if (realRelativeToRoot.startsWith('..') || path.isAbsolute(realRelativeToRoot)) {
    throw new Error(message)
  }
  return resolved
}

const extractRowStripFrames = async ({ stripPath, actionId, outputDir, dataDir = '' }) => {
  const row = ensureOfficialRow(actionId)
  const safeStripPath = resolveInsideDataDir({
    dataDir,
    filePath: stripPath,
    message: 'Official row strip path escaped the Creator Studio data directory'
  })
  const safeOutputDir = resolveInsideDataDir({
    dataDir,
    filePath: outputDir,
    message: 'Official row frame output path escaped the Creator Studio data directory',
    mustExist: false
  })
  ensureOutputDir(safeOutputDir)
  const metadata = await sharp(safeStripPath).metadata()
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
    const framePath = createFramePath({ outputDir: safeOutputDir, index })
    await sharp(safeStripPath)
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

const mirrorRowFrames = async ({ frames, actionId, outputDir, dataDir = '' }) => {
  const row = ensureOfficialRow(actionId)
  if (row.id !== 'running-left') {
    throw new Error('Only running-left may be derived by mirroring row frames')
  }
  const safeOutputDir = resolveInsideDataDir({
    dataDir,
    filePath: outputDir,
    message: 'Official row frame output path escaped the Creator Studio data directory',
    mustExist: false
  })
  ensureOutputDir(safeOutputDir)
  const mirroredFrames = []
  for (const [index, frame] of frames.entries()) {
    const sourcePath = resolveInsideDataDir({
      dataDir,
      filePath: frame.path || frame,
      message: 'Official row frame path escaped the Creator Studio data directory'
    })
    const framePath = createFramePath({ outputDir: safeOutputDir, index })
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
