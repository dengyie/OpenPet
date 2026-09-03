const { collectCustomCursorAssetPaths } = require('./ipc/pet-settings-adapter')

function createSettingsHostEffect({ getPetWindow, petService, systemCursorService, cursorAssetService, petMovementPolicy, persistNormalization, applyWindowScale, sendToPetRenderer }) {
  return async ({ settings, previousSettings, version }) => {
    const petWindow = getPetWindow?.()
    const nextSettings = { ...settings, petBehavior: { ...(settings.petBehavior || {}) } }
    const currentHome = nextSettings.petBehavior.home || {}
    if (currentHome.enabled && !currentHome.anchor && petMovementPolicy && petWindow && !petWindow.isDestroyed?.()) {
      nextSettings.petBehavior.home = {
        ...currentHome,
        anchor: petMovementPolicy.createHomeAnchorFromWindow({ windowBounds: petWindow.getBounds() })
      }
    }
    let applied = false
    try {
      await systemCursorService?.sync?.(nextSettings)
      const appliedSettings = petService.applySettings(nextSettings)
      applied = true
      if (nextSettings.scale !== previousSettings?.scale) applyWindowScale?.(petWindow, nextSettings.scale)
      if (currentHome.enabled && currentHome.anchor == null && nextSettings.petBehavior.home.anchor) {
        await persistNormalization?.({ settings: nextSettings, paths: ['petBehavior.home.anchor'], ifVersion: version })
      }
      const previousAssetPaths = new Set(collectCustomCursorAssetPaths(previousSettings?.customCursors))
      const nextAssetPaths = new Set(collectCustomCursorAssetPaths(nextSettings.customCursors))
      const orphaned = Array.from(previousAssetPaths).filter((assetPath) => !nextAssetPaths.has(assetPath))
      if (orphaned.length > 0) cursorAssetService?.deleteAssets?.(orphaned)
      sendToPetRenderer?.(appliedSettings)
      return appliedSettings
    } catch (error) {
      if (applied) petService.applySettings(previousSettings)
      await Promise.resolve(systemCursorService?.sync?.(previousSettings)).catch(() => {})
      throw error
    }
  }
}

module.exports = { createSettingsHostEffect }
