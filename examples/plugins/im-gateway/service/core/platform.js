const DEFAULT_PLATFORM = 'telegram'

const normalizePlatform = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return normalized || DEFAULT_PLATFORM
}

const resolvePlatform = (message = {}, adapter = {}) => normalizePlatform(adapter.platform || adapter.id || message.platform)

const platformLabel = (platform = DEFAULT_PLATFORM) => {
  const normalized = normalizePlatform(platform)
  if (normalized === 'telegram') return 'Telegram'
  if (normalized === 'qq-official') return 'QQ Official'
  return normalized.split(/[-_]/g).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
}

module.exports = {
  DEFAULT_PLATFORM,
  normalizePlatform,
  platformLabel,
  resolvePlatform
}
