const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
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
  const columns = Math.max(1, Math.min(ACTION_SHEET_MAX_COLUMNS, frameCount))
  const rows = Math.max(1, Math.ceil(frameCount / columns))
  return { columns, rows }
}

const resolveGeneratedImageEntries = ({ dataDir, generationResult }) => {
  const outputs = Array.isArray(generationResult?.outputs) ? generationResult.outputs : []
  if (outputs.length === 0) {
    throw new Error('Generated image is missing')
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

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixelIndex = ((y * info.width) + x) * info.channels
      const alpha = data[pixelIndex + 3]
      if (alpha > 0) {
        visiblePixels += 1
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (visiblePixels <= 0) return null
  return {
    left: minX,
    top: minY,
    width: Math.max(1, (maxX - minX) + 1),
    height: Math.max(1, (maxY - minY) + 1),
    visiblePixels
  }
}

const trimFrameSource = async (sourceInput, { allowOpaqueFullFrame = true } = {}) => {
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
          height: trimMetadata.height
        },
        fullFrameVisible: false
      }
    }
    throw new Error('Generated action sheet cell is missing a cutout-ready sprite silhouette')
  }
  const trimmed = await sharp(sourceInput)
    .extract({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    })
    .png()
    .toBuffer()
  return {
    buffer: trimmed,
    visiblePixels: bounds.visiblePixels,
    bounds,
    fullFrameVisible
  }
}

const createNormalizedFrame = async (sourceInput, options = {}) => {
  const maxWidth = Math.floor(FRAME_WIDTH * 0.82)
  const maxHeight = Math.floor(FRAME_HEIGHT * 0.82)
  const trimmed = await trimFrameSource(sourceInput, options)
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
    sourceFilledCell: trimmed.fullFrameVisible
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

const resolveFrameSource = async ({ dataDir, generationResult, frameCount, frameIndex }) => {
  const entries = resolveGeneratedImageEntries({ dataDir, generationResult })
  if (entries.length >= frameCount) {
    const entry = entries[frameIndex]
    return {
      mode: 'multi-output',
      sourceRelativePath: entry.sourceRelativePath,
      sourceRelativePaths: entries.slice(0, frameCount).map((candidate) => candidate.sourceRelativePath),
      normalized: await createNormalizedFrame(entry.sourcePath),
      extraction: {
        mode: 'multi-output',
        outputCount: entries.length
      }
    }
  }

  let lastError = null
  for (const [outputIndex, sheetEntry] of entries.entries()) {
    try {
      const extracted = await extractActionSheetCellBuffer({
        sourcePath: sheetEntry.sourcePath,
        frameCount,
        frameIndex
      })
      return {
        mode: entries.length > 1 ? 'action-sheet-fallback' : 'action-sheet',
        sourceRelativePath: sheetEntry.sourceRelativePath,
        sourceRelativePaths: entries.map((candidate) => candidate.sourceRelativePath),
        normalized: await createNormalizedFrame(extracted.cellBuffer, { allowOpaqueFullFrame: false }),
        extraction: {
          mode: entries.length > 1 ? 'action-sheet-fallback' : 'action-sheet',
          outputCount: entries.length,
          layout: extracted.layout,
          sourceCell: extracted.cell,
          ...(entries.length > 1 ? { sourceOutputIndex: outputIndex } : {})
        }
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('Generated action sheet cell could not be extracted')
}

const toDataRelativePath = ({ dataDir, targetPath }) => path
  .relative(path.resolve(dataDir), path.resolve(targetPath))
  .split(path.sep)
  .join('/')

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

const buildActionFramesFromGeneratedImage = async ({
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

  const frames = []
  let sourceRelativePath = ''
  let sourceRelativePaths = []
  let extraction = null
  for (let index = 0; index < frameCount; index += 1) {
    const fileName = `${String(index + 1).padStart(4, '0')}.png`
    const framePath = path.join(safeOutputFramesDir, fileName)
    const frameSource = await resolveFrameSource({
      dataDir,
      generationResult,
      frameCount,
      frameIndex: index
    })
    sourceRelativePath = sourceRelativePath || frameSource.sourceRelativePath
    sourceRelativePaths = frameSource.sourceRelativePaths
    extraction = frameSource.extraction
    fs.writeFileSync(framePath, frameSource.normalized.frameBuffer)
    frames.push({
      fileName,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      visiblePixels: await countVisiblePixels(framePath),
      sourceVisiblePixels: frameSource.normalized.sourceVisiblePixels,
      sourceBounds: frameSource.normalized.sourceBounds,
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
  writeJson(qaPath, {
    ok: true,
    actionId,
    name: String(action?.name || actionId),
    sourceRelativePath,
    sourceRelativePaths,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    loop: Boolean(action?.loop),
    playback,
    extraction: extraction || {
      mode: 'action-sheet',
      outputCount: 1,
      layout: getActionSheetLayout(frameCount)
    },
    triggerProposal: action?.triggerProposal || { type: 'unbound' },
    contactSheetRelativePath: toDataRelativePath({ dataDir, targetPath: contactSheetPath }),
    frames,
    warnings: []
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
  const frameSource = await resolveFrameSource({
    dataDir,
    generationResult,
    frameCount,
    frameIndex
  })
  const framePath = path.join(safeOutputFramesDir, fileName)
  fs.writeFileSync(framePath, frameSource.normalized.frameBuffer)
  const frame = {
    fileName,
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    visiblePixels: await countVisiblePixels(framePath),
    sourceVisiblePixels: frameSource.normalized.sourceVisiblePixels,
    sourceBounds: frameSource.normalized.sourceBounds,
    ...(frameSource.extraction?.sourceCell ? { sourceCell: frameSource.extraction.sourceCell } : {}),
    repairedAt: now()
  }

  const qaPath = path.join(safeQaDir, 'action-frame-validation.json')
  const currentQa = fs.existsSync(qaPath)
    ? JSON.parse(fs.readFileSync(qaPath, 'utf-8'))
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
  const frames = Array.isArray(currentQa.frames) ? currentQa.frames.slice() : []
  frames[frameIndex] = frame
  const qaComplete = isCompleteFrameEvidence({ frames, frameCount })
  const warnings = Array.isArray(currentQa.warnings) ? currentQa.warnings.slice() : []
  const incompleteWarning = 'Action frame QA is incomplete after repair.'
  const nextWarnings = qaComplete
    ? warnings.filter((warning) => warning !== incompleteWarning)
    : [...new Set([...warnings, incompleteWarning])]
  const contactSheetPath = await writeActionFrameContactSheet({
    dataDir,
    framesDir: safeOutputFramesDir,
    qaDir: safeQaDir,
    frames
  })
  const playback = createPlaybackDiagnostics({
    frameCount,
    loop: Boolean(currentQa.loop ?? action?.loop),
    frameDurationsMs: currentQa.playback?.frameDurationsMs
  })
  writeJson(qaPath, {
    ...currentQa,
    ok: qaComplete,
    actionId,
    sourceRelativePath: currentQa.sourceRelativePath || frameSource.sourceRelativePath,
    sourceRelativePaths: Array.isArray(currentQa.sourceRelativePaths) && currentQa.sourceRelativePaths.length > 0
      ? currentQa.sourceRelativePaths
      : frameSource.sourceRelativePaths,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    playback,
    extraction: currentQa.extraction || frameSource.extraction,
    contactSheetRelativePath: toDataRelativePath({ dataDir, targetPath: contactSheetPath }),
    frames,
    warnings: nextWarnings,
    repairs: [
      ...(Array.isArray(currentQa.repairs) ? currentQa.repairs : []),
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
  buildActionFramesFromGeneratedImage,
  repairActionFrameFromGeneratedImage
}
