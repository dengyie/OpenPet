const { generateFixturePetOutput } = require('./fake-hatch-pet')

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
  fixture: {
    backend: 'fixture',
    run: generateFixturePetOutput
  },
  cloud: createUnavailableAdapter({ backend: 'cloud', label: 'Cloud' }),
  local: createUnavailableAdapter({ backend: 'local', label: 'Local' })
}

const getBackendAdapter = (backend = 'fixture') => {
  const normalized = String(backend || 'fixture').toLowerCase()
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
