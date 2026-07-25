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

test('host canonical pool keeps paid duplicates quality-eligible while tracking diversity separately', async () => {
  const hashes = ['a'.repeat(64), 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
  const persisted = []
  const pool = await generateCanonicalCandidatePool({
    generateCandidate: async ({ candidateId, dispatchIndex }) => ({ candidateId, sha256: hashes[dispatchIndex - 1], eligible: true }),
    persistCandidate: (candidate) => persisted.push(candidate)
  })
  assert.equal(pool.dispatchCount, 4)
  assert.equal(pool.distinctEligibleCount, 3)
  assert.equal(pool.candidates[1].eligible, true)
  assert.equal(pool.candidates[1].technicalEligible, true)
  assert.equal(pool.candidates[1].diversityStatus, 'duplicate')
  assert.equal(pool.candidates[1].duplicateOfCandidateId, 'canonical-1')
  assert.equal(pool.candidates[1].failureCodes.includes('canonical-candidate-duplicate'), false)
  assert.equal(persisted.length, 4)
})

test('host canonical pool assigns an identity-safe duplicate-replacement strategy to dispatch four', async () => {
  const hashes = ['a'.repeat(64), 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
  const requests = []
  const pool = await generateCanonicalCandidatePool({
    generateCandidate: async (request) => {
      requests.push(request)
      return { candidateId: request.candidateId, sha256: hashes[request.dispatchIndex - 1], eligible: true }
    }
  })

  assert.equal(pool.distinctEligibleCount, 3)
  assert.deepEqual(requests.map(({ attemptKind }) => attemptKind), ['initial', 'initial', 'initial', 'duplicate-replacement'])
  assert.deepEqual(requests.map(({ diversityProfileId }) => diversityProfileId), [
    'identity-faithful-balanced-v1',
    'silhouette-readability-v1',
    'small-scale-detail-v1',
    'identity-safe-alternate-neutral-v1'
  ])
  assert.equal(pool.candidates[3].attemptKind, 'duplicate-replacement')
  assert.equal(pool.candidates[3].diversityProfileId, 'identity-safe-alternate-neutral-v1')
})

test('identity-safe canonical replacement requests visible neutral variation without weakening identity locks', () => {
  assert.equal(typeof hostModelBridgeModule.__testInternals.createCanonicalRequestedChanges, 'function')
  const requestedChanges = hostModelBridgeModule.__testInternals.createCanonicalRequestedChanges('identity-safe-alternate-neutral-v1')
  const text = requestedChanges.join(' ')

  assert.match(text, /exact referenced identity/i)
  assert.match(text, /limb separation/i)
  assert.match(text, /head angle/i)
  assert.match(text, /calm neutral/i)
  assert.match(text, /no action gesture/i)
  assert.match(text, /do not change.*view|view.*do not change/i)
  assert.match(text, /do not change.*style|style.*do not change/i)
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
  assert.equal(pool.candidates[1].eligible, true)
  assert.equal(pool.candidates[1].diversityStatus, 'duplicate')
  assert.equal(pool.candidates[1].duplicateOfCandidateId, 'canonical-1')
})

test('host evaluates duplicate canonical outputs as paid candidates and keeps every passing result selectable', async () => {
  assert.equal(typeof hostModelBridgeModule.__testInternals.evaluateCanonicalCandidatePool, 'function')
  const persisted = []
  const boardCandidateIds = []
  const pool = await hostModelBridgeModule.__testInternals.evaluateCanonicalCandidatePool({
    pool: {
      version: 1,
      dispatchCount: 3,
      distinctEligibleCount: 1,
      candidates: [
        { candidateId: 'canonical-1', path: '/data/canonical-1.png', sha256: 'a'.repeat(64), eligible: true, technicalEligible: true, failureCodes: [] },
        { candidateId: 'canonical-2', path: '/data/canonical-2.png', sha256: 'b'.repeat(64), eligible: true, technicalEligible: true, duplicateOfCandidateId: 'canonical-1', diversityStatus: 'duplicate', failureCodes: [] },
        { candidateId: 'canonical-3', sha256: '', eligible: false, technicalEligible: false, failureCodes: ['canonical-generation-failed'] }
      ]
    },
    dataDir: '/data',
    runId: 'run-1',
    sourcePath: '/data/source.png',
    createBoard: async ({ candidates }) => {
      boardCandidateIds.push(...candidates.map((candidate) => candidate.candidateId))
      return {
        path: '/data/board.png',
        sha256: 'f'.repeat(64),
        regions: [
          { regionId: 'source', role: 'source-identity' },
          ...candidates.map((candidate) => ({ regionId: candidate.candidateId, role: 'canonical-candidate' }))
        ]
      }
    },
    requestEvaluation: async () => ({
      evaluation: {
        candidates: [
          { candidateId: 'canonical-1', scores: { identity: 96, overall: 95 } },
          { candidateId: 'canonical-2', scores: { identity: 95, overall: 94 } }
        ]
      },
      gate: {
        candidateGates: {
          'canonical-1': { ok: true, outcome: 'pass', failures: [] },
          'canonical-2': { ok: true, outcome: 'pass', failures: [] }
        }
      },
      evidenceRelativePath: 'runs/run-1/evaluations/canonical.json'
    }),
    persistCandidate: async (candidate) => persisted.push(structuredClone(candidate))
  })

  assert.deepEqual(boardCandidateIds, ['canonical-1', 'canonical-2'])
  assert.equal(pool.passingCandidateCount, 2)
  assert.equal(pool.candidates[0].eligible, true)
  assert.equal(pool.candidates[1].eligible, true)
  assert.equal(pool.candidates[1].diversityStatus, 'duplicate')
  assert.equal(pool.candidates[2].eligible, false)
  assert.equal(persisted.length, 2)
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
    const failed = await corruptedRuntime.runAction({ actionId: 'idle', canonical })
    assert.equal(failed.ok, false)
    assert.equal(failed.failureCode, 'action_candidate_diversity_insufficient')
  } finally {
    if (previousUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousUrl
    if (previousToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousToken
  }
})

test('quality-first host runtime persists Provider request ids for failed action candidates', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-failed-evidence-'))
  const runId = 'run-failed-evidence'
  const sourceRelativePath = `runs/${runId}/inputs/reference.png`
  fs.mkdirSync(path.dirname(path.join(dataDir, sourceRelativePath)), { recursive: true })
  await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 80, g: 120, b: 160, alpha: 1 } } }).png().toFile(path.join(dataDir, sourceRelativePath))
  const plan = createSpriteAssetPlan({
    version: 1,
    revision: 1,
    character: { assetClass: 'grounded-compact-character' },
    actions: [{ actionId: 'idle' }]
  })
  const runtime = await createQualityFirstHostRuntime({
    dataDir,
    run: { runId, input: { referenceImage: { relativePath: sourceRelativePath } } },
    planOverride: plan
  })
  await runtime.persistActionResult({
    actionId: 'idle',
    canonical: { sha256: 'a'.repeat(64) },
    profile: { hash: 'p'.repeat(64) },
    result: {
      ok: false,
      actionId: 'idle',
      failureCode: 'quality_gate_failed',
      candidates: [{
        candidateId: 'candidate-1',
        requestId: 'provider-request-failed-1',
        modelAttempts: [{ model: 'gpt-image-2', ok: true, requestId: 'provider-request-failed-1' }]
      }]
    }
  })
  const checkpoint = readActionCheckpoints({ dataDir, runId }).actions.idle
  assert.deepEqual(checkpoint.requestIds, ['provider-request-failed-1'])
  assert.deepEqual(checkpoint.generationStages[0].requestIds, ['provider-request-failed-1'])
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
