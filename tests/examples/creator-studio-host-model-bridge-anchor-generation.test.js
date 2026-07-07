const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const {
  generateAnchorReferences,
  generateViaHostModelBridge
} = require('../../examples/plugins/creator-studio/lib/host-model-bridge')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-anchor-generation-'))

const writeSourceImage = async (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="128" cy="146" rx="74" ry="78" fill="#d7a14b"/>
          <circle cx="128" cy="82" r="54" fill="#e7b65f"/>
          <circle cx="96" cy="82" r="8" fill="#408c42"/>
          <circle cx="160" cy="82" r="8" fill="#408c42"/>
        </svg>
      `),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(filePath)
}

const createFakeImageGenerate = ({ dataDir, calls }) => async ({
  prompt,
  referenceImages,
  dataRelativeDir,
  model,
  requestedTimeoutMs
}) => {
  calls.push({
    prompt,
    model,
    dataRelativeDir,
    referenceRoles: referenceImages.map((reference) => reference.role),
    requestedTimeoutMs
  })
  const dataRelativePath = `${dataRelativeDir}/0001.png`
  const outputPath = path.join(dataDir, dataRelativePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
          <circle cx="128" cy="112" r="48" fill="#e7b65f"/>
          <ellipse cx="128" cy="168" rx="56" ry="58" fill="#d7a14b"/>
        </svg>
      `),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(outputPath)
  return {
    response: {
      result: {
        backend: 'provider',
        model,
        outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
      }
    },
    selectedModel: model,
    attempts: [{
      model,
      ok: true,
      timeoutMs: requestedTimeoutMs,
      referenceRoles: referenceImages.map((reference) => reference.role),
      durationMs: 7
    }]
  }
}

test('anchor generation creates composite, character, and action anchors with one reference per provider call', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'runs/run-anchor/inputs/references/cat.png')
  await writeSourceImage(sourcePath)
  const calls = []

  const result = await generateAnchorReferences({
    dataDir,
    run: {
      runId: 'run-anchor',
      petId: 'anchor-cat',
      generationTask: {
        mode: 'single-action',
        characterBrief: 'Golden cat with green eyes.',
        actions: [{
          actionId: 'waving',
          name: 'Waving',
          motionPrompt: 'Wave with the viewer-right front paw.',
          animationType: 'stationary_loop',
          frameCount: 6
        }]
      },
      input: {
        originalPrompt: 'Golden cat with green eyes.'
      }
    },
    settings: { provider: 'openai-compatible', model: 'gpt-image-2' },
    selectedModel: 'gpt-image-2',
    requestedTimeoutMs: 300000,
    originalReferenceImages: [{
      path: sourcePath,
      fileName: 'cat.png',
      relativePath: 'runs/run-anchor/inputs/references/cat.png',
      role: 'canonical-reference'
    }],
    generateWithFallbackImpl: createFakeImageGenerate({ dataDir, calls })
  })

  assert.equal(result.anchorReferences.version, 1)
  assert.equal(result.anchorReferences.sourcePriority, 'image-first')
  assert.equal(result.anchorReferences.compositeBoard.role, 'composite-reference-board')
  assert.equal(result.anchorReferences.characterAnchor.role, 'character-anchor')
  assert.equal(result.anchorReferences.actionAnchors.length, 1)
  assert.equal(result.anchorReferences.actionAnchors[0].role, 'action-anchor')
  assert.equal(result.anchorReferences.actionAnchors[0].actionId, 'waving')
  assert.deepEqual(result.anchorGeneration.stages.map((stage) => ({
    stage: stage.stage,
    actionId: stage.actionId || '',
    referenceRole: stage.referenceRole,
    outputRelativePath: stage.outputRelativePath,
    promptRelativePath: stage.promptRelativePath || '',
    model: stage.model || ''
  })), [
    {
      stage: 'composite-reference-board',
      actionId: '',
      referenceRole: 'canonical-reference',
      outputRelativePath: 'runs/run-anchor/inputs/anchors/composite-reference-board.png',
      promptRelativePath: '',
      model: ''
    },
    {
      stage: 'character-anchor',
      actionId: '',
      referenceRole: 'composite-reference-board',
      outputRelativePath: 'runs/run-anchor/anchors/character-anchor/0001.png',
      promptRelativePath: 'runs/run-anchor/prompts/anchors/character-anchor.md',
      model: 'gpt-image-2'
    },
    {
      stage: 'action-anchor',
      actionId: 'waving',
      referenceRole: 'character-anchor',
      outputRelativePath: 'runs/run-anchor/anchors/actions/waving-anchor/0001.png',
      promptRelativePath: 'runs/run-anchor/prompts/anchors/actions/waving-anchor.md',
      model: 'gpt-image-2'
    }
  ])
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.compositeBoard.relativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.characterAnchor.relativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.actionAnchors[0].relativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.characterAnchor.promptRelativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.actionAnchors[0].promptRelativePath)), true)

  assert.deepEqual(calls.map((call) => call.referenceRoles), [
    ['composite-reference-board'],
    ['character-anchor']
  ])
  assert.equal(calls.every((call) => call.model === 'gpt-image-2'), true)
  assert.deepEqual(calls.map((call) => call.requestedTimeoutMs), [300000, 300000])
  assert.deepEqual(result.anchorGeneration.stages
    .filter((stage) => stage.stage === 'character-anchor' || stage.stage === 'action-anchor')
    .map((stage) => ({
      stage: stage.stage,
      ok: stage.ok,
      timeoutMs: stage.timeoutMs,
      referenceRoles: stage.referenceRoles,
      attemptTimeoutMs: stage.modelAttempts[0].timeoutMs,
      attemptReferenceRoles: stage.modelAttempts[0].referenceRoles,
      durationMs: stage.durationMs
    })), [
    {
      stage: 'character-anchor',
      ok: true,
      timeoutMs: 300000,
      referenceRoles: ['composite-reference-board'],
      attemptTimeoutMs: 300000,
      attemptReferenceRoles: ['composite-reference-board'],
      durationMs: 7
    },
    {
      stage: 'action-anchor',
      ok: true,
      timeoutMs: 300000,
      referenceRoles: ['character-anchor'],
      attemptTimeoutMs: 300000,
      attemptReferenceRoles: ['character-anchor'],
      durationMs: 7
    }
  ])
})

test('host model bridge runs anchors before final single-action generation and conditions final call on action anchor', async () => {
  const dataDir = makeDataDir()
  const sourceRelativePath = 'runs/run-anchor-flow/inputs/references/cat.png'
  const sourcePath = path.join(dataDir, sourceRelativePath)
  await writeSourceImage(sourcePath)
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/creator/model-settings') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: true, config: { provider: 'openai-compatible', model: 'gpt-image-2', timeoutMs: 300000 } }))
        return
      }
      if (request.url !== '/creator/model-image-generate') {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      const dataRelativeDir = String(payload.output?.dataRelativeDir || '')
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, 'png placeholder')
      requests.push({
        dataRelativeDir,
        referenceRoles: Array.isArray(payload.referenceImages)
          ? payload.referenceImages.map((reference) => reference.role)
          : []
      })
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
        runId: 'run-anchor-flow',
        petId: 'anchor-cat',
        input: {
          originalPrompt: 'Golden cat with green eyes.',
          referenceImage: {
            fileName: 'cat.png',
            relativePath: sourceRelativePath,
            metadataRelativePath: 'runs/run-anchor-flow/inputs/references/reference.json',
            contentHash: 'hash',
            width: 256,
            height: 256
          }
        },
        generationTask: {
          mode: 'single-action',
          characterBrief: 'Golden cat with green eyes.',
          actions: [{
            actionId: 'waving',
            name: 'Waving',
            motionPrompt: 'Wave with the viewer-right front paw.',
            animationType: 'stationary_loop',
            synthesisMode: 'canonical-frame',
            frameCount: 6,
            loop: false,
            transparentBackground: true
          }]
        }
      }
    })

    assert.deepEqual(requests.map((entry) => entry.referenceRoles), [
      ['composite-reference-board'],
      ['character-anchor'],
      ['action-anchor']
    ])
    assert.deepEqual(requests.map((entry) => entry.dataRelativeDir), [
      'runs/run-anchor-flow/anchors/character-anchor',
      'runs/run-anchor-flow/anchors/actions/waving-anchor',
      'runs/run-anchor-flow/frames/base'
    ])
    assert.equal(result.anchorReferences.characterAnchor.role, 'character-anchor')
    assert.equal(result.anchorReferences.actionAnchors[0].role, 'action-anchor')
    assert.equal(result.conditioning.referenceImageCount, 1)
    assert.equal(result.conditioning.references[0].role, 'action-anchor')
    assert.deepEqual(result.generationStages.map((stage) => ({
      stage: stage.stage,
      ok: stage.ok,
      referenceRoles: stage.referenceRoles,
      timeoutMs: stage.timeoutMs,
      outputCount: stage.outputCount
    })), [
      {
        stage: 'character-anchor',
        ok: true,
        referenceRoles: ['composite-reference-board'],
        timeoutMs: 300000,
        outputCount: 1
      },
      {
        stage: 'action-anchor',
        ok: true,
        referenceRoles: ['character-anchor'],
        timeoutMs: 300000,
        outputCount: 1
      },
      {
        stage: 'final-image',
        ok: true,
        referenceRoles: ['action-anchor'],
        timeoutMs: 300000,
        outputCount: 1
      }
    ])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge records final-stage timeout diagnostics when final action generation fails', async () => {
  const dataDir = makeDataDir()
  const sourceRelativePath = 'runs/run-anchor-timeout/inputs/references/cat.png'
  const sourcePath = path.join(dataDir, sourceRelativePath)
  await writeSourceImage(sourcePath)
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/creator/model-settings') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: true, config: { provider: 'openai-compatible', model: 'gpt-image-2', timeoutMs: 300000 } }))
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
        timeoutMs: payload.timeoutMs,
        referenceRoles: Array.isArray(payload.referenceImages)
          ? payload.referenceImages.map((reference) => reference.role)
          : []
      })
      if (dataRelativeDir === 'runs/run-anchor-timeout/frames/base') {
        response.writeHead(500, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'Post "https://ai.example/v1/images/edits": context canceled' }))
        return
      }
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
    await assert.rejects(
      () => generateViaHostModelBridge({
        backend: 'provider',
        dataDir,
        run: {
          runId: 'run-anchor-timeout',
          petId: 'anchor-cat',
          input: {
            originalPrompt: 'Golden cat with green eyes.',
            referenceImage: {
              fileName: 'cat.png',
              relativePath: sourceRelativePath,
              metadataRelativePath: 'runs/run-anchor-timeout/inputs/references/reference.json',
              contentHash: 'hash',
              width: 256,
              height: 256
            }
          },
          generationTask: {
            mode: 'single-action',
            characterBrief: 'Golden cat with green eyes.',
            actions: [{
              actionId: 'waving',
              name: 'Waving',
              motionPrompt: 'Wave with the viewer-right front paw.',
              animationType: 'stationary_loop',
              synthesisMode: 'canonical-frame',
              frameCount: 6,
              loop: false,
              transparentBackground: true
            }]
          }
        }
      }),
      (error) => {
        assert.match(error.message, /context canceled/)
        const stages = error.partialGenerationResult?.generationStages || []
        assert.deepEqual(stages.map((stage) => ({
          stage: stage.stage,
          ok: stage.ok,
          referenceRoles: stage.referenceRoles,
          timeoutMs: stage.timeoutMs,
          error: stage.error || ''
        })), [
          {
            stage: 'character-anchor',
            ok: true,
            referenceRoles: ['composite-reference-board'],
            timeoutMs: 300000,
            error: ''
          },
          {
            stage: 'action-anchor',
            ok: true,
            referenceRoles: ['character-anchor'],
            timeoutMs: 300000,
            error: ''
          },
          {
            stage: 'final-image',
            ok: false,
            referenceRoles: ['action-anchor'],
            timeoutMs: 300000,
            error: 'Post "https://ai.example/v1/images/edits": context canceled'
          }
        ])
        assert.equal(stages[2].modelAttempts[0].timeoutMs, 300000)
        assert.deepEqual(stages[2].modelAttempts[0].referenceRoles, ['action-anchor'])
        return true
      }
    )
    assert.deepEqual(requests.map((entry) => entry.referenceRoles), [
      ['composite-reference-board'],
      ['character-anchor'],
      ['action-anchor']
    ])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})
