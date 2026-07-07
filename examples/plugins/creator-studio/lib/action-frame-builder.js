const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const sharp = require('sharp')
const { removeOpaqueEdgeBackground } = require('./edge-background-cutout')
const { resolveGeneratedImagePath } = require('./real-atlas-builder')
const { createPlaybackDiagnostics } = require('./action-frame-playback')

const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const FRAME_WIDTH = 192
const FRAME_HEIGHT = 208
const MAX_FRAME_COUNT = 32
const CONTACT_SHEET_THUMB_WIDTH = 96
const CONTACT_SHEET_THUMB_HEIGHT = 104
const CONTACT_SHEET_LABEL_HEIGHT = 20
const CONTACT_SHEET_GAP = 12
const CONTACT_SHEET_COLUMNS = 4
const ACTION_SHEET_MAX_COLUMNS = 4
const VISIBLE_ALPHA_THRESHOLD = 8
const COLOR_DIFF_THRESHOLD = 18
const MIN_AVERAGE_CHANGED_PIXEL_RATIO = 0.003
const MAX_AVERAGE_CHANGED_PIXEL_RATIO = 0.65
const MAX_PAIR_CHANGED_PIXEL_RATIO = 0.86
const MAX_IDENTITY_CORE_AVERAGE_CHANGED_PIXEL_RATIO = 0.52
const MAX_IDENTITY_CORE_PAIR_CHANGED_PIXEL_RATIO = 0.72
const IDENTITY_CORE_REGION = Object.freeze({
  left: 0.28,
  top: 0.16,
  right: 0.72,
  bottom: 0.78
})

const assertSafeActionId = (actionId) => {
  if (!SAFE_ACTION_ID_PATTERN.test(actionId || '')) {
    throw new Error('Creator Studio actionId is invalid')
  }
}

const normalizeFrameCount = (value) => {
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1 || count > MAX_FRAME_COUNT) {
    throw new Error(`Creator Studio action frameCount must be between 1 and ${MAX_FRAME_COUNT}`)
  }
  return count
}

const normalizeFrameIndex = ({ fileName, frameCount }) => {
  const match = String(fileName || '').match(/^(\d{4})\.png$/)
  if (!match) throw new Error('Creator Studio action frame fileName is invalid')
  const frameIndex = Number(match[1]) - 1
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= frameCount) {
    throw new Error('Creator Studio action frame fileName is outside the action frame range')
  }
  return frameIndex
}

const isCompleteFrameEvidence = ({ frames, frameCount }) => Array.from({ length: frameCount }, (_entry, index) => {
  const frame = frames[index]
  return frame?.fileName === `${String(index + 1).padStart(4, '0')}.png` &&
    Number(frame.width) === FRAME_WIDTH &&
    Number(frame.height) === FRAME_HEIGHT &&
    Number(frame.visiblePixels) > 0
}).every(Boolean)

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const getNearestExistingPath = (targetPath) => {
  let currentPath = targetPath
  while (!fs.existsSync(currentPath)) {
    const nextPath = path.dirname(currentPath)
    if (nextPath === currentPath) break
    currentPath = nextPath
  }
  return currentPath
}

const assertWritablePathInsideDataDir = ({ dataDir, targetPath, label }) => {
  const root = path.resolve(dataDir)
  const resolvedTarget = path.resolve(targetPath)
  const relative = path.relative(root, resolvedTarget)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Creator Studio ${label} must stay inside the data directory`)
  }
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
  const realRoot = fs.realpathSync.native(root)
  const nearestExisting = getNearestExistingPath(resolvedTarget)
  const realExisting = fs.realpathSync.native(nearestExisting)
  const realRelative = path.relative(realRoot, realExisting)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Creator Studio ${label} must stay inside the data directory`)
  }
  return resolvedTarget
}

const countVisiblePixels = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let visiblePixels = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visiblePixels += 1
  }
  return visiblePixels
}

const getActionSheetLayout = (frameCount) => {
  const columns = frameCount === 6 ? 3 : Math.max(1, Math.min(ACTION_SHEET_MAX_COLUMNS, frameCount))
  const rows = Math.max(1, Math.ceil(frameCount / columns))
  return { columns, rows }
}

const resolveGeneratedImageEntries = ({ dataDir, generationResult }) => {
  const outputs = Array.isArray(generationResult?.outputs) ? generationResult.outputs : []
  if (outputs.length === 0) {
    throw new Error('Generated image is missing')
  }
  if (outputs.length !== 1) {
    throw new Error('Deliverable action generation requires one complete provider-generated sprite sheet; multi-output frame sets are not allowed')
  }
  return outputs.map((output) => resolveGeneratedImagePath({
    dataDir,
    generationResult: { outputs: [output] }
  }))
}

const splitGridDimension = ({ size, count, index }) => {
  const start = Math.floor((size * index) / count)
  const end = Math.floor((size * (index + 1)) / count)
  return { start, size: Math.max(1, end - start) }
}

const extractVisibleBounds = ({ data, info }) => {
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  let visiblePixels = 0
  let sumX = 0
  let sumY = 0

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixelIndex = ((y * info.width) + x) * info.channels
      const alpha = data[pixelIndex + 3]
      if (alpha > 0) {
        visiblePixels += 1
        sumX += x
        sumY += y
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (visiblePixels <= 0) return null
  const bounds = {
    left: minX,
    top: minY,
    width: Math.max(1, (maxX - minX) + 1),
    height: Math.max(1, (maxY - minY) + 1),
    right: maxX,
    bottom: maxY,
    centroidX: Number((sumX / visiblePixels).toFixed(2)),
    centroidY: Number((sumY / visiblePixels).toFixed(2)),
    baselineY: maxY,
    visiblePixels
  }
  const lowerBandTop = Math.max(minY, maxY - Math.max(4, Math.floor((maxY - minY + 1) * 0.14)))
  let lowerMinX = info.width
  let lowerMaxX = -1
  for (let y = lowerBandTop; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const pixelIndex = ((y * info.width) + x) * info.channels
      if (data[pixelIndex + 3] <= VISIBLE_ALPHA_THRESHOLD) continue
      lowerMinX = Math.min(lowerMinX, x)
      lowerMaxX = Math.max(lowerMaxX, x)
    }
  }
  bounds.lowerRootX = Number((lowerMaxX >= lowerMinX
    ? (lowerMinX + lowerMaxX) / 2
    : sumX / visiblePixels).toFixed(2))
  bounds.identityDescriptor = createIdentityDescriptor({ data, info, bounds, alphaThreshold: 0 })
  return bounds
}

const createAlphaMaskEvidence = ({ data, info }) => {
  const alphaMask = Buffer.alloc(info.width * info.height)
  const upperAlphaMask = Buffer.alloc(info.width * info.height)
  const lowerAlphaMask = Buffer.alloc(info.width * info.height)
  const splitY = Math.floor(info.height * 0.56)
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixelIndex = (y * info.width) + x
      const alpha = data[(pixelIndex * info.channels) + 3]
      if (alpha <= VISIBLE_ALPHA_THRESHOLD) continue
      alphaMask[pixelIndex] = 255
      if (y < splitY) upperAlphaMask[pixelIndex] = 255
      else lowerAlphaMask[pixelIndex] = 255
    }
  }
  const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
  return {
    alphaMaskSha256: hash(alphaMask),
    upperAlphaMaskSha256: hash(upperAlphaMask),
    lowerAlphaMaskSha256: hash(lowerAlphaMask)
  }
}

const inspectVisibleImage = async (imagePath) => {
  const decoded = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const bounds = extractVisibleBounds(decoded)
  return {
    width: decoded.info.width,
    height: decoded.info.height,
    sha256: crypto.createHash('sha256').update(decoded.data).digest('hex'),
    visiblePixels: bounds?.visiblePixels || 0,
    bounds
  }
}

const hydrateFrameEvidenceFromDisk = async ({ frames, framesDir }) => {
  const hydratedFrames = []
  for (const [index, frame] of frames.entries()) {
    if (!frame) {
      hydratedFrames.push(frame)
      continue
    }
    const fileName = String(frame.fileName || '')
    const expectedFileName = `${String(index + 1).padStart(4, '0')}.png`
    const framePath = path.join(framesDir, fileName)
    if (fileName !== expectedFileName || !fs.existsSync(framePath)) {
      hydratedFrames.push(frame)
      continue
    }
    const needsVisibleEvidence = Number(frame.width) !== FRAME_WIDTH ||
      Number(frame.height) !== FRAME_HEIGHT ||
      !Number.isFinite(Number(frame.visiblePixels)) ||
      Number(frame.visiblePixels) < 1 ||
      !frame.frameBounds
    const needsRawHash = typeof frame.sha256 !== 'string' || !frame.sha256.trim()
    const needsFileHash = typeof frame.fileSha256 !== 'string' || !frame.fileSha256.trim()
    if (!needsVisibleEvidence && !needsRawHash && !needsFileHash) {
      hydratedFrames.push(frame)
      continue
    }

    const frameInspection = await inspectVisibleImage(framePath)
    hydratedFrames.push({
      ...frame,
      width: needsVisibleEvidence ? FRAME_WIDTH : frame.width,
      height: needsVisibleEvidence ? FRAME_HEIGHT : frame.height,
      visiblePixels: needsVisibleEvidence ? frameInspection.visiblePixels : frame.visiblePixels,
      frameBounds: needsVisibleEvidence ? frameInspection.bounds : frame.frameBounds,
      sha256: needsRawHash ? frameInspection.sha256 : frame.sha256,
      fileSha256: needsFileHash
        ? crypto.createHash('sha256').update(fs.readFileSync(framePath)).digest('hex')
        : frame.fileSha256
    })
  }
  return hydratedFrames
}

const decodeFramePixels = async (imagePath) => sharp(imagePath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const inspectVisibleBuffer = async (buffer) => {
  const decoded = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const bounds = extractVisibleBounds(decoded)
  return {
    width: decoded.info.width,
    height: decoded.info.height,
    sha256: crypto.createHash('sha256').update(decoded.data).digest('hex'),
    visiblePixels: bounds?.visiblePixels || 0,
    bounds
  }
}

const getFrameFilePath = ({ framesDir, frame }) => path.join(framesDir, frame.fileName || '')

const getVisibleRgbDistance = ({ dataA, dataB, index }) => (
  Math.abs(dataA[index] - dataB[index]) +
  Math.abs(dataA[index + 1] - dataB[index + 1]) +
  Math.abs(dataA[index + 2] - dataB[index + 2])
)

const resolveCompareRegion = ({ info, region }) => {
  if (!region) {
    return {
      left: 0,
      top: 0,
      right: info.width,
      bottom: info.height
    }
  }
  const left = Math.max(0, Math.min(info.width - 1, Math.floor(info.width * Number(region.left || 0))))
  const top = Math.max(0, Math.min(info.height - 1, Math.floor(info.height * Number(region.top || 0))))
  const right = Math.max(left + 1, Math.min(info.width, Math.ceil(info.width * Number(region.right || 1))))
  const bottom = Math.max(top + 1, Math.min(info.height, Math.ceil(info.height * Number(region.bottom || 1))))
  return { left, top, right, bottom }
}

const compareAdjacentFramePixels = (previous, next, options = {}) => {
  if (
    previous.info.width !== next.info.width ||
    previous.info.height !== next.info.height ||
    previous.info.channels !== next.info.channels
  ) {
    return { changedPixels: 0, visibleUnionPixels: 0, changedPixelRatio: 0 }
  }

  let changedPixels = 0
  let visibleUnionPixels = 0
  const channels = previous.info.channels
  const region = resolveCompareRegion({ info: previous.info, region: options.region })
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const index = ((y * previous.info.width) + x) * channels
      const alphaA = previous.data[index + 3]
      const alphaB = next.data[index + 3]
      const visibleA = alphaA > VISIBLE_ALPHA_THRESHOLD
      const visibleB = alphaB > VISIBLE_ALPHA_THRESHOLD
      if (!visibleA && !visibleB) continue
      visibleUnionPixels += 1
      if (
        Math.abs(alphaA - alphaB) > VISIBLE_ALPHA_THRESHOLD ||
        getVisibleRgbDistance({ dataA: previous.data, dataB: next.data, index }) > COLOR_DIFF_THRESHOLD
      ) {
        changedPixels += 1
      }
    }
  }

  return {
    changedPixels,
    visibleUnionPixels,
    changedPixelRatio: visibleUnionPixels > 0
      ? Number((changedPixels / visibleUnionPixels).toFixed(6))
      : 0
  }
}

const summarizeAdjacentPairs = (pairs) => {
  const ratios = pairs.map((pair) => pair.changedPixelRatio)
  const average = ratios.length > 0
    ? ratios.reduce((total, value) => total + value, 0) / ratios.length
    : 0
  return {
    minChangedPixelRatio: ratios.length > 0 ? Number(Math.min(...ratios).toFixed(6)) : 0,
    maxChangedPixelRatio: ratios.length > 0 ? Number(Math.max(...ratios).toFixed(6)) : 0,
    averageChangedPixelRatio: Number(average.toFixed(6)),
    pairs
  }
}

const createAdjacentFrameDiffMetrics = async ({ frames, framesDir }) => {
  if (!framesDir || frames.length < 2) {
    return {
      minChangedPixelRatio: 0,
      maxChangedPixelRatio: 0,
      averageChangedPixelRatio: 0,
      pairs: [],
      identityCore: {
        minChangedPixelRatio: 0,
        maxChangedPixelRatio: 0,
        averageChangedPixelRatio: 0,
        pairs: []
      }
    }
  }

  const decodedFrames = []
  for (const frame of frames) {
    decodedFrames.push(await decodeFramePixels(getFrameFilePath({ framesDir, frame })))
  }

  const createPairs = (region) => {
    const pairs = []
    for (let index = 1; index < decodedFrames.length; index += 1) {
      const diff = compareAdjacentFramePixels(decodedFrames[index - 1], decodedFrames[index], { region })
      pairs.push({
        from: frames[index - 1].fileName,
        to: frames[index].fileName,
        ...diff
      })
    }
    return pairs
  }

  const pairs = createPairs()
  const identityCorePairs = createPairs(IDENTITY_CORE_REGION)
  return {
    ...summarizeAdjacentPairs(pairs),
    identityCore: summarizeAdjacentPairs(identityCorePairs)
  }
}

const countPairsAboveRatio = (pairs = [], threshold = 1) => (
  Array.isArray(pairs)
    ? pairs.filter((pair) => Number(pair?.changedPixelRatio || 0) > threshold).length
    : 0
)

const trimFrameSource = async (sourceInput, { allowOpaqueFullFrame = true, allowOpaqueFullFrameTrim = true } = {}) => {
  const decoded = await sharp(sourceInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const bounds = extractVisibleBounds(decoded)
  if (!bounds) {
    throw new Error('Generated action frame source contains no visible pixels')
  }
  const fullFrameVisible = bounds.left === 0 &&
    bounds.top === 0 &&
    bounds.width === decoded.info.width &&
    bounds.height === decoded.info.height
  if (!allowOpaqueFullFrame && fullFrameVisible) {
    if (!allowOpaqueFullFrameTrim) {
      throw new Error('Generated canonical source is missing a transparent cutout; opaque edge background could not be removed safely.')
    }
    const trimAttempt = await sharp(sourceInput)
      .trim()
      .png()
      .toBuffer()
    const trimMetadata = await sharp(trimAttempt).metadata()
    if (trimMetadata.width < decoded.info.width || trimMetadata.height < decoded.info.height) {
      return {
        buffer: trimAttempt,
        visiblePixels: bounds.visiblePixels,
        bounds: {
          left: 0,
          top: 0,
          width: trimMetadata.width,
          height: trimMetadata.height,
          right: Math.max(0, trimMetadata.width - 1),
          bottom: Math.max(0, trimMetadata.height - 1),
          centroidX: Number(((trimMetadata.width - 1) / 2).toFixed(2)),
          centroidY: Number(((trimMetadata.height - 1) / 2).toFixed(2)),
          baselineY: Math.max(0, trimMetadata.height - 1)
        },
        fullFrameVisible: false,
        opaqueFullFrameTrimmed: true
      }
    }
    throw new Error('Generated action sheet cell is missing a cutout-ready sprite silhouette')
  }
  return {
    buffer: backgroundRemoval.buffer,
    width: decoded.info.width,
    height: decoded.info.height,
    visiblePixels: bounds.visiblePixels,
    bounds,
    fullFrameVisible,
    opaqueFullFrameTrimmed: false
  }
}

const createSharedSequenceCrop = (preparedFrames = []) => {
  const validFrames = preparedFrames.filter((frame) => frame?.bounds)
  if (validFrames.length === 0) throw new Error('Generated action sheet contains no visible frame sources')
  const sourceWidth = Math.min(...validFrames.map((frame) => frame.width))
  const sourceHeight = Math.min(...validFrames.map((frame) => frame.height))
  const padding = Math.ceil(Math.min(sourceWidth, sourceHeight) * 0.04)
  const left = Math.max(0, Math.min(...validFrames.map((frame) => frame.bounds.left)) - padding)
  const top = Math.max(0, Math.min(...validFrames.map((frame) => frame.bounds.top)) - padding)
  const right = Math.min(sourceWidth - 1, Math.max(...validFrames.map((frame) => frame.bounds.right)) + padding)
  const bottom = Math.min(sourceHeight - 1, Math.max(...validFrames.map((frame) => frame.bounds.bottom)) + padding)
  return {
    left,
    top,
    width: Math.max(1, right - left + 1),
    height: Math.max(1, bottom - top + 1)
  }
}

const normalizeSharedCrop = (value = {}) => {
  const left = Number(value.left)
  const top = Number(value.top)
  const width = Number(value.width)
  const height = Number(value.height)
  if (
    !Number.isInteger(left) || left < 0 ||
    !Number.isInteger(top) || top < 0 ||
    !Number.isInteger(width) || width < 1 ||
    !Number.isInteger(height) || height < 1
  ) return null
  return { left, top, width, height }
}

const createNormalizedFrame = async (preparedFrame, sharedCrop = null) => {
  const maxWidth = Math.floor(FRAME_WIDTH * 0.82)
  const maxHeight = Math.floor(FRAME_HEIGHT * 0.82)
  const backgroundRemoval = options.removeOpaqueBackground
    ? await removeOpaqueEdgeBackground(sourceInput)
    : { buffer: sourceInput, removed: false, removedPixelRatio: 0 }
  const trimmed = await trimFrameSource(backgroundRemoval.buffer, options)
  const resized = await sharp(trimmed.buffer)
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()
  const metadata = await sharp(resized).metadata()
  const left = Math.max(0, Math.floor((FRAME_WIDTH - metadata.width) / 2))
  const top = Math.max(0, Math.floor((FRAME_HEIGHT - metadata.height) * 0.58))

  const frameBuffer = await sharp({
    create: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer()

  return {
    frameBuffer,
    sourceVisiblePixels: trimmed.visiblePixels,
    sourceBounds: trimmed.bounds,
    sourceFilledCell: trimmed.fullFrameVisible,
    sourceFilledFrame: trimmed.fullFrameVisible,
    sourceOpaqueFullFrameTrimmed: Boolean(trimmed.opaqueFullFrameTrimmed),
    sourceBackgroundRemoved: Boolean(backgroundRemoval.removed),
    sourceBackgroundRemovedRatio: Number(backgroundRemoval.removedPixelRatio || 0)
  }
}

const extractActionSheetCellBuffer = async ({ sourcePath, frameCount, frameIndex }) => {
  const metadata = await sharp(sourcePath).metadata()
  const layout = getActionSheetLayout(frameCount)
  const row = Math.floor(frameIndex / layout.columns)
  const column = frameIndex % layout.columns
  if (row >= layout.rows) {
    throw new Error('Generated action sheet does not contain enough rows')
  }
  const horizontal = splitGridDimension({ size: metadata.width, count: layout.columns, index: column })
  const vertical = splitGridDimension({ size: metadata.height, count: layout.rows, index: row })
  const cellBuffer = await sharp(sourcePath)
    .ensureAlpha()
    .extract({
      left: horizontal.start,
      top: vertical.start,
      width: horizontal.size,
      height: vertical.size
    })
    .png()
    .toBuffer()
  return {
    cellBuffer,
    layout,
    cell: {
      column,
      row,
      left: horizontal.start,
      top: vertical.start,
      width: horizontal.size,
      height: vertical.size
    }
  }
}

const inspectActionSheetLayout = async ({ dataDir, generationResult, frameCount }) => {
  const entries = resolveGeneratedImageEntries({ dataDir, generationResult })
  const layout = getActionSheetLayout(frameCount)
  const base = {
    checked: false,
    capacity: layout.columns * layout.rows,
    frameCount,
    unusedCellCount: Math.max(0, (layout.columns * layout.rows) - frameCount),
    visibleUnusedCellCount: 0,
    unusedCells: []
  }
  if (entries.length !== 1 || base.unusedCellCount === 0) return base

  const sourcePath = entries[0].sourcePath
  const sheetBackgroundRemoval = await removeOpaqueEdgeBackground(sourcePath)
  const sheetInput = sheetBackgroundRemoval?.buffer || sourcePath
  const metadata = await sharp(sheetInput).metadata()
  const unusedCells = []
  for (let index = frameCount; index < base.capacity; index += 1) {
    const row = Math.floor(index / layout.columns)
    const column = index % layout.columns
    const horizontal = splitGridDimension({ size: metadata.width, count: layout.columns, index: column })
    const vertical = splitGridDimension({ size: metadata.height, count: layout.rows, index: row })
    const cellBuffer = await sharp(sheetInput)
      .ensureAlpha()
      .extract({
        left: horizontal.start,
        top: vertical.start,
        width: horizontal.size,
        height: vertical.size
      })
      .png()
      .toBuffer()
    const cellBackgroundRemoval = await removeOpaqueEdgeBackground(cellBuffer)
    const { data, info } = await sharp(cellBackgroundRemoval?.buffer || cellBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let visiblePixels = 0
    for (let offset = 3; offset < data.length; offset += info.channels) {
      if (data[offset] > 8) visiblePixels += 1
    }
    const pixelCount = info.width * info.height
    unusedCells.push({
      index,
      row,
      column,
      visiblePixels,
      visibleRatio: pixelCount > 0 ? Number((visiblePixels / pixelCount).toFixed(6)) : 0
    })
  }
  return {
    ...base,
    checked: true,
    visibleUnusedCellCount: unusedCells.filter((cell) => cell.visiblePixels > Math.max(4, Math.floor(metadata.width * metadata.height * 0.0002))).length,
    unusedCells
  }
}

const resolveFrameCellSource = async ({ dataDir, generationResult, frameCount, frameIndex }) => {
  const entries = resolveGeneratedImageEntries({ dataDir, generationResult })
  const sheetEntry = entries[0]
  const extracted = await extractActionSheetCellBuffer({
    sourcePath: sheetEntry.sourcePath,
    frameCount,
    frameIndex
  })
  const prepared = await prepareFrameSource(extracted.cellBuffer, {
    removeOpaqueBackground: true,
    allowOpaqueFullFrame: false
  })
  return {
    mode: 'action-sheet',
    sourceRelativePath: sheetEntry.sourceRelativePath,
    sourceRelativePaths: [sheetEntry.sourceRelativePath],
    prepared,
    extraction: {
      mode: 'action-sheet',
      outputCount: 1,
      layout: extracted.layout,
      sourceCell: extracted.cell
    }
  }
}

const clampInteger = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)))

const isCanonicalWaveAction = (action = {}) => /wave|waving|挥手|招手|挥爪|paw\s*wave/i.test(
  `${action?.name || ''} ${action?.motionPrompt || ''}`
)

const resolveCanonicalMotionProfile = (action = {}) => (
  isCanonicalWaveAction(action)
    ? 'wave-local-appendage'
    : 'generic-local-motion'
)

const resolveCanonicalMotionRegion = ({ bounds, action }) => {
  const visible = bounds || {
    left: 0,
    top: 0,
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    right: FRAME_WIDTH - 1,
    bottom: FRAME_HEIGHT - 1
  }
  const wave = isCanonicalWaveAction(action)
  const relative = wave
    ? { left: 0.72, top: 0.02, right: 1.0, bottom: 0.46 }
    : { left: 0.30, top: 0.18, right: 0.70, bottom: 0.64 }

  let left = clampInteger(visible.left + (visible.width * relative.left), 0, FRAME_WIDTH - 1)
  let top = clampInteger(visible.top + (visible.height * relative.top), 0, FRAME_HEIGHT - 1)
  let right = clampInteger(visible.left + (visible.width * relative.right), left + 1, FRAME_WIDTH)
  let bottom = clampInteger(visible.top + (visible.height * relative.bottom), top + 1, FRAME_HEIGHT)

  const minWidth = wave ? 28 : 24
  const minHeight = wave ? 44 : 32
  if (right - left < minWidth) {
    right = clampInteger(left + minWidth, left + 1, FRAME_WIDTH)
    left = clampInteger(right - minWidth, 0, right - 1)
  }
  if (bottom - top < minHeight) {
    bottom = clampInteger(top + minHeight, top + 1, FRAME_HEIGHT)
    top = clampInteger(bottom - minHeight, 0, bottom - 1)
  }

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  }
}

const createCanonicalMotionOffsets = ({ frameCount, action }) => {
  if (frameCount <= 1) return [{ x: 0, y: 0 }]
  if (isCanonicalWaveAction(action) && frameCount === 6) {
    return [
      { x: 0, y: 0 },
      { x: -3, y: -8 },
      { x: -7, y: -15 },
      { x: 5, y: -14 },
      { x: -5, y: -10 },
      { x: -1, y: -3 }
    ]
  }
  return Array.from({ length: frameCount }, (_entry, index) => {
    const t = frameCount === 1 ? 0 : index / (frameCount - 1)
    const cycle = Math.sin(t * Math.PI * 2)
    const lift = Math.sin(t * Math.PI)
    return {
      x: Math.round(cycle * 4),
      y: -Math.round(lift * 6)
    }
  })
}

const createCanonicalLocalMotionFrame = async ({ canonicalBuffer, motionRegion, offset }) => {
  if (!offset || (Number(offset.x || 0) === 0 && Number(offset.y || 0) === 0)) {
    return Buffer.from(canonicalBuffer)
  }
  const patch = await sharp(canonicalBuffer)
    .extract(motionRegion)
    .png()
    .toBuffer()
  const left = clampInteger(motionRegion.left + Number(offset.x || 0), 0, FRAME_WIDTH - motionRegion.width)
  const top = clampInteger(motionRegion.top + Number(offset.y || 0), 0, FRAME_HEIGHT - motionRegion.height)
  return sharp(canonicalBuffer)
    .composite([{ input: patch, left, top }])
    .png()
    .toBuffer()
}

const toDataRelativePath = ({ dataDir, targetPath }) => path
  .relative(path.resolve(dataDir), path.resolve(targetPath))
  .split(path.sep)
  .join('/')

const numericRange = (values) => {
  const finiteValues = values.map(Number).filter(Number.isFinite)
  if (finiteValues.length === 0) return { min: 0, max: 0, range: 0, ratio: 1 }
  const min = Math.min(...finiteValues)
  const max = Math.max(...finiteValues)
  return {
    min,
    max,
    range: Number((max - min).toFixed(2)),
    ratio: min > 0 ? Number((max / min).toFixed(3)) : (max > 0 ? Infinity : 1)
  }
}

const sourceBoundsTouchCellEdge = (frame) => {
  const bounds = frame?.sourceBounds
  const cell = frame?.sourceCell
  if (!bounds || !cell || frame?.sourceOpaqueFullFrameTrimmed) return false
  const tolerance = 2
  const right = Number.isFinite(Number(bounds.right))
    ? Number(bounds.right)
    : Number(bounds.left || 0) + Number(bounds.width || 0) - 1
  const bottom = Number.isFinite(Number(bounds.bottom))
    ? Number(bounds.bottom)
    : Number(bounds.top || 0) + Number(bounds.height || 0) - 1
  return Number(bounds.left || 0) <= tolerance ||
    Number(bounds.top || 0) <= tolerance ||
    right >= Number(cell.width || 0) - 1 - tolerance ||
    bottom >= Number(cell.height || 0) - 1 - tolerance
}

const createActionFrameQuality = async ({ frames, frameCount, extraction, framesDir }) => {
  const complete = isCompleteFrameEvidence({ frames, frameCount })
  const frameBounds = frames.map((frame) => frame?.frameBounds).filter(Boolean)
  const heights = numericRange(frameBounds.map((bounds) => bounds.height))
  const widths = numericRange(frameBounds.map((bounds) => bounds.width))
  const visiblePixels = numericRange(frames.map((frame) => frame?.visiblePixels))
  const baseline = numericRange(frameBounds.map((bounds) => bounds.baselineY))
  const centroidX = numericRange(frameBounds.map((bounds) => bounds.centroidX))
  const centroidY = numericRange(frameBounds.map((bounds) => bounds.centroidY))
  const sourceCellEdgeTouchCount = frames.filter(sourceBoundsTouchCellEdge).length
  const sourceCellEdgeTouchRatio = frames.length > 0
    ? Number((sourceCellEdgeTouchCount / frames.length).toFixed(3))
    : 0
  const mode = String(extraction?.mode || '')
  const opaqueMultiOutputFrameCount = mode === 'multi-output'
    ? frames.filter((frame) => frame?.sourceFilledFrame).length
    : 0
  const largeOpaqueMultiOutputFrameCount = mode === 'multi-output'
    ? frames.filter((frame) => {
        const bounds = frame?.sourceBounds || {}
        return frame?.sourceFilledFrame &&
          (Number(bounds.width || 0) > FRAME_WIDTH * 2 || Number(bounds.height || 0) > FRAME_HEIGHT * 2)
      }).length
    : 0
  const uniqueFrameCount = new Set(frames.map((frame) => frame?.sha256).filter(Boolean)).size
  const duplicateFrameCount = Math.max(0, frames.length - uniqueFrameCount)
  const reusedFrameCount = frames.filter((frame) => frame?.reusedPreviousFrame).length
  const adjacentFrameDiff = complete
    ? await createAdjacentFrameDiffMetrics({ frames, framesDir })
    : {
        minChangedPixelRatio: 0,
        maxChangedPixelRatio: 0,
        averageChangedPixelRatio: 0,
        pairs: [],
        identityCore: {
          minChangedPixelRatio: 0,
          maxChangedPixelRatio: 0,
          averageChangedPixelRatio: 0,
          pairs: []
        }
      }
  const identityCoreDiff = adjacentFrameDiff.identityCore || {
    minChangedPixelRatio: 0,
    maxChangedPixelRatio: 0,
    averageChangedPixelRatio: 0,
    pairs: []
  }
  const excessiveWholeSpriteChangePairCount = countPairsAboveRatio(
    adjacentFrameDiff.pairs,
    MAX_PAIR_CHANGED_PIXEL_RATIO
  )
  const excessiveIdentityCoreChangePairCount = countPairsAboveRatio(
    identityCoreDiff.pairs,
    MAX_IDENTITY_CORE_PAIR_CHANGED_PIXEL_RATIO
  )
  const actionSheetMode = mode === 'action-sheet' || mode === 'action-sheet-fallback'
  const errors = []
  const warnings = []

  if (!complete) {
    errors.push('Action frame QA is incomplete.')
  }
  if (complete && actionSheetMode && sourceCellEdgeTouchCount >= Math.max(3, Math.ceil(frameCount * 0.5))) {
    errors.push('Generated action sheet appears cropped or sliced: too many source cells touch grid boundaries.')
  }
  if (complete && opaqueMultiOutputFrameCount > 0) {
    errors.push('Generated multi-output action frames include opaque full-image backgrounds; frames must be transparent cutout sprites.')
  }
  if (complete && reusedFrameCount > 0) {
    errors.push('action_reused_frames')
  }
  if (complete && uniqueFrameCount <= 1) {
    errors.push('action_repeated_static')
  }
  if (complete && frameCount >= 12 && uniqueFrameCount < 6) {
    errors.push('action_insufficient_unique_frames')
  } else if (complete && frameCount >= 6 && uniqueFrameCount < 4) {
    errors.push('action_insufficient_unique_frames')
  }
  if (complete && adjacentFrameDiff.averageChangedPixelRatio < MIN_AVERAGE_CHANGED_PIXEL_RATIO) {
    errors.push('action_motion_below_minimum')
  }
  if (
    complete &&
    (
      adjacentFrameDiff.averageChangedPixelRatio > MAX_AVERAGE_CHANGED_PIXEL_RATIO ||
      excessiveWholeSpriteChangePairCount > 0
    )
  ) {
    errors.push('Generated action frames change too much of the whole sprite between adjacent frames; this usually indicates identity drift or full-character redraw.')
  }
  if (
    complete &&
    (
      identityCoreDiff.averageChangedPixelRatio > MAX_IDENTITY_CORE_AVERAGE_CHANGED_PIXEL_RATIO ||
      excessiveIdentityCoreChangePairCount > 0
    )
  ) {
    errors.push('Generated action frames have unstable face/body core pixels; this usually indicates character identity drift.')
  }
  if (complete && heights.range > 52 && heights.ratio > 1.45) {
    errors.push('Generated action frames have unstable sprite height; this usually indicates cropped body fragments.')
  }
  if (complete && visiblePixels.range > 3000 && visiblePixels.ratio > 1.8) {
    errors.push('Generated action frames have unstable visible area; this usually indicates partial or mismatched frames.')
  }
  if (complete && baseline.range > 30 && (heights.range > 38 || visiblePixels.ratio > 1.8)) {
    errors.push('Generated action frames have unstable body anchor; baseline drift is too large for direct import.')
  } else if (complete && baseline.range > 24) {
    warnings.push('Action frame baseline drift is elevated; review for visible shake before using in production.')
  }

  return {
    ok: complete && errors.length === 0,
    errors,
    warnings,
    metrics: {
      frameCount: frames.length,
      uniqueFrameCount,
      duplicateFrameCount,
      reusedFrameCount,
      adjacentFrameDiff,
      identityCoreDiff,
      excessiveWholeSpriteChangePairCount,
      excessiveIdentityCoreChangePairCount,
      sourceCellEdgeTouchCount,
      sourceCellEdgeTouchRatio,
      opaqueMultiOutputFrameCount,
      largeOpaqueMultiOutputFrameCount,
      visiblePixels,
      frameBounds: {
        width: widths,
        height: heights,
        baselineY: baseline,
        centroidX,
        centroidY
      }
    }
  }
}

const createContactSheetLabel = ({ fileName, width }) => Buffer.from(`
  <svg width="${width}" height="${CONTACT_SHEET_LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <text x="${Math.floor(width / 2)}" y="14" text-anchor="middle" font-family="Avenir Next, Arial, sans-serif" font-size="12" font-weight="700" fill="#66727f">${fileName}</text>
  </svg>
`)

const writeActionFrameContactSheet = async ({ dataDir, framesDir, qaDir, frames }) => {
  const frameEntries = Array.isArray(frames) ? frames : []
  const columns = Math.max(1, Math.min(CONTACT_SHEET_COLUMNS, frameEntries.length || 1))
  const rows = Math.max(1, Math.ceil((frameEntries.length || 1) / columns))
  const cellWidth = CONTACT_SHEET_THUMB_WIDTH + CONTACT_SHEET_GAP
  const cellHeight = CONTACT_SHEET_THUMB_HEIGHT + CONTACT_SHEET_LABEL_HEIGHT + CONTACT_SHEET_GAP
  const width = (columns * cellWidth) + CONTACT_SHEET_GAP
  const height = (rows * cellHeight) + CONTACT_SHEET_GAP
  const composites = []

  for (const [index, frame] of frameEntries.entries()) {
    const fileName = frame?.fileName
    const framePath = path.join(framesDir, fileName || '')
    if (!fileName || !fs.existsSync(framePath)) continue
    const left = CONTACT_SHEET_GAP + ((index % columns) * cellWidth)
    const top = CONTACT_SHEET_GAP + (Math.floor(index / columns) * cellHeight)
    const thumb = await sharp(framePath)
      .ensureAlpha()
      .resize({
        width: CONTACT_SHEET_THUMB_WIDTH,
        height: CONTACT_SHEET_THUMB_HEIGHT,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer()
    composites.push(
      { input: thumb, left, top },
      {
        input: createContactSheetLabel({ fileName, width: CONTACT_SHEET_THUMB_WIDTH }),
        left,
        top: top + CONTACT_SHEET_THUMB_HEIGHT
      }
    )
  }

  const contactSheetPath = path.join(qaDir, 'action-frame-contact-sheet.png')
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 253, b: 246, alpha: 1 }
    }
  })
    .composite(composites)
    .png()
    .toFile(contactSheetPath)
  return contactSheetPath
}

const createExtractionWithMode = ({ extraction, mode }) => {
  const requestedMode = String(mode || '').trim()
  if (!requestedMode) return extraction
  return {
    ...(extraction || {}),
    mode: requestedMode,
    originalMode: extraction?.mode || ''
  }
}

const buildActionFramesFromGeneratedImage = async ({
  dataDir,
  generationResult,
  action,
  outputFramesDir,
  qaDir,
  extractionMode = ''
}) => {
  const actionId = String(action?.actionId || '').trim()
  assertSafeActionId(actionId)
  const frameCount = normalizeFrameCount(action?.frameCount || 16)
  const safeOutputFramesDir = assertWritablePathInsideDataDir({
    dataDir,
    targetPath: outputFramesDir,
    label: 'action frames output directory'
  })
  const safeQaDir = assertWritablePathInsideDataDir({
    dataDir,
    targetPath: qaDir,
    label: 'action QA directory'
  })

  fs.rmSync(safeOutputFramesDir, { recursive: true, force: true })
  fs.mkdirSync(safeOutputFramesDir, { recursive: true })
  fs.mkdirSync(safeQaDir, { recursive: true })
  const sheetLayout = await inspectActionSheetLayout({
    dataDir,
    generationResult,
    frameCount
  })

  const frames = []
  let sourceRelativePath = ''
  let sourceRelativePaths = []
  let extraction = null
  const frameCellSources = []
  for (let index = 0; index < frameCount; index += 1) {
    frameCellSources.push(await resolveFrameCellSource({
      dataDir,
      generationResult,
      frameCount,
      frameIndex: index
    }))
  }
  const sharedCrop = createSharedSequenceCrop(frameCellSources.map((source) => source.prepared))
  const materializedFrameSources = []
  for (let index = 0; index < frameCount; index += 1) {
    materializedFrameSources.push(await materializeFrameSource({
      frameCellSource: frameCellSources[index],
      sharedCrop
    }))
  }
  const stabilized = await stabilizeNormalizedFrameSources({
    frameSources: materializedFrameSources,
    action
  })
  for (let index = 0; index < frameCount; index += 1) {
    const fileName = `${String(index + 1).padStart(4, '0')}.png`
    const framePath = path.join(safeOutputFramesDir, fileName)
    const frameSource = stabilized.frameSources[index]
    sourceRelativePath = sourceRelativePath || frameSource.sourceRelativePath
    sourceRelativePaths = frameSource.sourceRelativePaths
    extraction = frameSource.extraction
    const fileSha256 = crypto.createHash('sha256').update(frameSource.normalized.frameBuffer).digest('hex')
    fs.writeFileSync(framePath, frameSource.normalized.frameBuffer)
    const frameInspection = await inspectVisibleImage(framePath)
    frames.push({
      fileName,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      sha256: frameInspection.sha256,
      fileSha256,
      visiblePixels: frameInspection.visiblePixels,
      frameBounds: frameInspection.bounds,
      sourceVisiblePixels: frameSource.normalized.sourceVisiblePixels,
      sourceBounds: frameSource.normalized.sourceBounds,
      sourceFilledFrame: frameSource.normalized.sourceFilledFrame,
      sourceOpaqueFullFrameTrimmed: frameSource.normalized.sourceOpaqueFullFrameTrimmed,
      sourceBackgroundRemoved: frameSource.normalized.sourceBackgroundRemoved,
      sourceBackgroundRemovedRatio: frameSource.normalized.sourceBackgroundRemovedRatio,
      ...(reusedPreviousFrame ? { reusedPreviousFrame: true, reusedFromFileName } : {}),
      ...(frameSource.extraction?.sourceCell ? { sourceCell: frameSource.extraction.sourceCell } : {}),
      ...(Number.isInteger(frameSource.extraction?.sourceOutputIndex) ? { sourceOutputIndex: frameSource.extraction.sourceOutputIndex } : {})
    })
  }

  const contactSheetPath = await writeActionFrameContactSheet({
    dataDir,
    framesDir: safeOutputFramesDir,
    qaDir: safeQaDir,
    frames
  })
  const qaPath = path.join(safeQaDir, 'action-frame-validation.json')
  const playback = createPlaybackDiagnostics({
    frameCount,
    loop: Boolean(action?.loop)
  })
  const quality = await createActionFrameQuality({
    frames,
    frameCount,
    framesDir: safeOutputFramesDir,
    extraction: extraction || {
      mode: 'action-sheet',
      outputCount: 1,
      layout: getActionSheetLayout(frameCount)
    }
  })
  writeJson(qaPath, {
    ok: quality.ok,
    actionId,
    name: String(action?.name || actionId),
    sourceRelativePath,
    sourceRelativePaths,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    loop: Boolean(action?.loop),
    playback,
    extraction: {
      ...(extraction || {
        mode: 'action-sheet',
        outputCount: 1,
        layout: getActionSheetLayout(frameCount)
      }),
      sharedCrop,
      rootStabilization: stabilized.rootStabilization
    },
    triggerProposal: action?.triggerProposal || { type: 'unbound' },
    contactSheetRelativePath: toDataRelativePath({ dataDir, targetPath: contactSheetPath }),
    frames,
    errors: quality.errors,
    warnings: [...warnings, ...quality.warnings],
    quality
  })

  return {
    actionId,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    framesDir: safeOutputFramesDir,
    contactSheetPath,
    qaPath
  }
}

const buildCanonicalActionFramesFromGeneratedImage = async ({
  dataDir,
  generationResult,
  action,
  outputFramesDir,
  qaDir
}) => {
  const actionId = String(action?.actionId || '').trim()
  assertSafeActionId(actionId)
  const frameCount = normalizeFrameCount(action?.frameCount || 16)
  const safeOutputFramesDir = assertWritablePathInsideDataDir({
    dataDir,
    targetPath: outputFramesDir,
    label: 'action frames output directory'
  })
  const safeQaDir = assertWritablePathInsideDataDir({
    dataDir,
    targetPath: qaDir,
    label: 'action QA directory'
  })

  fs.rmSync(safeOutputFramesDir, { recursive: true, force: true })
  fs.mkdirSync(safeOutputFramesDir, { recursive: true })
  fs.mkdirSync(safeQaDir, { recursive: true })

  const [sourceEntry] = resolveGeneratedImageEntries({ dataDir, generationResult })
  const normalized = await createNormalizedFrame(sourceEntry.sourcePath, {
    removeOpaqueBackground: true,
    allowOpaqueFullFrame: false,
    allowOpaqueFullFrameTrim: false
  })
  const canonicalInspection = await inspectVisibleBuffer(normalized.frameBuffer)
  const motionRegion = resolveCanonicalMotionRegion({
    bounds: canonicalInspection.bounds,
    action
  })
  const offsets = createCanonicalMotionOffsets({ frameCount, action })
  const motionProfile = resolveCanonicalMotionProfile(action)
  const extraction = {
    mode: 'canonical-local-synthesis',
    outputCount: 1,
    sourceFrame: 'canonical'
  }
  const synthesis = {
    mode: 'canonical-frame',
    source: 'single-approved-canonical-frame',
    compositeMode: 'overlay-local-patch',
    motionProfile,
    motionRegion,
    offsets
  }
  const frames = []
  for (let index = 0; index < frameCount; index += 1) {
    const fileName = `${String(index + 1).padStart(4, '0')}.png`
    const framePath = path.join(safeOutputFramesDir, fileName)
    const frameBuffer = await createCanonicalLocalMotionFrame({
      canonicalBuffer: normalized.frameBuffer,
      motionRegion,
      offset: offsets[index] || { x: 0, y: 0 }
    })
    const fileSha256 = crypto.createHash('sha256').update(frameBuffer).digest('hex')
    fs.writeFileSync(framePath, frameBuffer)
    const frameInspection = await inspectVisibleImage(framePath)
    frames.push({
      fileName,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      sha256: frameInspection.sha256,
      fileSha256,
      visiblePixels: frameInspection.visiblePixels,
      frameBounds: frameInspection.bounds,
      sourceVisiblePixels: normalized.sourceVisiblePixels,
      sourceBounds: normalized.sourceBounds,
      sourceFilledFrame: normalized.sourceFilledFrame,
      sourceOpaqueFullFrameTrimmed: normalized.sourceOpaqueFullFrameTrimmed,
      sourceBackgroundRemoved: normalized.sourceBackgroundRemoved,
      sourceBackgroundRemovedRatio: normalized.sourceBackgroundRemovedRatio,
      synthesisOffset: offsets[index] || { x: 0, y: 0 }
    })
  }

  const contactSheetPath = await writeActionFrameContactSheet({
    dataDir,
    framesDir: safeOutputFramesDir,
    qaDir: safeQaDir,
    frames
  })
  const qaPath = path.join(safeQaDir, 'action-frame-validation.json')
  const playback = createPlaybackDiagnostics({
    frameCount,
    loop: Boolean(action?.loop)
  })
  const quality = await createActionFrameQuality({
    frames,
    frameCount,
    framesDir: safeOutputFramesDir,
    extraction
  })
  writeJson(qaPath, {
    ok: quality.ok,
    actionId,
    name: String(action?.name || actionId),
    sourceRelativePath: sourceEntry.sourceRelativePath,
    sourceRelativePaths: [sourceEntry.sourceRelativePath],
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    loop: Boolean(action?.loop),
    playback,
    extraction,
    synthesis,
    triggerProposal: action?.triggerProposal || { type: 'unbound' },
    contactSheetRelativePath: toDataRelativePath({ dataDir, targetPath: contactSheetPath }),
    frames,
    errors: quality.errors,
    warnings: quality.warnings,
    quality
  })

  return {
    actionId,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    framesDir: safeOutputFramesDir,
    contactSheetPath,
    qaPath
  }
}

const repairActionFrameFromGeneratedImage = async ({
  dataDir,
  generationResult,
  action,
  outputFramesDir,
  qaDir,
  fileName,
  now = () => new Date().toISOString()
}) => {
  const actionId = String(action?.actionId || '').trim()
  assertSafeActionId(actionId)
  const frameCount = normalizeFrameCount(action?.frameCount || 16)
  const frameIndex = normalizeFrameIndex({ fileName, frameCount })
  const safeOutputFramesDir = assertWritablePathInsideDataDir({
    dataDir,
    targetPath: outputFramesDir,
    label: 'action frames output directory'
  })
  const safeQaDir = assertWritablePathInsideDataDir({
    dataDir,
    targetPath: qaDir,
    label: 'action QA directory'
  })

  fs.mkdirSync(safeOutputFramesDir, { recursive: true })
  fs.mkdirSync(safeQaDir, { recursive: true })
  const currentQa = fs.existsSync(path.join(safeQaDir, 'action-frame-validation.json'))
    ? JSON.parse(fs.readFileSync(path.join(safeQaDir, 'action-frame-validation.json'), 'utf-8'))
    : null
  let sharedCrop = normalizeSharedCrop(currentQa?.extraction?.sharedCrop)
  if (!sharedCrop) {
    const preparedSources = []
    for (let index = 0; index < frameCount; index += 1) {
      preparedSources.push(await resolveFrameCellSource({
        dataDir,
        generationResult,
        frameCount,
        frameIndex: index
      }))
    }
    sharedCrop = createSharedSequenceCrop(preparedSources.map((source) => source.prepared))
  }
  const frameCellSource = await resolveFrameCellSource({
    dataDir,
    generationResult,
    frameCount,
    frameIndex
  })
  let frameSource = await materializeFrameSource({ frameCellSource, sharedCrop })
  const storedRootStabilization = currentQa?.extraction?.rootStabilization
  if (storedRootStabilization?.target) {
    const stabilized = await stabilizeNormalizedFrameSources({
      frameSources: [frameSource],
      action,
      target: storedRootStabilization.target
    })
    frameSource = stabilized.frameSources[0]
  }
  const framePath = path.join(safeOutputFramesDir, fileName)
  const fileSha256 = crypto.createHash('sha256').update(frameSource.normalized.frameBuffer).digest('hex')
  fs.writeFileSync(framePath, frameSource.normalized.frameBuffer)
  const frameInspection = await inspectVisibleImage(framePath)
  const frame = {
    fileName,
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    sha256: frameInspection.sha256,
    fileSha256,
    visiblePixels: frameInspection.visiblePixels,
    frameBounds: frameInspection.bounds,
    sourceVisiblePixels: frameSource.normalized.sourceVisiblePixels,
    sourceBounds: frameSource.normalized.sourceBounds,
    sourceFilledFrame: frameSource.normalized.sourceFilledFrame,
    sourceOpaqueFullFrameTrimmed: frameSource.normalized.sourceOpaqueFullFrameTrimmed,
    sourceBackgroundRemoved: frameSource.normalized.sourceBackgroundRemoved,
    sourceBackgroundRemovedRatio: frameSource.normalized.sourceBackgroundRemovedRatio,
    ...(frameSource.extraction?.sourceCell ? { sourceCell: frameSource.extraction.sourceCell } : {}),
    repairedAt: now()
  }

  const qaPath = path.join(safeQaDir, 'action-frame-validation.json')
  const storedQa = currentQa
    ? currentQa
    : {
        ok: true,
        actionId,
        name: String(action?.name || actionId),
        sourceRelativePath: frameSource.sourceRelativePath,
        sourceRelativePaths: frameSource.sourceRelativePaths,
        frameCount,
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
        loop: Boolean(action?.loop),
        extraction: frameSource.extraction,
        triggerProposal: action?.triggerProposal || { type: 'unbound' },
        frames: [],
        warnings: []
  }
  const frames = Array.isArray(storedQa.frames) ? storedQa.frames.slice() : []
  frames[frameIndex] = frame
  const hydratedFrames = await hydrateFrameEvidenceFromDisk({
    frames,
    framesDir: safeOutputFramesDir
  })
  const qaComplete = isCompleteFrameEvidence({ frames: hydratedFrames, frameCount })
  const warnings = Array.isArray(currentQa.warnings) ? currentQa.warnings.slice() : []
  const incompleteWarning = 'Action frame QA is incomplete after repair.'
  const nextWarnings = qaComplete
    ? warnings.filter((warning) => warning !== incompleteWarning)
    : [...new Set([...warnings, incompleteWarning])]
  const contactSheetPath = await writeActionFrameContactSheet({
    dataDir,
    framesDir: safeOutputFramesDir,
    qaDir: safeQaDir,
    frames: hydratedFrames
  })
  const playback = createPlaybackDiagnostics({
    frameCount,
    loop: Boolean(storedQa.loop ?? action?.loop),
    frameDurationsMs: storedQa.playback?.frameDurationsMs
  })
  const extraction = currentQa.extraction || frameSource.extraction
  const quality = qaComplete
    ? await createActionFrameQuality({
        frames: hydratedFrames,
        frameCount,
        extraction,
        framesDir: safeOutputFramesDir
      })
    : {
        ok: false,
        errors: [],
        warnings: [],
        metrics: { frameCount: frames.filter(Boolean).length }
      }
  writeJson(qaPath, {
    ...currentQa,
    ok: qaComplete && quality.ok,
    actionId,
    sourceRelativePath: storedQa.sourceRelativePath || frameSource.sourceRelativePath,
    sourceRelativePaths: Array.isArray(storedQa.sourceRelativePaths) && storedQa.sourceRelativePaths.length > 0
      ? storedQa.sourceRelativePaths
      : frameSource.sourceRelativePaths,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    playback,
    extraction,
    contactSheetRelativePath: toDataRelativePath({ dataDir, targetPath: contactSheetPath }),
    frames: hydratedFrames,
    errors: quality.errors,
    warnings: [...nextWarnings, ...quality.warnings],
    quality,
    repairs: [
      ...(Array.isArray(storedQa.repairs) ? storedQa.repairs : []),
      { fileName, repairedAt: frame.repairedAt }
    ]
  })

  return {
    actionId,
    fileName,
    frameIndex,
    frame,
    framePath,
    contactSheetPath,
    qaPath
  }
}

module.exports = {
  buildCanonicalActionFramesFromGeneratedImage,
  buildActionFramesFromGeneratedImage,
  repairActionFrameFromGeneratedImage
}
