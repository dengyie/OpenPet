const closeServerIfListening = async (server) => {
  if (!server?.listening) return
  server.closeAllConnections?.()
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

const closeBrowserIfConnected = async (browser) => {
  if (!browser) return
  if (typeof browser.isConnected === 'function' && !browser.isConnected()) return
  await browser.close()
}

const trackAsyncCleanup = (testContext, cleanup) => {
  let cleanupPromise = null
  const runCleanup = () => {
    if (!cleanupPromise) cleanupPromise = Promise.resolve().then(cleanup)
    return cleanupPromise
  }
  testContext.after(runCleanup)
  return runCleanup
}

const trackServerCleanup = (testContext, server) => trackAsyncCleanup(
  testContext,
  () => closeServerIfListening(server)
)

const trackBrowserCleanup = (testContext, browser) => trackAsyncCleanup(
  testContext,
  () => closeBrowserIfConnected(browser)
)

module.exports = {
  closeBrowserIfConnected,
  closeServerIfListening,
  trackAsyncCleanup,
  trackBrowserCleanup,
  trackServerCleanup
}
