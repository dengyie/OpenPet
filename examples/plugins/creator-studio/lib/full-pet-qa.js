const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {
  OFFICIAL_FULL_PET_ACTION_IDS,
  getMissingRequiredRealActionIds
} = require('./full-pet-basic-actions')

const assertExistingPathInsideDataDir = ({ dataDir, targetPath, label }) => {
  if (!targetPath) throw new Error(`${label} must stay inside the Creator Studio data directory`)
  const root = path.resolve(String(dataDir || ''))
  const target = path.resolve(String(targetPath))
  const relative = path.relative(root, target)
  if (!root || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  if (!fs.existsSync(target)) throw new Error(`${label} is missing`)
  const realRoot = fs.realpathSync.native(root)
  const realTarget = fs.realpathSync.native(target)
  const realRelative = path.relative(realRoot, realTarget)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  return target
}

const readQaJson = (qaPath, operation) => {
  try {
    return JSON.parse(fs.readFileSync(qaPath, 'utf-8'))
  } catch (_) {
    throw new Error(`Full-pet QA must be valid JSON before ${operation}`)
  }
}

const sha256File = (filePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex')

const assertPositiveInteger = ({ value, label, operation }) => {
  if (!Number.isInteger(Number(value)) || Number(value) < 1) {
    throw new Error(`Full-pet QA ${label} must be valid before ${operation}`)
  }
}

const normalizeQaRelativePath = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\\/g, '/')
}

const getMissingRequiredBasicActions = (basicActions) => {
  if (!basicActions || typeof basicActions !== 'object' || Array.isArray(basicActions)) return []
  return getMissingRequiredRealActionIds(basicActions)
}

const createUniqueActionIdList = (values) => {
  const seen = new Set()
  const actionIds = []
  for (const value of Array.isArray(values) ? values : []) {
    const actionId = String(value || '').trim()
    if (!actionId || seen.has(actionId)) continue
    seen.add(actionId)
    actionIds.push(actionId)
  }
  return actionIds
}

const hasOfficialActionPolicy = (basicActions) => Boolean(
  basicActions &&
  typeof basicActions === 'object' &&
  !Array.isArray(basicActions) &&
  (
    Array.isArray(basicActions.requiredOfficialActionIds) ||
    Array.isArray(basicActions.missingRequiredOfficialActionIds) ||
    Array.isArray(basicActions.previewFallbackActionIds)
  )
)

const getMissingRequiredOfficialActionIds = (basicActions) => {
  if (!hasOfficialActionPolicy(basicActions)) return []
  const requiredOfficialActionIds = createUniqueActionIdList(
    Array.isArray(basicActions.requiredOfficialActionIds) && basicActions.requiredOfficialActionIds.length > 0
      ? basicActions.requiredOfficialActionIds
      : OFFICIAL_FULL_PET_ACTION_IDS
  )
  const realActionIds = new Set(createUniqueActionIdList(basicActions.realActionIds))
  const reportedMissingActionIds = createUniqueActionIdList(basicActions.missingRequiredOfficialActionIds)
  const computedMissingActionIds = requiredOfficialActionIds.filter((actionId) => !realActionIds.has(actionId))
  return createUniqueActionIdList([...reportedMissingActionIds, ...computedMissingActionIds])
}

const isFullPetOfficialActionReady = (atlasQa) => (
  getMissingRequiredOfficialActionIds(atlasQa?.basicActions).length === 0
)

const assertFullPetQaPassed = ({ dataDir, artifacts, operation = 'approval/import' }) => {
  if (!artifacts?.qa || !artifacts?.sourceImageQa) {
    throw new Error(`Full-pet QA must pass before ${operation}`)
  }
  if (!artifacts?.spritesheet || !artifacts?.petJson) {
    throw new Error(`Full-pet output must be complete before ${operation}`)
  }

  const atlasQaPath = assertExistingPathInsideDataDir({
    dataDir,
    targetPath: artifacts.qa,
    label: 'Full-pet atlas QA'
  })
  const sourceQaPath = assertExistingPathInsideDataDir({
    dataDir,
    targetPath: artifacts.sourceImageQa,
    label: 'Full-pet source image QA'
  })
  const spritesheetPath = assertExistingPathInsideDataDir({
    dataDir,
    targetPath: artifacts.spritesheet,
    label: 'Full-pet spritesheet'
  })
  assertExistingPathInsideDataDir({
    dataDir,
    targetPath: artifacts.petJson,
    label: 'Full-pet manifest'
  })

  const atlasQa = readQaJson(atlasQaPath, operation)
  const sourceQa = readQaJson(sourceQaPath, operation)

  if (atlasQa.ok !== true || sourceQa.ok !== true) {
    throw new Error(`Full-pet QA must pass before ${operation}`)
  }
  assertPositiveInteger({ value: atlasQa.width, label: 'atlas width', operation })
  assertPositiveInteger({ value: atlasQa.height, label: 'atlas height', operation })
  assertPositiveInteger({ value: atlasQa.visiblePixels, label: 'atlas visible pixels', operation })
  assertPositiveInteger({ value: sourceQa.width, label: 'source width', operation })
  assertPositiveInteger({ value: sourceQa.height, label: 'source height', operation })
  assertPositiveInteger({ value: sourceQa.visiblePixels, label: 'source visible pixels', operation })
  if (typeof sourceQa.sourceRelativePath !== 'string' || !sourceQa.sourceRelativePath.trim()) {
    throw new Error(`Full-pet QA source path must be valid before ${operation}`)
  }
  if (typeof atlasQa.atlasSha256 === 'string' && atlasQa.atlasSha256.trim()) {
    const actualAtlasHash = sha256File(spritesheetPath)
    if (actualAtlasHash !== atlasQa.atlasSha256) {
      throw new Error(`Full-pet spritesheet hash must match QA before ${operation}`)
    }
  }
  if (typeof sourceQa.sourceSha256 === 'string' && sourceQa.sourceSha256.trim()) {
    const sourceImagePath = assertExistingPathInsideDataDir({
      dataDir,
      targetPath: path.join(dataDir, sourceQa.sourceRelativePath),
      label: 'Full-pet source image'
    })
    const actualSourceHash = sha256File(sourceImagePath)
    if (actualSourceHash !== sourceQa.sourceSha256) {
      throw new Error(`Full-pet source image hash must match QA before ${operation}`)
    }
  }
  const missingRequiredBasicActions = getMissingRequiredBasicActions(atlasQa.basicActions)
  if (missingRequiredBasicActions.length > 0) {
    throw new Error(`Full-pet QA missing required real basic actions before ${operation}: ${missingRequiredBasicActions.join(', ')}`)
  }
  const missingRequiredOfficialActionIds = getMissingRequiredOfficialActionIds(atlasQa.basicActions)
  if (missingRequiredOfficialActionIds.length > 0) {
    throw new Error(`Full-pet QA missing required official action rows before ${operation}: ${missingRequiredOfficialActionIds.join(', ')}`)
  }

  return { atlasQa, sourceQa }
}

const assertRunFullPetQaPassed = ({ dataDir, run, operation = 'approval/import' }) => {
  if (run?.generationTask?.mode !== 'full-pet') return null
  const qa = assertFullPetQaPassed({ dataDir, artifacts: run?.artifacts, operation })
  const generatedImagePath = normalizeQaRelativePath(run?.artifacts?.generatedImage?.outputs?.[0]?.dataRelativePath)
  const sourceQaPath = normalizeQaRelativePath(qa.sourceQa?.sourceRelativePath)

  if (!generatedImagePath || generatedImagePath !== sourceQaPath) {
    throw new Error(`Full-pet QA source path must match the current generated image before ${operation}`)
  }

  return qa
}

module.exports = {
  getMissingRequiredOfficialActionIds,
  isFullPetOfficialActionReady,
  assertFullPetQaPassed,
  assertRunFullPetQaPassed
}
