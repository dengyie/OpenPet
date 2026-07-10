const hasCursorRepairChanged = (before = {}, after = {}) => (
  ['assetPath', 'assetUrl', 'fileName', 'width', 'height', 'hotspotX', 'hotspotY']
    .some((key) => before?.[key] !== after?.[key])
)

const applyCursorRepairToCollection = (customCursors = [], previousCursor = {}, repairedCursor = {}) => (
  Array.isArray(customCursors)
    ? customCursors.map((cursor) => {
      const isSameAssetPath = Boolean(previousCursor.assetPath && cursor?.assetPath === previousCursor.assetPath)
      const isSameAssetUrl = Boolean(previousCursor.assetUrl && cursor?.assetUrl === previousCursor.assetUrl)
      const isRepairedCursor = isSameAssetPath || isSameAssetUrl
      return isRepairedCursor
        ? {
            ...cursor,
            assetPath: repairedCursor.assetPath,
            assetUrl: repairedCursor.assetUrl,
            fileName: repairedCursor.fileName,
            width: repairedCursor.width,
            height: repairedCursor.height,
            hotspotX: repairedCursor.hotspotX,
            hotspotY: repairedCursor.hotspotY
          }
        : cursor
    })
    : []
)

const registerCursorRepair = ({ cursorAssetService, petService, appLogService }) => {
  const cursorBeforeRepair = petService.getSettings().customCursor
  return cursorAssetService.repairCursor(cursorBeforeRepair).then((customCursor) => {
    const currentSettings = petService.getSettings()
    if (customCursor.assetPath && hasCursorRepairChanged(cursorBeforeRepair, customCursor)) {
      petService.saveSettings({
        ...currentSettings,
        customCursor,
        customCursors: applyCursorRepairToCollection(currentSettings.customCursors, cursorBeforeRepair, customCursor)
      })
      appLogService.record({
        scope: 'settings',
        level: 'info',
        actor: 'system',
        event: 'settings.cursor.asset.repaired',
        message: 'Cursor asset resized for browser compatibility',
        details: { fileName: customCursor.fileName, enabled: customCursor.enabled }
      })
    }
  }).catch((error) => {
    appLogService.record({
      scope: 'settings',
      level: 'error',
      actor: 'system',
      event: 'settings.cursor.asset.repair.failed',
      message: error.message
    })
  })
}

const maybeStartLocalHttp = ({ petService, localHttpService, normalizeLocalHttpConfig }) => {
  let localHttpConfig = petService.getSettings().localHttp
  if (!localHttpConfig?.enabled) return

  const normalizedConfig = normalizeLocalHttpConfig(localHttpConfig, localHttpConfig)
  if (normalizedConfig.token !== localHttpConfig.token) {
    const currentSettings = petService.getSettings()
    petService.saveSettings({ ...currentSettings, localHttp: normalizedConfig })
    localHttpConfig = normalizedConfig
  }
  localHttpService.start(localHttpConfig).catch((error) => {
    console.error('Failed to start local HTTP service:', error.message)
  })
}

const runPostPluginStartupSideEffects = ({
  petService,
  localHttpService,
  normalizeLocalHttpConfig,
  syncLoginItemSettings,
  triggerRuleRuntimeService,
  cursorRepairPromise = Promise.resolve(),
  systemCursorService,
  appLogService,
  onSystemCursorFallback = () => {}
}) => {
  maybeStartLocalHttp({ petService, localHttpService, normalizeLocalHttpConfig })
  syncLoginItemSettings(petService.getSettings().autoStart)
  triggerRuleRuntimeService.start()
  return Promise.resolve(cursorRepairPromise).then(async () => {
    try {
      await systemCursorService?.sync?.(petService.getSettings())
    } catch (error) {
      const currentSettings = petService.getSettings()
      const fallbackSettings = currentSettings.customCursorScope === 'system'
        ? petService.saveSettings({ ...currentSettings, customCursorScope: 'openpet' })
        : currentSettings
      try {
        appLogService?.record?.({
          scope: 'system-cursor',
          level: 'error',
          actor: 'system',
          event: 'system-cursor.startup.failed',
          message: error?.message || 'Failed to restore whole-computer cursor at startup'
        })
      } catch (_) {
        // Startup fallback must not depend on logging availability.
      }
      onSystemCursorFallback(fallbackSettings)
    }
  })
}

module.exports = {
  applyCursorRepairToCollection,
  hasCursorRepairChanged,
  maybeStartLocalHttp,
  registerCursorRepair,
  runPostPluginStartupSideEffects
}
