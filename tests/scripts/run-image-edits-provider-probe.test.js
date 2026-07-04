const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  parseArgs,
  runImageEditsProviderProbe
} = require('../../scripts/run-image-edits-provider-probe')

const createTempPng = () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-provider-probe-')), 'reference.png')
  fs.writeFileSync(filePath, 'fake png bytes')
  return filePath
}

const readMultipartBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('error', reject)
  req.on('end', () => resolve(Buffer.concat(chunks)))
})

const createProbeServer = async () => {
  const requests = []
  const server = http.createServer(async (req, res) => {
    const body = req.method === 'POST' ? await readMultipartBody(req) : Buffer.alloc(0)
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      contentType: req.headers['content-type'] || '',
      contentLength: req.headers['content-length'] || '',
      body
    })

    if (req.method === 'POST' && req.url === '/v1/images/edits') {
      const text = body.toString('utf8')
      if (text.includes('name="model"\r\n\r\ngpt-image-2\r\n')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          data: [{ b64_json: Buffer.from('fake-output').toString('base64') }]
        }))
        return
      }
      if (text.includes('name="model"\r\n\r\ngpt-image-1.5\r\n')) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: {
            message: 'failed to parse multipart form (request id: req-123)',
            code: 'convert_request_failed'
          }
        }))
        return
      }
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'unknown provider' } }))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'not found' } }))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('parseArgs accepts image edits provider probe options', () => {
  const referenceImagePath = createTempPng()
  const parsed = parseArgs([
    '--base-url', 'http://127.0.0.1:8317/v1',
    '--reference-image', referenceImagePath,
    '--api-key-env', 'OPENPET_TEST_KEY',
    '--models', 'gpt-image-2,gpt-image-1.5',
    '--model', 'grok-imagine-image',
    '--timeout-ms', '1234',
    '--prompt', 'keep the same cat',
    '--output', 'report.json',
    '--json'
  ], { OPENPET_TEST_KEY: 'sk-test-secret' })

  assert.equal(parsed.baseUrl, 'http://127.0.0.1:8317/v1')
  assert.equal(parsed.referenceImagePath, referenceImagePath)
  assert.equal(parsed.apiKey, 'sk-test-secret')
  assert.deepEqual(parsed.models, ['gpt-image-2', 'gpt-image-1.5', 'grok-imagine-image'])
  assert.equal(parsed.timeoutMs, 1234)
  assert.equal(parsed.prompt, 'keep the same cat')
  assert.equal(parsed.outputPath, 'report.json')
  assert.equal(parsed.json, true)
})

test('parseArgs treats explicit --model flags as the complete probe list', () => {
  const referenceImagePath = createTempPng()
  const parsed = parseArgs([
    '--base-url', 'http://127.0.0.1:8317/v1',
    '--reference-image', referenceImagePath,
    '--api-key', 'sk-test-secret',
    '--model', 'grok-imagine-image-lite',
    '--model', 'gpt-image-2'
  ])

  assert.deepEqual(parsed.models, ['grok-imagine-image-lite', 'gpt-image-2'])
})

test('runImageEditsProviderProbe writes a sanitized report and classifies multipart failures separately', async () => {
  const provider = await createProbeServer()
  const referenceImagePath = createTempPng()
  const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-provider-probe-report-')), 'report.json')
  try {
    const report = await runImageEditsProviderProbe({
      baseUrl: provider.baseUrl,
      apiKey: 'sk-real-secret-value',
      referenceImagePath,
      models: ['gpt-image-2', 'gpt-image-1.5', 'grok-imagine-image'],
      outputPath,
      now: () => new Date('2026-07-04T10:00:00.000Z')
    })

    assert.equal(report.schemaVersion, 1)
    assert.equal(report.evidenceType, 'image-edits-provider-probe')
    assert.equal(report.generatedAt, '2026-07-04T10:00:00.000Z')
    assert.equal(report.ok, true)
    assert.deepEqual(report.supportedModels, ['gpt-image-2'])
    assert.equal(report.results[0].status, 'pass')
    assert.equal(report.results[1].status, 'multipart-failed')
    assert.equal(report.results[2].status, 'provider-error')
    assert.equal(report.secret.apiKeyPreview, 'sk-r…alue')
    assert.ok(provider.requests.every((request) => request.authorization === 'Bearer sk-real-secret-value'))
    assert.match(provider.requests[0].contentType, /^multipart\/form-data; boundary=----OpenPetProbeBoundary[0-9a-f]+$/)
    assert.equal(provider.requests[0].contentLength, String(provider.requests[0].body.byteLength))
    assert.match(provider.requests[0].body.toString('utf8'), /name="image"; filename="reference\.png"/)
    assert.match(provider.requests[0].body.toString('utf8'), /name="size"\r\n\r\n1024x1024\r\n/)

    const written = fs.readFileSync(outputPath, 'utf8')
    assert.doesNotMatch(written, /sk-real-secret-value/)
  } finally {
    await provider.close()
  }
})

test('cli prints readable validation errors when the reference image is missing', () => {
  const scriptPath = path.resolve(__dirname, '../../scripts/run-image-edits-provider-probe.js')
  const result = spawnSync(process.execPath, [
    scriptPath,
    '--base-url', 'http://127.0.0.1:8317/v1',
    '--reference-image', '/tmp/missing-reference.png',
    '--api-key', 'sk-test-secret'
  ], {
    encoding: 'utf-8',
    env: process.env
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Reference image does not exist/)
})
