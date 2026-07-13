const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const sharp = require('sharp')
const { removeOpaqueEdgeBackground, sanitizeNearTransparentPixels } = require('./edge-background-cutout')
const { createBasicActionCoverage } = require('./full-pet-basic-actions')
const { composeOfficialFullPetAtlas } = require('./full-pet-atlas-composer')
const {
  FULL_PET_ROW_QUALITY,
  OFFICIAL_FULL_PET_ROWS
} = require('./full-pet-row-contract')
const { analyzeRowFrames } = require('./full-pet-row-qa')
const { createOfficialRowPreviewArtifacts } = require('./full-pet-row-preview-artifacts')
const { stabilizeRowFrames } = require('./full-pet-row-stable-slots')
const {
  createQualityProfileEvidence,
  getDefaultQualityProfile
} = require('./pet-generation-quality-profile')

const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const CODEX_ATLAS = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  width: 1536,
  height: 1872
}
const CODEX_ROWS = OFFICIAL_FULL_PET_ROWS
const toSafePosixRelativePath = (value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Generated image is missing')
  }
  const normalized = value.replace(/\\/g, '/')
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error('Generated image path escaped the Creator Studio data directory')
  }
  return normalized
}

const normalizeSafePosixRelativePath = (value) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) {
    return ''
  }
  return normalized
}

const resolveGeneratedImagePath = ({ dataDir, generationResult }) => {
  const firstOutput = Array.isArray(generationResult?.outputs) ? generationResult.outputs[0] : null
  const sourceRelativePath = toSafePosixRelativePath(firstOutput?.dataRelativePath)
  const root = path.resolve(dataDir)
  const sourcePath = path.resolve(root, sourceRelativePath)
  const relativeToRoot = path.relative(root, sourcePath)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Generated image path escaped the Creator Studio data directory')
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Generated image is missing')
  }
  const realRoot = fs.realpathSync.native(root)
  const realSourcePath = fs.realpathSync.native(sourcePath)
  const realRelativeToRoot = path.relative(realRoot, realSourcePath)
  if (realRelativeToRoot.startsWith('..') || path.isAbsolute(realRelativeToRoot)) {
    throw new Error('Generated image path escaped the Creator Studio data directory')
  }
  const size = fs.statSync(sourcePath).size
  if (size > MAX_SOURCE_BYTES) {
    throw new Error('Generated image is too large to process')
  }
  return { sourcePath, sourceRelativePath, size }
}

const resolveGeneratedImageEntries = ({ dataDir, generationResult }) => {
  const outputs = Array.isArray(generationResult?.outputs) ? generationResult.outputs : []
  if (outputs.length === 0) {
    throw new Error('Generated image is missing')
  }
  return outputs.map((output) => ({
    ...resolveGeneratedImagePath({
      dataDir,
      generationResult: { outputs: [output] }
    }),
    actionId: String(output?.actionId || output?.rowId || output?.action || '').trim()
  }))
}

const inspectVisiblePixels = async (sourcePath) => {
  let decoded
  try {
    decoded = await sharp(sourcePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  } catch (error) {
    throw new Error('Generated image could not be decoded')
  }

  const { data, info } = decoded
  if (!info.width || !info.height) {
    throw new Error('Generated image could not be decoded')
  }
  let visiblePixels = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visiblePixels += 1
  }
  if (visiblePixels <= 0) {
    throw new Error('Generated image contains no visible pixels')
  }
  return {
    width: info.width,
    height: info.height,
    channels: info.channels,
    hasAlpha: true,
    visiblePixels
  }
}

const validateGeneratedImageOutput = async ({ dataDir, generationResult }) => {
  const resolved = resolveGeneratedImagePath({ dataDir, generationResult })
  return {
    ...resolved,
    ...(await inspectVisiblePixels(resolved.sourcePath))
  }
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const createNormalizedCellBuffer = async (sourceInput, variant = {}) => {
  const baseMaxWidth = Math.floor(CODEX_ATLAS.cellWidth * 0.82)
  const baseMaxHeight = Math.floor(CODEX_ATLAS.cellHeight * 0.82)
  const scale = clamp(Number(variant.scale) || 1, 0.92, 1.08)
  const maxWidth = Math.max(1, Math.round(baseMaxWidth * scale))
  const maxHeight = Math.max(1, Math.round(baseMaxHeight * scale))
  const resized = await sharp(sourceInput)
    .ensureAlpha()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'contain',
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()
  const resizedMetadata = await sharp(resized).metadata()
  const centeredLeft = Math.floor((CODEX_ATLAS.cellWidth - resizedMetadata.width) / 2)
  const groundedTop = Math.floor((CODEX_ATLAS.cellHeight - resizedMetadata.height) * 0.58)
  const left = clamp(centeredLeft + Math.round(Number(variant.translateX) || 0), 0, CODEX_ATLAS.cellWidth - resizedMetadata.width)
  const top = clamp(groundedTop + Math.round(Number(variant.translateY) || 0), 0, CODEX_ATLAS.cellHeight - resizedMetadata.height)

  const cellBuffer = await sharp({
    create: {
      width: CODEX_ATLAS.cellWidth,
      height: CODEX_ATLAS.cellHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer()
  return sanitizeNearTransparentPixels(cellBuffer)
}

const createPreviewCellBuffers = async ({ sourcePath, row }) => {
  const stableCell = await createNormalizedCellBuffer(sourcePath)
  return row.durations.map(() => stableCell)
}

const findEntryForAction = ({ entries, actionId, fallbackEntry }) => {
  const exact = entries.find((entry) => entry.actionId === actionId)
  if (exact) {
    return {
      entry: exact,
      fallback: true,
      sourceActionId: actionId,
      quality: 'single-image-preview'
    }
  }
  return {
    entry: fallbackEntry,
    fallback: true,
    sourceActionId: fallbackEntry.actionId || 'base-pose',
    quality: actionId === 'idle' ? 'base-preview' : 'synthesized-preview'
  }
}

const createCellComposites = (rowCellBuffers) => {
  const composites = []
  for (const row of CODEX_ROWS) {
    const cellBuffers = rowCellBuffers.get(row.id) || []
    for (let column = 0; column < row.durations.length; column += 1) {
      composites.push({
        input: cellBuffers[column] || cellBuffers[0],
        left: column * CODEX_ATLAS.cellWidth,
        top: row.row * CODEX_ATLAS.cellHeight
      })
    }
  }
  return composites
}

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const sha256File = (filePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex')

const normalizeOfficialRowsInput = (officialRows) => (
  Array.isArray(officialRows)
    ? officialRows
    : Array.isArray(officialRows?.rows)
      ? officialRows.rows
      : []
)

const sanitizeRowQa = (qa) => ({
  actionId: qa.actionId,
  quality: qa.quality,
  qualityProfile: qa.qualityProfile,
  frameCount: qa.frameCount,
  expectedFrameCount: qa.expectedFrameCount,
  uniqueFrameCount: qa.uniqueFrameCount,
  alphaMaskUniqueFrameCount: qa.alphaMaskUniqueFrameCount,
  upperAlphaMaskUniqueFrameCount: qa.upperAlphaMaskUniqueFrameCount,
  lowerAlphaMaskUniqueFrameCount: qa.lowerAlphaMaskUniqueFrameCount,
  centroidDrift: qa.centroidDrift,
  centroidYRange: qa.centroidYRange,
  baselineDrift: qa.baselineDrift,
  sizeDrift: qa.sizeDrift,
  edgeTouchFrameCount: qa.edgeTouchFrameCount,
  ...(qa.identityReference ? { identityReference: qa.identityReference } : {}),
  errors: qa.errors,
  warnings: qa.warnings,
  ...(qa.stabilization ? {
    stabilization: {
      method: qa.stabilization.method,
      frameWidth: qa.stabilization.frameWidth,
      frameHeight: qa.stabilization.frameHeight,
      frameCount: qa.stabilization.frameCount,
      slotWidth: qa.stabilization.slotWidth,
      slotHeight: qa.stabilization.slotHeight,
      baseline: qa.stabilization.baseline,
      padding: qa.stabilization.padding,
      placements: Array.isArray(qa.stabilization.placements)
        ? qa.stabilization.placements.map((placement) => ({
            index: placement.index,
            slotLeft: placement.slotLeft,
            slotTop: placement.slotTop,
            cropLeft: placement.cropLeft,
            cropTop: placement.cropTop
          }))
        : []
    }
  } : {}),
  ...(qa.preStabilization ? {
    preStabilization: {
      quality: qa.preStabilization.quality,
      errors: Array.isArray(qa.preStabilization.errors) ? qa.preStabilization.errors : [],
      centroidDrift: qa.preStabilization.centroidDrift,
      baselineDrift: qa.preStabilization.baselineDrift,
      sizeDrift: qa.preStabilization.sizeDrift
    }
  } : {}),
  frames: qa.frames.map((frame) => ({
    index: frame.index,
    visiblePixels: frame.visiblePixels,
    bbox: frame.bbox,
    centroid: frame.centroid,
    baseline: frame.baseline
  }))
})

const getOfficialFramePath = (frame) => String(frame?.path || frame || '').trim()

const resolveOfficialRowFramePath = ({ dataDir, actionId, frame }) => {
  const framePath = getOfficialFramePath(frame)
  if (!framePath) {
    throw new Error(`Official full-pet row ${actionId} has a missing frame path`)
  }
  const root = path.resolve(dataDir)
  const absoluteFramePath = path.resolve(framePath)
  const relativeToRoot = path.relative(root, absoluteFramePath)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Official full-pet row frame path escaped the Creator Studio data directory')
  }
  if (!fs.existsSync(absoluteFramePath)) {
    throw new Error(`Official full-pet row ${actionId} frame is missing`)
  }
  const realRoot = fs.realpathSync.native(root)
  const realFramePath = fs.realpathSync.native(absoluteFramePath)
  const realRelativeToRoot = path.relative(realRoot, realFramePath)
  if (realRelativeToRoot.startsWith('..') || path.isAbsolute(realRelativeToRoot)) {
    throw new Error('Official full-pet row frame path escaped the Creator Studio data directory')
  }
  return realFramePath
}

const normalizeOfficialRowFrames = async ({ dataDir, actionId, frames }) => (
  Array.isArray(frames)
    ? Promise.all(frames.map(async (frame, index) => {
        const framePath = resolveOfficialRowFramePath({ dataDir, actionId, frame })
        const metadata = await sharp(framePath).metadata()
        if (metadata.width !== CODEX_ATLAS.cellWidth || metadata.height !== CODEX_ATLAS.cellHeight) {
          throw new Error(`Official full-pet row ${actionId} frame ${index + 1} must be exactly ${CODEX_ATLAS.cellWidth}x${CODEX_ATLAS.cellHeight}`)
        }
        return {
        ...(
          frame && typeof frame === 'object' && !Array.isArray(frame)
            ? frame
            : {}
        ),
        index: Number.isInteger(frame?.index) ? frame.index : index,
        path: framePath
        }
      }))
    : []
)

const CORRECTABLE_ROW_STABILITY_ERRORS = new Set([
  'row_centroid_drift',
  'row_baseline_drift',
  'row_size_drift'
])

const hasOnlyCorrectableStabilityErrors = (qa) => (
  Array.isArray(qa.errors) &&
  qa.errors.length > 0 &&
  qa.errors.every((error) => CORRECTABLE_ROW_STABILITY_ERRORS.has(error))
)

const analyzeOfficialRowWithStableSlots = async ({
  dataDir,
  qaDir,
  row,
  frames,
  sourceKind,
  identityReferenceMeanRgb = null,
  identityReferenceDescriptor = null,
  qualityProfile = getDefaultQualityProfile()
}) => {
  const initialQa = await analyzeRowFrames({
    actionId: row.id,
    frames,
    sourceKind,
    identityReferenceMeanRgb,
    identityReferenceDescriptor,
    qualityProfile
  })
  if (initialQa.quality !== FULL_PET_ROW_QUALITY.FAILED) {
    return {
      frames,
      qa: initialQa
    }
  }
  if (!hasOnlyCorrectableStabilityErrors(initialQa)) {
    return {
      frames,
      qa: initialQa
    }
  }

  const stabilized = await stabilizeRowFrames({
    dataDir,
    actionId: row.id,
    frames,
    outputDir: path.join(qaDir, 'stable-rows', row.id)
  })
  const stabilizedQa = await analyzeRowFrames({
    actionId: row.id,
    frames: stabilized.frames,
    sourceKind,
    identityReferenceMeanRgb,
    identityReferenceDescriptor,
    qualityProfile
  })
  return {
    frames: stabilized.frames,
    qa: {
      ...stabilizedQa,
      stabilization: stabilized.stabilization,
      preStabilization: {
        quality: initialQa.quality,
        errors: initialQa.errors,
        centroidDrift: initialQa.centroidDrift,
        baselineDrift: initialQa.baselineDrift,
        sizeDrift: initialQa.sizeDrift
      }
    }
  }
}

const buildOfficialAtlasFromRows = async ({
  dataDir,
  officialRows,
  spritesheetPath,
  qaDir,
  sourceRelativePath,
  sourceValidation,
  size,
  entries,
  basicActionAttempts = [],
  qualityProfile = getDefaultQualityProfile()
}) => {
  const rowInputs = normalizeOfficialRowsInput(officialRows)
  const rowInputsByActionId = new Map(rowInputs.map((row) => [String(row?.actionId || '').trim(), row]))
  const rowFramesByActionId = new Map()
  const rowQas = []
  const basicActionRows = []
  for (const row of OFFICIAL_FULL_PET_ROWS) {
    const input = rowInputsByActionId.get(row.id)
    if (!input) {
      if (row.id === 'idle') throw new Error('Official full-pet row package is missing required idle')
      continue
    }
    const frames = await normalizeOfficialRowFrames({
      dataDir,
      actionId: row.id,
      frames: input.frames
    })
    const requestedQuality = String(input.quality || '').trim()
    if (requestedQuality === FULL_PET_ROW_QUALITY.APPROVED_MIRROR && row.id !== 'running-left') {
      throw new Error('Only running-left may use approved-mirror official row quality')
    }
    const sourceKind = requestedQuality === FULL_PET_ROW_QUALITY.APPROVED_MIRROR
      ? 'approved-mirror'
      : 'row-strip'
    const rowAnalysis = await analyzeOfficialRowWithStableSlots({
      dataDir,
      qaDir,
      row,
      frames,
      sourceKind,
      identityReferenceMeanRgb: input.identityReferenceMeanRgb || null,
      identityReferenceDescriptor: input.identityReferenceDescriptor || null,
      qualityProfile
    })
    const qa = rowAnalysis.qa
    if (qa.quality === FULL_PET_ROW_QUALITY.FAILED) {
      throw new Error(`Official full-pet row ${row.id} failed QA: ${qa.errors.join(', ')}`)
    }
    rowFramesByActionId.set(row.id, rowAnalysis.frames)
    rowQas.push(qa)
    basicActionRows.push({
      actionId: row.id,
      sourceActionId: row.id === 'running-left' && qa.quality === FULL_PET_ROW_QUALITY.APPROVED_MIRROR
        ? 'running-right'
        : row.id,
      sourceRelativePath: normalizeSafePosixRelativePath(input.sourceRelativePath),
      fallback: false,
      quality: qa.quality
    })
  }

  const composed = await composeOfficialFullPetAtlas({
    outputPath: spritesheetPath,
    rowFramesByActionId
  })
  const visualReviewArtifacts = await createOfficialRowPreviewArtifacts({
    dataDir,
    rowFramesByActionId,
    outputDir: qaDir
  })
  const basicActions = createBasicActionCoverage(basicActionRows, basicActionAttempts)
  const atlasSha256 = sha256File(spritesheetPath)
  const sourceSha256 = sha256File(entries[0].sourcePath)
  const sourceQaPath = path.join(qaDir, 'source-image-validation.json')
  const rowQaPath = path.join(qaDir, 'full-pet-row-validation.json')
  const atlasQaPath = path.join(qaDir, 'atlas-validation.json')
  writeJson(sourceQaPath, {
    ok: true,
    sourceRelativePath,
    width: sourceValidation.width,
    height: sourceValidation.height,
    channels: sourceValidation.channels,
    hasAlpha: sourceValidation.hasAlpha,
    visiblePixels: sourceValidation.visiblePixels,
    byteSize: size,
    sourceSha256,
    warnings: []
  })
  writeJson(rowQaPath, {
    ok: true,
    qualityProfile: createQualityProfileEvidence(qualityProfile),
    rows: rowQas.map(sanitizeRowQa)
  })
  writeJson(atlasQaPath, {
    ok: true,
    width: CODEX_ATLAS.width,
    height: CODEX_ATLAS.height,
    visiblePixels: composed.visiblePixels,
    atlasSha256,
    sourceRelativePath,
    sourceRelativePaths: entries.map((entry) => entry.sourceRelativePath),
    qualityProfile: createQualityProfileEvidence(qualityProfile),
    basicActions,
    frame: {
      width: CODEX_ATLAS.cellWidth,
      height: CODEX_ATLAS.cellHeight,
      rows: composed.frameRows.map((frameRow) => ({
        ...frameRow,
        sourceQuality: basicActionRows.find((candidate) => candidate.actionId === frameRow.id)?.quality || 'unknown'
      }))
    },
    visualReview: {
      contactSheet: visualReviewArtifacts.contactSheetRelativePath,
      previews: visualReviewArtifacts.previews.map((preview) => ({
        actionId: preview.actionId,
        path: preview.relativePath,
        frameCount: preview.frameCount,
        durations: preview.durations
      }))
    },
    warnings: []
  })

  return {
    sourceQaPath,
    atlasQaPath,
    visiblePixels: composed.visiblePixels,
    basicActions
  }
}

const countUniqueRowFrames = async ({ spritesheetPath, row }) => {
  const hashes = new Set()
  for (let column = 0; column < row.durations.length; column += 1) {
    const { data } = await sharp(spritesheetPath)
      .extract({
        left: column * CODEX_ATLAS.cellWidth,
        top: row.row * CODEX_ATLAS.cellHeight,
        width: CODEX_ATLAS.cellWidth,
        height: CODEX_ATLAS.cellHeight
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    hashes.add(crypto.createHash('sha256').update(data).digest('hex'))
  }
  return hashes.size
}

const createEntryVisibilityInspector = ({ fallbackEntry, fallbackValidation, warnings }) => {
  const cache = new Map([[fallbackEntry.sourcePath, fallbackValidation]])
  return async (entry, actionId) => {
    if (cache.has(entry.sourcePath)) return cache.get(entry.sourcePath)
    try {
      const validation = await inspectVisiblePixels(entry.sourcePath)
      cache.set(entry.sourcePath, validation)
      return validation
    } catch (error) {
      warnings.push(`Action ${actionId} source has no usable visible pixels; falling back to base source.`)
      cache.set(entry.sourcePath, null)
      return null
    }
  }
}

const createPreviewSourcePreparer = () => {
  const cache = new Map()
  return async (entry) => {
    const sourcePath = entry?.sourcePath
    if (!sourcePath) return { sourceInput: sourcePath, sourceBackgroundRemoved: false, sourceBackgroundRemovedRatio: 0 }
    if (cache.has(sourcePath)) return cache.get(sourcePath)
    const backgroundRemoval = await removeOpaqueEdgeBackground(sourcePath)
    const prepared = {
      sourceInput: backgroundRemoval.buffer,
      sourceBackgroundRemoved: Boolean(backgroundRemoval.removed),
      sourceBackgroundRemovedRatio: Number(backgroundRemoval.removedPixelRatio || 0)
    }
    cache.set(sourcePath, prepared)
    return prepared
  }
}

const buildRealAtlasFromGeneratedImage = async ({
  dataDir,
  generationResult,
  outputDir,
  qaDir,
  officialRows = null,
  qualityProfile = getDefaultQualityProfile()
}) => {
  const entries = resolveGeneratedImageEntries({ dataDir, generationResult })
  const fallbackEntry = entries[0]
  const { sourcePath, sourceRelativePath, size } = fallbackEntry
  const sourceValidation = await inspectVisiblePixels(sourcePath)

  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })

  const spritesheetPath = path.join(outputDir, 'spritesheet.webp')
  if (officialRows) {
    const official = await buildOfficialAtlasFromRows({
      dataDir,
      officialRows,
      spritesheetPath,
      qaDir,
      sourceRelativePath,
      sourceValidation,
      size,
      entries,
      qualityProfile,
      basicActionAttempts: Array.isArray(generationResult?.basicActionGeneration?.attempts)
        ? generationResult.basicActionGeneration.attempts
        : []
    })
    return {
      spritesheetPath,
      sourceQaPath: official.sourceQaPath,
      atlasQaPath: official.atlasQaPath,
      sourceRelativePath,
      visiblePixels: official.visiblePixels,
      basicActions: official.basicActions
    }
  }

  const basicActionRows = []
  const warnings = []
  const inspectEntryVisibility = createEntryVisibilityInspector({
    fallbackEntry,
    fallbackValidation: sourceValidation,
    warnings
  })
  const preparePreviewSource = createPreviewSourcePreparer()
  const fallbackPreviewSource = await preparePreviewSource(fallbackEntry)
  for (const row of CODEX_ROWS) {
    let resolved = findEntryForAction({
      entries,
      actionId: row.id,
      fallbackEntry
    })
    const validation = await inspectEntryVisibility(resolved.entry, row.id)
    if (!validation) {
      resolved = {
        entry: fallbackEntry,
        fallback: true,
        sourceActionId: fallbackEntry.actionId || 'base-pose',
        quality: row.id === 'idle' ? 'base-preview' : 'synthesized-preview'
      }
    }
    const previewSource = await preparePreviewSource(resolved.entry)
    basicActionRows.push({
      actionId: row.id,
      sourceActionId: resolved.sourceActionId,
      sourceRelativePath: resolved.entry.sourceRelativePath,
      fallback: resolved.fallback,
      quality: resolved.quality
    })
  }
  const basicActions = createBasicActionCoverage(basicActionRows)
  const previewPath = path.join(outputDir, 'base-preview.webp')
  const previewCell = await createNormalizedCellBuffer(fallbackPreviewSource.sourceInput)
  await sharp(await sanitizeNearTransparentPixels(previewCell))
    .webp({ lossless: true })
    .toFile(previewPath)

  const previewVisiblePixels = await countVisiblePixels(previewPath)
  const sourceQaPath = path.join(qaDir, 'source-image-validation.json')
  const atlasQaPath = path.join(qaDir, 'atlas-validation.json')
  const previewSha256 = sha256File(previewPath)
  const sourceSha256 = sha256File(sourcePath)
  writeJson(sourceQaPath, {
    ok: true,
    sourceRelativePath,
    width: sourceValidation.width,
    height: sourceValidation.height,
    channels: sourceValidation.channels,
    hasAlpha: sourceValidation.hasAlpha,
    visiblePixels: sourceValidation.visiblePixels,
    byteSize: size,
    sourceSha256,
    sourceBackgroundRemoved: fallbackPreviewSource.sourceBackgroundRemoved,
    sourceBackgroundRemovedRatio: fallbackPreviewSource.sourceBackgroundRemovedRatio,
    warnings: []
  })
  writeJson(atlasQaPath, {
    ok: false,
    previewOnly: true,
    reason: 'official_action_rows_required',
    width: CODEX_ATLAS.cellWidth,
    height: CODEX_ATLAS.cellHeight,
    visiblePixels: previewVisiblePixels,
    previewSha256,
    sourceRelativePath,
    sourceRelativePaths: entries.map((entry) => entry.sourceRelativePath),
    qualityProfile: createQualityProfileEvidence(qualityProfile),
    basicActions,
    frame: null,
    warnings
  })

  return {
    spritesheetPath: '',
    previewPath,
    previewOnly: true,
    sourceQaPath,
    atlasQaPath,
    sourceRelativePath,
    visiblePixels: previewVisiblePixels
  }
}

module.exports = {
  buildRealAtlasFromGeneratedImage,
  resolveGeneratedImagePath,
  validateGeneratedImageOutput
}
