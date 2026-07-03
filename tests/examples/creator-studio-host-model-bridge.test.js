const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const { createFullPetActionPosePrompt, generateViaHostModelBridge } = require('../../examples/plugins/creator-studio/lib/host-model-bridge')

test('host model bridge sanitizes full-pet action pose prompts', () => {
  const prompt = createFullPetActionPosePrompt({
    actionId: 'waving',
    run: {
      input: {
        originalPrompt: 'Make a cat with sk-secret123 at /Users/mango/private.png via localhost:3000/debug'
      },
      generationTask: {
        characterBrief: 'Round pet token=secret-value from http://127.0.0.1:9911/provider',
        actions: [{
          actionId: 'waving',
          name: 'wave tokenName',
          motionPrompt: 'wave from C:\\Users\\mango\\secret.png'
        }]
      }
    }
  })

  assert.match(prompt, /\[redacted-secret\]|\[redacted-token\]/)
  assert.match(prompt, /\[redacted-path\]/)
  assert.match(prompt, /\[redacted-local-url\]/)
  assert.doesNotMatch(prompt, /sk-secret123/)
  assert.doesNotMatch(prompt, /\/Users\/mango/)
  assert.doesNotMatch(prompt, /127\.0\.0\.1|localhost/)
  assert.doesNotMatch(prompt, /C:\\Users\\mango/)
})

test('host model bridge runs full-pet basic action generations concurrently with bounded timeouts', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-'))
  const actionRequestTimeouts = []
  let activeActionRequests = 0
  let maxActiveActionRequests = 0
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/creator/model-settings') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: true, config: { provider: 'local', model: 'pet-model', timeoutMs: 300000 } }))
        return
      }
      if (request.url !== '/creator/model-image-generate') {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      const dataRelativeDir = String(payload.output?.dataRelativeDir || '')
      const isActionRequest = /\/frames\/base\/[^/]+$/.test(dataRelativeDir)
      if (isActionRequest) {
        activeActionRequests += 1
        maxActiveActionRequests = Math.max(maxActiveActionRequests, activeActionRequests)
        actionRequestTimeouts.push(Number(payload.timeoutMs) || 0)
      }
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, 'png placeholder')
      setTimeout(() => {
        if (isActionRequest) activeActionRequests -= 1
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          ok: true,
          result: {
            backend: 'provider',
            model: 'pet-model',
            outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
          }
        }))
      }, isActionRequest ? 40 : 0)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  try {
    const result = await generateViaHostModelBridge({
      backend: 'provider',
      dataDir,
      run: {
        runId: 'run-bridge-concurrency',
        petId: 'bridge-cat',
        generationTask: {
          mode: 'full-pet',
          characterBrief: 'Bridge cat',
          actions: [{
            actionId: 'idle',
            name: 'Idle',
            motionPrompt: 'neutral idle pose',
            frameCount: 6,
            loop: true,
            transparentBackground: true
          }]
        },
        input: {
          generationTask: {
            mode: 'full-pet',
            characterBrief: 'Bridge cat',
            actions: [{
              actionId: 'idle',
              name: 'Idle',
              motionPrompt: 'neutral idle pose',
              frameCount: 6,
              loop: true,
              transparentBackground: true
            }]
          }
        }
      }
    })

    assert.equal(result.outputs.length, 5)
    assert.equal(result.basicActionGeneration.attempts.length, 4)
    assert.equal(maxActiveActionRequests > 1, true)
    assert.deepEqual([...new Set(actionRequestTimeouts)], [90000])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})
