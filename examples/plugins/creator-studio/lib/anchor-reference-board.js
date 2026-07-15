const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { sanitizeCreativeBrief } = require('./openpet-prompt-builder')
const { removeOpaqueEdgeBackground } = require('./edge-background-cutout')
const { resolveGuidanceReasonCodes } = require('./pet-generation-human-examples')
const {
  createQualityProfileEvidence,
  getDefaultQualityProfile
} = require('./pet-generation-quality-profile')

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
const CONDITIONING_BOARD_PADDING = 64
const CONDITIONING_BOARD_GAP = 32
const CONDITIONING_MAIN_PANEL = Object.freeze({
  left: CONDITIONING_BOARD_PADDING,
  top: CONDITIONING_BOARD_PADDING,
  width: BOARD_SIZE - (CONDITIONING_BOARD_PADDING * 2),
  height: 608
})
const CONDITIONING_SECONDARY_PANEL_TOP = CONDITIONING_MAIN_PANEL.top + CONDITIONING_MAIN_PANEL.height + CONDITIONING_BOARD_GAP
const CONDITIONING_SECONDARY_PANEL_WIDTH = Math.floor(
  (CONDITIONING_MAIN_PANEL.width - CONDITIONING_BOARD_GAP) / 2
)
const CONDITIONING_SECONDARY_PANEL_HEIGHT = BOARD_SIZE - CONDITIONING_SECONDARY_PANEL_TOP - CONDITIONING_BOARD_PADDING
const CONDITIONING_PANEL_INNER_PADDING = 36

const normalizeText = (value) => String(value || '').trim()

const toSafeRelativePath = (value) => {
  const normalized = normalizeText(value).replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').includes('..')) return ''
  return normalized
}

const toSafeFileBaseName = (value, fallback = 'composite-reference-board') => {
  const normalized = normalizeText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/\.(?:png|json)$/i, '')
  return normalized || fallback
}

const assertInsideDirectory = ({ rootDir, targetPath, message }) => {
  const root = path.resolve(rootDir)
  const target = path.resolve(targetPath)
  const relative = path.relative(root, target)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return target
  throw new Error(message)
}

const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)

const normalizeSourceReference = ({ dataDir, entry = {}, index = 0 }) => {
  const sourcePath = path.resolve(normalizeText(entry.path))
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Anchor reference source image ${index + 1} does not exist`)
  }
  const rootPath = fs.realpathSync.native(path.resolve(dataDir))
  const realSourcePath = fs.realpathSync.native(sourcePath)
  const relativeToRoot = path.relative(rootPath, realSourcePath)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Anchor reference source image ${index + 1} must stay inside the Creator Studio data directory`)
  }
  if (!fs.statSync(realSourcePath).isFile()) {
    throw new Error(`Anchor reference source image ${index + 1} must be a file`)
  }
  return {
    path: realSourcePath,
    fileName: normalizeText(entry.fileName) || path.basename(realSourcePath) || `reference-${index + 1}.png`,
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

const colorDistance = (a, b) => Math.sqrt(
  ((a.r - b.r) ** 2) +
  ((a.g - b.g) ** 2) +
  ((a.b - b.b) ** 2)
)

const readPixel = ({ data, width, channels, x, y }) => {
  const index = ((y * width) + x) * channels
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
    alpha: data[index + 3]
  }
}

const sampleCornerBackground = ({ data, width, height, channels }) => {
  const samples = [
    readPixel({ data, width, channels, x: 0, y: 0 }),
    readPixel({ data, width, channels, x: width - 1, y: 0 }),
    readPixel({ data, width, channels, x: 0, y: height - 1 }),
    readPixel({ data, width, channels, x: width - 1, y: height - 1 })
  ]
  const totals = samples.reduce((accumulator, pixel) => ({
    r: accumulator.r + pixel.r,
    g: accumulator.g + pixel.g,
    b: accumulator.b + pixel.b,
    alpha: accumulator.alpha + pixel.alpha
  }), { r: 0, g: 0, b: 0, alpha: 0 })
  return {
    r: totals.r / samples.length,
    g: totals.g / samples.length,
    b: totals.b / samples.length,
    alpha: totals.alpha / samples.length
  }
}

const findForegroundBounds = async (sourcePath) => {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const width = Number(info.width) || 0
  const height = Number(info.height) || 0
  const channels = Number(info.channels) || 4
  if (width <= 0 || height <= 0 || channels < 4) return null
  const background = sampleCornerBackground({ data, width, height, channels })
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let foregroundPixels = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = readPixel({ data, width, channels, x, y })
      if (pixel.alpha <= 24) continue
      const alphaDelta = Math.abs(pixel.alpha - background.alpha)
      const differsFromBackground = background.alpha < 24
        ? pixel.alpha > 24
        : alphaDelta > 36 || colorDistance(pixel, background) > 28
      if (!differsFromBackground) continue
      foregroundPixels += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (foregroundPixels <= 0) return null
  const boundsWidth = maxX - minX + 1
  const boundsHeight = maxY - minY + 1
  const coverage = (boundsWidth * boundsHeight) / (width * height)
  if (coverage > 0.96) return null
  const padding = Math.ceil(Math.min(width, height) * 0.02)
  const left = Math.max(0, minX - padding)
  const top = Math.max(0, minY - padding)
  const right = Math.min(width - 1, maxX + padding)
  const bottom = Math.min(height - 1, maxY + padding)
  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1
  }
}

const createForegroundTrimmedBuffer = async (sourcePath) => {
  const bounds = await findForegroundBounds(sourcePath)
  const image = sharp(sourcePath).ensureAlpha()
  if (!bounds) return image.png().toBuffer()
  return image.extract(bounds).png().toBuffer()
}

const renderReferenceInputPanel = async ({ input, layout, anchor = 'center' }) => {
  const buffer = await sharp(input)
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
    top: anchor === 'lower-center'
      ? layout.top + Math.max(0, layout.height - (Number(metadata.height) || layout.height))
      : layout.top + Math.round((layout.height - (Number(metadata.height) || layout.height)) / 2)
  }
}

const renderReferencePanel = async ({ sourcePath, layout }) => renderReferenceInputPanel({
  input: sourcePath,
  layout
})

const getConditioningBoardLayouts = () => ([
  {
    panelRole: 'user-source-main-view',
    left: CONDITIONING_MAIN_PANEL.left,
    top: CONDITIONING_MAIN_PANEL.top,
    width: CONDITIONING_MAIN_PANEL.width,
    height: CONDITIONING_MAIN_PANEL.height
  },
  {
    panelRole: 'normalized-start-keyframe',
    left: CONDITIONING_BOARD_PADDING,
    top: CONDITIONING_SECONDARY_PANEL_TOP,
    width: CONDITIONING_SECONDARY_PANEL_WIDTH,
    height: CONDITIONING_SECONDARY_PANEL_HEIGHT
  },
  {
    panelRole: 'normalized-peak-keyframe',
    left: CONDITIONING_BOARD_PADDING + CONDITIONING_SECONDARY_PANEL_WIDTH + CONDITIONING_BOARD_GAP,
    top: CONDITIONING_SECONDARY_PANEL_TOP,
    width: BOARD_SIZE - CONDITIONING_BOARD_PADDING - (
      CONDITIONING_BOARD_PADDING + CONDITIONING_SECONDARY_PANEL_WIDTH + CONDITIONING_BOARD_GAP
    ),
    height: CONDITIONING_SECONDARY_PANEL_HEIGHT
  }
])

const findConditioningSourceByRole = (sources, pattern) => (
  Array.isArray(sources)
    ? sources.find((source) => pattern.test(String(source?.role || '')))
    : null
)

const assertConditioningBoardSources = (sources = []) => {
  const identitySource = findConditioningSourceByRole(sources, /^(canonical-reference|source-identity-reference|source-identity|full-pet-action-identity-board)$/i) ||
    findConditioningSourceByRole(sources, /canonical|source-identity/i)
  const startSource = findConditioningSourceByRole(sources, /action-start-keyframe/i)
  const peakSource = findConditioningSourceByRole(sources, /action-peak-keyframe/i)
  if (!identitySource || !startSource || !peakSource) {
    throw new Error('Action sprite conditioning board requires canonical-reference, action-start-keyframe, and action-peak-keyframe sources')
  }
  return { identitySource, startSource, peakSource }
}

const createConditioningPanelInput = async (sourcePath) => {
  const cutout = await removeOpaqueEdgeBackground(sourcePath)
  return createForegroundTrimmedBuffer(cutout?.buffer || sourcePath)
}

const renderConditioningPanel = async ({ sourcePath, layout }) => {
  const input = await createConditioningPanelInput(sourcePath)
  return renderReferenceInputPanel({
    input,
    layout: {
      ...layout,
      left: layout.left + CONDITIONING_PANEL_INNER_PADDING,
      top: layout.top + CONDITIONING_PANEL_INNER_PADDING,
      width: Math.max(1, layout.width - (CONDITIONING_PANEL_INNER_PADDING * 2)),
      height: Math.max(1, layout.height - (CONDITIONING_PANEL_INNER_PADDING * 2))
    },
    anchor: 'lower-center'
  })
}

const buildAnchorReferenceBoard = async ({
  dataDir,
  runId,
  sourceReferences = [],
  characterBrief = '',
  outputRelativeDir = '',
  boardRole = 'composite-reference-board',
  fileBaseName = 'composite-reference-board',
  qualityProfile = getDefaultQualityProfile(),
  qualityGuidance = null,
  actionId = ''
}) => {
  if (!dataDir) throw new Error('Anchor reference board dataDir is required')
  const normalizedRunId = normalizeText(runId)
  if (!normalizedRunId) throw new Error('Anchor reference board runId is required')
  const sources = Array.isArray(sourceReferences)
    ? sourceReferences.map((entry, index) => normalizeSourceReference({ dataDir, entry, index }))
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

  const safeFileBaseName = toSafeFileBaseName(fileBaseName)
  const normalizedBoardRole = normalizeText(boardRole) || 'composite-reference-board'
  const boardFileName = `${safeFileBaseName}.png`
  const metadataFileName = `${safeFileBaseName}.json`
  const boardPath = path.join(outputDir, boardFileName)
  const metadataPath = path.join(outputDir, metadataFileName)
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
    version: 2,
    role: normalizedBoardRole,
    sourcePriority: 'image-first',
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    sourceCount: sources.length,
    renderedSourceCount: renderedReferences.length,
    characterBrief: sanitizeCreativeBrief(characterBrief),
    qualityProfile: createQualityProfileEvidence(qualityProfile),
    guidanceReasonCodes: resolveGuidanceReasonCodes({ qualityGuidance, actionId }),
    panelAuthority: 'identity-primary-pose-guidance-secondary',
    sources: await Promise.all(sources.map((source, index) => createSourceSummary(source, sourceLayouts[index])))
  }
  writeJson(metadataPath, metadata)

  return {
    role: normalizedBoardRole,
    path: boardPath,
    relativePath: path.join(relativeDir, boardFileName).replace(/\\/g, '/'),
    metadataPath,
    metadataRelativePath: path.join(relativeDir, metadataFileName).replace(/\\/g, '/'),
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    sourceCount: sources.length,
    renderedSourceCount: renderedReferences.length,
    characterBrief: metadata.characterBrief
  }
}

const buildActionSpriteReferenceBoard = async ({
  dataDir,
  runId,
  sourceReferences = [],
  action = {},
  characterBrief = '',
  outputRelativeDir = '',
  boardRole = 'keyframe-action-reference-board',
  fileBaseName = 'action-row-reference-board',
  qualityProfile = getDefaultQualityProfile(),
  qualityGuidance = null
}) => {
  if (!dataDir) throw new Error('Anchor reference board dataDir is required')
  const normalizedRunId = normalizeText(runId)
  if (!normalizedRunId) throw new Error('Anchor reference board runId is required')
  const sources = Array.isArray(sourceReferences)
    ? sourceReferences.map((entry, index) => normalizeSourceReference({ dataDir, entry, index }))
    : []
  if (sources.length === 0) throw new Error('Anchor reference board requires at least one source image')

  const requestedOutputRelativeDir = normalizeText(outputRelativeDir)
  const relativeDir = requestedOutputRelativeDir
    ? toSafeRelativePath(requestedOutputRelativeDir)
    : path.join('runs', normalizedRunId, 'inputs', 'keyframes', 'actions').replace(/\\/g, '/')
  if (!relativeDir) {
    throw new Error('Anchor reference board output path escaped the Creator Studio data directory')
  }
  const outputDir = assertInsideDirectory({
    rootDir: dataDir,
    targetPath: path.join(dataDir, relativeDir),
    message: 'Anchor reference board output path escaped the Creator Studio data directory'
  })
  fs.mkdirSync(outputDir, { recursive: true })

  const safeFileBaseName = toSafeFileBaseName(fileBaseName, 'action-row-reference-board')
  const normalizedBoardRole = normalizeText(boardRole) || 'keyframe-action-reference-board'
  const boardFileName = `${safeFileBaseName}.png`
  const metadataFileName = `${safeFileBaseName}.json`
  const boardPath = path.join(outputDir, boardFileName)
  const metadataPath = path.join(outputDir, metadataFileName)
  const { identitySource, startSource, peakSource } = assertConditioningBoardSources(sources)
  const panelLayouts = getConditioningBoardLayouts()
  const panels = [{
    source: identitySource,
    layout: panelLayouts[0]
  }, {
    source: startSource,
    layout: panelLayouts[1]
  }, {
    source: peakSource,
    layout: panelLayouts[2]
  }]
  const renderedPanels = []
  for (const panel of panels) {
    renderedPanels.push(await renderConditioningPanel({
      sourcePath: panel.source.path,
      layout: panel.layout
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
    .composite(renderedPanels)
    .png()
    .toFile(boardPath)

  const metadata = {
    version: 2,
    role: normalizedBoardRole,
    layoutMode: 'single-conditioning-board',
    sourcePriority: 'image-first',
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    sourceCount: sources.length,
    renderedSourceCount: renderedPanels.length,
    actionId: normalizeText(action?.actionId),
    characterBrief: sanitizeCreativeBrief(characterBrief),
    qualityProfile: createQualityProfileEvidence(qualityProfile),
    guidanceReasonCodes: resolveGuidanceReasonCodes({
      qualityGuidance,
      actionId: normalizeText(action?.actionId)
    }),
    panelAuthority: 'identity-primary-pose-guidance-secondary',
    sources: await Promise.all(sources.map((source, index) => createSourceSummary(source, {
      role: 'reference-source',
      rendered: panels.some((panel) => panel.source.path === source.path),
      sourceIndex: index
    }))),
    panels: panels.map((panel) => ({
      panelRole: panel.layout.panelRole,
      sourceRole: panel.source.role,
      sourceFileName: panel.source.fileName,
      sourceRelativePath: panel.source.relativePath,
      layout: {
        left: panel.layout.left,
        top: panel.layout.top,
        width: panel.layout.width,
        height: panel.layout.height
      }
    }))
  }
  writeJson(metadataPath, metadata)

  return {
    role: normalizedBoardRole,
    path: boardPath,
    relativePath: path.join(relativeDir, boardFileName).replace(/\\/g, '/'),
    metadataPath,
    metadataRelativePath: path.join(relativeDir, metadataFileName).replace(/\\/g, '/'),
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    sourceCount: sources.length,
    renderedSourceCount: renderedPanels.length,
    characterBrief: metadata.characterBrief
  }
}

module.exports = {
  buildActionSpriteReferenceBoard,
  buildAnchorReferenceBoard
}
