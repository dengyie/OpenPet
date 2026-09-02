const { createTelegramAdapter } = require('./telegram')
const { createQqOfficialAdapter } = require('./qq-official')
const { createWecomAdapter } = require('./wecom')

const createDefaultAdapters = ({ config, token, secrets, wecomSecrets = {}, httpClient, qqHttpClient = httpClient, wecomHttpClient = httpClient, websocketFactory, now, logEvent } = {}) => [
  createTelegramAdapter({ config, token, logEvent }),
  createQqOfficialAdapter({ config, secrets, httpClient: qqHttpClient, websocketFactory, now, logEvent }),
  createWecomAdapter({ config, secrets: wecomSecrets, logEvent, httpClient: wecomHttpClient })
]

const createAdapterRegistry = ({ factories = {} } = {}) => {
  const registry = new Map(Object.entries({ telegram: createTelegramAdapter, 'qq-official': createQqOfficialAdapter, wecom: createWecomAdapter, ...factories }))
  return { get: (id) => registry.get(id), ids: () => [...registry.keys()] }
}

module.exports = {
  createAdapterRegistry,
  createDefaultAdapters
}
