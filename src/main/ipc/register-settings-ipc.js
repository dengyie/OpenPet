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

const hasSameCursorRepairSource = (before, latest) => (
  ['id', 'source', 'assetPath', 'assetUrl', 'fileName']
    .every((key) => before?.[key] === latest?.[key])
)

const mergeCursorRepairIntoLatest = ({ before, repaired, latest }) => {
  const normalizedBefore = normalizeCustomCursorRecord(before)
  const normalizedRepaired = normalizeCustomCursorRecord(repaired)
  const normalizedLatest = normalizeCustomCursorRecord(latest)
  if (!normalizedBefore || !normalizedRepaired || !normalizedLatest) return normalizedLatest || latest
  if (!hasIncompleteCustomCursorMetrics(normalizedLatest)) return normalizedLatest
  if (!hasSameCursorRepairSource(normalizedBefore, normalizedLatest)) return normalizedLatest

  const baseWidth = normalizedRepaired.baseWidth || normalizedRepaired.width
  const baseHeight = normalizedRepaired.baseHeight || normalizedRepaired.height
  const baseHotspotX = normalizedRepaired.baseHotspotX ?? normalizedRepaired.hotspotX
  const baseHotspotY = normalizedRepaired.baseHotspotY ?? normalizedRepaired.hotspotY
  const repairedBaseRecord = normalizeCustomCursorRecord({
    ...normalizedLatest,
    assetPath: normalizedRepaired.assetPath,
    assetUrl: normalizedRepaired.assetUrl,
    fileName: normalizedRepaired.fileName,
    width: baseWidth,
    height: baseHeight,
    hotspotX: baseHotspotX,
    hotspotY: baseHotspotY,
    baseWidth,
    baseHeight,
    baseHotspotX,
    baseHotspotY,
    sizePercent: 100
  })
  if (!repairedBaseRecord) return normalizedLatest
  return resizeCustomCursorRecord(repairedBaseRecord, normalizedLatest.sizePercent) || repairedBaseRecord
}

const registerSettingsIpc = ({
  ipcMainService,
  petService,
  getPetWindow,
  browserWindowService,
  cursorAssetService,
  systemCursorService,
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

    // 修复期间可能有并发写入：通过原子读改写按 id 回填修复结果，
    // 而不是用修复前的快照整体覆盖。
    const repairedById = new Map(repairedCustomCursors
      .map((cursor, index) => ({ before: currentCustomCursors[index], repaired: cursor }))
      .filter(({ before, repaired }) => hasCustomCursorRecordChanged(before, repaired))
      .map((repair) => [repair.before.id, repair]))
    const repairedSettings = petService.updateSettings((latestSettings) => {
      const latestCursors = normalizeCustomCursorCollection(latestSettings.customCursors)
        .map((cursor) => {
          const repair = repairedById.get(cursor.id)
          return repair
            ? mergeCursorRepairIntoLatest({ ...repair, latest: cursor })
            : cursor
        })
      const cursorState = normalizeCursorSettingsState({
        selectedCursorId: latestSettings.selectedCursorId,
        customCursors: latestCursors,
        customCursor: latestSettings.customCursor,
        hiddenCursorIds: latestSettings.hiddenCursorIds,
        customCursorScope: latestSettings.customCursorScope
      })
      return {
        ...latestSettings,
        selectedCursorId: cursorState.selectedCursorId,
        customCursors: cursorState.customCursors,
        customCursor: cursorState.customCursor,
        hiddenCursorIds: cursorState.hiddenCursorIds,
        customCursorScope: cursorState.customCursorScope
      }
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

  ipcMainService.handle(IPC.SETTINGS_GET, async () => createPetRendererSettings(
    await maybeRepairStoredCustomCursorRecords(),
    systemCursorService?.getStatus?.()
  ))

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

  ipcMainService.handle(IPC.SETTINGS_SAVE, async (_event, settings) => {
    const petWindow = getPetWindow()
    const previousSettings = petService.getSettings()
    // 合并逻辑封装为纯函数：先基于当前快照算出 provisional 结果用于系统指针同步，
    // 真正落盘时在 updateSettings 内基于最新快照重算，避免 await 期间的并发写被旧快照覆盖。
    const computeNextSettings = (currentSettings) => {
      const nextSettings = mergePetSettingsViewIntoHostSettings(currentSettings, settings)
      if (petMovementPolicy && petWindow && !petWindow.isDestroyed()) {
        const behavior = petMovementPolicy.normalizePetBehaviorSettings(nextSettings.petBehavior)
        const currentBehavior = petMovementPolicy.normalizePetBehaviorSettings(currentSettings.petBehavior)
        const needsInitialHomeAnchor = behavior.home.enabled && !behavior.home.anchor
        if (needsInitialHomeAnchor || (!currentBehavior.home.enabled && behavior.home.enabled)) {
          behavior.home.anchor = petMovementPolicy.createHomeAnchorFromWindow({ windowBounds: petWindow.getBounds() })
        }
        nextSettings.petBehavior = behavior
      }
      return nextSettings
    }
    const provisionalSettings = computeNextSettings(previousSettings)

    if (provisionalSettings.customCursorScope === 'system' && !systemCursorService?.sync) {
      throw new Error('Whole-computer cursor service is unavailable')
    }
    try {
      await systemCursorService?.sync?.(provisionalSettings)
    } catch (error) {
      recordAppLog({
        scope: 'system-cursor',
        level: 'error',
        actor: 'system',
        event: 'system-cursor.apply.failed',
        message: error?.message || 'Whole-computer cursor activation failed',
        details: { requestedScope: provisionalSettings.customCursorScope }
      })
      throw error
    }

    let savedSettings
    try {
      savedSettings = petService.updateSettings(computeNextSettings)
    } catch (error) {
      try {
        await systemCursorService?.sync?.(previousSettings)
      } catch (rollbackError) {
        recordAppLog({
          scope: 'system-cursor',
          level: 'error',
          actor: 'system',
          event: 'system-cursor.rollback.failed',
          message: rollbackError?.message || 'Whole-computer cursor rollback failed'
        })
      }
      throw error
    }
    const previousAssetPaths = new Set(collectCustomCursorAssetPaths(previousSettings.customCursors))
    const nextAssetPaths = new Set(collectCustomCursorAssetPaths(savedSettings.customCursors))
    const orphanedAssetPaths = Array.from(previousAssetPaths).filter((assetPath) => !nextAssetPaths.has(assetPath))
    if (orphanedAssetPaths.length > 0) cursorAssetService?.deleteAssets?.(orphanedAssetPaths)
    const rendererSettings = createPetRendererSettings(savedSettings, systemCursorService?.getStatus?.())
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
        customCursorFileName: savedSettings.customCursor?.fileName || '',
        customCursorScope: savedSettings.customCursorScope || 'openpet'
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
