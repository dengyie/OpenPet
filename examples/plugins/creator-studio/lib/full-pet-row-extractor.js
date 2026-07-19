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


const measureVisibleBounds = async (sourceInput, alphaThreshold = 8) => {
  const { data, info } = await sharp(sourceInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  let visiblePixels = 0
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3]
      if (alpha <= alphaThreshold) continue
      visiblePixels += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (visiblePixels <= 0 || maxX < minX || maxY < minY) {
    return {
      visiblePixels: 0,
      bbox: null,
      width: info.width,
      height: info.height
    }
  }
  return {
    visiblePixels,
    width: info.width,
    height: info.height,
    bbox: {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    }
  }
}

const registerCellToFrame = async ({ cellBuffer, framePath, registration = null }) => {
  const prepared = await prepareCellBuffer(cellBuffer)
  const measured = await measureVisibleBounds(prepared.prepared)
  if (!measured.bbox) {
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
    return { prepared, measured, registration: null }
  }

  const targetScale = registration?.targetScale > 0
    ? registration.targetScale
    : Math.min(
      (CELL_WIDTH * 0.82) / measured.bbox.width,
      (CELL_HEIGHT * 0.82) / measured.bbox.height,
      1
    )
  const targetBaseline = Number.isFinite(registration?.targetBaseline)
    ? registration.targetBaseline
    : Math.min(CELL_HEIGHT - 8, Math.max(24, Math.round(CELL_HEIGHT * 0.9)))
  const targetCenterX = Number.isFinite(registration?.targetCenterX)
    ? registration.targetCenterX
    : Math.round(CELL_WIDTH / 2)

  const scaledWidth = Math.max(1, Math.round(measured.bbox.width * targetScale))
  const scaledHeight = Math.max(1, Math.round(measured.bbox.height * targetScale))
  const crop = await sharp(prepared.prepared)
    .ensureAlpha()
    .extract({
      left: measured.bbox.left,
      top: measured.bbox.top,
      width: measured.bbox.width,
      height: measured.bbox.height
    })
    .resize({
      width: scaledWidth,
      height: scaledHeight,
      fit: 'fill',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()

  const left = Math.round(targetCenterX - (scaledWidth / 2))
  const top = Math.round(targetBaseline - scaledHeight + 1)
  await sharp({
    create: {
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: crop,
      left: Math.max(0, Math.min(CELL_WIDTH - scaledWidth, left)),
      top: Math.max(0, Math.min(CELL_HEIGHT - scaledHeight, top))
    }])
    .png()
    .toFile(framePath)

  return {
    prepared,
    measured,
    registration: {
      targetScale,
      targetBaseline,
      targetCenterX,
      scaledWidth,
      scaledHeight
    }
  }
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
  const useRegistrationLock = row.id === 'idle'
  const cellEntries = []
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
    const cellBuffer = await sharp(sheetInput)
      .extract({ left, top, width, height })
      .png()
      .toBuffer()
    const prepared = await prepareCellBuffer(cellBuffer)
    const measured = await measureVisibleBounds(prepared.prepared)
    cellEntries.push({
      index,
      cellBuffer,
      prepared,
      measured
    })
  }

  const visibleEntries = cellEntries.filter((entry) => entry.measured?.bbox)
  const median = (values) => {
    if (!values.length) return 0
    const sorted = [...values].sort((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle]
  }
  const medianWidth = median(visibleEntries.map((entry) => entry.measured.bbox.width))
  const medianHeight = median(visibleEntries.map((entry) => entry.measured.bbox.height))
  const targetScale = Math.min(
    medianWidth > 0 ? (CELL_WIDTH * 0.82) / medianWidth : 1,
    medianHeight > 0 ? (CELL_HEIGHT * 0.82) / medianHeight : 1,
    1
  )
  const targetBaseline = Math.min(
    CELL_HEIGHT - 8,
    Math.max(24, Math.round(CELL_HEIGHT * 0.9))
  )
  const targetCenterX = Math.round(CELL_WIDTH / 2)
  const registrationLock = useRegistrationLock
    ? {
        targetScale,
        targetBaseline,
        targetCenterX
      }
    : null

const frames = []
  for (const entry of cellEntries) {
    const framePath = createFramePath({ outputDir: safeOutputDir, index: entry.index })
    if (registrationLock) {
      await registerCellToFrame({
        cellBuffer: entry.cellBuffer,
        framePath,
        registration: registrationLock
      })
    } else {
      await fitCellToFrame({ cellBuffer: entry.cellBuffer, framePath })
    }
    frames.push({
      index: entry.index,
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
      sourceBackgroundRemovedRatio: Number(sheetBackgroundRemoval?.removedPixelRatio || 0),
      registrationLock: registrationLock || null
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
