const CURSOR_SETTINGS_KEYS = [
  'selectedCursorId',
  'customCursor',
  'customCursors',
  'hiddenCursorIds',
  'customCursorScope',
  'systemCursorStatus'
]

export const mergeExternalCursorSettings = (currentSettings = {}, externalSettings = {}) => {
  const cursorPatch = {}
  for (const key of CURSOR_SETTINGS_KEYS) {
    if (Object.hasOwn(externalSettings, key)) cursorPatch[key] = externalSettings[key]
  }
  return { ...currentSettings, ...cursorPatch }
}

const cursorSettingsEqual = (left = {}, right = {}) => CURSOR_SETTINGS_KEYS.every((key) => (
  JSON.stringify(left[key]) === JSON.stringify(right[key])
))

export const resolvePersistedCursorMutation = ({ previous, optimistic, current, saved }) => {
  if (saved) {
    if (!cursorSettingsEqual(current, optimistic)) return current
    return mergeExternalCursorSettings(current, saved)
  }
  if (!cursorSettingsEqual(current, optimistic)) return current
  return mergeExternalCursorSettings(current, previous)
}
