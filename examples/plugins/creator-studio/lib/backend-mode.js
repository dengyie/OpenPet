const FIXTURE_BACKEND = 'fixture'
const PROVIDER_BACKEND = 'provider'
const LEGACY_PROVIDER_BACKENDS = new Set(['provider', 'cloud', 'local'])

const normalizeCreatorBackend = (value, fallback = FIXTURE_BACKEND) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === FIXTURE_BACKEND) return FIXTURE_BACKEND
  if (LEGACY_PROVIDER_BACKENDS.has(normalized)) return PROVIDER_BACKEND
  return fallback
}

const usesHostProviderBackend = (value) => normalizeCreatorBackend(value) === PROVIDER_BACKEND

module.exports = {
  FIXTURE_BACKEND,
  PROVIDER_BACKEND,
  normalizeCreatorBackend,
  usesHostProviderBackend
}
