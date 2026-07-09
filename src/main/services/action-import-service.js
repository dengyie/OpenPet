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

const createActionImportService = ({
  framesRoot,
  spritesDir,
  configPath,
  configType = 'animations',
  spriteRelativeDir = 'cat_anime/sprites'
}) => {
  const usesPetPackManifest = configType === 'pet-pack'
  const configRoot = path.dirname(configPath)

  const writeCurrentConfig = (config) => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
  }

  const readCurrentConfig = () => {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch (_) {
      return {}
    }
  }

  const toActionConfig = (config = {}) => ({
    defaultAction: String(config.defaultAction || ''),
    clickAction: String(config.clickAction || ''),
    actions: Array.isArray(config.actions) ? config.actions.map((action) => ({ ...action })) : [],
    ...(Array.isArray(config.triggerProposalInbox) ? { triggerProposalInbox: config.triggerProposalInbox } : {}),
    ...(Array.isArray(config.triggerRules) ? { triggerRules: config.triggerRules } : {})
  })

  const resolveConfigRelativePath = (relativePath, fieldName) => {
    const normalized = String(relativePath || '').replace(/\\/g, '/')
    if (
      !normalized ||
      normalized.includes('\0') ||
      path.posix.isAbsolute(normalized) ||
      normalized.split('/').includes('..')
    ) {
      throw new Error(`${fieldName} must be a safe relative path`)
    }
    const targetPath = path.resolve(configRoot, normalized)
    const rootPath = path.resolve(configRoot)
    if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
      throw new Error(`${fieldName} must stay inside the pet pack directory`)
    }
    return targetPath
  }

  const getExistingLabels = () => Object.fromEntries(
    (readCurrentConfig().actions || [])
      .filter((action) => action.id && action.label)
      .map((action) => [action.id, action.label])
  )

  const preserveHostActionMetadata = (currentConfig = {}, generated = {}) => {
    const generatedActionIds = new Set((generated.actions || []).map((action) => action.id))
    const triggerRules = Array.isArray(currentConfig.triggerRules)
      ? currentConfig.triggerRules.filter((rule) => generatedActionIds.has(rule.actionId))
      : []
    return {
      ...generated,
      ...(Array.isArray(currentConfig.triggerProposalInbox)
        ? { triggerProposalInbox: currentConfig.triggerProposalInbox }
        : {}),
      ...(triggerRules.length ? { triggerRules } : {})
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
    if (usesPetPackManifest) return updatePetPackActionConfig(overrides)

    const currentConfig = readCurrentConfig()
    const { generateSpritesFromFrames } = loadSpriteGenerator()
    const generated = await generateSpritesFromFrames({
      framesRoot,
      spritesDir,
      configPath,
      defaultAction: overrides.defaultAction ?? currentConfig.defaultAction,
      clickAction: overrides.clickAction ?? currentConfig.clickAction,
      labels: getExistingLabels(),
      spriteRelativeDir
    })
    const preserved = preserveHostActionMetadata(currentConfig, generated)
    writeCurrentConfig(preserved)
    return preserved
  }

  const updatePetPackActionConfig = (overrides = {}) => {
    const currentConfig = readCurrentConfig()
    const actions = Array.isArray(currentConfig.actions)
      ? currentConfig.actions.map((action) => ({ ...action }))
      : []
    const actionIds = new Set(actions.map((action) => action.id))
    const nextDefaultAction = overrides.defaultAction
      ? String(overrides.defaultAction)
      : currentConfig.defaultAction ?? actions[0]?.id ?? ''
    const nextClickAction = overrides.clickAction
      ? String(overrides.clickAction)
      : currentConfig.clickAction ?? actions.find((action) => action.id !== nextDefaultAction)?.id ?? nextDefaultAction
    if (nextDefaultAction && !actionIds.has(nextDefaultAction)) {
      throw new Error(`Default action does not exist: ${nextDefaultAction}`)
    }
    if (nextClickAction && !actionIds.has(nextClickAction)) {
      throw new Error(`Click action does not exist: ${nextClickAction}`)
    }
    const nextConfig = {
      ...currentConfig,
      defaultAction: nextDefaultAction,
      clickAction: nextClickAction,
      actions
    }
    writeCurrentConfig(nextConfig)
    return toActionConfig(nextConfig)
  }

  const importActionFrames = async ({ sourceDir, actionId, label }) => {
    if (!isSafeActionId(actionId)) throw new Error('Invalid action id')
    if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      throw new Error('Source frames folder does not exist')
    }

    const { inspection } = await inspectActionFrames({ sourceDir, actionId })
    if (!inspection.valid) throw new Error(inspection.errors.join('; ') || 'Frame folder is invalid')

    const targetDir = path.join(framesRoot, actionId)
    const currentConfig = readCurrentConfig()
    const labels = { ...getExistingLabels(), ...(label ? { [actionId]: label } : {}) }
    const { generateSpritesFromFrames, processActionFolder } = loadSpriteGenerator()

    if (usesPetPackManifest) {
      const importedSpritePath = path.join(spritesDir, `${actionId}.png`)
      let copiedFrames = false
      try {
        fs.mkdirSync(spritesDir, { recursive: true })
        copyDirectory(sourceDir, targetDir)
        copiedFrames = true
        const generatedAction = await processActionFolder({
          folderEntry: { name: actionId },
          framesRoot,
          spritesDir,
          labels,
          spriteRelativeDir
        })
        if (!generatedAction) throw new Error(`Imported action was not generated: ${actionId}`)
        const generated = {
          ...toActionConfig(currentConfig),
          actions: [
            ...(Array.isArray(currentConfig.actions) ? currentConfig.actions.map((action) => ({ ...action })) : []),
            generatedAction
          ]
        }
        const config = preserveHostActionMetadata(currentConfig, {
          ...generated,
          defaultAction: generated.defaultAction || currentConfig.defaultAction || actionId,
          clickAction: generated.clickAction || currentConfig.clickAction || actionId
        })
        const importedAction = config.actions.find((action) => action.id === actionId)
        if (!importedAction) throw new Error(`Imported action is missing from generated config: ${actionId}`)
        writeCurrentConfig({ ...currentConfig, ...config })
        return { ...config, importedAction }
      } catch (error) {
        if (copiedFrames) fs.rmSync(targetDir, { recursive: true, force: true })
        fs.rmSync(importedSpritePath, { recursive: true, force: true })
        throw error
      }
    }

    copyDirectory(sourceDir, targetDir)
    const generated = await generateSpritesFromFrames({
      framesRoot,
      spritesDir,
      configPath,
      defaultAction: currentConfig.defaultAction,
      clickAction: currentConfig.clickAction,
      labels,
      spriteRelativeDir
    })
    const config = preserveHostActionMetadata(currentConfig, {
      ...generated,
      defaultAction: generated.defaultAction || currentConfig.defaultAction || actionId,
      clickAction: generated.clickAction || currentConfig.clickAction || actionId
    })
    writeCurrentConfig(config)
    const importedAction = config.actions.find((action) => action.id === actionId)
    return { ...config, importedAction }
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

  const updateActionConfig = async ({ defaultAction, clickAction }) => regenerate({ defaultAction, clickAction })

  const deleteAction = async (actionId) => {
    if (!isSafeActionId(actionId)) throw new Error('Invalid action id')
    if (usesPetPackManifest) return deletePetPackAction(actionId)

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

  const deletePetPackAction = (actionId) => {
    const currentConfig = readCurrentConfig()
    const currentActions = Array.isArray(currentConfig.actions)
      ? currentConfig.actions.map((action) => ({ ...action }))
      : []
    const action = currentActions.find((item) => item.id === actionId)
    if (!action) throw new Error(`Action does not exist: ${actionId}`)
    if (currentActions.length <= 1) throw new Error('Cannot delete the last action')

    const remainingActions = currentActions.filter((item) => item.id !== actionId)
    const targetDir = path.join(framesRoot, actionId)
    const spritePath = action.sprite ? resolveConfigRelativePath(action.sprite, 'Action sprite') : ''
    const spriteIsShared = Boolean(action.sprite && remainingActions.some((item) => item.sprite === action.sprite))
    const backupRoot = path.join(configRoot, '.openpet-delete-backups', `${actionId}-${Date.now()}`)
    const backupFramesDir = path.join(backupRoot, 'frames')
    const backupSpritePath = path.join(backupRoot, path.basename(spritePath || `${actionId}.png`))
    const movedFrames = moveIfExists(targetDir, backupFramesDir)
    const movedSprite = spritePath && !spriteIsShared ? moveIfExists(spritePath, backupSpritePath) : false

    try {
      const nextDefaultAction = currentConfig.defaultAction === actionId
        ? remainingActions[0]?.id || ''
        : currentConfig.defaultAction
      const nextClickAction = currentConfig.clickAction === actionId
        ? remainingActions.find((item) => item.id !== nextDefaultAction)?.id || nextDefaultAction
        : currentConfig.clickAction
      const remainingActionIds = new Set(remainingActions.map((item) => item.id))
      const nextConfig = {
        ...currentConfig,
        defaultAction: nextDefaultAction,
        clickAction: nextClickAction,
        actions: remainingActions,
        ...(Array.isArray(currentConfig.triggerRules)
          ? { triggerRules: currentConfig.triggerRules.filter((rule) => remainingActionIds.has(rule.actionId)) }
          : {})
      }
      writeCurrentConfig(nextConfig)
      fs.rmSync(backupRoot, { recursive: true, force: true })
      return toActionConfig(nextConfig)
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
