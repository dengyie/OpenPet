const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { pathToFileURL } = require('url')

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/
const ALLOWED_TARGET_TYPES = new Set(['editable-action-host', 'pet-pack'])
const DEFAULT_PATH_MIN_ASPECT_RATIO = 0.5
const DEFAULT_PATH_MAX_ASPECT_RATIO = 1.9
const UNSUPPORTED_DEFAULT_PATH_REFERENCE_CODE = 'unsupported_multi_view_reference'
const UNSUPPORTED_DEFAULT_PATH_REFERENCE_MESSAGE = '默认一键生成暂只支持单张干净正面图，请改用一张清晰的正面图，不要使用拼图、三视图或多视图合成图。'

const normalizeTargetType = (value) => {
  const normalized = String(value || '').trim()
  if (!ALLOWED_TARGET_TYPES.has(normalized)) {
    throw new Error(`Creator reference target type is invalid: ${normalized || 'unknown'}`)
  }
  return normalized
}

const normalizeTargetId = (value) => {
  const normalized = String(value || '').trim()
  if (!SAFE_ID_PATTERN.test(normalized)) {
    throw new Error('Creator reference target id is invalid')
  }
  return normalized
}

const createReferenceKey = ({ targetType, targetId }) => `${targetType}:${targetId}`

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const sanitizeFileSegment = (value) => String(value || '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-|-$/g, '')

const createSafeFileName = (value, fallback = 'reference.png') => {
  const normalized = String(value || '').trim()
  const candidate = normalized || fallback
  const extension = path.extname(candidate) || path.extname(fallback)
  const baseName = extension ? candidate.slice(0, -extension.length) : candidate
  const fallbackExtension = path.extname(fallback)
  const fallbackBaseName = fallbackExtension ? fallback.slice(0, -fallbackExtension.length) : fallback
  const safeBaseName = sanitizeFileSegment(baseName) || sanitizeFileSegment(fallbackBaseName) || 'reference'
  const safeExtension = sanitizeFileSegment(extension.replace(/^\./, ''))
  return safeExtension ? `${safeBaseName}.${safeExtension}` : safeBaseName
}

const readSettingsReferences = (settingsService) => {
  const settings = settingsService.get()
  const references = settings.creator?.references
  return references && typeof references === 'object' && !Array.isArray(references)
    ? references
    : {}
}

const saveSettingsReferences = (settingsService, references) => {
  const settings = settingsService.get()
  settingsService.save({
    ...settings,
    creator: {
      ...(settings.creator || {}),
      references
    }
  })
}

const createView = (record) => {
  if (!record) return null
  return {
    targetType: record.targetType,
    targetId: record.targetId,
    assetPath: record.assetPath,
    assetUrl: pathToFileURL(record.assetPath).toString(),
    fileName: record.fileName,
    width: Number(record.width) || 0,
    height: Number(record.height) || 0,
    contentHash: record.contentHash || '',
    createdAt: record.createdAt || '',
    updatedAt: record.updatedAt || ''
  }
}

const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)

const isBlankLikePixel = ({ data, offset }) => {
  const alpha = data[offset + 3]
  if (alpha <= 8) return true
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  return red >= 245 && green >= 245 && blue >= 245 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 10
}

const countNonBlankPixels = ({ data, info, left, top, width, height }) => {
  let count = 0
  const xEnd = Math.min(info.width, left + width)
  const yEnd = Math.min(info.height, top + height)
  for (let y = Math.max(0, top); y < yEnd; y += 1) {
    for (let x = Math.max(0, left); x < xEnd; x += 1) {
      const offset = (y * info.width + x) * info.channels
      if (!isBlankLikePixel({ data, offset })) count += 1
    }
  }
  return count
}

const hasContentOnBothSides = ({ data, info, orientation, index }) => {
  if (orientation === 'vertical') {
    const leftWidth = Math.max(1, index - 2)
    const rightLeft = Math.min(info.width - 1, index + 3)
    const rightWidth = Math.max(1, info.width - rightLeft)
    const leftPixels = leftWidth * info.height
    const rightPixels = rightWidth * info.height
    return (
      countNonBlankPixels({ data, info, left: 0, top: 0, width: leftWidth, height: info.height }) / leftPixels > 0.08 &&
      countNonBlankPixels({ data, info, left: rightLeft, top: 0, width: rightWidth, height: info.height }) / rightPixels > 0.08
    )
  }
  const topHeight = Math.max(1, index - 2)
  const bottomTop = Math.min(info.height - 1, index + 3)
  const bottomHeight = Math.max(1, info.height - bottomTop)
  const topPixels = info.width * topHeight
  const bottomPixels = info.width * bottomHeight
  return (
    countNonBlankPixels({ data, info, left: 0, top: 0, width: info.width, height: topHeight }) / topPixels > 0.08 &&
    countNonBlankPixels({ data, info, left: 0, top: bottomTop, width: info.width, height: bottomHeight }) / bottomPixels > 0.08
  )
}

const hasCentralBlankSeparator = ({ data, info, orientation }) => {
  const length = orientation === 'vertical' ? info.width : info.height
  const span = orientation === 'vertical' ? info.height : info.width
  const minIndex = Math.floor(length * 0.28)
  const maxIndex = Math.ceil(length * 0.72)
  let runLength = 0
  let runStart = 0
  for (let index = 0; index < length; index += 1) {
    let blankPixels = 0
    for (let cross = 0; cross < span; cross += 1) {
      const x = orientation === 'vertical' ? index : cross
      const y = orientation === 'vertical' ? cross : index
      const offset = (y * info.width + x) * info.channels
      if (isBlankLikePixel({ data, offset })) blankPixels += 1
    }
    const blankRatio = blankPixels / span
    const inCentralBand = index >= minIndex && index <= maxIndex
    if (blankRatio >= 0.92 && inCentralBand) {
      if (runLength === 0) runStart = index
      runLength += 1
      continue
    }
    if (runLength >= 3) {
      const center = Math.floor(runStart + runLength / 2)
      return hasContentOnBothSides({ data, info, orientation, index: center })
    }
    runLength = 0
  }
  if (runLength >= 3) {
    const center = Math.floor(runStart + runLength / 2)
    return hasContentOnBothSides({ data, info, orientation, index: center })
  }
  return false
}

const inspectLikelyGridCollage = async (sourcePath) => {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .resize({
      width: 192,
      height: 192,
      fit: 'inside',
      withoutEnlargement: true
    })
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (!info.width || !info.height) return false
  return (
    hasCentralBlankSeparator({ data, info, orientation: 'vertical' }) &&
    hasCentralBlankSeparator({ data, info, orientation: 'horizontal' })
  )
}

const createDefaultPathReferenceInspection = ({ fileName, width, height, likelyGridCollage = false }) => {
  const normalizedWidth = Number(width) || 0
  const normalizedHeight = Number(height) || 0
  const aspectRatio = normalizedWidth > 0 && normalizedHeight > 0
    ? Number((normalizedWidth / normalizedHeight).toFixed(4))
    : 0
  const likelyMultiView = aspectRatio >= DEFAULT_PATH_MAX_ASPECT_RATIO ||
    aspectRatio <= DEFAULT_PATH_MIN_ASPECT_RATIO ||
    Boolean(likelyGridCollage)
  return {
    fileName: String(fileName || '').trim(),
    width: normalizedWidth,
    height: normalizedHeight,
    aspectRatio,
    likelyMultiView,
    likelyGridCollage: Boolean(likelyGridCollage),
    defaultPathEligible: !likelyMultiView,
    code: likelyMultiView ? UNSUPPORTED_DEFAULT_PATH_REFERENCE_CODE : '',
    message: likelyMultiView ? UNSUPPORTED_DEFAULT_PATH_REFERENCE_MESSAGE : ''
  }
}

const createCreatorReferenceService = ({
  settingsService,
  referenceRoot,
  now = () => new Date().toISOString()
}) => {
  if (!settingsService?.get || !settingsService?.save) {
    throw new Error('settingsService is required for creator references')
  }
  if (!referenceRoot) {
    throw new Error('referenceRoot is required for creator references')
  }

  const approvedReferenceTokens = new Map()

  const normalizeSourcePath = (value) => {
    const normalized = String(value || '').trim()
    return normalized ? path.resolve(normalized) : ''
  }

  const normalizeReferenceToken = (value) => String(value || '').trim()

  const approveSourcePath = (sourcePath) => {
    const resolvedSourcePath = normalizeSourcePath(sourcePath)
    if (!resolvedSourcePath) {
      throw new Error('Creator reference source image is required')
    }
    const referenceToken = crypto.randomUUID()
    approvedReferenceTokens.set(referenceToken, resolvedSourcePath)
    return {
      referenceToken,
      fileName: path.basename(resolvedSourcePath)
    }
  }

  const inspectSourceImage = async (sourcePath, fileName = '') => {
    const resolvedSourcePath = normalizeSourcePath(sourcePath)
    if (!resolvedSourcePath || !fs.existsSync(resolvedSourcePath)) {
      throw new Error('Creator reference source image does not exist')
    }
    const stat = fs.statSync(resolvedSourcePath)
    if (!stat.isFile()) throw new Error('Creator reference source image must be a file')
    const metadata = await sharp(resolvedSourcePath).metadata()
    const width = Number(metadata.width) || 0
    const height = Number(metadata.height) || 0
    if (width <= 0 || height <= 0) {
      throw new Error('Creator reference image dimensions are invalid')
    }
    const likelyGridCollage = await inspectLikelyGridCollage(resolvedSourcePath)
    return createDefaultPathReferenceInspection({
      fileName: fileName || path.basename(resolvedSourcePath),
      width,
      height,
      likelyGridCollage
    })
  }

  const getReferenceRecord = ({ targetType, targetId }) => {
    const normalizedTargetType = normalizeTargetType(targetType)
    const normalizedTargetId = normalizeTargetId(targetId)
    const references = readSettingsReferences(settingsService)
    const key = createReferenceKey({ targetType: normalizedTargetType, targetId: normalizedTargetId })
    const record = references[key]
    if (!record?.assetPath || !fs.existsSync(record.assetPath)) return null
    return {
      ...record,
      targetType: normalizedTargetType,
      targetId: normalizedTargetId
    }
  }

  const getReference = (target) => createView(getReferenceRecord(target))

  const consumeApprovedSourcePath = (referenceToken) => {
    const normalizedReferenceToken = normalizeReferenceToken(referenceToken)
    if (!normalizedReferenceToken) {
      throw new Error('Creator reference source image was not approved by the main picker')
    }
    const resolvedSourcePath = approvedReferenceTokens.get(normalizedReferenceToken) || ''
    approvedReferenceTokens.delete(normalizedReferenceToken)
    if (!resolvedSourcePath) {
      throw new Error('Creator reference source image was not approved by the main picker')
    }
    return resolvedSourcePath
  }

  const bindReference = async ({ targetType, targetId, referenceToken }) => {
    const normalizedTargetType = normalizeTargetType(targetType)
    const normalizedTargetId = normalizeTargetId(targetId)
    const resolvedSourcePath = consumeApprovedSourcePath(referenceToken)
    if (!resolvedSourcePath || !fs.existsSync(resolvedSourcePath)) {
      throw new Error('Creator reference source image does not exist')
    }
    const stat = fs.statSync(resolvedSourcePath)
    if (!stat.isFile()) throw new Error('Creator reference source image must be a file')

    const inspection = await inspectSourceImage(resolvedSourcePath, path.basename(resolvedSourcePath))
    const width = inspection.width
    const height = inspection.height

    const previous = getReferenceRecord({ targetType: normalizedTargetType, targetId: normalizedTargetId })
    const timestamp = now()
    const extension = path.extname(resolvedSourcePath).toLowerCase() || '.png'
    const fileName = createSafeFileName(path.basename(resolvedSourcePath), `reference${extension}`)
    const targetDir = path.join(referenceRoot, normalizedTargetType, normalizedTargetId)
    ensureDirectory(targetDir)
    const assetPath = path.join(targetDir, fileName)
    fs.copyFileSync(resolvedSourcePath, assetPath)
    const contentHash = crypto.createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex')
    const record = {
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      assetPath,
      fileName,
      width,
      height,
      contentHash,
      createdAt: previous?.createdAt || timestamp,
      updatedAt: timestamp
    }

    const references = readSettingsReferences(settingsService)
    references[createReferenceKey({ targetType: normalizedTargetType, targetId: normalizedTargetId })] = record
    saveSettingsReferences(settingsService, references)
    writeJson(path.join(targetDir, 'reference.json'), record)
    if (previous?.assetPath && previous.assetPath !== assetPath && fs.existsSync(previous.assetPath)) {
      fs.rmSync(previous.assetPath, { force: true })
    }

    return {
      replaced: Boolean(previous),
      reference: createView(record)
    }
  }

  const inspectApprovedSource = async ({ referenceToken }) => {
    const normalizedReferenceToken = normalizeReferenceToken(referenceToken)
    if (!normalizedReferenceToken) {
      throw new Error('Creator reference source image was not approved by the main picker')
    }
    const resolvedSourcePath = approvedReferenceTokens.get(normalizedReferenceToken) || ''
    if (!resolvedSourcePath) {
      throw new Error('Creator reference source image was not approved by the main picker')
    }
    return inspectSourceImage(resolvedSourcePath, path.basename(resolvedSourcePath))
  }

  const inspectReference = async ({ targetType, targetId }) => {
    const record = getReferenceRecord({ targetType, targetId })
    if (!record) return null
    return inspectSourceImage(record.assetPath, record.fileName)
  }

  const copyReferenceIntoRun = ({ targetType, targetId, pluginDataDir, runId }) => {
    const record = getReferenceRecord({ targetType, targetId })
    if (!record) {
      throw new Error(`Creator reference is not bound for ${targetType}:${targetId}`)
    }
    const normalizedRunId = normalizeTargetId(runId)
    const runDir = path.join(path.resolve(pluginDataDir), 'runs', normalizedRunId)
    const referencesDir = path.join(runDir, 'inputs', 'references')
    ensureDirectory(referencesDir)
    const extension = path.extname(record.assetPath) || '.png'
    const fileName = `canonical-reference${extension}`
    const copiedAssetPath = path.join(referencesDir, fileName)
    fs.copyFileSync(record.assetPath, copiedAssetPath)
    const metadataPath = path.join(referencesDir, 'reference.json')
    const referenceMetadata = {
      targetType: record.targetType,
      targetId: record.targetId,
      fileName: record.fileName,
      width: record.width,
      height: record.height,
      contentHash: record.contentHash,
      copiedFileName: fileName,
      copiedAt: now()
    }
    writeJson(metadataPath, referenceMetadata)

    const runPath = path.join(runDir, 'run.json')
    if (fs.existsSync(runPath)) {
      const run = JSON.parse(fs.readFileSync(runPath, 'utf-8'))
      writeJson(runPath, {
        ...run,
        input: {
          ...(run.input || {}),
          referenceImage: {
            targetType: record.targetType,
            targetId: record.targetId,
            fileName,
            originalFileName: record.fileName,
            width: record.width,
            height: record.height,
            contentHash: record.contentHash,
            relativePath: path.join('runs', normalizedRunId, 'inputs', 'references', fileName).replace(/\\/g, '/'),
            metadataRelativePath: path.join('runs', normalizedRunId, 'inputs', 'references', 'reference.json').replace(/\\/g, '/')
          }
        }
      })
    }

    return {
      fileName,
      assetPath: copiedAssetPath,
      metadataPath,
      relativePath: path.join('runs', normalizedRunId, 'inputs', 'references', fileName).replace(/\\/g, '/'),
      metadataRelativePath: path.join('runs', normalizedRunId, 'inputs', 'references', 'reference.json').replace(/\\/g, '/'),
      reference: createView(record)
    }
  }

  return {
    approveSourcePath,
    getReference,
    bindReference,
    copyReferenceIntoRun,
    inspectApprovedSource,
    inspectReference
  }
}

module.exports = {
  UNSUPPORTED_DEFAULT_PATH_REFERENCE_CODE,
  UNSUPPORTED_DEFAULT_PATH_REFERENCE_MESSAGE,
  createCreatorReferenceService
}
