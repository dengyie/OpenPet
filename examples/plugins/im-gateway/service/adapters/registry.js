const { createTelegramAdapter } = require('./telegram')
const { createQqOfficialAdapter } = require('./qq-official')

const createDefaultAdapters = ({ config, token, secrets, httpClient, websocketFactory, now, logEvent } = {}) => [
  createTelegramAdapter({ config, token, logEvent }),
  createQqOfficialAdapter({ config, secrets, httpClient, websocketFactory, now, logEvent })
]

const createAdapterRegistry = ({ factories = {} } = {}) => {
  const registry = new Map(Object.entries({ telegram: createTelegramAdapter, 'qq-official': createQqOfficialAdapter, ...factories }))
  return { get: (id) => registry.get(id), ids: () => [...registry.keys()] }
}

module.exports = {
  createAdapterRegistry,
  createDefaultAdapters
}
