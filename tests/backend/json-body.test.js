const assert = require('node:assert/strict')
const { test } = require('node:test')

test('image-bearing Web routes accept 1.1 MB reference files while other routes keep the default limit', async (t) => {
  const [{ backendJsonBody, sendSuccess }, { createRouter }] = await Promise.all([
    import('../../services/backend/http/middleware.js'),
    import('../../services/backend/http/router.js')
  ])
  const router = createRouter({ basePath: '/api/v1' })
  router.use(backendJsonBody())
  router.post('/creator/references/upload', (ctx) => sendSuccess(ctx, { length: ctx.body.dataBase64.length }))
  router.post('/creator/characters/generate', (ctx) => sendSuccess(ctx, { received: true }))
  router.post('/ai/images/web-generate', (ctx) => sendSuccess(ctx, { received: true }))
  router.post('/other', (ctx) => sendSuccess(ctx, { received: true }))
  const server = require('node:http').createServer(router.handle)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const endpoint = `http://127.0.0.1:${server.address().port}/api/v1`
  const payload = { prompt: 'fox', referenceImage: { mimeType: 'image/png', dataBase64: Buffer.alloc(1_100_000).toString('base64') } }

  const upload = await fetch(`${endpoint}/creator/references/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataBase64: payload.referenceImage.dataBase64 })
  })
  assert.equal(upload.status, 200)
  assert.equal((await upload.json()).data.length, payload.referenceImage.dataBase64.length)

  for (const route of ['/creator/characters/generate', '/ai/images/web-generate']) {
    const response = await fetch(`${endpoint}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    assert.equal(response.status, 200, route)
  }
  const otherRoute = await fetch(`${endpoint}/other`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  })
  assert.equal(otherRoute.status, 413)
})
