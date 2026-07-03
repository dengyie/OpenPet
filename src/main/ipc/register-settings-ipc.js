const { IPC } = require('../../shared/ipc-channels')
const {
  createPersistedCursorRecord,
  getBuiltinCursorById,
  normalizeCursorSettingsState,
  normalizeCustomCursorCollection,
  normalizeCustomCursorRecord,
  resizeCustomCursorRecord
} = require('../../shared/cursor-library')

const hasIncompleteCustomCursorMetrics = (cursor) => {
  const normalized = normalizeCustomCursorRecord(cursor)
  if (!normalized?.assetPath || !normalized?.assetUrl) return false
  return normalized.width <= 0
    || normalized.height <= 0
    || normalized.baseWidth <= 0
    || normalized.baseHeight <= 0
}

const repairCustomCursorRecord = async (cursorAssetService, cursor) => {
  const normalized = normalizeCustomCursorRecord(cursor)
  if (!normalized) return null
  if (!hasIncompleteCustomCursorMetrics(normalized)) return normalized
  const builtinCursor = createPersistedCursorRecord(getBuiltinCursorById(normalized.id))
  if (builtinCursor) {
    const repairedBaseRecord = normalizeCustomCursorRecord({
      ...normalized,
      assetPath: builtinCursor.assetPath,
      assetUrl: builtinCursor.assetUrl,
      fileName: builtinCursor.fileName,
      width: builtinCursor.width,
      height: builtinCursor.height,
      hotspotX: builtinCursor.hotspotX,
      hotspotY: builtinCursor.hotspotY,
      baseWidth: builtinCursor.width,
      baseHeight: builtinCursor.height,
      baseHotspotX: builtinCursor.hotspotX,
      baseHotspotY: builtinCursor.hotspotY,
      sizePercent: 100
    })
    if (!repairedBaseRecord) return normalized
    return resizeCustomCursorRecord(repairedBaseRecord, normalized.sizePercent) || repairedBaseRecord
  }
  const repairedRuntimeCursor = await cursorAssetService.repairCursor(normalized)
  const repairedBaseRecord = normalizeCustomCursorRecord({
    ...normalized,
    assetPath: repairedRuntimeCursor.assetPath,
    assetUrl: repairedRuntimeCursor.assetUrl,
    fileName: repairedRuntimeCursor.fileName,
    width: repairedRuntimeCursor.width,
    height: repairedRuntimeCursor.height,
    hotspotX: repairedRuntimeCursor.hotspotX,
    hotspotY: repairedRuntimeCursor.hotspotY,
    baseWidth: repairedRuntimeCursor.width,
    baseHeight: repairedRuntimeCursor.height,
    baseHotspotX: repairedRuntimeCursor.hotspotX,
    baseHotspotY: repairedRuntimeCursor.hotspotY,
    sizePercent: 100
  })
  if (!repairedBaseRecord) return normalized
  return resizeCustomCursorRecord(repairedBaseRecord, normalized.sizePercent) || repairedBaseRecord
}

const hasCustomCursorRecordChanged = (before, after) => (
  ['assetPath', 'assetUrl', 'fileName', 'width', 'height', 'hotspotX', 'hotspotY', 'baseWidth', 'baseHeight', 'baseHotspotX', 'baseHotspotY', 'sizePercent']
    .some((key) => before?.[key] !== after?.[key])
)

const registerSettingsIpc = ({
  ipcMainService,
  petService,
  getPetWindow,
  browserWindowService,
  cursorAssetService,
  petMovementPolicy,
  showOpenDialogForEvent,
  sendToPetWindow,
  createPetRendererSettings,
  collectCustomCursorAssetPaths,
  mergePetSettingsViewIntoHostSettings,
  recordAppLog
}) => {
  const maybeRepairStoredCustomCursorRecords = async () => {
    if (!cursorAssetService?.repairCursor) return petService.getSettings()
    const currentSettings = petService.getSettings()
    const currentCustomCursors = normalizeCustomCursorCollection(currentSettings.customCursors)
    const repairableCursors = currentCustomCursors.filter(hasIncompleteCustomCursorMetrics)
    if (repairableCursors.length === 0) return currentSettings

    const repairFailures = []
    const repairedCustomCursors = await Promise.all(currentCustomCursors.map(async (cursor) => {
      if (!hasIncompleteCustomCursorMetrics(cursor)) return cursor
      try {
        return await repairCustomCursorRecord(cursorAssetService, cursor)
      } catch (error) {
        repairFailures.push({
          cursorId: cursor.id,
          fileName: cursor.fileName,
          message: error?.message || String(error)
        })
        return cursor
      }
    }))
    const changedCursorIds = repairedCustomCursors
      .filter((cursor, index) => hasCustomCursorRecordChanged(currentCustomCursors[index], cursor))
      .map((cursor) => cursor.id)
    if (repairFailures.length > 0) {
      recordAppLog({
        scope: 'settings',
        level: 'warn',
        actor: 'system',
        event: 'settings.cursor.collection.repair.skipped',
        message: 'Some stored custom cursor records could not be repaired',
        details: {
          failures: repairFailures
        }
      })
    }
    if (changedCursorIds.length === 0) return currentSettings

    const cursorState = normalizeCursorSettingsState({
      selectedCursorId: currentSettings.selectedCursorId,
      customCursors: repairedCustomCursors,
      customCursor: currentSettings.customCursor
    })
    const repairedSettings = petService.saveSettings({
      ...currentSettings,
      selectedCursorId: cursorState.selectedCursorId,
      customCursors: cursorState.customCursors,
      customCursor: cursorState.customCursor
    })
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, createPetRendererSettings(repairedSettings))
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'system',
      event: 'settings.cursor.collection.repaired',
      message: 'Stored custom cursor metadata repaired before rendering settings',
      details: {
        count: changedCursorIds.length,
        cursorIds: changedCursorIds
      }
    })
    return repairedSettings
  }

  ipcMainService.handle(IPC.SETTINGS_GET, async () => createPetRendererSettings(await maybeRepairStoredCustomCursorRecords()))

  ipcMainService.handle(IPC.SETTINGS_IMPORT_CURSOR, async (event) => {
    if (!cursorAssetService?.importCursor) throw new Error('Cursor asset import is not available')
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'user',
      event: 'settings.cursor.import.opened',
      message: 'Cursor image picker opened'
    })
    try {
      const selected = await showOpenDialogForEvent(event, {
        title: '选择自定义鼠标指针图片',
        properties: ['openFile'],
        filters: [{ name: 'Cursor Images', extensions: ['png', 'webp'] }]
      })
      if (selected.canceled || !selected.filePaths[0]) {
        recordAppLog({
          scope: 'settings',
          level: 'info',
          actor: 'user',
          event: 'settings.cursor.import.canceled',
          message: 'Cursor image picker canceled'
        })
        return { canceled: true }
      }
      const cursor = await cursorAssetService.importCursor(selected.filePaths[0])
      recordAppLog({
        scope: 'settings',
        level: 'info',
        actor: 'system',
        event: 'settings.cursor.import.completed',
        message: 'Cursor image imported',
        details: {
          fileName: cursor.fileName,
          enabled: cursor.enabled
        }
      })
      return { canceled: false, cursor }
    } catch (error) {
      recordAppLog({
        scope: 'settings',
        level: 'error',
        actor: 'system',
        event: 'settings.cursor.import.failed',
        message: error.message
      })
      throw error
    }
  })

  ipcMainService.handle(IPC.SETTINGS_SAVE, (_event, settings) => {
    const petWindow = getPetWindow()
    const previousSettings = petService.getSettings()
    const nextSettings = mergePetSettingsViewIntoHostSettings(petService.getSettings(), settings)
    if (petMovementPolicy && petWindow && !petWindow.isDestroyed()) {
      const behavior = petMovementPolicy.normalizePetBehaviorSettings(nextSettings.petBehavior)
      const currentBehavior = petMovementPolicy.normalizePetBehaviorSettings(previousSettings.petBehavior)
      const needsInitialHomeAnchor = behavior.home.enabled && !behavior.home.anchor
      if (needsInitialHomeAnchor || (!currentBehavior.home.enabled && behavior.home.enabled)) {
        behavior.home.anchor = petMovementPolicy.createHomeAnchorFromWindow({ windowBounds: petWindow.getBounds() })
      }
      nextSettings.petBehavior = behavior
    }

    const savedSettings = petService.saveSettings(nextSettings)
    const previousAssetPaths = new Set(collectCustomCursorAssetPaths(previousSettings.customCursors))
    const nextAssetPaths = new Set(collectCustomCursorAssetPaths(savedSettings.customCursors))
    const orphanedAssetPaths = Array.from(previousAssetPaths).filter((assetPath) => !nextAssetPaths.has(assetPath))
    if (orphanedAssetPaths.length > 0) cursorAssetService?.deleteAssets?.(orphanedAssetPaths)
    const rendererSettings = createPetRendererSettings(savedSettings)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, rendererSettings)
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'user',
      event: 'settings.saved',
      message: 'Settings saved',
      details: {
        grounded: Boolean(savedSettings.petBehavior?.grounded),
        homeEnabled: Boolean(savedSettings.petBehavior?.home?.enabled),
        homeRadius: savedSettings.petBehavior?.home?.radius || 'medium',
        customCursorEnabled: Boolean(savedSettings.customCursor?.enabled),
        customCursorFileName: savedSettings.customCursor?.fileName || ''
      }
    })
    return rendererSettings
  })

  ipcMainService.on(IPC.SETTINGS_PREVIEW_SCALE, (_event, scale) => {
    petService.previewSettings({ scale })
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, { scale })
  })

  ipcMainService.on(IPC.SETTINGS_CLOSE, (_event) => {
    const win = browserWindowService.fromWebContents(_event.sender)
    if (win) {
      const petWindow = getPetWindow()
      if (petWindow && petWindow.settingsWindow === win) {
        petWindow.settingsWindow = null
      }
      win.close()
    }
  })
}

module.exports = { registerSettingsIpc }
