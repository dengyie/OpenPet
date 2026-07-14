export const formatPluginLogTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const getPluginLogLevelClass = (level) => {
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warn'
  return 'info'
}

export const formatPluginLogLevel = (level) => {
  if (level === 'error') return 'Error'
  if (level === 'warn') return 'Warning'
  return 'Info'
}

export const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
