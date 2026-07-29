const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const {
  closeBrowserIfConnected,
  closeServerIfListening,
  trackBrowserCleanup,
  trackServerCleanup
} = require('../helpers/test-resource-cleanup')

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

test('tracked server cleanup closes a listener after later setup fails', async () => {
  const server = http.createServer((_request, response) => response.end('ok'))
  const cleanups = []
  const context = { after: (cleanup) => cleanups.push(cleanup) }

  await listen(server)
  const cleanup = trackServerCleanup(context, server)
  assert.equal(server.listening, true)

  await assert.rejects(async () => {
    throw new Error('simulated browser launch failure')
  }, /simulated browser launch failure/)
  await cleanup()
  await cleanups[0]()

  assert.equal(server.listening, false)
  await assert.doesNotReject(() => closeServerIfListening(server))
})

test('tracked browser cleanup closes a connected browser once', async () => {
  let connected = true
  let closeCount = 0
  const browser = {
    isConnected: () => connected,
    close: async () => {
      closeCount += 1
      connected = false
    }
  }
  const cleanups = []
  const context = { after: (cleanup) => cleanups.push(cleanup) }

  const cleanup = trackBrowserCleanup(context, browser)
  await cleanup()
  await cleanups[0]()
  await closeBrowserIfConnected(browser)

  assert.equal(connected, false)
  assert.equal(closeCount, 1)
})
