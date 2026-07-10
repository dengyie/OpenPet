const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const { __testInternals, createFullPetActionPosePrompt, generateViaHostModelBridge } = require('../../examples/plugins/creator-studio/lib/host-model-bridge')
const {
  OFFICIAL_FULL_PET_ACTION_IDS,
  OFFICIAL_FULL_PET_ROWS
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
const { getActionSheetLayout } = require('../../examples/plugins/creator-studio/lib/action-sheet-layout')

const OFFICIAL_FULL_PET_ROW_BY_ID = new Map(OFFICIAL_FULL_PET_ROWS.map((row) => [row.id, row]))

const writeMockBaseProviderPng = async (outputPath) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="256" cy="300" rx="82" ry="112" fill="#d89b45" />
          <circle cx="256" cy="196" r="72" fill="#e2ad5b" />
          <circle cx="224" cy="190" r="10" fill="#4f8c42" />
          <circle cx="288" cy="190" r="10" fill="#4f8c42" />
          <ellipse cx="256" cy="294" rx="38" ry="74" fill="#f2dcc0" />
          <ellipse cx="214" cy="420" rx="28" ry="14" fill="#d89b45" />
          <ellipse cx="298" cy="420" rx="28" ry="14" fill="#d89b45" />
        </svg>
      `),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(outputPath)
}

const writeMockOfficialRowStripPng = async ({ outputPath, actionId }) => {
  const row = OFFICIAL_FULL_PET_ROW_BY_ID.get(actionId)
  if (!row) throw new Error(`Unknown test official row: ${actionId}`)
  const cellWidth = 192
  const cellHeight = 208
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const composites = row.durations.map((_duration, index) => ({
    input: Buffer.from(`
      <svg width="${cellWidth}" height="${cellHeight}" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="96" cy="124" rx="38" ry="50" fill="#d89b45" />
        <circle cx="96" cy="78" r="34" fill="#e2ad5b" />
        <circle cx="82" cy="76" r="5" fill="#4f8c42" />
        <circle cx="110" cy="76" r="5" fill="#4f8c42" />
        <ellipse cx="96" cy="134" rx="20" ry="32" fill="#f2dcc0" />
        <rect x="${118 + (index % 3)}" y="${82 - (index % 4)}" width="10" height="${30 + (index % 5)}" rx="5" fill="#d89b45" />
        <ellipse cx="78" cy="174" rx="13" ry="7" fill="#d89b45" />
        <ellipse cx="114" cy="174" rx="13" ry="7" fill="#d89b45" />
      </svg>
    `),
    left: index * cellWidth,
    top: 0
  }))
  await sharp({
    create: {
      width: row.frameCount * cellWidth,
      height: cellHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)
}

const writeMockActionSheetPng = async ({ outputPath, actionId }) => {
  const row = OFFICIAL_FULL_PET_ROW_BY_ID.get(actionId)
  if (!row) throw new Error(`Unknown test official row: ${actionId}`)
  const { columns, rows } = getActionSheetLayout(row.frameCount)
  const cellWidth = 256
  const cellHeight = 256
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const composites = row.durations.map((_duration, index) => ({
    input: Buffer.from(`
      <svg width="${cellWidth}" height="${cellHeight}" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="128" cy="150" rx="50" ry="60" fill="#d89b45" />
        <circle cx="128" cy="92" r="42" fill="#e2ad5b" />
        <circle cx="111" cy="90" r="6" fill="#4f8c42" />
        <circle cx="145" cy="90" r="6" fill="#4f8c42" />
        <ellipse cx="128" cy="162" rx="24" ry="36" fill="#f2dcc0" />
        <rect x="${154 + (index % 3)}" y="${98 - (index % 4)}" width="12" height="${36 + (index % 5)}" rx="6" fill="#d89b45" />
        <ellipse cx="${104 - (index % 3) * 3}" cy="210" rx="16" ry="9" fill="#d89b45" />
        <ellipse cx="${152 + (index % 3) * 3}" cy="210" rx="16" ry="9" fill="#d89b45" />
      </svg>
    `),
    left: (index % columns) * cellWidth,
    top: Math.floor(index / columns) * cellHeight
  }))
  await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)
}

const writeMockProviderImage = async ({ outputPath, dataRelativeDir }) => {
  const officialRowMatch = String(dataRelativeDir || '').match(/\/official-rows\/([^/]+)-row-strip$/)
  if (officialRowMatch) {
    await writeMockOfficialRowStripPng({ outputPath, actionId: officialRowMatch[1] })
    return
  }
  const actionSheetMatch = String(dataRelativeDir || '').match(/\/frames\/base\/([^/]+)-keyframe-row$/)
  if (actionSheetMatch) {
    await writeMockActionSheetPng({ outputPath, actionId: actionSheetMatch[1] })
    return
  }
  await writeMockBaseProviderPng(outputPath)
}

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
  assert.match(prompt, /2 columns by 2 rows/i)
  assert.doesNotMatch(prompt, /one horizontal row/i)
})

test('host model bridge does not upload a canonical reference symlink that escapes the data directory', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-escaped-reference-'))
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-outside-'))
  const outsidePath = path.join(outsideDir, 'outside.png')
  const sourceRelativePath = 'runs/run-escaped-reference/inputs/references/cat.png'
  await writeMockBaseProviderPng(outsidePath)
  fs.mkdirSync(path.dirname(path.join(dataDir, sourceRelativePath)), { recursive: true })
  fs.symlinkSync(outsidePath, path.join(dataDir, sourceRelativePath))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => {
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
      requests.push({
        dataRelativeDir,
        referenceRoles: Array.isArray(payload.referenceImages)
          ? payload.referenceImages.map((reference) => reference.role)
          : []
      })
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      await writeMockProviderImage({ outputPath: path.join(dataDir, dataRelativePath), dataRelativeDir })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: payload.model,
          outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
        }
      }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  try {
    await assert.rejects(() => generateViaHostModelBridge({
      backend: 'provider',
      dataDir,
      run: {
        runId: 'run-escaped-reference',
        petId: 'escaped-cat',
        input: {
          referenceImage: {
            fileName: 'cat.png',
            relativePath: sourceRelativePath,
            width: 512,
            height: 512,
            contentHash: 'source-hash'
          }
        },
        generationTask: {
          mode: 'single-action',
          characterBrief: 'Exact source cat.',
          actions: [{
            actionId: 'waving',
            name: 'Waving',
            motionPrompt: 'Wave one front paw.',
            frameCount: 4,
            loop: true,
            transparentBackground: true,
            synthesisMode: 'canonical-frame'
          }]
        }
      }
    }), /provider complete sprite rows are required/i)

    assert.equal(requests.length, 0)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge generates text-only full-pet rows through per-action conditioning boards', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-'))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/creator/model-settings') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: true, config: { provider: 'local', model: 'pet-model', timeoutMs: 480000 } }))
        return
      }
      if (request.url !== '/creator/model-image-generate') {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      const dataRelativeDir = String(payload.output?.dataRelativeDir || '')
      requests.push({
        dataRelativeDir,
        timeoutMs: Number(payload.timeoutMs) || 0,
        referenceRoles: Array.isArray(payload.referenceImages)
          ? payload.referenceImages.map((reference) => reference.role)
          : []
      })
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      await writeMockProviderImage({ outputPath, dataRelativeDir })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: 'pet-model',
          outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
        }
      }))
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

    assert.equal(result.outputs.length, 1)
    assert.deepEqual(result.basicActionGeneration.attemptedActionIds, OFFICIAL_FULL_PET_ACTION_IDS)
    assert.equal(result.basicActionGeneration.attempts.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    const startRequests = requests.filter((entry) => /-start-keyframe$/.test(entry.dataRelativeDir))
    const peakRequests = requests.filter((entry) => /-peak-keyframe$/.test(entry.dataRelativeDir))
    const finalRequests = requests.filter((entry) => /-keyframe-row$/.test(entry.dataRelativeDir))
    assert.equal(startRequests.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    assert.equal(peakRequests.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    assert.equal(finalRequests.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    assert.equal(requests.some((entry) => /\/official-rows\//.test(entry.dataRelativeDir)), false)
    assert.equal(startRequests.every((entry) => entry.referenceRoles[0] === 'canonical-reference'), true)
    assert.equal(peakRequests.every((entry) => entry.referenceRoles[0] === 'canonical-reference'), true)
    assert.equal(finalRequests.every((entry) => entry.referenceRoles[0] === 'keyframe-action-reference-board'), true)
    assert.equal(startRequests.every((entry) => entry.timeoutMs === 480000), true)
    assert.equal(peakRequests.every((entry) => entry.timeoutMs === 480000), true)
    assert.equal(finalRequests.every((entry) => entry.timeoutMs === 480000), true)
    assert.equal(result.officialRows.rows.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge conditions every official full-pet action with provider start and peak keyframes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-conditioned-full-pet-'))
  const sourceRelativePath = 'runs/run-conditioned-full-pet/inputs/references/cat.png'
  await writeMockBaseProviderPng(path.join(dataDir, sourceRelativePath))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => {
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
      requests.push({
        dataRelativeDir,
        referenceRoles: Array.isArray(payload.referenceImages)
          ? payload.referenceImages.map((reference) => reference.role)
          : []
      })
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      await writeMockProviderImage({ outputPath, dataRelativeDir })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: payload.model,
          outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
        }
      }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  try {
    const actions = OFFICIAL_FULL_PET_ROWS.map((row) => ({
      actionId: row.id,
      name: row.id,
      motionPrompt: `${row.id} motion`,
      frameCount: row.frameCount,
      loop: true,
      transparentBackground: true,
      synthesisMode: 'canonical-frame'
    }))
    const result = await generateViaHostModelBridge({
      backend: 'provider',
      dataDir,
      run: {
        runId: 'run-conditioned-full-pet',
        petId: 'conditioned-cat',
        input: {
          referenceImage: {
            fileName: 'cat.png',
            relativePath: sourceRelativePath,
            width: 512,
            height: 512,
            contentHash: 'source-hash'
          },
          generationTask: {
            mode: 'full-pet',
            characterBrief: 'Exact source cat.',
            actions
          }
        },
        generationTask: {
          mode: 'full-pet',
          characterBrief: 'Exact source cat.',
          actions
        }
      }
    })

    const startRequests = requests.filter((entry) => /-start-keyframe$/.test(entry.dataRelativeDir))
    const peakRequests = requests.filter((entry) => /-peak-keyframe$/.test(entry.dataRelativeDir))
    const finalRequests = requests.filter((entry) => /-keyframe-row$/.test(entry.dataRelativeDir))
    const legacyRowRequests = requests.filter((entry) => /\/official-rows\//.test(entry.dataRelativeDir))
    assert.equal(startRequests.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    assert.equal(peakRequests.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    assert.equal(finalRequests.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    assert.equal(legacyRowRequests.length, 0)
    assert.equal(startRequests.every((entry) => entry.referenceRoles.length === 1 && entry.referenceRoles[0] === 'canonical-reference'), true)
    assert.equal(peakRequests.every((entry) => entry.referenceRoles.length === 1 && entry.referenceRoles[0] === 'canonical-reference'), true)
    assert.equal(finalRequests.every((entry) => entry.referenceRoles.length === 1 && entry.referenceRoles[0] === 'keyframe-action-reference-board'), true)
    assert.equal(result.officialRows.rows.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge falls back to a discovered working model for full-pet official row generation', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-fallback-'))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/creator/model-settings') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            model: 'gpt-image-2',
            timeoutMs: 300000,
            modelCatalog: {
              models: ['gpt-image-2', 'gpt-image-1.5']
            }
          }
        }))
        return
      }
      if (request.url !== '/creator/model-image-generate') {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      requests.push({
        model: payload.model,
        dataRelativeDir: String(payload.output?.dataRelativeDir || '')
      })
      if (payload.model === 'gpt-image-2') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'Failed to perform, curl: (97) cannot complete SOCKS5 connection' }))
        return
      }
      const dataRelativeDir = String(payload.output?.dataRelativeDir || '')
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      await writeMockProviderImage({ outputPath, dataRelativeDir })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: payload.model,
          outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
        }
      }))
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
        runId: 'run-bridge-fallback',
        petId: 'bridge-cat',
        input: {
          referenceImage: {
            fileName: 'reference.png',
            relativePath: 'runs/run-bridge-fallback/inputs/references/reference.png',
            metadataRelativePath: 'runs/run-bridge-fallback/inputs/references/reference.json',
            contentHash: 'hash'
          }
        },
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
    })

    assert.equal(result.model, 'gpt-image-1.5')
    assert.deepEqual(result.modelAttempts.map((entry) => entry.model), ['gpt-image-2', 'gpt-image-1.5'])
    assert.equal(result.basicActionGeneration.attempts.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    assert.deepEqual(result.basicActionGeneration.attemptedActionIds, OFFICIAL_FULL_PET_ACTION_IDS)
    assert.equal(result.officialRows.rows.length, OFFICIAL_FULL_PET_ACTION_IDS.length)
    assert.equal(requests.some((entry) => entry.model === 'gpt-image-2'), true)
    assert.equal(requests.some((entry) => entry.model === 'gpt-image-1.5'), true)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge only retries openai-compatible image-edit fallbacks with supported models and extends retry timeout', async () => {
  assert.deepEqual(__testInternals.buildModelCandidateList({
    settings: { provider: 'openai-compatible', modelCatalog: { models: ['gemini-image', 'grok-imagine-image', 'gpt-image-1.5'] } },
    preferredModel: 'gpt-image-2'
  }), ['gpt-image-2', 'gpt-image-1.5', 'grok-imagine-image'])
  return
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-compatible-fallback-'))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/creator/model-settings') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            model: 'gpt-image-2',
            timeoutMs: 300000,
            modelCatalog: {
              models: ['gemini-image', 'grok-imagine-image', 'gpt-image-1.5']
            }
          }
        }))
        return
      }
      if (request.url !== '/creator/model-image-generate') {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      requests.push({
        model: payload.model,
        timeoutMs: payload.timeoutMs
      })
      if (payload.model === 'gpt-image-2' || payload.model === 'gpt-image-1.5') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'Image Provider generation timed out after 300000ms' }))
        return
      }
      const dataRelativeDir = String(payload.output?.dataRelativeDir || '')
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, 'png placeholder')
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: payload.model,
          outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
        }
      }))
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
        runId: 'run-bridge-compatible-fallback',
        petId: 'bridge-cat',
        input: {
          referenceImage: {
            fileName: 'reference.png',
            relativePath: 'runs/run-bridge-compatible-fallback/inputs/references/reference.png',
            metadataRelativePath: 'runs/run-bridge-compatible-fallback/inputs/references/reference.json',
            contentHash: 'hash'
          }
        },
        generationTask: {
          mode: 'single-action',
          characterBrief: 'Bridge cat',
          actions: [{
            actionId: 'wave',
            name: 'Wave',
            motionPrompt: 'friendly wave',
            frameCount: 6,
            loop: false,
            transparentBackground: true
          }]
        }
      }
    })

    assert.equal(result.model, 'grok-imagine-image')
    assert.deepEqual(requests.map((entry) => entry.model), [
      'gpt-image-2',
      'gpt-image-1.5',
      'grok-imagine-image'
    ])
    assert.equal(requests.some((entry) => entry.model === 'gemini-image'), false)
    assert.deepEqual(requests.map((entry) => entry.timeoutMs), [300000, 600000, 600000])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge prefers host-owned verified fallback policy over discovered model heuristics', async () => {
  assert.deepEqual(__testInternals.buildModelCandidateList({
    settings: { provider: 'openai-compatible', creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'], fallbackModels: [] } },
    preferredModel: 'gpt-image-2'
  }), ['gpt-image-2'])
  return
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-policy-fallback-'))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/creator/model-settings') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            model: 'gpt-image-2',
            timeoutMs: 300000,
            modelCatalog: {
              models: ['gpt-image-2', 'gpt-image-1.5', 'grok-imagine-image']
            },
            creatorWorkflowModelPolicy: {
              evidenceScope: 'creator-one-click-default',
              preferredModel: 'gpt-image-2',
              verifiedModels: ['gpt-image-2'],
              fallbackModels: [],
              discoveredModels: ['gpt-image-2', 'gpt-image-1.5', 'grok-imagine-image'],
              preferredModelVerified: true
            }
          }
        }))
        return
      }
      if (request.url !== '/creator/model-image-generate') {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      requests.push(payload.model)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'Image Provider generation timed out after 300000ms' }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  try {
    await assert.rejects(() => generateViaHostModelBridge({
      backend: 'provider',
      dataDir,
      run: {
        runId: 'run-bridge-policy-fallback',
        petId: 'bridge-cat',
        input: {
          referenceImage: {
            fileName: 'reference.png',
            relativePath: 'runs/run-bridge-policy-fallback/inputs/references/reference.png',
            metadataRelativePath: 'runs/run-bridge-policy-fallback/inputs/references/reference.json',
            contentHash: 'hash'
          }
        },
        generationTask: {
          mode: 'single-action',
          characterBrief: 'Bridge cat',
          actions: [{
            actionId: 'wave',
            name: 'Wave',
            motionPrompt: 'friendly wave',
            frameCount: 6,
            loop: false,
            transparentBackground: true
          }]
        }
      }
    }), /timed out/i)

    assert.deepEqual(requests, ['gpt-image-2'])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge skips an unverified preferred model when host policy exposes the verified creator workflow candidates', async () => {
  assert.deepEqual(__testInternals.buildModelCandidateList({
    settings: { provider: 'openai-compatible', creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'], fallbackModels: [] } },
    preferredModel: 'grok-imagine-image'
  }), ['gpt-image-2'])
  return
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-policy-preferred-'))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/creator/model-settings') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            model: 'grok-imagine-image',
            timeoutMs: 300000,
            modelCatalog: {
              models: ['gpt-image-2', 'gpt-image-1.5', 'grok-imagine-image']
            },
            creatorWorkflowModelPolicy: {
              evidenceScope: 'creator-one-click-default',
              preferredModel: 'grok-imagine-image',
              verifiedModels: ['gpt-image-2'],
              fallbackModels: [],
              discoveredModels: ['gpt-image-2', 'gpt-image-1.5', 'grok-imagine-image'],
              preferredModelVerified: false
            }
          }
        }))
        return
      }
      if (request.url !== '/creator/model-image-generate') {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      requests.push(payload.model)
      const dataRelativeDir = String(payload.output?.dataRelativeDir || '')
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, 'png placeholder')
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: payload.model,
          outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
        }
      }))
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
        runId: 'run-bridge-policy-preferred',
        petId: 'bridge-cat',
        input: {
          referenceImage: {
            fileName: 'reference.png',
            relativePath: 'runs/run-bridge-policy-preferred/inputs/references/reference.png',
            metadataRelativePath: 'runs/run-bridge-policy-preferred/inputs/references/reference.json',
            contentHash: 'hash'
          }
        },
        generationTask: {
          mode: 'single-action',
          characterBrief: 'Bridge cat',
          actions: [{
            actionId: 'wave',
            name: 'Wave',
            motionPrompt: 'friendly wave',
            frameCount: 6,
            loop: false,
            transparentBackground: true
          }]
        }
      }
    })

    assert.equal(result.model, 'gpt-image-2')
    assert.deepEqual(requests, ['gpt-image-2'])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge fails fast when the host policy exposes no verified creator workflow image model', async () => {
  assert.deepEqual(__testInternals.buildModelCandidateList({
    settings: { provider: 'openai-compatible', creatorWorkflowModelPolicy: { verifiedModels: [], fallbackModels: [] } },
    preferredModel: 'grok-imagine-image'
  }), [])
  return
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-policy-empty-'))
  const server = http.createServer((request, response) => {
    if (request.url === '/creator/model-settings') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        config: {
          provider: 'openai-compatible',
          model: 'grok-imagine-image',
          timeoutMs: 300000,
          modelCatalog: {
            models: ['grok-imagine-image']
          },
          creatorWorkflowModelPolicy: {
            evidenceScope: 'creator-one-click-default',
            preferredModel: 'grok-imagine-image',
            verifiedModels: [],
            fallbackModels: [],
            discoveredModels: ['grok-imagine-image'],
            preferredModelVerified: false
          }
        }
      }))
      return
    }
    response.writeHead(500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: false, error: 'should not call model generate without a verified model' }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  try {
    await assert.rejects(() => generateViaHostModelBridge({
      backend: 'provider',
      dataDir,
      run: {
        runId: 'run-bridge-policy-empty',
        petId: 'bridge-cat',
        input: {
          referenceImage: {
            fileName: 'reference.png',
            relativePath: 'runs/run-bridge-policy-empty/inputs/references/reference.png',
            metadataRelativePath: 'runs/run-bridge-policy-empty/inputs/references/reference.json',
            contentHash: 'hash'
          }
        },
        generationTask: {
          mode: 'single-action',
          characterBrief: 'Bridge cat',
          actions: [{
            actionId: 'wave',
            name: 'Wave',
            motionPrompt: 'friendly wave',
            frameCount: 6,
            loop: false,
            transparentBackground: true
          }]
        }
      }
    }), /no verified image model available/i)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})
