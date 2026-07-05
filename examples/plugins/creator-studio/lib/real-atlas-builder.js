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

const createNormalizedCellBuffer = async (sourcePath, variant = {}) => {
  const baseMaxWidth = Math.floor(CODEX_ATLAS.cellWidth * 0.82)
  const baseMaxHeight = Math.floor(CODEX_ATLAS.cellHeight * 0.82)
  const scale = clamp(Number(variant.scale) || 1, 0.92, 1.08)
  const maxWidth = Math.max(1, Math.round(baseMaxWidth * scale))
  const maxHeight = Math.max(1, Math.round(baseMaxHeight * scale))
  const resized = await sharp(sourcePath)
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
    rowCellBuffers.set(row.id, await createPreviewCellBuffers({
      sourcePath: resolved.entry.sourcePath,
      row
    }))
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

  const atlasVisiblePixels = await countVisiblePixels(spritesheetPath)
  const frameRows = []
  for (const row of CODEX_ROWS) {
    frameRows.push({
      id: row.id,
      row: row.row,
      frameCount: row.durations.length,
      uniqueFrameCount: await countUniqueRowFrames({ spritesheetPath, row }),
      sourceQuality: basicActionRows.find((candidate) => candidate.actionId === row.id)?.quality || 'unknown'
    })
  }
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
    frame: {
      width: CODEX_ATLAS.cellWidth,
      height: CODEX_ATLAS.cellHeight,
      rows: frameRows
    },
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
