const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  parseArgs,
  runAiProviderSmoke
} = require('../../scripts/run-ai-provider-smoke')

const readJsonBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('error', reject)
  req.on('end', () => {
    try {
      resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {})
    } catch (error) {
      reject(error)
    }
  })
})

const createProviderServer = async () => {
  const requests = []
  const server = http.createServer(async (req, res) => {
    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : null
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body
      })

      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: 'gpt-5.5' }, { id: 'gpt-image-2' }] }))
        return
      }

      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        assert.equal(body.model, 'gpt-5.5')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }))
        return
      }

      if (req.method === 'POST' && req.url === '/v1/images/generations') {
        assert.equal(body.model, 'gpt-image-2')
        assert.equal(Object.hasOwn(body, 'background'), false)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [{ b64_json: Buffer.from('fake-png').toString('base64') }] }))
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'not found' } }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: error.message } }))
    }
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('parseArgs accepts AI provider smoke options without requiring image generation by default', () => {
  const parsed = parseArgs([
    '--base-url', 'http://127.0.0.1:8317/v1',
    '--api-key-env', 'OPENPET_TEST_KEY',
    '--chat-model', 'gpt-5.5',
    '--image-model', 'gpt-image-2',
    '--output', 'smoke.json',
    '--timeout-ms', '1234',
    '--json'
  ], { OPENPET_TEST_KEY: 'sk-test-secret' })

  assert.equal(parsed.baseUrl, 'http://127.0.0.1:8317/v1')
  assert.equal(parsed.apiKey, 'sk-test-secret')
  assert.equal(parsed.chatModel, 'gpt-5.5')
  assert.equal(parsed.imageModel, 'gpt-image-2')
  assert.equal(parsed.includeImage, false)
  assert.equal(parsed.outputPath, 'smoke.json')
  assert.equal(parsed.timeoutMs, 1234)
  assert.equal(parsed.json, true)
})

test('runAiProviderSmoke writes a sanitized report for chat and opt-in image checks', async () => {
  const provider = await createProviderServer()
  const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ai-provider-smoke-')), 'report.json')
  try {
    const report = await runAiProviderSmoke({
      baseUrl: provider.baseUrl,
      apiKey: 'sk-real-secret-value',
      chatModel: 'gpt-5.5',
      imageModel: 'gpt-image-2',
      includeImage: true,
      outputPath,
      now: () => new Date('2026-06-27T00:00:00.000Z')
    })

    assert.equal(report.ok, true)
    assert.equal(report.schemaVersion, 1)
    assert.equal(report.evidenceType, 'ai-provider-smoke')
    assert.match(report.claimBoundary, /image quality and asset readiness still require human review/i)
    assert.equal(report.generatedAt, '2026-06-27T00:00:00.000Z')
    assert.equal(report.provider, 'openai-compatible')
    assert.equal(report.baseUrl, provider.baseUrl)
    assert.equal(report.secret.apiKeyConfigured, true)
    assert.equal(report.secret.apiKeyPreview, 'sk-r…alue')
    assert.equal(report.checks.find((check) => check.id === 'models').status, 'pass')
    assert.equal(report.checks.find((check) => check.id === 'models').containsChatModel, true)
    assert.equal(report.checks.find((check) => check.id === 'models').containsImageModel, true)
    assert.equal(report.checks.find((check) => check.id === 'chat-completions').status, 'pass')
    assert.equal(report.checks.find((check) => check.id === 'image-generations').status, 'pass')
    assert.equal(report.checks.find((check) => check.id === 'image-generations').backgroundMode, 'omitted')

    const written = fs.readFileSync(outputPath, 'utf-8')
    assert.doesNotMatch(written, /sk-real-secret-value/)
    assert.ok(provider.requests.every((request) => request.authorization === 'Bearer sk-real-secret-value'))
    assert.deepEqual(provider.requests.map((request) => `${request.method} ${request.url}`), [
      'GET /v1/models',
      'POST /v1/chat/completions',
      'POST /v1/images/generations'
    ])
  } finally {
    await provider.close()
  }
})

test('runAiProviderSmoke skips image generation unless explicitly requested', async () => {
  const provider = await createProviderServer()
  try {
    const report = await runAiProviderSmoke({
      baseUrl: provider.baseUrl,
      apiKey: 'sk-chat-only-secret',
      chatModel: 'gpt-5.5',
      imageModel: 'gpt-image-2'
    })

    assert.equal(report.ok, true)
    assert.equal(report.schemaVersion, 1)
    assert.equal(report.evidenceType, 'ai-provider-smoke')
    assert.match(report.claimBoundary, /image generation was not executed/i)
    assert.equal(report.checks.find((check) => check.id === 'image-generations').status, 'skipped')
    assert.deepEqual(provider.requests.map((request) => `${request.method} ${request.url}`), [
      'GET /v1/models',
      'POST /v1/chat/completions'
    ])
  } finally {
    await provider.close()
  }
})

test('parseArgs rejects unsafe provider base URLs', () => {
  assert.throws(() => parseArgs([
    '--base-url', 'https://user:pass@example.test/v1',
    '--api-key', 'sk-test',
    '--chat-model', 'gpt-5.5'
  ]), /Base URL must not include credentials/)
})

test('cli prints readable validation errors when no API key is configured', () => {
  const scriptPath = path.resolve(__dirname, '../../scripts/run-ai-provider-smoke.js')
  const result = spawnSync(process.execPath, [scriptPath, '--base-url', 'http://127.0.0.1:8317/v1'], {
    encoding: 'utf-8',
    env: { ...process.env, OPENPET_AI_PROVIDER_API_KEY: '' }
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /API key is required\. Prefer --api-key-env over --api-key\./)
  assert.doesNotMatch(result.stderr, /\[redacted\]\[redacted\]/)
})
