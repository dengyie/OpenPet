const createNoopActivityLog = () => ({ record: () => {} })

const registerWindowAllClosedPolicy = ({ app, keepAlive = true, activityLog = createNoopActivityLog() } = {}) => {
  if (!app?.on || !app?.quit) throw new Error('Electron app is required')
  app.on('window-all-closed', () => {
    activityLog.record({
      category: 'app',
      action: 'window-all-closed',
      message: 'All windows closed',
      details: { keepAlive }
    })
    if (!keepAlive) app.quit()
  })
}

module.exports = { registerWindowAllClosedPolicy }
