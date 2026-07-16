const { createTelegramAdapter } = require('./telegram')

const createDefaultAdapters = ({ config, token } = {}) => [
  createTelegramAdapter({ config, token })
]

module.exports = {
  createDefaultAdapters
}
