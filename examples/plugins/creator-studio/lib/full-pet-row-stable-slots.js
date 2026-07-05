const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { getOfficialFullPetRow } = require('./full-pet-row-contract')

const CELL_WIDTH = 192
const CELL_HEIGHT = 208
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const padFrameNumber = (index) => String(index + 1).padStart(2, '0')

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const ensureOfficialRow = (actionId) => {
  const row = getOfficialFullPetRow(actionId)
  if (!row) {
    throw new Error(`Unknown official full-pet row: ${String(actionId || '').trim() || '(missing)'}`)
  }
  return row
}

const getFramePath = (frame) => String(frame?.path || frame || '').trim()

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

const createFramePath = ({ outputDir, index }) => (
  path.join(outputDir, `${padFrameNumber(index)}.png`)
)

const measureFrame = async ({ sourcePath, index }) => {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let visiblePixels = 0
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3]
      if (alpha <= 0) continue
      visiblePixels += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (visiblePixels <= 0) {
    throw new Error('Official row stable-slots cannot stabilize empty frames')
  }

  return {
    index,
    sourcePath,
    width: info.width,
    height: info.height,
    visiblePixels,
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

const resizeCropForSlot = async ({ sourcePath, bbox, slotWidth, slotHeight, padding }) => {
  const crop = sharp(sourcePath)
    .ensureAlpha()
    .extract({
      left: bbox.left,
      top: bbox.top,
      width: bbox.width,
      height: bbox.height
    })

  const maxWidth = Math.max(1, slotWidth - padding * 2)
  const maxHeight = Math.max(1, slotHeight - padding * 2)
  if (bbox.width <= maxWidth && bbox.height <= maxHeight) {
    const buffer = await crop.png().toBuffer()
    return {
      buffer,
      width: bbox.width,
      height: bbox.height
    }
  }

  const buffer = await crop
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
      background: TRANSPARENT
    })
    .png()
    .toBuffer()
  const metadata = await sharp(buffer).metadata()
  return {
    buffer,
    width: metadata.width,
    height: metadata.height
  }
}

const createStableFrame = async ({ sourcePath, bbox, outputPath, slotWidth, slotHeight, targetBaseline, padding }) => {
  const fitted = await resizeCropForSlot({
    sourcePath,
    bbox,
    slotWidth,
    slotHeight,
    padding
  })
  const cropLeft = Math.floor((slotWidth - fitted.width) / 2)
  const cropTop = clamp(slotHeight - padding - fitted.height, 0, slotHeight - fitted.height)
  const slotBuffer = await sharp({
    create: {
      width: slotWidth,
      height: slotHeight,
      channels: 4,
      background: TRANSPARENT
    }
  })
    .composite([{
      input: fitted.buffer,
      left: cropLeft,
      top: cropTop
    }])
    .png()
    .toBuffer()

  const slotLeft = Math.floor((CELL_WIDTH - slotWidth) / 2)
  const slotBaseline = slotHeight - padding - 1
  const slotTop = clamp(targetBaseline - slotBaseline, 0, CELL_HEIGHT - slotHeight)
  await sharp({
    create: {
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
      channels: 4,
      background: TRANSPARENT
    }
  })
    .composite([{
      input: slotBuffer,
      left: slotLeft,
      top: slotTop
    }])
    .png()
    .toFile(outputPath)

  return {
    path: outputPath,
    placement: {
      slotLeft,
      slotTop,
      cropLeft,
      cropTop
    }
  }
}

const stabilizeRowFrames = async ({ frames, actionId, outputDir, dataDir = '', padding = 4 }) => {
  const row = ensureOfficialRow(actionId)
  const normalizedFrames = Array.isArray(frames) ? frames : []
  if (normalizedFrames.length !== row.frameCount) {
    throw new Error('Official row stable-slots frame count mismatch')
  }

  const safeOutputDir = resolveInsideDataDir({
    dataDir,
    filePath: outputDir,
    message: 'Official row stable-slots output path escaped the Creator Studio data directory',
    mustExist: false
  })
  const safePadding = clamp(Math.round(Number(padding) || 0), 0, 24)
  const measuredFrames = []
  for (const [index, frame] of normalizedFrames.entries()) {
    const sourcePath = resolveInsideDataDir({
      dataDir,
      filePath: getFramePath(frame),
      message: 'Official row frame path escaped the Creator Studio data directory'
    })
    measuredFrames.push(await measureFrame({ sourcePath, index }))
  }

  const slotWidth = Math.max(
    1,
    Math.min(CELL_WIDTH, Math.max(...measuredFrames.map((frame) => frame.bbox.width)) + safePadding * 2)
  )
  const slotHeight = Math.max(
    1,
    Math.min(CELL_HEIGHT, Math.max(...measuredFrames.map((frame) => frame.bbox.height)) + safePadding * 2)
  )
  const targetBaseline = clamp(
    Math.max(...measuredFrames.map((frame) => frame.bbox.bottom)),
    safePadding,
    CELL_HEIGHT - safePadding - 1
  )

  fs.mkdirSync(safeOutputDir, { recursive: true })
  const stabilizedFrames = []
  const placements = []
  for (const frame of measuredFrames) {
    const framePath = createFramePath({ outputDir: safeOutputDir, index: frame.index })
    const stableFrame = await createStableFrame({
      sourcePath: frame.sourcePath,
      bbox: frame.bbox,
      outputPath: framePath,
      slotWidth,
      slotHeight,
      targetBaseline,
      padding: safePadding
    })
    placements.push({
      index: frame.index,
      ...stableFrame.placement
    })
    stabilizedFrames.push({
      index: frame.index,
      actionId: row.id,
      path: framePath,
      sourcePath: frame.sourcePath
    })
  }

  const stabilization = {
    method: 'stable-slots',
    frameWidth: CELL_WIDTH,
    frameHeight: CELL_HEIGHT,
    frameCount: stabilizedFrames.length,
    slotWidth,
    slotHeight,
    baseline: targetBaseline,
    padding: safePadding,
    inputs: measuredFrames.map((frame) => ({
      index: frame.index,
      bbox: frame.bbox,
      visiblePixels: frame.visiblePixels
    })),
    placements
  }

  fs.writeFileSync(
    path.join(safeOutputDir, 'stable-slots-metadata.json'),
    `${JSON.stringify({
      actionId: row.id,
      stabilization
    }, null, 2)}\n`
  )

  return {
    actionId: row.id,
    frames: stabilizedFrames,
    stabilization
  }
}

module.exports = {
  stabilizeRowFrames
}
