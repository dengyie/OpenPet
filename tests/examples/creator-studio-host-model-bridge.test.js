const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const { __testInternals, generateViaHostModelBridge } = require('../../examples/plugins/creator-studio/lib/host-model-bridge')
const { buildCharacterAnchorPrompt } = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')
const {
  OFFICIAL_FULL_PET_ACTION_IDS,
  OFFICIAL_FULL_PET_ROWS
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
const { getActionSheetLayout } = require('../../examples/plugins/creator-studio/lib/action-sheet-layout')
const { GENERATED_FULL_PET_ACTION_IDS } = require('../../examples/plugins/creator-studio/lib/full-pet-basic-actions')

const OFFICIAL_FULL_PET_ROW_BY_ID = new Map(OFFICIAL_FULL_PET_ROWS.map((row) => [row.id, row]))

const createSyntheticFullPetActionResult = (actionId, runId = 'run-synthetic') => ({
  actionId,
  ok: true,
  outputCount: 1,
  model: 'pet-model',
  modelAttempts: [{ model: 'pet-model', ok: true }],
  keyframes: [{ actionId, keyframeRole: 'start', quality: { ok: true, score: 80 } }],
  generationStages: [{ stage: 'final-image', actionId, ok: true }],
  row: {
    actionId,
    sourceRelativePath: `runs/${runId}/frames/base/${actionId}-keyframe-row/0001.png`,
    quality: 'row-real',
    frames: [{ index: 0, actionId, path: `/tmp/${actionId}-01.png` }]
  }
})

test('host model bridge clamps provider stages to the remaining workflow budget', () => {
  assert.equal(__testInternals.resolveGenerationStageTimeout({
    requestedTimeoutMs: 600000,
    deadlineMs: 11000,
    nowMs: 10000
  }), 1000)
  assert.throws(() => __testInternals.resolveGenerationStageTimeout({
    requestedTimeoutMs: 600000,
    deadlineMs: 10000,
    nowMs: 10000
  }), /time budget/i)
})

test('full-pet generation omits the directional pair and continues when running-left mirroring fails', async () => {
  const generatedActionIds = []

  const result = await __testInternals.generateFullPetBasicActionSources({
      dataDir: '/tmp/creator-studio-mirror-failure',
      run: { runId: 'run-mirror-failure' },
      settings: {},
      selectedModel: 'pet-model',
      requestedTimeoutMs: 300000,
      referenceImages: [],
      generateActionSourceImpl: async ({ actionId }) => {
        generatedActionIds.push(actionId)
        return createSyntheticFullPetActionResult(actionId, 'run-mirror-failure')
      },
      mirrorRowFramesImpl: async () => {
        throw new Error('sharp decode failed')
      },
      writeActionCheckpointImpl: () => {}
    })

  assert.deepEqual(generatedActionIds, GENERATED_FULL_PET_ACTION_IDS)
  assert.equal(result.officialRows.rows.some((row) => row.actionId === 'running-right'), false)
  assert.equal(result.officialRows.rows.some((row) => row.actionId === 'running-left'), false)
  assert.equal(result.officialRows.rows.some((row) => row.actionId === 'waving'), true)
  assert.equal(result.actionAvailability['running-right'].available, false)
  assert.match(result.actionAvailability['running-right'].reason, /mirror/i)
  assert.equal(result.actionAvailability['running-left'].available, false)
})

test('full-pet generation omits a failed optional action and continues later actions', async () => {
  const generatedActionIds = []
  const result = await __testInternals.generateFullPetBasicActionSources({
    dataDir: '/tmp/creator-studio-optional-failure',
    run: { runId: 'run-optional-failure' },
    settings: {},
    selectedModel: 'pet-model',
    requestedTimeoutMs: 300000,
    referenceImages: [],
    generateActionSourceImpl: async ({ actionId }) => {
      generatedActionIds.push(actionId)
      if (actionId === 'running-right') {
        return {
          actionId,
          ok: false,
          outputCount: 0,
          keyframes: [],
          generationStages: [{ stage: 'action-start-keyframe', actionId, ok: false }],
          failureConditions: ['identity-descriptor-distance-high'],
          error: 'identity drift'
        }
      }
      return createSyntheticFullPetActionResult(actionId, 'run-optional-failure')
    },
    writeActionCheckpointImpl: () => {}
  })

  assert.deepEqual(generatedActionIds, GENERATED_FULL_PET_ACTION_IDS)
  assert.equal(result.officialRows.rows.some((row) => row.actionId === 'running-right'), false)
  assert.equal(result.officialRows.rows.some((row) => row.actionId === 'waving'), true)
  assert.equal(result.actionAvailability['running-right'].reason, 'identity-descriptor-distance-high')
})

test('full-pet generation still fails closed when required idle generation fails', async () => {
  await assert.rejects(() => __testInternals.generateFullPetBasicActionSources({
    dataDir: '/tmp/creator-studio-idle-failure',
    run: { runId: 'run-idle-failure' },
    settings: {},
    selectedModel: 'pet-model',
    requestedTimeoutMs: 300000,
    referenceImages: [],
    generateActionSourceImpl: async ({ actionId }) => ({
      actionId,
      ok: false,
      outputCount: 0,
      keyframes: [],
      generationStages: [],
      error: 'idle identity drift'
    }),
    writeActionCheckpointImpl: () => {}
  }), /required idle/i)
})

test('full-pet generation reuses approved action checkpoints and calls Provider only for missing actions', async () => {
  const generatedActionIds = []
  const checkpointedActionIds = []
  const result = await __testInternals.generateFullPetBasicActionSources({
    dataDir: '/tmp/creator-studio-checkpoint-reuse',
    run: { runId: 'run-checkpoint-reuse' },
    settings: {},
    selectedModel: 'pet-model',
    requestedTimeoutMs: 300000,
    referenceImages: [],
    resolveReusableActionResultImpl: ({ actionId }) => (
      actionId === 'idle' ? createSyntheticFullPetActionResult('idle', 'run-checkpoint-reuse') : null
    ),
    generateActionSourceImpl: async ({ actionId }) => {
      generatedActionIds.push(actionId)
      return createSyntheticFullPetActionResult(actionId, 'run-checkpoint-reuse')
    },
    mirrorRowFramesImpl: async ({ frames }) => ({
      frames: frames.map((frame) => ({ ...frame, actionId: 'running-left' })),
      extraction: { sourceKind: 'approved-mirror' }
    }),
    writeActionCheckpointImpl: ({ result: checkpoint }) => {
      checkpointedActionIds.push(checkpoint.actionId)
    }
  })

  assert.equal(generatedActionIds.includes('idle'), false)
  assert.deepEqual(generatedActionIds, GENERATED_FULL_PET_ACTION_IDS.filter((actionId) => actionId !== 'idle'))
  assert.deepEqual(checkpointedActionIds, generatedActionIds)
  assert.equal(result.officialRows.rows.some((row) => row.actionId === 'idle'), true)
})

test('host model bridge delegates transient retry policy to the Host without resending the request', async () => {
  const requests = []
  let failure = null
  try {
    await __testInternals.generateWithModelFallback({
    prompt: 'wave',
    requestedTimeoutMs: 300000,
    referenceImages: [{ role: 'canonical-reference' }],
    runId: 'run-transient-retry',
    dataRelativeDir: 'runs/run-transient-retry/keyframes/start',
    settings: {
      provider: 'openai-compatible',
      creatorWorkflowModelPolicy: {
        verifiedModels: ['gpt-image-2'],
        fallbackModels: []
      }
    },
    preferredModel: 'gpt-image-2',
    callHostImageGenerateImpl: async (request) => {
      requests.push(request)
      throw new Error('Image Provider generation failed with HTTP 524')
    }
    })
  } catch (error) {
    failure = error
  }

  assert.match(String(failure?.message || ''), /HTTP 524/)
  assert.equal(requests.length, 1)
  assert.equal(Object.hasOwn(requests[0], 'model'), false)
  assert.equal(requests[0].constraints.transparent, true)
  assert.equal(requests[0].promptVariants[0].constraints.transparent, true)
  assert.deepEqual(failure.modelAttempts.map((attempt) => ({ model: attempt.model, ok: attempt.ok })), [
    { model: 'gpt-image-2', ok: false }
  ])
})

test('host model bridge sends a fresh compiled prompt variant for every Host fallback candidate', async () => {
  const requests = []
  const result = await __testInternals.generateWithModelFallback({
    prompt: 'opaque primary prompt',
    promptCompiler: {
      modelCapabilityProfile: 'gpt-image-2-v1',
      backgroundStrategy: 'solid-background-then-local-removal'
    },
    constraints: { width: 1024, height: 1024, transparent: false },
    requestedTimeoutMs: 300000,
    referenceImages: [{ role: 'canonical-reference' }],
    runId: 'run-model-aware-fallback',
    dataRelativeDir: 'runs/run-model-aware-fallback/keyframes/start',
    settings: {
      provider: 'openai-compatible',
      creatorWorkflowModelPolicy: {
        verifiedModels: ['gpt-image-2', 'gpt-image-1.5'],
        fallbackModels: ['gpt-image-1.5']
      }
    },
    preferredModel: 'gpt-image-2',
    buildPromptForModel: (model) => buildCharacterAnchorPrompt({
      model,
      appearanceIntent: ['small mint-colored character']
    }),
    callHostImageGenerateImpl: async (request) => {
      requests.push(request)
      return {
        result: {
          model: 'gpt-image-1.5',
          modelAttempts: [
            { model: 'gpt-image-2', ok: false, timeoutMs: 180000 },
            { model: 'gpt-image-1.5', ok: true, timeoutMs: 120000 }
          ]
        }
      }
    }
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].expectedModel, 'gpt-image-2')
  assert.equal(requests[0].promptVariants.length, 2)
  assert.equal(requests[0].promptVariants[0].model, 'gpt-image-2')
  assert.equal(requests[0].promptVariants[0].promptCompiler.modelCapabilityProfile, 'gpt-image-2-v1')
  assert.doesNotMatch(requests[0].promptVariants[0].prompt, /fully transparent/i)
  assert.equal(requests[0].promptVariants[1].model, 'gpt-image-1.5')
  assert.equal(requests[0].promptVariants[1].promptCompiler.modelCapabilityProfile, 'gpt-image-edit-transparent-v1')
  assert.match(requests[0].promptVariants[1].prompt, /fully transparent/i)
  assert.equal(result.selectedModel, 'gpt-image-1.5')
  assert.deepEqual(result.attempts.map((attempt) => attempt.model), ['gpt-image-2', 'gpt-image-1.5'])
})

test('host model bridge does not spend provider calls on default full-pet action poses', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-'))
  const actionRequests = []
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
    }), (error) => {
      assert.equal(error.code, 'reference_image_required')
      assert.match(error.message, /requires one usable local reference image/i)
      return true
    })

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

test('host model bridge fails closed when a full-pet reference record is no longer usable', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-missing-full-pet-reference-'))
  const requests = []
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
      requests.push(payload)
      response.writeHead(500, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'provider must not be called' }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${server.address().port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  try {
    await assert.rejects(() => generateViaHostModelBridge({
      backend: 'provider',
      dataDir,
      run: {
        runId: 'run-missing-full-pet-reference',
        petId: 'missing-reference-cat',
        input: {
          referenceImage: {
            fileName: 'cat.png',
            relativePath: 'runs/run-missing-full-pet-reference/inputs/references/cat.png',
            width: 512,
            height: 512,
            contentHash: 'a'.repeat(64)
          }
        },
        generationTask: {
          mode: 'full-pet',
          styleSource: 'referenceImage',
          characterBrief: 'Preserve the exact source cat.',
          actions: OFFICIAL_FULL_PET_ROWS.map((row) => ({
            actionId: row.id,
            name: row.id,
            motionPrompt: `${row.id} motion`,
            frameCount: row.frameCount,
            loop: true
          }))
        }
      }
    }), (error) => {
      assert.equal(error.code, 'reference_image_required')
      assert.match(error.message, /requires one usable local reference image/i)
      return true
    })

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

test('host model bridge generates reference-conditioned full-pet rows through per-action conditioning boards', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-'))
  const sourceRelativePath = 'runs/run-bridge-concurrency/inputs/references/cat.png'
  await writeMockBaseProviderPng(path.join(dataDir, sourceRelativePath))
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
          styleSource: 'referenceImage',
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
          referenceImage: {
            fileName: 'cat.png',
            relativePath: sourceRelativePath,
            width: 512,
            height: 512,
            contentHash: 'source-hash'
          },
          generationTask: {
            mode: 'full-pet',
            styleSource: 'referenceImage',
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
    assert.deepEqual(result.basicActionGeneration.attemptedActionIds, [])
    assert.equal(result.basicActionGeneration.attempts.length, 0)
    assert.deepEqual(actionRequests, [])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge falls back to a discovered working model for full-pet generation without action pose calls', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-fallback-'))
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
    assert.equal(startRequests.length, GENERATED_FULL_PET_ACTION_IDS.length)
    assert.equal(peakRequests.length, GENERATED_FULL_PET_ACTION_IDS.length)
    assert.equal(finalRequests.length, GENERATED_FULL_PET_ACTION_IDS.length)
    assert.equal(requests.some((entry) => entry.dataRelativeDir.includes('running-left')), false)
    assert.equal(legacyRowRequests.length, 0)
    assert.equal(startRequests.every((entry) => entry.referenceRoles.length === 1 && entry.referenceRoles[0] === 'full-pet-action-identity-board'), true)
    assert.equal(peakRequests.every((entry) => entry.referenceRoles.length === 1 && entry.referenceRoles[0] === 'action-peak-conditioning-board'), true)
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

test('host model bridge stops full-pet generation after the first official action fails', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-full-pet-fail-fast-'))
  const sourceRelativePath = 'runs/run-full-pet-fail-fast/inputs/references/cat.png'
  const sourcePath = path.join(dataDir, sourceRelativePath)
  await writeMockBaseProviderPng(sourcePath)
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')
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
      const dataRelativeDir = String(payload.output?.dataRelativeDir || '')
      requests.push(dataRelativeDir)
      if (
        dataRelativeDir === 'runs/run-full-pet-fail-fast/anchors/character-anchor' ||
        dataRelativeDir === 'runs/run-full-pet-fail-fast/frames/base'
      ) {
        const dataRelativePath = `${dataRelativeDir}/0001.png`
        await writeMockBaseProviderPng(path.join(dataDir, dataRelativePath))
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          ok: true,
          result: { outputs: [{ dataRelativePath, mimeType: 'image/png' }] }
        }))
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'identity source rejected' }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${server.address().port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  try {
    let failure = null
    try {
      await generateViaHostModelBridge({
        backend: 'provider',
        dataDir,
        run: {
          runId: 'run-full-pet-fail-fast',
          petId: 'fail-fast-cat',
          input: {
            referenceImage: {
              fileName: 'cat.png',
              relativePath: sourceRelativePath,
              width: 512,
              height: 512,
              contentHash: sourceHash
            }
          },
          generationTask: {
            mode: 'full-pet',
            styleSource: 'referenceImage',
            characterBrief: 'Exact source cat.',
            actions: OFFICIAL_FULL_PET_ROWS.map((row) => ({
              actionId: row.id,
              name: row.id,
              motionPrompt: `${row.id} motion`,
              frameCount: row.frameCount,
              loop: true
            }))
          }
        }
      })
    } catch (error) {
      failure = error
    }

    assert.match(String(failure?.message || ''), /identity source rejected|official row generation failed/i)
    assert.deepEqual(requests, [
      'runs/run-full-pet-fail-fast/anchors/character-anchor',
      'runs/run-full-pet-fail-fast/frames/base',
      'runs/run-full-pet-fail-fast/keyframes/actions/idle-start-keyframe'
    ])
    const failedStage = failure?.partialGenerationResult?.generationStages?.find((stage) => (
      stage?.actionId === 'idle' && stage?.stage === 'action-start-keyframe'
    ))
    assert.equal(failedStage?.ok, false)
    assert.match(String(failedStage?.error || ''), /identity source rejected/i)
    assert.deepEqual(failure?.partialGenerationResult?.keyframes, [])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge delegates full-pet model selection and retries to the Host', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-fallback-'))
  await writeMockBaseProviderPng(path.join(dataDir, 'runs/run-bridge-fallback/inputs/references/reference.png'))
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
        hasModel: Object.hasOwn(payload, 'model'),
        dataRelativeDir: String(payload.output?.dataRelativeDir || '')
      })
      const dataRelativeDir = String(payload.output?.dataRelativeDir || '')
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      await writeMockProviderImage({ outputPath, dataRelativeDir })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: 'gpt-image-2',
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
    assert.deepEqual(result.basicActionGeneration.attempts, [])
    assert.deepEqual(result.basicActionGeneration.attemptedActionIds, [])
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

test('host model bridge does not forward discovered model candidates or rewrite Host timeouts', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-compatible-fallback-'))
  const referencePath = path.join(dataDir, 'runs/run-bridge-compatible-fallback/inputs/references/reference.png')
  await writeMockBaseProviderPng(referencePath)
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
            actionId: 'waving',
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
    assert.equal(requests.length > 0, true)
    assert.equal(requests.every((entry) => entry.model === undefined), true)
    assert.equal(requests.every((entry) => entry.timeoutMs === 300000), true)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge leaves verified-model policy enforcement to the Host', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-policy-fallback-'))
  await writeMockBaseProviderPng(path.join(dataDir, 'runs/run-bridge-policy-fallback/inputs/references/reference.png'))
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
            actionId: 'waving',
            name: 'Wave',
            motionPrompt: 'friendly wave',
            frameCount: 6,
            loop: false,
            transparentBackground: true
          }]
        }
      }
    }), /timed out/i)

    assert.deepEqual(requests, [undefined])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge accepts the Host-selected model without plugin-side substitution', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-policy-preferred-'))
  await writeMockBaseProviderPng(path.join(dataDir, 'runs/run-bridge-policy-preferred/inputs/references/reference.png'))
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
      await writeMockProviderImage({ outputPath, dataRelativeDir })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: 'grok-imagine-image',
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
            actionId: 'waving',
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
    assert.equal(requests.length > 0, true)
    assert.equal(requests.every((model) => model === undefined), true)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge does not reinterpret an empty Host verified-model policy', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-model-bridge-policy-empty-'))
  await writeMockBaseProviderPng(path.join(dataDir, 'runs/run-bridge-policy-empty/inputs/references/reference.png'))
  let generationRequestCount = 0
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
    generationRequestCount += 1
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
            actionId: 'waving',
            name: 'Wave',
            motionPrompt: 'friendly wave',
            frameCount: 6,
            loop: false,
            transparentBackground: true
          }]
        }
      }
    }), /should not call model generate without a verified model/i)
    assert.equal(generationRequestCount, 1)
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
