const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { test, expect } = require('@playwright/test')

let server
let baseUrl
let requests

test.beforeAll(async () => {
  const [{ createRouter }, middleware] = await Promise.all([
    import('../../services/backend/http/router.js'),
    import('../../services/backend/http/middleware.js')
  ])
  const router = createRouter({ basePath: '/api/v1' })
  router.use(middleware.requestId())
  router.use(middleware.errorBoundary())
  router.use(middleware.loopbackOnly())
  router.use(middleware.cors())
  router.use(middleware.bearerAuth({ getSessionToken: () => 'browser-session-token' }))
  router.use(middleware.jsonBody())
  router.post('/commands', (ctx) => middleware.sendSuccess(ctx, { accepted: ctx.body }))
  router.get('/events', (ctx) => {
    ctx.res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
    ctx.res.end('event: system.ready\ndata: {}\n\n')
  })

  requests = []
  server = createServer((req, res) => {
    requests.push({ method: req.method, path: req.url, origin: req.headers.origin })
    void router.handle(req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`
})

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
})

test('file renderer completes browser preflights before authorized POST and SSE GET', async ({ page }) => {
  const fixture = pathToFileURL(path.join(__dirname, 'fixtures/cors-file-renderer.html')).href
  await page.goto(fixture)

  const result = await page.evaluate(async ({ url }) => {
    const command = await fetch(`${url}/commands`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer browser-session-token',
        'content-type': 'application/json',
        'idempotency-key': 'i_browser',
        'x-client': 'control-center',
        'x-request-id': 'r_browser_command'
      },
      body: JSON.stringify({ action: 'say' })
    })
    const commandBody = await command.json()
    const events = await fetch(`${url}/events?topics=system`, {
      headers: {
        accept: 'text/event-stream',
        authorization: 'Bearer browser-session-token',
        'last-event-id': 'evt_browser'
      }
    })
    return {
      commandStatus: command.status,
      commandBody,
      eventStatus: events.status,
      eventContentType: events.headers.get('content-type'),
      eventBody: await events.text()
    }
  }, { url: baseUrl })

  expect(result.commandStatus).toBe(200)
  expect(result.commandBody.data).toEqual({ accepted: { action: 'say' } })
  expect(result.eventStatus).toBe(200)
  expect(result.eventContentType).toMatch(/^text\/event-stream/)
  expect(result.eventBody).toContain('event: system.ready')

  assert.deepEqual(requests.map(({ method, path }) => [method, path]), [
    ['OPTIONS', '/api/v1/commands'],
    ['POST', '/api/v1/commands'],
    ['OPTIONS', '/api/v1/events?topics=system'],
    ['GET', '/api/v1/events?topics=system']
  ])
  assert.equal(requests.every(({ origin }) => origin === 'null'), true)
})
