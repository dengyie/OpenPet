const { generateFixturePetOutput } = require('./fake-hatch-pet')
const { FIXTURE_BACKEND, PROVIDER_BACKEND, normalizeCreatorBackend } = require('./backend-mode')

class BackendUnavailableError extends Error {
  constructor({ backend, message }) {
    super(message)
    this.name = 'BackendUnavailableError'
    this.backend = backend
    this.state = 'not_configured'
  }
}

const createUnavailableAdapter = ({ backend, label }) => ({
  backend,
  run() {
    throw new BackendUnavailableError({
      backend,
      message: `${label} backend is not configured. Configure model settings in OpenPet before running this backend.`
    })
  }
})

const adapters = {
  [FIXTURE_BACKEND]: {
    backend: FIXTURE_BACKEND,
    run: generateFixturePetOutput
  },
  [PROVIDER_BACKEND]: createUnavailableAdapter({ backend: PROVIDER_BACKEND, label: 'Provider' })
}

const getBackendAdapter = (backend = FIXTURE_BACKEND) => {
  const normalized = normalizeCreatorBackend(backend, String(backend || '').trim().toLowerCase())
  const adapter = adapters[normalized]
  if (!adapter) {
    throw new BackendUnavailableError({
      backend: normalized,
      message: `Creator Studio backend is not supported: ${normalized}`
    })
  }
  return adapter
}

module.exports = {
  BackendUnavailableError,
  getBackendAdapter
}
