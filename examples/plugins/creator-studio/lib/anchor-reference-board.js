const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { sanitizeCreativeBrief } = require('./openpet-prompt-builder')

const BOARD_SIZE = 1024
const MAIN_PANEL_SIZE = 820

const normalizeText = (value) => String(value || '').trim()

const toSafeRelativePath = (value) => {
  const normalized = normalizeText(value).replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').includes('..')) return ''
  return normalized
}

const assertInsideDirectory = ({ rootDir, targetPath, message }) => {
  const root = path.resolve(rootDir)
  const target = path.resolve(targetPath)
  const relative = path.relative(root, target)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return target
  throw new Error(message)
}

const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)

const normalizeSourceReference = (entry = {}, index = 0) => {
  const sourcePath = path.resolve(normalizeText(entry.path))
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Anchor reference source image ${index + 1} does not exist`)
  }
  if (!fs.statSync(sourcePath).isFile()) {
    throw new Error(`Anchor reference source image ${index + 1} must be a file`)
  }
  return {
    path: sourcePath,
    fileName: normalizeText(entry.fileName) || path.basename(sourcePath) || `reference-${index + 1}.png`,
    relativePath: toSafeRelativePath(entry.relativePath),
    role: normalizeText(entry.role) || 'reference-image'
  }
}

const createSourceSummary = async (source) => {
  const metadata = await sharp(source.path).metadata()
  return {
    fileName: source.fileName,
    relativePath: source.relativePath,
    role: source.role,
    width: Number(metadata.width) || 0,
    height: Number(metadata.height) || 0
  }
}

const renderMainReference = async (sourcePath) => {
  const buffer = await sharp(sourcePath)
    .ensureAlpha()
    .resize({
      width: MAIN_PANEL_SIZE,
      height: MAIN_PANEL_SIZE,
      fit: 'inside',
      withoutEnlargement: false
    })
    .png()
    .toBuffer()
  const metadata = await sharp(buffer).metadata()
  return {
    input: buffer,
    left: Math.round((BOARD_SIZE - (Number(metadata.width) || MAIN_PANEL_SIZE)) / 2),
    top: 88 + Math.round((MAIN_PANEL_SIZE - (Number(metadata.height) || MAIN_PANEL_SIZE)) / 2)
  }
}

const buildAnchorReferenceBoard = async ({
  dataDir,
  runId,
  sourceReferences = [],
  characterBrief = '',
  outputRelativeDir = ''
}) => {
  if (!dataDir) throw new Error('Anchor reference board dataDir is required')
  const normalizedRunId = normalizeText(runId)
  if (!normalizedRunId) throw new Error('Anchor reference board runId is required')
  const sources = Array.isArray(sourceReferences)
    ? sourceReferences.map(normalizeSourceReference)
    : []
  if (sources.length === 0) throw new Error('Anchor reference board requires at least one source image')

  const requestedOutputRelativeDir = normalizeText(outputRelativeDir)
  const relativeDir = requestedOutputRelativeDir
    ? toSafeRelativePath(requestedOutputRelativeDir)
    : path.join('runs', normalizedRunId, 'inputs', 'anchors').replace(/\\/g, '/')
  if (!relativeDir) {
    throw new Error('Anchor reference board output path escaped the Creator Studio data directory')
  }
  const outputDir = assertInsideDirectory({
    rootDir: dataDir,
    targetPath: path.join(dataDir, relativeDir),
    message: 'Anchor reference board output path escaped the Creator Studio data directory'
  })
  fs.mkdirSync(outputDir, { recursive: true })

  const boardPath = path.join(outputDir, 'composite-reference-board.png')
  const metadataPath = path.join(outputDir, 'composite-reference-board.json')
  const mainReference = await renderMainReference(sources[0].path)
  await sharp({
    create: {
      width: BOARD_SIZE,
      height: BOARD_SIZE,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([mainReference])
    .png()
    .toFile(boardPath)

  const metadata = {
    version: 1,
    role: 'composite-reference-board',
    sourcePriority: 'image-first',
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    sourceCount: sources.length,
    characterBrief: sanitizeCreativeBrief(characterBrief),
    sources: await Promise.all(sources.map(createSourceSummary))
  }
  writeJson(metadataPath, metadata)

  return {
    role: 'composite-reference-board',
    path: boardPath,
    relativePath: path.join(relativeDir, 'composite-reference-board.png').replace(/\\/g, '/'),
    metadataPath,
    metadataRelativePath: path.join(relativeDir, 'composite-reference-board.json').replace(/\\/g, '/'),
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    sourceCount: sources.length,
    characterBrief: metadata.characterBrief
  }
}

module.exports = {
  buildAnchorReferenceBoard
}
