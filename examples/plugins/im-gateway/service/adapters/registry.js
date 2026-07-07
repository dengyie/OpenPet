const { createTelegramAdapter } = require('./telegram')
const { createOneBotAdapter } = require('./onebot')
const { createWeixinAdapter } = require('./weixin')

const createDefaultAdapters = ({ config, token } = {}) => [
  createTelegramAdapter({ config, token }),
  createOneBotAdapter(),
  createWeixinAdapter()
]

module.exports = {
  createDefaultAdapters
}
