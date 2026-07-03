const { normalizeCursorSettingsState } = require('../../shared/cursor-library')
const { createLocalHttpToken } = require('../services/local-http-service')

const createPetRendererSettings = (settings = {}) => {
  const cursorState = normalizeCursorSettingsState(settings)
  return {
    scale: settings.scale,
    walkSpeed: settings.walkSpeed,
    walkDuration: settings.walkDuration,
    bubbleDuration: settings.bubbleDuration,
    menuPosition: settings.menuPosition || 'auto',
    selectedCursorId: cursorState.selectedCursorId,
    customCursor: cursorState.customCursor,
    customCursors: cursorState.customCursors,
    grounded: Boolean(settings.petBehavior?.grounded),
    home: {
      enabled: Boolean(settings.petBehavior?.home?.enabled),
      radius: settings.petBehavior?.home?.radius || 'medium',
      hasAnchor: Boolean(settings.petBehavior?.home?.anchor)
    },
    petBubbleChat: {
      enabled: settings.petBubbleChat?.enabled !== false,
      autoPopup: settings.petBubbleChat?.autoPopup !== false,
      autoHide: settings.petBubbleChat?.autoHide !== false,
      pinOnInteraction: settings.petBubbleChat?.pinOnInteraction !== false
    }
  }
}

const mergePetSettingsViewIntoHostSettings = (currentSettings = {}, nextSettings = {}) => {
  const currentHome = currentSettings.petBehavior?.home || {}
  const nextHome = nextSettings.home || {}
  const cursorState = normalizeCursorSettingsState({
    selectedCursorId: nextSettings.selectedCursorId ?? currentSettings.selectedCursorId,
    customCursors: nextSettings.customCursors ?? currentSettings.customCursors,
    customCursor: nextSettings.customCursor ?? currentSettings.customCursor
  })

  return {
    ...currentSettings,
    scale: Number(nextSettings.scale ?? currentSettings.scale ?? 1),
    walkSpeed: Number(nextSettings.walkSpeed ?? currentSettings.walkSpeed ?? 2),
    walkDuration: Number(nextSettings.walkDuration ?? currentSettings.walkDuration ?? 15000),
    bubbleDuration: Number(nextSettings.bubbleDuration ?? currentSettings.bubbleDuration ?? 6000),
    menuPosition: nextSettings.menuPosition || currentSettings.menuPosition || 'auto',
    autoStart: Boolean(nextSettings.autoStart ?? currentSettings.autoStart),
    selectedCursorId: cursorState.selectedCursorId,
    customCursors: cursorState.customCursors,
    customCursor: cursorState.customCursor,
    petBubbleChat: {
      ...(currentSettings.petBubbleChat || {}),
      ...(nextSettings.petBubbleChat || {}),
      enabled: nextSettings.petBubbleChat?.enabled ?? currentSettings.petBubbleChat?.enabled ?? true,
      autoPopup: nextSettings.petBubbleChat?.autoPopup ?? currentSettings.petBubbleChat?.autoPopup ?? true,
      autoHide: nextSettings.petBubbleChat?.autoHide ?? currentSettings.petBubbleChat?.autoHide ?? true,
      pinOnInteraction: nextSettings.petBubbleChat?.pinOnInteraction ?? currentSettings.petBubbleChat?.pinOnInteraction ?? true
    },
    petBehavior: {
      ...(currentSettings.petBehavior || {}),
      grounded: Boolean(nextSettings.grounded),
      home: {
        ...(currentHome || {}),
        enabled: Boolean(nextHome.enabled),
        radius: nextHome.radius || currentHome.radius || 'medium',
        anchor: currentHome.anchor || null
      }
    }
  }
}

const normalizeLocalHttpConfig = (currentConfig = {}, nextConfig = {}) => {
  const enabled = Boolean(nextConfig.enabled)
  const token = nextConfig.token || currentConfig.token || (enabled ? createLocalHttpToken() : '')
  return {
    ...currentConfig,
    ...nextConfig,
    host: '127.0.0.1',
    port: Number(nextConfig.port ?? currentConfig.port ?? 0),
    enabled,
    token
  }
}

const collectCustomCursorAssetPaths = (cursors = []) => (
  (Array.isArray(cursors) ? cursors : [])
    .map((cursor) => (typeof cursor?.assetPath === 'string' ? cursor.assetPath : ''))
    .filter((assetPath) => Boolean(assetPath) && !assetPath.startsWith('builtin://'))
)

module.exports = {
  collectCustomCursorAssetPaths,
  createPetRendererSettings,
  mergePetSettingsViewIntoHostSettings,
  normalizeLocalHttpConfig
}
