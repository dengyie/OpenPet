const SETTINGS_CHANGED = 'settings:changed'
const SETTINGS_PREVIEW = 'settings:preview'

const cloneSettings = (settings) => {
  if (settings == null) return {}
  if (typeof structuredClone === 'function') return structuredClone(settings)
  return JSON.parse(JSON.stringify(settings))
}

const createSettingsService = ({ eventBus, loadSettings, saveSettings, syncSideEffects }) => {
  let currentSettings = cloneSettings(loadSettings())

  const get = () => cloneSettings(currentSettings)

  const save = (settings) => {
    currentSettings = cloneSettings(settings)
    saveSettings(cloneSettings(currentSettings))
    syncSideEffects?.(cloneSettings(currentSettings))
    eventBus?.emit(SETTINGS_CHANGED, get())
    return get()
  }

  const preview = (partialSettings) => {
    const nextSettings = {
      ...currentSettings,
      ...cloneSettings(partialSettings)
    }
    eventBus?.emit(SETTINGS_PREVIEW, cloneSettings(nextSettings))
    return cloneSettings(nextSettings)
  }

  const reload = () => {
    currentSettings = cloneSettings(loadSettings())
    return get()
  }

  return { get, save, preview, reload }
}

module.exports = { SETTINGS_CHANGED, SETTINGS_PREVIEW, createSettingsService }
