const {
  createPersistedCursorRecord,
  getBuiltinCursorById,
  normalizeCustomCursorCollection,
  normalizeCustomCursorRecord,
  resizeCustomCursorRecord
} = require('../../shared/cursor-library')

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

const normalizeRepairCandidate = (cursor) => {
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || !cursor.assetPath) return null
  const assetPath = String(cursor.assetPath)
  const fileName = typeof cursor.fileName === 'string' && cursor.fileName
    ? cursor.fileName
    : assetPath.split(/[\\/]/).pop() || 'cursor.png'
  return normalizeCustomCursorRecord({
    ...cursor,
    id: typeof cursor.id === 'string' && cursor.id ? cursor.id : `active:${assetPath}`,
    assetUrl: typeof cursor.assetUrl === 'string' && cursor.assetUrl ? cursor.assetUrl : `file://${assetPath}`,
    fileName
  })
}

const registerCursorRepair = ({ cursorAssetService, petService, appLogService, persistCanonicalSettings }) => {
  const initial = petService.getSettings()
  const initialCustomCursorValues = Array.isArray(initial.customCursors) ? initial.customCursors : []
  const initialCustomCursorHasUrls = initialCustomCursorValues.map((cursor) => Boolean(cursor?.assetUrl))
  const initialCustomCursors = initialCustomCursorValues
    .map(normalizeRepairCandidate)
    .filter(Boolean)
  const activeBefore = initial.customCursor
  const activeNeedsRepair = hasIncompleteCustomCursorMetrics(activeBefore)
  const activeIndex = initialCustomCursors.findIndex((cursor) => (
    cursor?.assetPath === activeBefore?.assetPath || cursor?.assetUrl === activeBefore?.assetUrl
  ))
  const repairableCollection = initialCustomCursors.some((cursor, index) => (
    (index === activeIndex || initialCustomCursorHasUrls[index]) && hasIncompleteCustomCursorMetrics(cursor)
  ))
  if (!cursorAssetService?.repairCursor || (!repairableCollection && !activeNeedsRepair)) return Promise.resolve(initial)
  const repairOne = async (cursor, index) => {
    if (index !== activeIndex && !initialCustomCursorHasUrls[index]) return cursor
    if (!hasIncompleteCustomCursorMetrics(cursor)) return cursor
    try {
      return await repairCustomCursorRecord(cursorAssetService, cursor)
    } catch (error) {
      appLogService?.record?.({
        scope: 'settings',
        level: 'error',
        actor: 'system',
        event: 'settings.cursor.asset.repair.failed',
        message: error?.message || String(error), details: { cursorId: cursor.id }
      })
      return cursor
    }
  }
  const repairedActiveOutsideCollection = activeNeedsRepair && activeIndex < 0
    ? repairOne(activeBefore)
    : Promise.resolve(activeBefore)
  return Promise.all([
    ...initialCustomCursors.map(repairOne),
    repairedActiveOutsideCollection
  ]).then(async (results) => {
    const repaired = results.slice(0, initialCustomCursors.length)
    const activeRepair = activeIndex >= 0 ? repaired[activeIndex] : results.at(-1)
    const changed = repaired.some((cursor, index) => hasCursorRepairChanged(initialCustomCursors[index], cursor)) || (
      activeIndex < 0 && hasCursorRepairChanged(activeBefore, activeRepair)
    )
    if (!changed) return petService.getSettings()
    const byId = new Map(repaired.map((cursor, index) => [cursor.id, { before: initialCustomCursors[index], repaired: cursor }]))
		const update = (updater) => {
			const latest = structuredClone(petService.getSettings())
			const next = updater(latest)
			if (persistCanonicalSettings) {
				if (typeof petService.applySettings === 'function') petService.applySettings(next)
				else petService.saveSettings?.(next)
				return next
			}
			return petService.updateSettings
				? petService.updateSettings(updater)
				: petService.saveSettings(updater(petService.getSettings()))
		}
    const nextSettings = update((latest) => ({
      ...latest,
      customCursor: activeRepair && hasIncompleteCustomCursorMetrics(latest.customCursor)
        ? mergeActiveCursorRepair(activeBefore, activeRepair, latest.customCursor)
        : latest.customCursor,
      customCursors: (Array.isArray(latest.customCursors) ? latest.customCursors : [])
        .map(normalizeRepairCandidate)
        .filter(Boolean)
        .map((cursor) => {
          const repair = byId.get(cursor.id)
          return repair ? mergeCursorRepair(repair.before, repair.repaired, cursor) : cursor
        })
    }))
	const persistence = typeof persistCanonicalSettings === 'function'
		? Promise.resolve(persistCanonicalSettings({ settings: nextSettings, paths: ['customCursor', 'customCursors'] }))
      : null
    for (const { before, repaired: repair } of byId.values()) {
      if (!hasCursorRepairChanged(before, repair)) continue
      appLogService?.record?.({
        scope: 'settings',
        level: 'info',
        actor: 'system',
        event: 'settings.cursor.asset.repaired',
        message: 'Cursor asset resized for browser compatibility',
        details: { fileName: repair.fileName, enabled: repair.enabled }
      })
    }
    if (persistence) await persistence
    return nextSettings
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
  onSystemCursorFallback = () => {},
  persistSystemCursorFallback
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
        ? { ...currentSettings, customCursorScope: 'openpet' }
        : currentSettings
      const persistedFallback = currentSettings.customCursorScope === 'system'
        ? (typeof persistSystemCursorFallback === 'function'
          ? await persistSystemCursorFallback(fallbackSettings)
          : petService.saveSettings(fallbackSettings))
        : fallbackSettings
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
      onSystemCursorFallback(persistedFallback || fallbackSettings)
    }
  })
}

const hasIncompleteCustomCursorMetrics = (cursor) => {
  const normalized = normalizeRepairCandidate(cursor)
  if (!normalized?.assetPath) return false
  return normalized.width <= 0 || normalized.height <= 0 || normalized.baseWidth <= 0 || normalized.baseHeight <= 0
}

const repairCustomCursorRecord = async (cursorAssetService, cursor) => {
  const normalized = normalizeRepairCandidate(cursor)
  if (!normalized || !hasIncompleteCustomCursorMetrics(normalized)) return normalized
  const builtinCursor = createPersistedCursorRecord(getBuiltinCursorById(normalized.id))
  if (builtinCursor) {
    const repaired = normalizeCustomCursorRecord({
      ...normalized, assetPath: builtinCursor.assetPath, assetUrl: builtinCursor.assetUrl,
      fileName: builtinCursor.fileName, width: builtinCursor.width, height: builtinCursor.height,
      hotspotX: builtinCursor.hotspotX, hotspotY: builtinCursor.hotspotY,
      baseWidth: builtinCursor.width, baseHeight: builtinCursor.height,
      baseHotspotX: builtinCursor.hotspotX, baseHotspotY: builtinCursor.hotspotY, sizePercent: 100
    })
    return resizeCustomCursorRecord(repaired, normalized.sizePercent) || repaired
  }
  const repaired = await cursorAssetService.repairCursor(normalized)
  const base = normalizeCustomCursorRecord({
    ...normalized, assetPath: repaired.assetPath, assetUrl: repaired.assetUrl, fileName: repaired.fileName,
    width: repaired.width, height: repaired.height, hotspotX: repaired.hotspotX, hotspotY: repaired.hotspotY,
    baseWidth: repaired.width, baseHeight: repaired.height,
    baseHotspotX: repaired.hotspotX, baseHotspotY: repaired.hotspotY, sizePercent: 100
  })
  return resizeCustomCursorRecord(base, normalized.sizePercent) || base
}

const mergeCursorRepair = (before, repaired, latest) => {
  const normalizedBefore = normalizeRepairCandidate(before)
  const normalizedRepaired = normalizeRepairCandidate(repaired)
  const normalizedLatest = normalizeRepairCandidate(latest)
  if (!normalizedBefore || !normalizedRepaired || !normalizedLatest || !hasIncompleteCustomCursorMetrics(normalizedLatest)) return normalizedLatest || latest
  if (!['id', 'source', 'assetPath', 'assetUrl', 'fileName'].every((key) => normalizedBefore[key] === normalizedLatest[key])) return normalizedLatest
  const baseWidth = normalizedRepaired.baseWidth || normalizedRepaired.width
  const baseHeight = normalizedRepaired.baseHeight || normalizedRepaired.height
  const base = normalizeCustomCursorRecord({
    ...normalizedLatest, assetPath: normalizedRepaired.assetPath, assetUrl: normalizedRepaired.assetUrl,
    fileName: normalizedRepaired.fileName, width: baseWidth, height: baseHeight,
    hotspotX: normalizedRepaired.baseHotspotX ?? normalizedRepaired.hotspotX,
    hotspotY: normalizedRepaired.baseHotspotY ?? normalizedRepaired.hotspotY,
    baseWidth, baseHeight, baseHotspotX: normalizedRepaired.baseHotspotX ?? normalizedRepaired.hotspotX,
    baseHotspotY: normalizedRepaired.baseHotspotY ?? normalizedRepaired.hotspotY, sizePercent: 100
  })
  return resizeCustomCursorRecord(base, normalizedLatest.sizePercent) || base
}

const mergeActiveCursorRepair = (before, repaired, latest) => {
  if (!before || !repaired || !latest || !hasIncompleteCustomCursorMetrics(latest)) return latest
  const sameAsset = (
    (before.assetPath && before.assetPath === latest.assetPath)
    || (before.assetUrl && before.assetUrl === latest.assetUrl)
  )
  if (!sameAsset) return latest
  return {
    ...latest,
    assetPath: repaired.assetPath,
    assetUrl: repaired.assetUrl,
    fileName: repaired.fileName,
    width: repaired.width,
    height: repaired.height,
    hotspotX: repaired.hotspotX,
    hotspotY: repaired.hotspotY
  }
}

module.exports = {
  applyCursorRepairToCollection,
  hasCursorRepairChanged,
  maybeStartLocalHttp,
  registerCursorRepair,
  runPostPluginStartupSideEffects
}
