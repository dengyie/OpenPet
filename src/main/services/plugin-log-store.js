const MAX_PLUGIN_LOG_ENTRIES = 200

const normalizePluginLog = (entry = {}, index = 0) => ({
  id: Number.isFinite(Number(entry.id)) ? Number(entry.id) : index + 1,
  timestamp: entry.timestamp || new Date().toISOString(),
  level: entry.level === 'error' ? 'error' : 'info',
  pluginId: String(entry.pluginId || ''),
  commandId: String(entry.commandId || ''),
  message: String(entry.message || '')
})

const filterLogs = (logs, filters = {}) => {
  const pluginId = String(filters.pluginId || '').trim()
  const level = String(filters.level || '').trim()
  const query = String(filters.query || '').trim().toLowerCase()

  return logs.filter((entry) => {
    if (pluginId && entry.pluginId !== pluginId) return false
    if (level && entry.level !== level) return false
    if (query) {
      const haystack = `${entry.pluginId} ${entry.commandId} ${entry.message}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

const escapeCsvCell = (value) => {
  const cell = String(value ?? '')
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

const exportLogs = (logs, format = 'json') => {
  if (format === 'csv') {
    const rows = [
      ['timestamp', 'level', 'pluginId', 'commandId', 'message'],
      ...logs.map((entry) => [entry.timestamp, entry.level, entry.pluginId, entry.commandId, entry.message])
    ]
    return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
  }
  return JSON.stringify(logs, null, 2)
}

module.exports = {
  MAX_PLUGIN_LOG_ENTRIES,
  normalizePluginLog,
  filterLogs,
  exportLogs
}
