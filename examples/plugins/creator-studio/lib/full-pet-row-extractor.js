const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { removeOpaqueEdgeBackground } = require('./edge-background-cutout')
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

const normalizeLayout = ({ layout, frameCount }) => {
  if (!layout) return null
  const columns = Number(layout.columns)
  const rows = Number(layout.rows)
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    throw new Error('Official row sprite grid layout is invalid')
  }
  if (columns * rows < frameCount) {
    throw new Error('Official row sprite grid does not contain enough cells')
  }
  return { columns, rows }
}

const countVisiblePixels = async (sourceInput) => {
  const { data, info } = await sharp(sourceInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let visiblePixels = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 8) visiblePixels += 1
  }
  return {
    visiblePixels,
    pixelCount: info.width * info.height
  }
}

const prepareCellBuffer = async (cellBuffer) => {
  const backgroundRemoval = await removeOpaqueEdgeBackground(cellBuffer)
  const prepared = backgroundRemoval?.buffer || cellBuffer
  const visibility = await countVisiblePixels(prepared)
  if (visibility.visiblePixels >= visibility.pixelCount) {
    throw new Error('Official row frame background could not be removed')
  }
  return { prepared, backgroundRemoval, visibility }
}

const fitCellToFrame = async ({ cellBuffer, framePath }) => {
  const prepared = await prepareCellBuffer(cellBuffer)
  await sharp(prepared.prepared)
    .ensureAlpha()
    .resize({
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
      fit: 'contain',
      position: 'bottom',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(framePath)
  return prepared
}

const extractRowStripFrames = async ({ stripPath, actionId, outputDir, dataDir = '', layout = null }) => {
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
  const sheetBackgroundRemoval = await removeOpaqueEdgeBackground(safeStripPath)
  const sheetInput = sheetBackgroundRemoval?.buffer || safeStripPath
  const metadata = await sharp(sheetInput).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('Official row strip could not be decoded')
  }
  const grid = normalizeLayout({ layout, frameCount: row.frameCount })
  const slotWidth = metadata.width / (grid?.columns || row.frameCount)
  const slotHeight = metadata.height / (grid?.rows || 1)
  if (grid && grid.columns * grid.rows > row.frameCount) {
    for (let index = row.frameCount; index < grid.columns * grid.rows; index += 1) {
      const column = index % grid.columns
      const gridRow = Math.floor(index / grid.columns)
      const left = Math.round(column * slotWidth)
      const right = column === grid.columns - 1 ? metadata.width : Math.round((column + 1) * slotWidth)
      const top = Math.round(gridRow * slotHeight)
      const bottom = gridRow === grid.rows - 1 ? metadata.height : Math.round((gridRow + 1) * slotHeight)
      const unusedCell = await sharp(sheetInput)
        .extract({
          left,
          top,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top)
        })
        .png()
        .toBuffer()
      const preparedUnusedCell = await removeOpaqueEdgeBackground(unusedCell)
      const visibility = await countVisiblePixels(preparedUnusedCell?.buffer || unusedCell)
      if (visibility.visiblePixels > Math.max(4, Math.floor(visibility.pixelCount * 0.002))) {
        throw new Error(`Official row unused grid cell contains visible content at index ${index}`)
      }
    }
  }
  const frames = []
  for (let index = 0; index < row.frameCount; index += 1) {
    const column = grid ? index % grid.columns : index
    const gridRow = grid ? Math.floor(index / grid.columns) : 0
    const left = Math.round(column * slotWidth)
    const right = column === (grid?.columns || row.frameCount) - 1
      ? metadata.width
      : Math.round((column + 1) * slotWidth)
    const top = Math.round(gridRow * slotHeight)
    const bottom = gridRow === (grid?.rows || 1) - 1
      ? metadata.height
      : Math.round((gridRow + 1) * slotHeight)
    const width = Math.max(1, right - left)
    const height = Math.max(1, bottom - top)
    const framePath = createFramePath({ outputDir: safeOutputDir, index })
    const cellBuffer = await sharp(sheetInput)
      .extract({ left, top, width, height })
      .png()
      .toBuffer()
    await fitCellToFrame({ cellBuffer, framePath })
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
      slotWidth,
      slotHeight,
      layout: grid || { columns: row.frameCount, rows: 1 },
      sourceBackgroundRemoved: Boolean(sheetBackgroundRemoval?.removed),
      sourceBackgroundRemovedRatio: Number(sheetBackgroundRemoval?.removedPixelRatio || 0)
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
