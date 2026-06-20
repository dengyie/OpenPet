const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const CODEX_ATLAS = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  width: 1536,
  height: 1872
}
const CODEX_ROWS = [
  { id: 'idle', row: 0, durations: [280, 110, 110, 140, 140, 320] },
  { id: 'running-right', row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  { id: 'running-left', row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  { id: 'waving', row: 3, durations: [140, 140, 140, 280] },
  { id: 'jumping', row: 4, durations: [140, 140, 140, 140, 280] },
  { id: 'failed', row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  { id: 'waiting', row: 6, durations: [150, 150, 150, 150, 150, 260] },
  { id: 'running', row: 7, durations: [120, 120, 120, 120, 120, 220] },
  { id: 'review', row: 8, durations: [150, 150, 150, 150, 150, 280] }
]

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
  const size = fs.statSync(sourcePath).size
  if (size > MAX_SOURCE_BYTES) {
    throw new Error('Generated image is too large to process')
  }
  return { sourcePath, sourceRelativePath, size }
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

const createNormalizedCellBuffer = async (sourcePath) => {
  const maxWidth = Math.floor(CODEX_ATLAS.cellWidth * 0.82)
  const maxHeight = Math.floor(CODEX_ATLAS.cellHeight * 0.82)
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
  const left = Math.max(0, Math.floor((CODEX_ATLAS.cellWidth - resizedMetadata.width) / 2))
  const top = Math.max(0, Math.floor((CODEX_ATLAS.cellHeight - resizedMetadata.height) * 0.58))

  return sharp({
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
}

const createCellComposites = (cellBuffer) => {
  const composites = []
  for (const row of CODEX_ROWS) {
    for (let column = 0; column < row.durations.length; column += 1) {
      composites.push({
        input: cellBuffer,
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

const buildRealAtlasFromGeneratedImage = async ({ dataDir, generationResult, outputDir, qaDir }) => {
  const { sourcePath, sourceRelativePath, size } = resolveGeneratedImagePath({ dataDir, generationResult })
  const sourceValidation = await inspectVisiblePixels(sourcePath)

  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })

  const spritesheetPath = path.join(outputDir, 'spritesheet.webp')
  const cellBuffer = await createNormalizedCellBuffer(sourcePath)
  await sharp({
    create: {
      width: CODEX_ATLAS.width,
      height: CODEX_ATLAS.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(createCellComposites(cellBuffer))
    .webp({ lossless: true })
    .toFile(spritesheetPath)

  const atlasVisiblePixels = await countVisiblePixels(spritesheetPath)
  const sourceQaPath = path.join(qaDir, 'source-image-validation.json')
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
    warnings: []
  })
  writeJson(atlasQaPath, {
    ok: true,
    width: CODEX_ATLAS.width,
    height: CODEX_ATLAS.height,
    visiblePixels: atlasVisiblePixels,
    sourceRelativePath,
    frame: {
      width: CODEX_ATLAS.cellWidth,
      height: CODEX_ATLAS.cellHeight,
      rows: CODEX_ROWS.map((row) => ({
        id: row.id,
        row: row.row,
        frameCount: row.durations.length
      }))
    },
    warnings: []
  })

  return {
    spritesheetPath,
    sourceQaPath,
    atlasQaPath,
    sourceRelativePath,
    visiblePixels: atlasVisiblePixels
  }
}

module.exports = {
  buildRealAtlasFromGeneratedImage,
  resolveGeneratedImagePath
}
