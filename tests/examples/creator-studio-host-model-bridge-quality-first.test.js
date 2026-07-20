const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const {
  createQualityFirstHostRuntime,
  generateCanonicalCandidatePool,
  generateSelectedFullPetAction,
  createQualityFirstRecoveryBundle,
  evaluateQualityFirstFinalPackage
} = require('../../examples/plugins/creator-studio/lib/host-model-bridge')
const { readActionCheckpoints, writeActionCheckpoint } = require('../../examples/plugins/creator-studio/lib/full-pet-action-checkpoints')
const { getQualityFirstQualityProfile } = require('../../examples/plugins/creator-studio/lib/pet-generation-quality-profile')
const { createSpriteAssetPlan } = require('../../examples/plugins/creator-studio/lib/sprite-asset-plan')
const hostModelBridgeModule = require('../../examples/plugins/creator-studio/lib/host-model-bridge')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

test('host canonical pool keeps paid duplicates and obtains three distinct candidates within four dispatches', async () => {
  const hashes = ['a'.repeat(64), 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
  const persisted = []
  const pool = await generateCanonicalCandidatePool({
    generateCandidate: async ({ candidateId, dispatchIndex }) => ({ candidateId, sha256: hashes[dispatchIndex - 1], eligible: true }),
    persistCandidate: (candidate) => persisted.push(candidate)
  })
  assert.equal(pool.dispatchCount, 4)
  assert.equal(pool.distinctEligibleCount, 3)
  assert.equal(pool.candidates[1].eligible, false)
  assert.ok(pool.candidates[1].failureCodes.includes('canonical-candidate-duplicate'))
  assert.equal(persisted.length, 4)
})

test('host canonical pool rejects perceptual duplicates even when encoded hashes differ', async () => {
  const candidates = [
    { sha256: 'a'.repeat(64), descriptors: { perceptualHash: '0000000000000000', identityDescriptor: [0, 0], alphaMaskDescriptor: [0, 0] } },
    { sha256: 'b'.repeat(64), descriptors: { perceptualHash: '0000000000000001', identityDescriptor: [0.01, 0.01], alphaMaskDescriptor: [0.01, 0.01] } },
    { sha256: 'c'.repeat(64), descriptors: { perceptualHash: 'ffffffffffffffff', identityDescriptor: [1, 1], alphaMaskDescriptor: [1, 1] } },
    { sha256: 'd'.repeat(64), descriptors: { perceptualHash: '0f0f0f0f0f0f0f0f', identityDescriptor: [0.5, 0.5], alphaMaskDescriptor: [0.5, 0.5] } }
  ]
  const pool = await generateCanonicalCandidatePool({
    generateCandidate: async ({ candidateId, dispatchIndex }) => ({ candidateId, eligible: true, ...candidates[dispatchIndex - 1] })
  })
  assert.equal(pool.dispatchCount, 4)
  assert.equal(pool.distinctEligibleCount, 3)
  assert.equal(pool.candidates[1].eligible, false)
  assert.equal(pool.candidates[1].duplicateOfCandidateId, 'canonical-1')
})

test('host selected action delegates to the bounded quality-first runner', async () => {
  const generated = [
    { candidateId: 'one', descriptors: { perceptualHash: '0000', identityDescriptor: [0], alphaMaskDescriptor: [0] } },
    { candidateId: 'two', descriptors: { perceptualHash: 'ffff', identityDescriptor: [1], alphaMaskDescriptor: [1] } }
  ]
  const result = await generateSelectedFullPetAction({
    context: { actionId: 'idle' },
    reserveCreativeDispatch: () => {},
    generateCandidate: async () => generated.shift(),
    processCandidate: async (candidate) => ({ ...candidate, qa: { ok: true, failures: [] } }),
    evaluateCandidate: async () => ({ evaluation: { scores: { overall: 95 } }, gate: { ok: true, outcome: 'pass', failures: [] } })
  })
  assert.equal(result.ok, true)
  assert.ok(['one', 'two'].includes(result.selectedCandidateId))
})

test('quality-first candidate records include prompt and evaluator evidence artifacts', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-artifacts-'))
  const candidateDir = path.join(dataDir, 'runs/run-artifacts/candidates/idle/candidate-1')
  const outputDir = path.join(candidateDir, 'processed')
  const rawPath = path.join(candidateDir, 'raw.png')
  const promptRelativePath = 'runs/run-artifacts/prompts/idle-candidate-1.txt'
  const evidenceRelativePath = 'runs/run-artifacts/evaluations/idle-candidate-1.json'
  for (const [filePath, value] of [
    [rawPath, 'raw'],
    [path.join(dataDir, promptRelativePath), 'prompt'],
    [path.join(dataDir, evidenceRelativePath), 'evaluation'],
    [path.join(outputDir, 'evaluator-board.png'), 'board']
  ]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, value)
  }
  const artifacts = hostModelBridgeModule.__testInternals.collectQualityFirstCandidateArtifacts({
    dataDir,
    candidate: {
      rawPath,
      sha256: crypto.createHash('sha256').update('raw').digest('hex'),
      promptRelativePath,
      evaluationEvidenceRelativePath: evidenceRelativePath,
      outputDir
    }
  })
  assert.deepEqual(artifacts.map((entry) => entry.role), ['raw-sheet', 'prompt', 'evaluation-evidence', 'evaluator-board'])
  assert.equal(artifacts.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)), true)
})

test('quality-first host runtime reuses a five-way-bound action checkpoint without Provider generation', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-resume-'))
  const runId = 'run-resume'
  const sourceRelativePath = `runs/${runId}/inputs/reference.png`
  const canonicalRelativePath = `runs/${runId}/canonical.png`
  const framePath = path.join(dataDir, `runs/${runId}/quality-first/frames/idle/01.png`)
  for (const filePath of [path.join(dataDir, sourceRelativePath), path.join(dataDir, canonicalRelativePath), framePath]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 80, g: 120, b: 160, alpha: 1 } } }).png().toFile(filePath)
  }
  const plan = createSpriteAssetPlan({
    version: 1,
    revision: 1,
    character: { assetClass: 'grounded-compact-character' },
    actions: [{ actionId: 'idle' }]
  })
  const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64), relativePath: canonicalRelativePath }
  const profileBase = { version: 1, maxBodyScaleCv: 0.08 }
  const profile = { ...profileBase, hash: crypto.createHash('sha256').update(JSON.stringify(profileBase)).digest('hex') }
  fs.writeFileSync(path.join(dataDir, `runs/${runId}/character-scale-profile.json`), `${JSON.stringify(profile)}\n`)
  writeActionCheckpoint({
    dataDir,
    runId,
    result: {
      actionId: 'idle',
      ok: true,
      outputCount: 1,
      model: 'paid-image-model',
      bindings: {
        planHash: plan.hash,
        canonicalHash: canonical.sha256,
        profileHash: profile.hash,
        processorVersion: 1,
        qualityProfileHash: getQualityFirstQualityProfile().hash
      },
      row: { actionId: 'idle', quality: 'row-real', frames: [{ index: 0, durationMs: 120, path: framePath }] }
    }
  })
  const previousUrl = process.env.OPENPET_BRIDGE_URL
  const previousToken = process.env.OPENPET_BRIDGE_TOKEN
  delete process.env.OPENPET_BRIDGE_URL
  delete process.env.OPENPET_BRIDGE_TOKEN
  try {
    const runtime = await createQualityFirstHostRuntime({
      dataDir,
      run: { runId, input: { referenceImage: { relativePath: sourceRelativePath } } },
      planOverride: plan
    })
    const result = await runtime.runAction({ actionId: 'idle', canonical })
    assert.equal(result.ok, true)
    assert.equal(result.checkpointReused, true)
    assert.equal(result.selectedCandidate.model, 'paid-image-model')
    assert.equal(result.selectedCandidate.processed.frames[0].path, framePath)
    assert.deepEqual(await runtime.createCharacterScaleProfile({ canonical, idle: result }), profile)
    const beforePersist = readActionCheckpoints({ dataDir, runId }).actions.idle
    await runtime.persistActionResult({ actionId: 'idle', result, canonical })
    assert.deepEqual(readActionCheckpoints({ dataDir, runId }).actions.idle, beforePersist)

    fs.writeFileSync(path.join(dataDir, `runs/${runId}/character-scale-profile.json`), `${JSON.stringify({ ...profile, maxBodyScaleCv: 999 })}\n`)
    const corruptedRuntime = await createQualityFirstHostRuntime({
      dataDir,
      run: { runId, input: { referenceImage: { relativePath: sourceRelativePath } } },
      planOverride: plan
    })
    await assert.rejects(() => corruptedRuntime.runAction({ actionId: 'idle', canonical }), /OpenPet bridge is not available/)
  } finally {
    if (previousUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousUrl
    if (previousToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousToken
  }
})

test('quality-first recovery bundle retains every run asset with relative paths and hashes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-recovery-'))
  const runId = 'run-recovery'
  const runDir = path.join(dataDir, 'runs', runId)
  fs.mkdirSync(path.join(runDir, 'candidates', 'idle'), { recursive: true })
  fs.mkdirSync(path.join(runDir, 'prompts'), { recursive: true })
  fs.writeFileSync(path.join(runDir, 'candidates', 'idle', 'raw.png'), 'raw')
  fs.writeFileSync(path.join(runDir, 'prompts', 'idle.txt'), 'visible prompt')
  const bundle = await createQualityFirstRecoveryBundle({
    dataDir,
    run: { runId, qualityFirst: { planHash: 'p'.repeat(64) } },
    actionResults: { idle: { ok: false, failureCode: 'idle_generation_failed' } },
    reason: 'idle_generation_failed'
  })
  assert.equal(bundle.relativePath, `runs/${runId}/recovery/recovery.json`)
  assert.match(bundle.sha256, /^[a-f0-9]{64}$/)
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, bundle.relativePath), 'utf8'))
  assert.equal(manifest.reason, 'idle_generation_failed')
  assert.ok(manifest.files.some((file) => file.relativePath.endsWith('/candidates/idle/raw.png')))
  assert.ok(manifest.files.some((file) => file.relativePath.endsWith('/prompts/idle.txt')))
  assert.doesNotMatch(JSON.stringify(manifest), /\/Users\/|\/tmp\//)
})

test('quality-first final package requires a passing code-owned visual gate over fixed package regions', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-package-gate-'))
  const runId = 'run-package-gate'
  const runDir = path.join(dataDir, 'runs', runId)
  fs.mkdirSync(path.join(runDir, 'quality-first', 'qa'), { recursive: true })
  const paths = Object.fromEntries(['source', 'canonical', 'contact', 'atlas'].map((name) => [name, path.join(runDir, `${name}.png`)]))
  await Promise.all(Object.values(paths).map((filePath, index) => sharp({
    create: { width: 128, height: 128, channels: 4, background: { r: 40 + index * 30, g: 80, b: 160, alpha: 1 } }
  }).png().toFile(filePath)))
  const atlasQaPath = path.join(runDir, 'quality-first', 'qa', 'atlas-validation.json')
  fs.writeFileSync(atlasQaPath, `${JSON.stringify({
    ok: true,
    visiblePixels: 100,
    visualReview: { contactSheet: path.relative(dataDir, paths.contact).replace(/\\/g, '/') },
    basicActions: { availableActionIds: ['idle'] }
  })}\n`)
  const requests = []
  const accepted = await evaluateQualityFirstFinalPackage({
    dataDir,
    runId,
    sourcePath: paths.source,
    canonicalPath: paths.canonical,
    spritesheetPath: paths.atlas,
    atlasQaPath,
    requestEvaluation: async (request) => {
      requests.push(request)
      return { gate: { ok: true, outcome: 'pass', failures: [] }, evidenceRelativePath: `runs/${runId}/evaluations/final-package.json` }
    }
  })
  assert.equal(requests[0].scope, 'final-package')
  assert.deepEqual(requests[0].board.regions.map((region) => region.regionId), ['source', 'canonical', 'action-review', 'atlas'])
  assert.equal(accepted.gate.ok, true)
  assert.match(accepted.boardRelativePath, /final-package-review-board\.png$/)

  await assert.rejects(() => evaluateQualityFirstFinalPackage({
    dataDir,
    runId,
    sourcePath: paths.source,
    canonicalPath: paths.canonical,
    spritesheetPath: paths.atlas,
    atlasQaPath,
    requestEvaluation: async () => ({ gate: { ok: false, outcome: 'repair', failures: ['visual-score-overall-below-minimum'] }, evidenceRelativePath: `runs/${runId}/evaluations/final-package.json` })
  }), (error) => {
    assert.equal(error.code, 'final_package_visual_gate_failed')
    assert.match(error.message, /visual-score-overall-below-minimum/)
    return true
  })

  const outsideCanonical = path.join(os.tmpdir(), `openpet-outside-canonical-${Date.now()}.png`)
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(outsideCanonical)
  await assert.rejects(() => evaluateQualityFirstFinalPackage({
    dataDir,
    runId,
    sourcePath: paths.source,
    canonicalPath: outsideCanonical,
    spritesheetPath: paths.atlas,
    atlasQaPath,
    requestEvaluation: async () => ({ gate: { ok: true, outcome: 'pass', failures: [] } })
  }), /canonical.*inside the Creator Studio data directory/i)
})

test('host model bridge no longer exports the removed legacy full-pet repair entry point', () => {
  assert.equal(Object.hasOwn(hostModelBridgeModule, 'regenerateFullPetActionsViaHostModelBridge'), false)
})
