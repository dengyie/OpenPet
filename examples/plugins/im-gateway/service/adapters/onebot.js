const createOneBotAdapter = () => ({
  id: 'qq',
  platform: 'qq',
  onMessage: () => {},
  start: async () => {},
  stop: async () => {},
  getStatus: () => ({ enabled: false, status: 'disabled', mode: '' })
})

module.exports = {
  createOneBotAdapter
}
