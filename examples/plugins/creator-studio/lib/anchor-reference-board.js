const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { sanitizeCreativeBrief } = require('./openpet-prompt-builder')

const BOARD_SIZE = 1024
const MAIN_PANEL_SIZE = 820
const MULTI_PANEL_PADDING = 64
const MULTI_PANEL_GAP = 24
const MULTI_PRIMARY_PANEL = Object.freeze({
  left: MULTI_PANEL_PADDING,
  top: MULTI_PANEL_PADDING,
  width: BOARD_SIZE - (MULTI_PANEL_PADDING * 2),
  height: 648
})
const MULTI_SECONDARY_TOP = 752
const MULTI_SECONDARY_HEIGHT = 208
const MAX_RENDERED_SOURCES = 5

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

const createSourceSummary = async (source, layout) => {
  const metadata = await sharp(source.path).metadata()
  return {
    fileName: source.fileName,
    relativePath: source.relativePath,
    role: source.role,
    width: Number(metadata.width) || 0,
    height: Number(metadata.height) || 0,
    layout
  }
}

const createSourceLayouts = (sourceCount) => {
  if (sourceCount <= 1) {
    return [{
      role: 'primary',
      rendered: true,
      left: Math.round((BOARD_SIZE - MAIN_PANEL_SIZE) / 2),
      top: 88,
      width: MAIN_PANEL_SIZE,
      height: MAIN_PANEL_SIZE
    }]
  }

  const renderedCount = Math.min(sourceCount, MAX_RENDERED_SOURCES)
  const secondaryCount = Math.max(0, renderedCount - 1)
  const secondaryPanelWidth = Math.floor(
    (MULTI_PRIMARY_PANEL.width - (MULTI_PANEL_GAP * Math.max(0, secondaryCount - 1))) / Math.max(1, secondaryCount)
  )
  const layouts = [{
    role: 'primary',
    rendered: true,
    ...MULTI_PRIMARY_PANEL
  }]
  for (let index = 0; index < secondaryCount; index += 1) {
    const left = MULTI_PANEL_PADDING + (index * (secondaryPanelWidth + MULTI_PANEL_GAP))
    const isLast = index === secondaryCount - 1
    layouts.push({
      role: 'secondary',
      rendered: true,
      left,
      top: MULTI_SECONDARY_TOP,
      width: isLast
        ? Math.max(1, BOARD_SIZE - MULTI_PANEL_PADDING - left)
        : secondaryPanelWidth,
      height: MULTI_SECONDARY_HEIGHT
    })
  }
  for (let index = renderedCount; index < sourceCount; index += 1) {
    layouts.push({
      role: 'secondary',
      rendered: false,
      left: 0,
      top: 0,
      width: 0,
      height: 0
    })
  }
  return layouts
}

const renderReferencePanel = async ({ sourcePath, layout }) => {
  const buffer = await sharp(sourcePath)
    .ensureAlpha()
    .resize({
      width: layout.width,
      height: layout.height,
      fit: 'inside',
      withoutEnlargement: false
    })
    .png()
    .toBuffer()
  const metadata = await sharp(buffer).metadata()
  return {
    input: buffer,
    left: layout.left + Math.round((layout.width - (Number(metadata.width) || layout.width)) / 2),
    top: layout.top + Math.round((layout.height - (Number(metadata.height) || layout.height)) / 2)
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
  const sourceLayouts = createSourceLayouts(sources.length)
  const renderedReferences = []
  for (const [index, source] of sources.entries()) {
    const layout = sourceLayouts[index]
    if (!layout?.rendered) continue
    renderedReferences.push(await renderReferencePanel({
      sourcePath: source.path,
      layout
    }))
  }
  await sharp({
    create: {
      width: BOARD_SIZE,
      height: BOARD_SIZE,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite(renderedReferences)
    .png()
    .toFile(boardPath)

  const metadata = {
    version: 1,
    role: 'composite-reference-board',
    sourcePriority: 'image-first',
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    sourceCount: sources.length,
    renderedSourceCount: renderedReferences.length,
    characterBrief: sanitizeCreativeBrief(characterBrief),
    sources: await Promise.all(sources.map((source, index) => createSourceSummary(source, sourceLayouts[index])))
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
    renderedSourceCount: renderedReferences.length,
    characterBrief: metadata.characterBrief
  }
}

module.exports = {
  buildAnchorReferenceBoard
}
