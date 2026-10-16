const assert = require('node:assert/strict')
const { test } = require('node:test')

test('only the Creator reference upload route accepts the expanded base64 request size', async (t) => {
  const [{ backendJsonBody, sendSuccess }, { createRouter }] = await Promise.all([
    import('../../services/backend/http/middleware.js'),
    import('../../services/backend/http/router.js')
  ])
  const router = createRouter({ basePath: '/api/v1' })
  router.use(backendJsonBody())
  router.post('/creator/references/upload', (ctx) => sendSuccess(ctx, { length: ctx.body.dataBase64.length }))
  router.post('/creator/characters/generate', (ctx) => sendSuccess(ctx, { received: true }))
  const server = require('node:http').createServer(router.handle)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const endpoint = `http://127.0.0.1:${server.address().port}/api/v1`
  const payload = { dataBase64: 'A'.repeat(1_100_000) }

  const upload = await fetch(`${endpoint}/creator/references/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  assert.equal(upload.status, 200)
  assert.equal((await upload.json()).data.length, 1_100_000)

  const otherRoute = await fetch(`${endpoint}/creator/characters/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  assert.equal(otherRoute.status, 413)
})
