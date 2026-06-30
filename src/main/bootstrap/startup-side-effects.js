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
  cursorAssetService.repairCursor(cursorBeforeRepair).then((customCursor) => {
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
  triggerRuleRuntimeService
}) => {
  maybeStartLocalHttp({ petService, localHttpService, normalizeLocalHttpConfig })
  syncLoginItemSettings(petService.getSettings().autoStart)
  triggerRuleRuntimeService.start()
}

module.exports = {
  applyCursorRepairToCollection,
  hasCursorRepairChanged,
  maybeStartLocalHttp,
  registerCursorRepair,
  runPostPluginStartupSideEffects
}
