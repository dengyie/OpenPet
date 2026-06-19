const focusExistingPetWindow = (petWindow) => {
  if (!petWindow || petWindow.isDestroyed?.()) return
  if (petWindow.isMinimized?.()) petWindow.restore()
  petWindow.focus?.()
}

const sleepFor = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))

const REPLACE_EXISTING_ACTION = 'replace-existing'
const DEFAULT_RETRY_DELAY_MS = 250
const DEFAULT_MAX_WAIT_MS = 3000

const requestSingleInstanceLock = (app) => app.requestSingleInstanceLock({
  openpetAction: REPLACE_EXISTING_ACTION
})

const waitForSingleInstanceLock = async ({
  app,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  sleep = sleepFor,
  now = Date.now
}) => {
  const startedAt = now()

  while (true) {
    if (requestSingleInstanceLock(app)) return true
    if (now() - startedAt >= maxWaitMs) return false
    await sleep(retryDelayMs)
  }
}

const getAdditionalData = (args) => args.find((arg) => (
  arg
  && typeof arg === 'object'
  && !Array.isArray(arg)
  && typeof arg.openpetAction === 'string'
)) || {}

const configureSingleInstanceLock = async ({ app, getPetWindow, retryDelayMs, maxWaitMs, sleep, now } = {}) => {
  if (!app?.requestSingleInstanceLock || !app?.quit || !app?.on) {
    throw new Error('Electron app is required')
  }
  if (typeof getPetWindow !== 'function') {
    throw new Error('getPetWindow is required')
  }

  const gotTheLock = await waitForSingleInstanceLock({ app, retryDelayMs, maxWaitMs, sleep, now })
  if (!gotTheLock) {
    app.quit()
    return false
  }

  app.on('second-instance', (...args) => {
    const additionalData = getAdditionalData(args)
    if (additionalData.openpetAction === REPLACE_EXISTING_ACTION) {
      app.quit()
      return
    }
    focusExistingPetWindow(getPetWindow())
  })
  return true
}

module.exports = {
  configureSingleInstanceLock,
  focusExistingPetWindow,
  waitForSingleInstanceLock
}
