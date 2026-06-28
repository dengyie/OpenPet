const fs = require('fs')
const path = require('path')

const isSafeActionId = (actionId) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(actionId || '')

const loadSpriteGenerator = () => require('./sprite-generator')

const copyDirectory = (sourceDir, targetDir) => {
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true })
}

const moveIfExists = (sourcePath, targetPath) => {
  if (!fs.existsSync(sourcePath)) return false
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.rmSync(targetPath, { recursive: true, force: true })
  fs.renameSync(sourcePath, targetPath)
  return true
}

const createActionImportService = ({ framesRoot, spritesDir, configPath }) => {
  const readCurrentConfig = () => {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch (_) {
      return {}
    }
  }

  const getExistingLabels = () => Object.fromEntries(
    (readCurrentConfig().actions || [])
      .filter((action) => action.id && action.label)
      .map((action) => [action.id, action.label])
  )

  const preserveHostTriggerData = (nextConfig, currentConfig = nextConfig) => {
    const validActionIds = new Set(Array.isArray(nextConfig.actions) ? nextConfig.actions.map((action) => action.id).filter(Boolean) : [])
    const sourceTriggerRules = Array.isArray(nextConfig.triggerRules)
      ? nextConfig.triggerRules
      : currentConfig.triggerRules
    return {
      ...nextConfig,
      ...(Array.isArray(sourceTriggerRules)
        ? {
            triggerRules: sourceTriggerRules.filter((rule) => validActionIds.has(rule?.actionId))
          }
        : {}),
      ...(Array.isArray(currentConfig.triggerProposalInbox)
        ? {
            triggerProposalInbox: currentConfig.triggerProposalInbox
          }
        : {})
    }
  }

  const actionExists = (actionId) => {
    const existsInConfig = (readCurrentConfig().actions || [])
      .some((action) => action.id === actionId)
    return existsInConfig || fs.existsSync(path.join(framesRoot, actionId))
  }

  const getActionFolderIds = () => {
    if (!fs.existsSync(framesRoot)) return []
    return fs.readdirSync(framesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isSafeActionId(entry.name))
      .map((entry) => entry.name)
  }

  const getValidActionIds = async () => {
    const validActionIds = []
    for (const actionId of getActionFolderIds()) {
      try {
        const { inspectFrameFolder } = loadSpriteGenerator()
        const inspection = await inspectFrameFolder(path.join(framesRoot, actionId))
        if (inspection.valid) validActionIds.push(actionId)
      } catch (_) {}
    }
    return validActionIds
  }

  const regenerate = async (overrides = {}) => {
    const currentConfig = readCurrentConfig()
    const { generateSpritesFromFrames } = loadSpriteGenerator()
    const generated = await generateSpritesFromFrames({
      framesRoot,
      spritesDir,
      configPath,
      defaultAction: overrides.defaultAction ?? currentConfig.defaultAction,
      clickAction: overrides.clickAction ?? currentConfig.clickAction,
      labels: getExistingLabels()
    })
    const preserved = preserveHostTriggerData({
      ...generated,
      ...(Array.isArray(overrides.triggerRules) ? { triggerRules: overrides.triggerRules } : {})
    }, currentConfig)
    if (preserved !== generated) {
      fs.writeFileSync(configPath, JSON.stringify(preserved, null, 2), 'utf-8')
    }
    return preserved
  }

  const importActionFrames = async ({ sourceDir, actionId, label }) => {
    if (!isSafeActionId(actionId)) throw new Error('Invalid action id')
    if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      throw new Error('Source frames folder does not exist')
    }

    const { inspection } = await inspectActionFrames({ sourceDir, actionId })
    if (!inspection.valid) throw new Error(inspection.errors.join('; ') || 'Frame folder is invalid')

    const targetDir = path.join(framesRoot, actionId)
    copyDirectory(sourceDir, targetDir)
    const { generateSpritesFromFrames } = loadSpriteGenerator()
    const currentConfig = readCurrentConfig()
    const config = await generateSpritesFromFrames({
      framesRoot,
      spritesDir,
      configPath,
      defaultAction: currentConfig.defaultAction,
      clickAction: currentConfig.clickAction,
      labels: { ...getExistingLabels(), ...(label ? { [actionId]: label } : {}) }
    })
    const preserved = preserveHostTriggerData(config, currentConfig)
    if (preserved !== config) {
      fs.writeFileSync(configPath, JSON.stringify(preserved, null, 2), 'utf-8')
    }
    const importedAction = preserved.actions.find((action) => action.id === actionId)
    return { ...preserved, importedAction }
  }

  const inspectActionFrames = async ({ sourceDir, actionId }) => {
    if (!isSafeActionId(actionId)) throw new Error('Invalid action id')
    const { inspectFrameFolder } = loadSpriteGenerator()
    const inspection = await inspectFrameFolder(sourceDir)
    if (actionExists(actionId)) {
      inspection.errors = [...inspection.errors, `Action ID already exists: ${actionId}`]
      inspection.valid = false
    }
    return { actionId, folderName: path.basename(sourceDir || ''), inspection }
  }

  const updateActionConfig = async ({ defaultAction, clickAction, triggerRules }) => regenerate({ defaultAction, clickAction, triggerRules })

  const deleteAction = async (actionId) => {
    if (!isSafeActionId(actionId)) throw new Error('Invalid action id')
    const validActionIds = await getValidActionIds()
    if (validActionIds.includes(actionId) && validActionIds.length <= 1) {
      throw new Error('Cannot delete the last action')
    }

    const targetDir = path.join(framesRoot, actionId)
    const spritePath = path.join(spritesDir, `${actionId}.png`)
    const backupRoot = path.join(path.dirname(framesRoot), '.openpet-delete-backups', `${actionId}-${Date.now()}`)
    const backupFramesDir = path.join(backupRoot, 'frames')
    const backupSpritePath = path.join(backupRoot, `${actionId}.png`)
    const movedFrames = moveIfExists(targetDir, backupFramesDir)
    const movedSprite = moveIfExists(spritePath, backupSpritePath)

    try {
      const result = await regenerate()
      fs.rmSync(backupRoot, { recursive: true, force: true })
      return result
    } catch (error) {
      if (movedFrames) moveIfExists(backupFramesDir, targetDir)
      if (movedSprite) moveIfExists(backupSpritePath, spritePath)
      fs.rmSync(backupRoot, { recursive: true, force: true })
      throw error
    }
  }

  return { deleteAction, importActionFrames, inspectActionFrames, regenerate, updateActionConfig }
}

module.exports = { createActionImportService, isSafeActionId }
