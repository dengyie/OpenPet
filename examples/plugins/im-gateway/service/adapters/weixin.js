const createWeixinAdapter = () => ({
  id: 'weixin',
  platform: 'weixin',
  onMessage: () => {},
  start: async () => {},
  stop: async () => {},
  getStatus: () => ({ enabled: false, status: 'disabled', mode: '' })
})

module.exports = {
  createWeixinAdapter
}
