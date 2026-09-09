const SETTINGS_CHANGED = 'settings:changed'
const SETTINGS_PREVIEW = 'settings:preview'

const cloneSettings = (settings) => structuredClone(settings)

const validateSettings = (settings) => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Settings must be an object')
  }
  return settings
}

const createSettingsService = ({ eventBus, loadSettings, saveSettings, syncSideEffects }) => {
  let currentSettings = loadSettings()

  const get = () => cloneSettings(currentSettings)

  const save = (settings) => {
    const nextSettings = cloneSettings(validateSettings(settings))
    saveSettings(nextSettings)
    currentSettings = nextSettings
    syncSideEffects?.(currentSettings)
    eventBus?.emit(SETTINGS_CHANGED, get())
    return get()
  }

  // Backend settings are authoritative for the Control Center domain, but
  // Shell-only domains still live here during the staged migration. Applying
  // a backend snapshot must therefore update memory without writing root
  // settings.json or claiming ownership of those fields.
  const applyInMemory = (settings) => {
    currentSettings = cloneSettings(validateSettings(settings))
    syncSideEffects?.(currentSettings)
    eventBus?.emit(SETTINGS_CHANGED, get())
    return get()
  }

  // Atomic read-modify-write: the updater receives the current settings
  // snapshot at save-time (not at a prior get() call), eliminating the
  // stale-snapshot race when concurrent async callers write different fields.
  const update = (updater) => {
    const nextSettings = updater(cloneSettings(currentSettings))
    return save(nextSettings)
  }

  const preview = (partialSettings) => {
    const nextSettings = { ...currentSettings, ...partialSettings }
    eventBus?.emit(SETTINGS_PREVIEW, { ...nextSettings })
    return nextSettings
  }

  const reload = () => {
    currentSettings = validateSettings(loadSettings())
    return get()
  }

  return { get, save, update, preview, reload, applyInMemory }
}

module.exports = { SETTINGS_CHANGED, SETTINGS_PREVIEW, createSettingsService }
