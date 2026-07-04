const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { pathToFileURL } = require('url')

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/
const ALLOWED_TARGET_TYPES = new Set(['editable-action-host', 'pet-pack'])

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

    const metadata = await sharp(resolvedSourcePath).metadata()
    const width = Number(metadata.width) || 0
    const height = Number(metadata.height) || 0
    if (width <= 0 || height <= 0) {
      throw new Error('Creator reference image dimensions are invalid')
    }

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
    copyReferenceIntoRun
  }
}

module.exports = {
  createCreatorReferenceService
}
