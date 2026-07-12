const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const {
  __testInternals,
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

const writeCandidateAnchorImage = async ({ filePath, kind }) => {
  const body = kind === 'good'
    ? '<ellipse cx="128" cy="144" rx="48" ry="60" fill="#d7a14b"/><circle cx="128" cy="86" r="42" fill="#e7b65f"/><circle cx="111" cy="84" r="7" fill="#408c42"/><circle cx="145" cy="84" r="7" fill="#408c42"/><ellipse cx="104" cy="184" rx="14" ry="8" fill="#c98735"/><ellipse cx="152" cy="184" rx="14" ry="8" fill="#c98735"/><ellipse cx="166" cy="122" rx="10" ry="32" fill="#d7a14b" transform="rotate(-24 166 122)"/>'
    : kind === 'board-copy'
      ? '<rect x="26" y="48" width="204" height="153" fill="#d7a14b"/><ellipse cx="64" cy="95" rx="26" ry="38" fill="#e7b65f"/><ellipse cx="128" cy="95" rx="34" ry="28" fill="#e7b65f"/><ellipse cx="194" cy="96" rx="26" ry="38" fill="#e7b65f"/><ellipse cx="58" cy="162" rx="24" ry="24" fill="#e7b65f"/><ellipse cx="112" cy="162" rx="28" ry="20" fill="#e7b65f"/><ellipse cx="164" cy="162" rx="28" ry="20" fill="#e7b65f"/><ellipse cx="210" cy="162" rx="18" ry="24" fill="#e7b65f"/><text x="52" y="138" font-size="8" fill="#4b3824">Front</text><text x="123" y="138" font-size="8" fill="#4b3824">Side</text><text x="188" y="138" font-size="8" fill="#4b3824">Back</text><text x="180" y="196" font-size="8" fill="#4b3824">Paw Up</text>'
    : kind === 'cropped'
      ? '<ellipse cx="240" cy="152" rx="86" ry="100" fill="#d7a14b"/><circle cx="218" cy="66" r="62" fill="#e7b65f"/>'
      : kind === 'wrong-identity'
        ? '<ellipse cx="128" cy="144" rx="48" ry="60" fill="#3157d5"/><circle cx="128" cy="86" r="42" fill="#2b48b8"/><circle cx="111" cy="84" r="7" fill="#f4e04d"/><circle cx="145" cy="84" r="7" fill="#f4e04d"/><ellipse cx="104" cy="184" rx="14" ry="8" fill="#243b91"/><ellipse cx="152" cy="184" rx="14" ry="8" fill="#243b91"/>'
      : '<rect x="0" y="0" width="256" height="256" fill="#7c6652"/><ellipse cx="128" cy="138" rx="112" ry="112" fill="#6d5343"/><circle cx="128" cy="64" r="74" fill="#8b6a52"/>'
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: Buffer.from(`<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">${body}</svg>`),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(filePath)
}

const createCandidateImageGenerate = ({ dataDir, calls }) => async ({
  prompt,
  referenceImages,
  dataRelativeDir,
  model,
  requestedTimeoutMs
}) => {
  const candidateId = dataRelativeDir.includes('clean-cutout-motion-readable')
    ? 'clean-cutout-motion-readable'
    : dataRelativeDir.includes('identity-locked-desktop-sprite')
      ? 'identity-locked-desktop-sprite'
      : 'source-faithful-key-pose'
  const kind = candidateId === 'clean-cutout-motion-readable'
    ? 'good'
    : candidateId === 'identity-locked-desktop-sprite'
      ? 'cropped'
      : 'full-frame'
  calls.push({
    prompt,
    model,
    dataRelativeDir,
    referenceRoles: referenceImages.map((reference) => reference.role),
    requestedTimeoutMs,
    candidateId,
    kind
  })
  const dataRelativePath = `${dataRelativeDir}/0001.png`
  const outputPath = path.join(dataDir, dataRelativePath)
  await writeCandidateAnchorImage({ filePath: outputPath, kind })
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

const createFlakyCandidateImageGenerate = ({ dataDir, calls }) => async (request) => {
  if (String(request.dataRelativeDir || '').includes('01-source-faithful-key-pose')) {
    calls.push({
      dataRelativeDir: request.dataRelativeDir,
      referenceRoles: request.referenceImages.map((reference) => reference.role),
      failed: true
    })
    const error = new Error('provider candidate failed')
    error.modelAttempts = [{
      model: request.model,
      ok: false,
      timeoutMs: request.requestedTimeoutMs,
      referenceRoles: request.referenceImages.map((reference) => reference.role),
      durationMs: 5,
      error: 'provider candidate failed'
    }]
    throw error
  }
  return createCandidateImageGenerate({ dataDir, calls })(request)
}

const createBoardCopyCandidateImageGenerate = ({ dataDir, calls }) => async (request) => {
  const candidateId = String(request.dataRelativeDir || '').includes('identity-locked-desktop-sprite')
    ? 'identity-locked-desktop-sprite'
    : String(request.dataRelativeDir || '').includes('clean-cutout-motion-readable')
      ? 'clean-cutout-motion-readable'
      : 'source-faithful-key-pose'
  const kind = candidateId === 'identity-locked-desktop-sprite' ? 'good' : 'board-copy'
  calls.push({
    dataRelativeDir: request.dataRelativeDir,
    referenceRoles: request.referenceImages.map((reference) => reference.role),
    candidateId,
    kind
  })
  const dataRelativePath = `${request.dataRelativeDir}/0001.png`
  const outputPath = path.join(dataDir, dataRelativePath)
  await writeCandidateAnchorImage({ filePath: outputPath, kind })
  return {
    response: {
      result: {
        backend: 'provider',
        model: request.model,
        outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
      }
    },
    selectedModel: request.model,
    attempts: [{
      model: request.model,
      ok: true,
      timeoutMs: request.requestedTimeoutMs,
      referenceRoles: request.referenceImages.map((reference) => reference.role),
      durationMs: 7
    }]
  }
}

const createAllBoardCopyCandidateImageGenerate = ({ dataDir, calls }) => async (request) => {
  calls.push({
    dataRelativeDir: request.dataRelativeDir,
    referenceRoles: request.referenceImages.map((reference) => reference.role)
  })
  const dataRelativePath = `${request.dataRelativeDir}/0001.png`
  const outputPath = path.join(dataDir, dataRelativePath)
  await writeCandidateAnchorImage({ filePath: outputPath, kind: 'board-copy' })
  return {
    response: {
      result: {
        backend: 'provider',
        model: request.model,
        outputs: [{ dataRelativePath, mimeType: 'image/png', sha256: dataRelativePath }]
      }
    },
    selectedModel: request.model,
    attempts: [{
      model: request.model,
      ok: true,
      timeoutMs: request.requestedTimeoutMs,
      referenceRoles: request.referenceImages.map((reference) => reference.role),
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
  assert.equal(result.anchorReferences.finalActionBoards.length, 1)
  assert.equal(result.anchorReferences.finalActionBoards[0].role, 'final-action-reference-board')
  assert.equal(result.anchorReferences.finalActionBoards[0].actionId, 'waving')
  assert.equal(result.anchorReferences.finalActionBoards[0].relativePath, 'runs/run-anchor/inputs/anchors/actions/waving-final-reference-board.png')
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
    },
    {
      stage: 'final-action-reference-board',
      actionId: 'waving',
      referenceRole: 'source-identity-reference',
      outputRelativePath: 'runs/run-anchor/inputs/anchors/actions/waving-final-reference-board.png',
      promptRelativePath: '',
      model: ''
    }
  ])
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.compositeBoard.relativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.characterAnchor.relativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.actionAnchors[0].relativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.characterAnchor.promptRelativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.actionAnchors[0].promptRelativePath)), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.anchorReferences.finalActionBoards[0].relativePath)), true)
  const finalBoardMetadata = JSON.parse(fs.readFileSync(
    path.join(dataDir, result.anchorReferences.finalActionBoards[0].metadataRelativePath),
    'utf-8'
  ))
  assert.equal(finalBoardMetadata.sources[0].role, 'source-identity-reference')
  assert.equal(finalBoardMetadata.sources[0].relativePath, 'runs/run-anchor/inputs/references/cat.png')

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

test('canonical direct-source action anchors select the best provider candidate and materialize a stable anchor', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'runs/run-candidates/inputs/references/cat.png')
  await writeSourceImage(sourcePath)
  const calls = []

  const result = await generateAnchorReferences({
    dataDir,
    run: {
      runId: 'run-candidates',
      petId: 'candidate-cat',
      generationTask: {
        mode: 'single-action',
        characterBrief: 'Golden British Shorthair with green eyes.',
        actions: [{
          actionId: 'waving',
          name: 'Waving',
          motionPrompt: 'Wave with one front paw while the body stays anchored.',
          animationType: 'stationary_loop',
          synthesisMode: 'canonical-frame',
          frameCount: 6
        }]
      },
      input: {
        originalPrompt: 'Golden British Shorthair with green eyes.'
      }
    },
    settings: { provider: 'openai-compatible', model: 'gpt-image-2' },
    selectedModel: 'gpt-image-2',
    requestedTimeoutMs: 300000,
    originalReferenceImages: [{
      path: sourcePath,
      fileName: 'cat.png',
      relativePath: 'runs/run-candidates/inputs/references/cat.png',
      role: 'canonical-reference'
    }],
    generateWithFallbackImpl: createCandidateImageGenerate({ dataDir, calls })
  })

  assert.equal(result.anchorReferences.characterAnchor, null)
  assert.deepEqual(calls.map((call) => call.referenceRoles), [
    ['source-action-reference-board'],
    ['source-action-reference-board'],
    ['source-action-reference-board']
  ])
  assert.deepEqual(calls.map((call) => call.dataRelativeDir), [
    'runs/run-candidates/anchors/actions/waving-anchor-candidates/01-source-faithful-key-pose',
    'runs/run-candidates/anchors/actions/waving-anchor-candidates/02-clean-cutout-motion-readable',
    'runs/run-candidates/anchors/actions/waving-anchor-candidates/03-identity-locked-desktop-sprite'
  ])
  assert.equal(calls.every((call) => call.prompt.includes('Candidate guidance:')), true)

  const actionAnchor = result.anchorReferences.actionAnchors[0]
  assert.equal(actionAnchor.role, 'action-anchor')
  assert.equal(actionAnchor.relativePath, 'runs/run-candidates/anchors/actions/waving-anchor/0001.png')
  assert.equal(actionAnchor.candidateSelection.selectedCandidateId, 'clean-cutout-motion-readable')
  assert.equal(actionAnchor.candidateSelection.candidateCount, 3)
  assert.equal(actionAnchor.candidateSelection.candidates.length, 3)
  assert.equal(actionAnchor.candidateSelection.candidates[1].selected, true)
  assert.equal(actionAnchor.candidateSelection.candidates[1].acceptable, true)

  const stableAnchorPath = path.join(dataDir, actionAnchor.relativePath)
  const selectedCandidatePath = path.join(
    dataDir,
    'runs/run-candidates/anchors/actions/waving-anchor-candidates/02-clean-cutout-motion-readable/0001.png'
  )
  assert.equal(fs.existsSync(stableAnchorPath), true)
  assert.equal(fs.readFileSync(stableAnchorPath).equals(fs.readFileSync(selectedCandidatePath)), true)

  const stage = result.anchorGeneration.stages.find((entry) => entry.stage === 'action-anchor')
  assert.equal(stage.outputRelativePath, actionAnchor.relativePath)
  assert.equal(stage.candidateSelection.selectedCandidateId, 'clean-cutout-motion-readable')
  assert.equal(stage.candidateSelection.candidateCount, 3)
  assert.equal(stage.modelAttempts.length, 3)
})

test('canonical direct-source candidate selection tolerates failed provider candidates', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'runs/run-flaky-candidates/inputs/references/cat.png')
  await writeSourceImage(sourcePath)
  const calls = []

  const result = await generateAnchorReferences({
    dataDir,
    run: {
      runId: 'run-flaky-candidates',
      petId: 'candidate-cat',
      generationTask: {
        mode: 'single-action',
        characterBrief: 'Golden British Shorthair with green eyes.',
        actions: [{
          actionId: 'waving',
          name: 'Waving',
          motionPrompt: 'Wave with one front paw while the body stays anchored.',
          animationType: 'stationary_loop',
          synthesisMode: 'canonical-frame',
          frameCount: 6
        }]
      },
      input: {
        originalPrompt: 'Golden British Shorthair with green eyes.'
      }
    },
    settings: { provider: 'openai-compatible', model: 'gpt-image-2' },
    selectedModel: 'gpt-image-2',
    requestedTimeoutMs: 300000,
    originalReferenceImages: [{
      path: sourcePath,
      fileName: 'cat.png',
      relativePath: 'runs/run-flaky-candidates/inputs/references/cat.png',
      role: 'canonical-reference'
    }],
    generateWithFallbackImpl: createFlakyCandidateImageGenerate({ dataDir, calls })
  })

  const actionAnchor = result.anchorReferences.actionAnchors[0]
  assert.equal(actionAnchor.relativePath, 'runs/run-flaky-candidates/anchors/actions/waving-anchor/0001.png')
  assert.equal(actionAnchor.candidateSelection.selectedCandidateId, 'clean-cutout-motion-readable')
  assert.equal(actionAnchor.candidateSelection.candidates[0].ok, false)
  assert.match(actionAnchor.candidateSelection.candidates[0].error, /provider candidate failed/)
  assert.equal(actionAnchor.candidateSelection.candidates[1].selected, true)
  assert.equal(fs.existsSync(path.join(dataDir, actionAnchor.relativePath)), true)
})

test('canonical direct-source candidate selection rejects copied multi-view reference boards', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'runs/run-board-copy-candidates/inputs/references/cat.png')
  await writeSourceImage(sourcePath)
  const calls = []

  const result = await generateAnchorReferences({
    dataDir,
    run: {
      runId: 'run-board-copy-candidates',
      petId: 'candidate-cat',
      generationTask: {
        mode: 'single-action',
        characterBrief: 'Golden British Shorthair with green eyes.',
        actions: [{
          actionId: 'waving',
          name: 'Waving',
          motionPrompt: 'Wave with one front paw while the body stays anchored.',
          animationType: 'stationary_loop',
          synthesisMode: 'canonical-frame',
          frameCount: 6
        }]
      },
      input: {
        originalPrompt: 'Golden British Shorthair with green eyes.'
      }
    },
    settings: { provider: 'openai-compatible', model: 'gpt-image-2' },
    selectedModel: 'gpt-image-2',
    requestedTimeoutMs: 300000,
    originalReferenceImages: [{
      path: sourcePath,
      fileName: 'cat.png',
      relativePath: 'runs/run-board-copy-candidates/inputs/references/cat.png',
      role: 'canonical-reference'
    }],
    generateWithFallbackImpl: createBoardCopyCandidateImageGenerate({ dataDir, calls })
  })

  const actionAnchor = result.anchorReferences.actionAnchors[0]
  assert.equal(actionAnchor.candidateSelection.selectedCandidateId, 'identity-locked-desktop-sprite')
  assert.equal(actionAnchor.candidateSelection.candidates[0].selected, false)
  assert.equal(actionAnchor.candidateSelection.candidates[1].selected, false)
  assert.equal(actionAnchor.candidateSelection.candidates[2].selected, true)
  assert.equal(actionAnchor.candidateSelection.candidates[2].score > actionAnchor.candidateSelection.candidates[0].score, true)
})

test('action anchor scoring ranks single-pet action anchors above copied reference boards', () => {
  const referenceMetrics = {
    visiblePixels: 1,
    meanRgb: { r: 226, g: 205, b: 174 }
  }
  const copiedBoardMetrics = {
    visiblePixels: 30582,
    coverage: 0.4666,
    edgeRatio: 0,
    minPaddingRatio: 0.1016,
    centerOffsetRatio: 0.0562,
    meanRgb: { r: 226, g: 205, b: 174 },
    bounds: {
      width: 204,
      height: 153
    }
  }
  const singlePetMetrics = {
    visiblePixels: 18293,
    coverage: 0.2791,
    edgeRatio: 0,
    minPaddingRatio: 0.0859,
    centerOffsetRatio: 0.0218,
    meanRgb: { r: 207, g: 163, b: 105 },
    bounds: {
      width: 125,
      height: 206
    }
  }

  const boardScore = __testInternals.scoreActionAnchorMetrics({
    metrics: copiedBoardMetrics,
    referenceMetrics
  })
  const singlePetScore = __testInternals.scoreActionAnchorMetrics({
    metrics: singlePetMetrics,
    referenceMetrics
  })

  assert.equal(singlePetScore > boardScore, true)
})

test('action anchor scoring rejects same-average-color identities with different spatial color layout', () => {
  const referenceMetrics = {
    visiblePixels: 100,
    coverage: 0.28,
    edgeRatio: 0,
    minPaddingRatio: 0.08,
    centerOffsetRatio: 0.02,
    meanRgb: { r: 180, g: 140, b: 90 },
    bounds: { width: 120, height: 190 },
    identityDescriptor: {
      aspectRatio: 0.632,
      regions: [
        { r: 230, g: 190, b: 120 },
        { r: 130, g: 90, b: 60 },
        { r: 180, g: 140, b: 90 }
      ]
    }
  }
  const matchingMetrics = JSON.parse(JSON.stringify(referenceMetrics))
  const rearrangedMetrics = {
    ...JSON.parse(JSON.stringify(referenceMetrics)),
    identityDescriptor: {
      aspectRatio: 1.25,
      regions: [
        { r: 130, g: 90, b: 60 },
        { r: 230, g: 190, b: 120 },
        { r: 180, g: 140, b: 90 }
      ]
    }
  }

  const matchingScore = __testInternals.scoreActionAnchorMetrics({ metrics: matchingMetrics, referenceMetrics })
  const rearrangedScore = __testInternals.scoreActionAnchorMetrics({ metrics: rearrangedMetrics, referenceMetrics })

  assert.equal(matchingScore >= 70, true)
  assert.equal(rearrangedScore < 30, true)
})

test('canonical direct-source candidate selection rejects all-low-quality candidate sets before import', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'runs/run-low-quality-candidates/inputs/references/cat.png')
  await writeSourceImage(sourcePath)
  const calls = []

  await assert.rejects(
    () => generateAnchorReferences({
      dataDir,
      run: {
        runId: 'run-low-quality-candidates',
        petId: 'candidate-cat',
        generationTask: {
          mode: 'single-action',
          characterBrief: 'Golden British Shorthair with green eyes.',
          actions: [{
            actionId: 'waving',
            name: 'Waving',
            motionPrompt: 'Wave with one front paw while the body stays anchored.',
            animationType: 'stationary_loop',
            synthesisMode: 'canonical-frame',
            frameCount: 6
          }]
        },
        input: {
          originalPrompt: 'Golden British Shorthair with green eyes.'
        }
      },
      settings: { provider: 'openai-compatible', model: 'gpt-image-2' },
      selectedModel: 'gpt-image-2',
      requestedTimeoutMs: 300000,
      originalReferenceImages: [{
        path: sourcePath,
        fileName: 'cat.png',
        relativePath: 'runs/run-low-quality-candidates/inputs/references/cat.png',
        role: 'canonical-reference'
      }],
      generateWithFallbackImpl: createAllBoardCopyCandidateImageGenerate({ dataDir, calls })
    }),
    (error) => {
      assert.match(error.message, /below the minimum acceptable score/)
      assert.match(error.message, /selection\.json/)
      assert.equal(fs.existsSync(path.join(
        dataDir,
        'runs/run-low-quality-candidates/anchors/actions/waving-anchor/selection.json'
      )), true)
      assert.equal(calls.length, 3)
      return true
    }
  )
})

test('host model bridge routes every single action through a keyframe-conditioned provider sprite row', async () => {
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
      const svgBody = dataRelativeDir.includes('-peak-keyframe')
        ? '<circle cx="64" cy="48" r="22" fill="#e7b65f"/><ellipse cx="64" cy="88" rx="28" ry="30" fill="#d7a14b"/><ellipse cx="94" cy="48" rx="8" ry="24" fill="#d7a14b" transform="rotate(-32 94 48)"/>'
        : dataRelativeDir.includes('-keyframe-row')
          ? '<circle cx="24" cy="34" r="16" fill="#e7b65f"/><circle cx="64" cy="34" r="16" fill="#e7b65f"/><circle cx="104" cy="34" r="16" fill="#e7b65f"/><circle cx="24" cy="92" r="16" fill="#e7b65f"/><circle cx="64" cy="92" r="16" fill="#e7b65f"/><circle cx="104" cy="92" r="16" fill="#e7b65f"/>'
          : '<circle cx="64" cy="48" r="22" fill="#e7b65f"/><ellipse cx="64" cy="88" rx="28" ry="30" fill="#d7a14b"/>'
      sharp({
        create: {
          width: 128,
          height: 128,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([{
          input: Buffer.from(`<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">${svgBody}</svg>`),
          left: 0,
          top: 0
        }])
        .png()
        .toBuffer()
        .then((buffer) => {
          fs.writeFileSync(outputPath, buffer)
          requests.push({
            dataRelativeDir,
            prompt: String(payload.prompt || ''),
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
        .catch((error) => {
          response.writeHead(500, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ ok: false, error: error.message }))
        })
      return
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
            frameCount: 6,
            loop: false,
            transparentBackground: true
          }]
        }
      }
    })

    assert.deepEqual(requests.map((entry) => entry.referenceRoles), [
      ['canonical-reference'],
      ['action-peak-conditioning-board'],
      ['keyframe-action-reference-board']
    ])
    assert.deepEqual(requests.map((entry) => entry.dataRelativeDir), [
      'runs/run-anchor-flow/keyframes/actions/waving-start-keyframe',
      'runs/run-anchor-flow/keyframes/actions/waving-peak-keyframe',
      'runs/run-anchor-flow/frames/base/waving-keyframe-row'
    ])
    assert.equal(result.anchorReferences.characterAnchor, null)
    assert.deepEqual(result.anchorReferences.actionAnchors, [])
    assert.deepEqual(result.anchorReferences.finalActionBoards, [])
    assert.equal(result.conditioning.referenceImageCount, 1)
    assert.equal(result.conditioning.mode, 'provider-keyframe-sprite-row')
    assert.deepEqual(result.conditioning.references.map((reference) => reference.role), [
      'keyframe-action-reference-board'
    ])
    assert.equal(result.outputs[0].dataRelativePath, 'runs/run-anchor-flow/frames/base/waving-keyframe-row/0001.png')
    assert.match(requests[0].prompt, /START FRAME/i)
    assert.match(requests[1].prompt, /PEAK\/END FRAME/i)
    assert.match(requests[1].prompt, /single conditioning board/i)
    assert.match(requests[1].prompt, /start keyframe/i)
    assert.match(requests[2].prompt, /complete transparent-background OpenPet sprite sheet/i)
    assert.match(requests[2].prompt, /single local conditioning board/i)
    assert.match(requests[2].prompt, /Frame 3.*peak.*fully raised/is)
    assert.deepEqual(result.generationStages.map((stage) => ({
      stage: stage.stage,
      ok: stage.ok,
      referenceRoles: stage.referenceRoles,
      timeoutMs: stage.timeoutMs,
      outputCount: stage.outputCount,
      adopted: Boolean(stage.adopted)
    })), [
      {
        stage: 'action-start-keyframe',
        ok: true,
        referenceRoles: ['canonical-reference'],
        timeoutMs: 300000,
        outputCount: 1,
        adopted: false
      },
      {
        stage: 'action-peak-keyframe',
        ok: true,
        referenceRoles: ['action-peak-conditioning-board'],
        timeoutMs: 300000,
        outputCount: 1,
        adopted: false
      },
      {
        stage: 'final-image',
        ok: true,
        referenceRoles: ['keyframe-action-reference-board'],
        timeoutMs: 300000,
        outputCount: 1,
        adopted: false
      }
    ])
    assert.equal(result.keyframeSpriteRow.actionId, 'waving')
    assert.equal(result.keyframeSpriteRow.keyframes.length, 2)
    assert.equal(result.keyframeSpriteRow.referenceBoard.role, 'keyframe-action-reference-board')
    assert.equal(result.keyframeSpriteRow.referenceBoard.relativePath, 'runs/run-anchor-flow/inputs/keyframes/actions/waving-row-reference-board.png')
    assert.deepEqual(result.keyframeSpriteRow.keyframes.map((keyframe) => keyframe.role), [
      'action-start-keyframe',
      'action-peak-keyframe'
    ])
    const referenceBoardMetadata = JSON.parse(fs.readFileSync(
      path.join(dataDir, result.keyframeSpriteRow.referenceBoard.metadataRelativePath),
      'utf-8'
    ))
    assert.deepEqual(referenceBoardMetadata.sources.map((source) => source.role), [
      'canonical-reference',
      'action-start-keyframe',
      'action-peak-keyframe'
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

test('host model bridge rejects canonical actions when keyframe sprite row generation fails', async () => {
  const dataDir = makeDataDir()
  const sourceRelativePath = 'runs/run-anchor-row-fallback/inputs/references/cat.png'
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
        referenceRoles: Array.isArray(payload.referenceImages)
          ? payload.referenceImages.map((reference) => reference.role)
          : []
      })
      if (dataRelativeDir === 'runs/run-anchor-row-fallback/frames/base/waving-keyframe-row') {
        response.writeHead(500, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'row provider failed' }))
        return
      }
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      sharp({
        create: {
          width: 128,
          height: 128,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([{
          input: Buffer.from('<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg"><circle cx="64" cy="64" r="42" fill="#e7b65f"/></svg>'),
          left: 0,
          top: 0
        }])
        .png()
        .toBuffer()
        .then((buffer) => {
          fs.writeFileSync(outputPath, buffer)
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
        .catch((error) => {
          response.writeHead(500, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ ok: false, error: error.message }))
        })
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
          runId: 'run-anchor-row-fallback',
          petId: 'anchor-cat',
          input: {
            originalPrompt: 'Golden cat with green eyes.',
            referenceImage: {
              fileName: 'cat.png',
              relativePath: sourceRelativePath,
              metadataRelativePath: 'runs/run-anchor-row-fallback/inputs/references/reference.json',
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
        assert.match(error.message, /row provider failed/)
        assert.equal(error.keyframeSpriteRow?.ok, false)
        const stages = error.partialGenerationResult?.generationStages || []
        assert.deepEqual(stages.map((stage) => ({
          stage: stage.stage,
          ok: stage.ok,
          referenceRoles: stage.referenceRoles,
          adopted: Boolean(stage.adopted)
        })), [
          {
            stage: 'action-start-keyframe',
            ok: true,
            referenceRoles: ['canonical-reference'],
            adopted: false
          },
          {
            stage: 'action-peak-keyframe',
            ok: true,
            referenceRoles: ['action-peak-conditioning-board'],
            adopted: false
          },
          {
            stage: 'final-image',
            ok: false,
            referenceRoles: ['keyframe-action-reference-board'],
            adopted: false
          }
        ])
        assert.equal(error.partialGenerationResult?.outputs.length, 0)
        return true
      }
    )
    assert.deepEqual(requests.map((entry) => entry.referenceRoles), [
      ['canonical-reference'],
      ['action-peak-conditioning-board'],
      ['keyframe-action-reference-board']
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

test('host model bridge rejects canonical actions before final generation when keyframe row cannot be prepared', async () => {
  const dataDir = makeDataDir()
  const imageRequests = []
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
      imageRequests.push(payload)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        result: {
          backend: 'provider',
          model: payload.model,
          outputs: [{ dataRelativePath: 'runs/run-no-row/frames/base/0001.png', mimeType: 'image/png' }]
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
          runId: 'run-no-row',
          petId: 'anchor-cat',
          input: {
            originalPrompt: 'Golden cat with green eyes.'
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
      /keyframe sprite row.*could not be prepared/i
    )
    assert.equal(imageRequests.length, 0)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('host model bridge rejects cropped keyframes before building the conditioning board', async () => {
  const dataDir = makeDataDir()
  const sourceRelativePath = 'runs/run-cropped-keyframe/inputs/references/cat.png'
  await writeSourceImage(path.join(dataDir, sourceRelativePath))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => {
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
      requests.push(dataRelativeDir)
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      await writeCandidateAnchorImage({
        filePath: outputPath,
        kind: dataRelativeDir.endsWith('-start-keyframe') ? 'cropped' : 'good'
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
    await assert.rejects(
      () => generateViaHostModelBridge({
        backend: 'provider',
        dataDir,
        run: {
          runId: 'run-cropped-keyframe',
          petId: 'anchor-cat',
          input: {
            originalPrompt: 'Golden cat with green eyes.',
            referenceImage: {
              fileName: 'cat.png',
              relativePath: sourceRelativePath,
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
              synthesisMode: 'canonical-frame',
              frameCount: 6,
              loop: false,
              transparentBackground: true
            }]
          }
        }
      }),
      /start keyframe quality.*below/i
    )
    assert.deepEqual(requests, [
      'runs/run-cropped-keyframe/keyframes/actions/waving-start-keyframe'
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

test('host model bridge rejects keyframes whose foreground palette conflicts with the source identity', async () => {
  const dataDir = makeDataDir()
  const sourceRelativePath = 'runs/run-wrong-keyframe-identity/inputs/references/cat.png'
  await writeSourceImage(path.join(dataDir, sourceRelativePath))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => {
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
      requests.push(dataRelativeDir)
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      await writeCandidateAnchorImage({
        filePath: path.join(dataDir, dataRelativePath),
        kind: dataRelativeDir.endsWith('-start-keyframe') ? 'wrong-identity' : 'good'
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
    await assert.rejects(
      () => generateViaHostModelBridge({
        backend: 'provider',
        dataDir,
        run: {
          runId: 'run-wrong-keyframe-identity',
          petId: 'anchor-cat',
          input: {
            referenceImage: {
              fileName: 'cat.png',
              relativePath: sourceRelativePath,
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
              motionPrompt: 'Wave with one front paw.',
              synthesisMode: 'canonical-frame',
              frameCount: 6,
              loop: false,
              transparentBackground: true
            }]
          }
        }
      }),
      /start keyframe quality.*below/i
    )
    assert.deepEqual(requests, [
      'runs/run-wrong-keyframe-identity/keyframes/actions/waving-start-keyframe'
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
      if ((payload.referenceImages || []).some((reference) => reference.role === 'keyframe-action-reference-board')) {
        response.writeHead(500, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: 'Post "https://ai.example/v1/images/edits": context canceled' }))
        return
      }
      const dataRelativePath = `${dataRelativeDir}/0001.png`
      const outputPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      sharp({
        create: {
          width: 128,
          height: 128,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([{
          input: Buffer.from('<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg"><circle cx="64" cy="64" r="42" fill="#e7b65f"/></svg>'),
          left: 0,
          top: 0
        }])
        .png()
        .toBuffer()
        .then((buffer) => {
          fs.writeFileSync(outputPath, buffer)
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
        .catch((error) => {
          response.writeHead(500, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ ok: false, error: error.message }))
        })
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
        stage: 'action-start-keyframe',
        ok: true,
        referenceRoles: ['canonical-reference'],
        timeoutMs: 300000,
        error: ''
      },
      {
        stage: 'action-peak-keyframe',
        ok: true,
        referenceRoles: ['action-peak-conditioning-board'],
        timeoutMs: 300000,
        error: ''
      },
      {
        stage: 'final-image',
        ok: false,
        referenceRoles: ['keyframe-action-reference-board'],
        timeoutMs: 300000,
        error: 'Post "https://ai.example/v1/images/edits": context canceled'
      }
    ])
        assert.equal(stages[2].modelAttempts[0].timeoutMs, 300000)
        assert.deepEqual(stages[2].modelAttempts[0].referenceRoles, ['keyframe-action-reference-board'])
        return true
      }
    )
    assert.deepEqual(requests.map((entry) => entry.referenceRoles), [
      ['canonical-reference'],
      ['action-peak-conditioning-board'],
      ['keyframe-action-reference-board']
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
