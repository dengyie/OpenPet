const { createTelegramAdapter } = require('./telegram')

const createDefaultAdapters = ({ config, token, logEvent } = {}) => [
  createTelegramAdapter({ config, token, logEvent })
]

module.exports = {
  createDefaultAdapters
}
