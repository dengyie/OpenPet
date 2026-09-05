const { collectCustomCursorAssetPaths } = require('./ipc/pet-settings-adapter')

function createSettingsHostEffect({ getPetWindow, petService, systemCursorService, cursorAssetService, petMovementPolicy, persistNormalization, onNormalizationError, applyWindowScale, sendToPetRenderer }) {
  let busy = false
  const pending = []
  const sameValue = (left, right) => {
    if (Object.is(left, right)) return true
    if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameValue(value, right[index]))
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    return [...keys].every((key) => sameValue(left[key], right[key]))
  }
  const mergeChanged = (current, previous, next) => {
    if (sameValue(previous, next)) return structuredClone(current)
    if (!next || typeof next !== 'object' || Array.isArray(next) || !previous || typeof previous !== 'object' || Array.isArray(previous)) return structuredClone(next)
    const merged = structuredClone(current || {})
    for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
      if (!Object.hasOwn(next, key)) {
        if (Object.hasOwn(previous, key)) delete merged[key]
        continue
      }
      if (!Object.hasOwn(previous, key) || !sameValue(previous[key], next[key])) merged[key] = mergeChanged(merged[key], previous[key], next[key])
    }
    return merged
  }
  const applyInternal = async ({ settings, previousSettings, version, awaitNormalization = true }) => {
    const currentSettings = petService.getSettings?.() || previousSettings || {}
    const effectivePrevious = previousSettings || currentSettings
    const effectiveSettings = mergeChanged(currentSettings, effectivePrevious, settings)
    const petWindow = getPetWindow?.()
    const requestedSettings = { ...effectiveSettings, petBehavior: { ...(effectiveSettings.petBehavior || {}) } }
    const currentHome = requestedSettings.petBehavior.home || {}
    if (currentHome.enabled && !currentHome.anchor && petMovementPolicy && petWindow && !petWindow.isDestroyed?.()) {
      requestedSettings.petBehavior.home = {
        ...currentHome,
        anchor: petMovementPolicy.createHomeAnchorFromWindow({ windowBounds: petWindow.getBounds() })
      }
    }
    let applied = false
    let appliedSettings = null
    try {
      await systemCursorService?.sync?.(requestedSettings)
      // Native cursor sync is asynchronous. Rebase the settings changed by
      // this operation onto the latest PetService snapshot so an unrelated
      // local IPC write made while sync was pending is retained.
      const latestSettings = petService.getSettings?.() || {}
      const nextSettings = mergeChanged(latestSettings, effectivePrevious, requestedSettings)
      appliedSettings = petService.applySettings(nextSettings)
      applied = true
      if (nextSettings.scale !== previousSettings?.scale) applyWindowScale?.(petWindow, nextSettings.scale)
      if (currentHome.enabled && currentHome.anchor == null && nextSettings.petBehavior.home.anchor) {
        const normalization = persistNormalization?.({ settings: nextSettings, paths: ['petBehavior.home.anchor'], ifVersion: version })
        if (awaitNormalization) await normalization
        else void Promise.resolve(normalization).catch((error) => {
          try {
            onNormalizationError?.(error)
          } catch {
            // Observability must not turn the already-applied host effect into an unhandled rejection.
          }
        })
      }
      const previousAssetPaths = new Set(collectCustomCursorAssetPaths(previousSettings?.customCursors))
      const nextAssetPaths = new Set(collectCustomCursorAssetPaths(nextSettings.customCursors))
      const orphaned = Array.from(previousAssetPaths).filter((assetPath) => !nextAssetPaths.has(assetPath))
      if (orphaned.length > 0) await cursorAssetService?.deleteAssets?.(orphaned)
      sendToPetRenderer?.(appliedSettings)
      return appliedSettings
    } catch (error) {
      if (applied) {
        const latestSettings = petService.getSettings?.() || {}
        const rollbackSettings = mergeChanged(latestSettings, appliedSettings, effectivePrevious)
        petService.applySettings(rollbackSettings)
        await Promise.resolve(systemCursorService?.sync?.(rollbackSettings)).catch(() => {})
      } else {
        await Promise.resolve(systemCursorService?.sync?.(effectivePrevious)).catch(() => {})
      }
      throw error
    }
  }
  const drain = () => {
    if (busy || pending.length === 0) return
    busy = true
    const { input, resolve, reject } = pending.shift()
    Promise.resolve(applyInternal(input)).then(resolve, reject).finally(() => {
      busy = false
      drain()
    })
  }
  return (input) => new Promise((resolve, reject) => {
    pending.push({ input, resolve, reject })
    drain()
  })
}

module.exports = { createSettingsHostEffect }
