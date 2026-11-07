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
const { readActionCheckpoints, resolveReusableActionResult, writeActionCheckpoint } = require('../../examples/plugins/creator-studio/lib/full-pet-action-checkpoints')
const { getQualityFirstQualityProfile } = require('../../examples/plugins/creator-studio/lib/pet-generation-quality-profile')
const { compileProviderImagePrompt } = require('../../examples/plugins/creator-studio/lib/provider-image-prompt-compiler')
const { writeCandidateRecord } = require('../../examples/plugins/creator-studio/lib/sprite-candidate-store')
const { createSpriteAssetPlan } = require('../../examples/plugins/creator-studio/lib/sprite-asset-plan')
const hostModelBridgeModule = require('../../examples/plugins/creator-studio/lib/host-model-bridge')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')
const { OFFICIAL_FULL_PET_ACTION_IDS } = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')

test('running video prepares one QA-approved contact pose for all candidates and keeps idle unchanged', async () => {
  const canonical = { relativePath: 'canonical.png', sha256: 'a'.repeat(64) }
  const calls = []
  const resolveStart = hostModelBridgeModule.__testInternals.createVideoStartReferenceResolver({
    dataDir: '/data', run: { runId: 'pose-run' }, settings: { model: 'gpt-image-2', timeoutMs: 120000 },
    action: { actionId: 'running-right', movingParts: ['locomotion limbs'], framePlan: ['right-facing first contact'] }, canonical,
    generateKeyframe: async (input) => {
      calls.push(input)
      return { ok: true, referenceImage: { relativePath: 'start.png' }, keyframe: { sha256: 'b'.repeat(64) } }
    }
  })
  const [first, second] = await Promise.all([resolveStart(), resolveStart()])
  assert.equal(calls.length, 1)
  assert.equal(first, second)
  assert.equal(first.relativePath, 'start.png')
  assert.equal(first.sha256, 'b'.repeat(64))
  assert.equal(calls[0].keyframeRole, 'start')
  assert.equal(calls[0].referenceImages[0].relativePath, canonical.relativePath)
  assert.match(calls[0].action.viewDirection, /right-facing.*side/i)
  assert.deepEqual(calls[0].action.animatedParts, ['both legs and feet only'])
  assert.match(calls[0].action.forbiddenMotion.join(' '), /front-facing rotation.*wing flap.*blink/i)
  assert.equal(calls[0].action.animationType, 'locomotion_loop')
  const resolveIdle = hostModelBridgeModule.__testInternals.createVideoStartReferenceResolver({ action: { actionId: 'idle' }, canonical,
    generateKeyframe: async () => { throw new Error('idle must not generate a pose') } })
  assert.equal(await resolveIdle(), canonical)
})

test('running start preparation uses canonical pixels without reintroducing the resting-pose character narrative', async () => {
  let input
  const resolveStart = hostModelBridgeModule.__testInternals.createVideoStartReferenceResolver({
    dataDir: '/data', run: { runId: 'rest-conflict', generationTask: { characterBrief: 'Two wings resting by its sides, facing forward.' } },
    settings: {}, action: { actionId: 'running-right' }, canonical: { relativePath: 'canonical.png' },
    generateKeyframe: async (value) => {
      input = value
      return { ok: true, referenceImage: { relativePath: 'start.png' }, keyframe: { sha256: 'b'.repeat(64) } }
    }
  })
  await resolveStart()
  assert.deepEqual(input.appearanceIntent, [])
})

test('a rejected running start pose stops video preparation without falling back to front-facing canonical', async () => {
  let calls = 0
  const resolveStart = hostModelBridgeModule.__testInternals.createVideoStartReferenceResolver({
    dataDir: '/data', run: { runId: 'pose-fail' }, settings: {}, action: { actionId: 'running-right' },
    canonical: { relativePath: 'canonical.png' },
    generateKeyframe: async () => { calls += 1; return { ok: false, error: 'identity check failed' } }
  })
  await assert.rejects(resolveStart(), { code: 'video_start_frame_rejected' })
  await assert.rejects(resolveStart(), { code: 'video_start_frame_rejected' })
  assert.equal(calls, 1)
})

test('action start preparation preserves typed budget refusal instead of wrapping it as pose rejection', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-keyframe-budget-'))
  const failure = Object.assign(new Error('evaluation budget exhausted'), { code: 'hatch_pet_evaluator_call_budget_exhausted' })
  await assert.rejects(hostModelBridgeModule.__testInternals.generateActionKeyframe({
    dataDir, run: { runId: 'budget-start' }, settings: {}, selectedModel: 'gpt-image-2',
    action: { actionId: 'running-right' }, referenceImages: [{ role: 'canonical-reference' }],
    generateWithFallbackImpl: async () => { throw failure }
  }), error => error === failure)
})

test('canonical generation stops on the first typed budget refusal without creating failed quality candidates', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-canonical-budget-'))
  const runId = 'canonical-budget'
  const reference = `runs/${runId}/reference.png`
  fs.mkdirSync(path.dirname(path.join(dataDir, reference)), { recursive: true })
  await sharp({ create: { width: 192, height: 208, channels: 4, background: '#6789ab' } }).png().toFile(path.join(dataDir, reference))
  const plan = createSpriteAssetPlan({ version: 1, revision: 1, character: { assetClass: 'grounded-compact-character' }, actions: [{ actionId: 'idle' }] })
  const run = { runId, input: { referenceImage: { relativePath: reference } } }
  const previous = { url: process.env.OPENPET_BRIDGE_URL, token: process.env.OPENPET_BRIDGE_TOKEN, fetch: global.fetch }
  process.env.OPENPET_BRIDGE_URL = 'http://127.0.0.1:1'
  process.env.OPENPET_BRIDGE_TOKEN = 'fixture-token'
  let attempts = 0
  global.fetch = async url => {
    if (String(url).endsWith('/creator/model-settings')) return new Response(JSON.stringify({ config: { model: 'gpt-image-2' } }), { status: 200 })
    attempts++
    return new Response(JSON.stringify({ ok: false, error: 'evaluation budget exhausted', errorCode: 'hatch_pet_evaluator_call_budget_exhausted' }), { status: 409 })
  }
  try {
    const runtime = await createQualityFirstHostRuntime({ dataDir, run, planOverride: plan })
    await assert.rejects(runtime.orchestrator.start({ run, plan: runtime.plan, actions: ['idle'] }), { code: 'hatch_pet_evaluator_call_budget_exhausted' })
    assert.equal(attempts, 1)
  } finally {
    global.fetch = previous.fetch
    if (previous.url == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previous.url
    if (previous.token == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previous.token
  }
})

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

test('failed canonical candidates preserve Provider, model, and exact transport evidence', () => {
  assert.equal(typeof hostModelBridgeModule.__testInternals.createFailedCanonicalCandidate, 'function')
  const error = new Error('Image Provider generation timed out after 120000ms')
  error.code = 'provider_timeout'
  error.modelAttempts = [{
    model: 'gpt-image-2',
    ok: false,
    errorCode: 'provider_timeout',
    timeoutMs: 120000,
    durationMs: 120041,
    requestId: 'provider-timeout-request'
  }]

  const candidate = hostModelBridgeModule.__testInternals.createFailedCanonicalCandidate({
    candidateId: 'canonical-1',
    promptRelativePath: 'runs/run-timeout/prompts/quality-first/canonical-1.txt',
    settings: { provider: 'openai-compatible', model: 'gpt-image-2' },
    error,
    traceContext: { runId: 'run-timeout', stage: 'canonical-candidate', candidateId: 'canonical-1' }
  })

  assert.equal(candidate.provider, 'openai-compatible')
  assert.equal(candidate.model, 'gpt-image-2')
  assert.equal(candidate.technicalEligible, false)
  assert.equal(candidate.recommended, false)
  assert.deepEqual(candidate.technicalFailureCodes, ['provider_timeout'])
  assert.deepEqual(candidate.failureCodes, ['provider_timeout'])
  assert.equal(candidate.requestId, 'provider-timeout-request')
  assert.deepEqual(candidate.modelAttempts, error.modelAttempts)
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

test('quality-first action dispatches compile distinct registered prompt strategies', () => {
  assert.equal(typeof hostModelBridgeModule.__testInternals.createQualityFirstActionCandidateTask, 'function')
  const action = {
    actionId: 'idle',
    frameCount: 6,
    layout: { canvas: { width: 1024, height: 1024 }, columns: 3, rows: 2 },
    framePlan: ['neutral rest', 'small inhale', 'peak inhale', 'small exhale', 'near rest', 'neutral rest'],
    movingParts: ['upper torso'],
    fixedParts: ['body root'],
    actionClass: 'grounded-subtle-loop',
    anchorPolicy: 'compact-contact-root-v1',
    componentPolicy: 'reference-guided-body-v1',
    effectPolicy: 'forbid-detached-effects',
    motionPresetId: 'idle-breath-v1',
    framePlanVersion: 1
  }
  const requests = [
    { attemptKind: 'initial', dispatchIndex: 1, failureCodes: [] },
    { attemptKind: 'initial', dispatchIndex: 2, failureCodes: [] },
    { attemptKind: 'duplicate-replacement', dispatchIndex: 3, failureCodes: [] },
    { attemptKind: 'repair', dispatchIndex: 4, failureCodes: ['cell-edge-contact', 'unknown-private-code'] }
  ]
  const tasks = requests.map((request) => hostModelBridgeModule.__testInternals.createQualityFirstActionCandidateTask({ action, ...request }))
  const prompts = tasks.map((task) => compileProviderImagePrompt({ task, model: 'gpt-image-2' }).text)

  assert.deepEqual(tasks.map((task) => task.strategyId), [
    'identity-strict-motion-v1',
    'motion-clarity-identity-locked-v1',
    'identity-safe-action-alternate-v1',
    'reason-directed-action-repair-v1'
  ])
  assert.equal(new Set(prompts.map((prompt) => crypto.createHash('sha256').update(prompt).digest('hex'))).size, 4)
  assert.match(prompts[2], /visibly different/i)
  assert.match(prompts[3], /clear cell padding/i)
  assert.doesNotMatch(prompts[3], /unknown-private-code|cell-edge-contact/i)

  const repairCases = [
    ['style-drift', /restore the exact referenced rendering medium/i],
    ['jumping-trajectory-missing', /airborne path/i],
    ['incomplete-subject', /complete body/i]
  ]
  for (const [failureCode, expected] of repairCases) {
    const task = hostModelBridgeModule.__testInternals.createQualityFirstActionCandidateTask({
      action,
      attemptKind: 'repair',
      dispatchIndex: 4,
      failureCodes: [failureCode]
    })
    assert.match(compileProviderImagePrompt({ task, model: 'gpt-image-2' }).text, expected)
  }
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

test('host canonical evaluation preserves technical eligibility when quality recommendation fails', async () => {
  const persisted = []
  const pool = await hostModelBridgeModule.__testInternals.evaluateCanonicalCandidatePool({
    pool: {
      version: 1,
      dispatchCount: 1,
      distinctEligibleCount: 1,
      candidates: [{
        candidateId: 'canonical-4',
        path: '/data/canonical-4.png',
        sha256: 'f'.repeat(64),
        eligible: true,
        technicalEligible: true,
        failureCodes: []
      }]
    },
    dataDir: '/data',
    runId: 'run-1',
    sourcePath: '/data/source.png',
    createBoard: async () => ({
      path: '/data/board.png',
      sha256: 'e'.repeat(64),
      regions: [{ regionId: 'source', role: 'source-identity' }, { regionId: 'canonical-4', role: 'canonical-candidate' }]
    }),
    requestEvaluation: async () => ({
      evaluation: { candidates: [{ candidateId: 'canonical-4', scores: { identity: 84, silhouette: 45, overall: 68 } }] },
      gate: { candidateGates: { 'canonical-4': { ok: false, outcome: 'reject', failures: ['visual-score-silhouette-below-minimum', 'visual-score-overall-below-minimum'] } }, },
      evidenceRelativePath: 'runs/run-1/evaluations/canonical.json'
    }),
    persistCandidate: async (candidate) => persisted.push(structuredClone(candidate))
  })

  assert.equal(pool.passingCandidateCount, 0)
  assert.equal(pool.candidates[0].technicalEligible, true)
  assert.equal(pool.candidates[0].recommended, false)
  assert.equal(pool.candidates[0].eligible, false)
  assert.deepEqual(pool.candidates[0].technicalFailureCodes, [])
  assert.deepEqual(pool.candidates[0].qualityWarningCodes, [
    'visual-score-silhouette-below-minimum',
    'visual-score-overall-below-minimum'
  ])
  assert.equal(persisted[0].technicalEligible, true)
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
  const reviewPath = path.join(candidateDir, 'video/normalized/0001.png')
  for (const [filePath, value] of [
    [rawPath, 'raw'],
    [path.join(dataDir, promptRelativePath), 'prompt'],
    [path.join(dataDir, evidenceRelativePath), 'evaluation'],
    [path.join(outputDir, 'evaluator-board.png'), 'board'],
    [reviewPath, 'normalized-detail']
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
      outputDir,
      processed: { reviewFrames: [{ index: 0, path: reviewPath }] }
    }
  })
  assert.deepEqual(artifacts.map((entry) => entry.role), ['raw-sheet', 'prompt', 'evaluation-evidence', 'evaluator-board', 'review-frame-1'])
  assert.equal(artifacts.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)), true)
})

test('host reloads retained paid action candidates for diversity-failure recovery', () => {
  assert.equal(typeof hostModelBridgeModule.__testInternals.loadRetainedQualityFirstActionCandidates, 'function')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-retained-action-'))
  const runId = 'run-retained-action'
  const rawPath = path.join(dataDir, `runs/${runId}/candidates/idle/candidate-1/raw/0001.png`)
  const promptPath = path.join(dataDir, `runs/${runId}/prompts/quality-first/idle-candidate-1.txt`)
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  fs.mkdirSync(path.dirname(promptPath), { recursive: true })
  fs.writeFileSync(rawPath, 'paid-sheet')
  fs.writeFileSync(promptPath, 'visible prompt')
  const fileHash = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  writeCandidateRecord({
    dataDir,
    runId,
    scope: 'action-idle',
    candidate: {
      candidateId: 'candidate-1',
      attemptKind: 'initial',
      dispatchIndex: 1,
      strategyId: 'identity-strict-motion-v1',
      model: 'gpt-image-2',
      descriptors: { perceptualHash: '0000', identityDescriptor: [0, 0.1], alphaMaskDescriptor: [0, 0.2] },
      artifacts: [
        { role: 'raw-sheet', path: rawPath, sha256: fileHash(rawPath) },
        { role: 'prompt', path: promptPath, sha256: fileHash(promptPath) }
      ]
    }
  })
  writeCandidateRecord({
    dataDir,
    runId,
    scope: 'action-idle',
    candidate: {
      candidateId: 'candidate-2',
      attemptKind: 'duplicate-replacement',
      dispatchIndex: 2,
      failureCodes: ['provider-generation-failed']
    }
  })
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-retained-outside-'))
  const outsidePath = path.join(outsideDir, 'outside.png')
  fs.writeFileSync(outsidePath, 'outside-paid-sheet')
  const symlinkRelativePath = `runs/${runId}/candidates/idle/candidate-3/raw/0001.png`
  const symlinkPath = path.join(dataDir, symlinkRelativePath)
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true })
  fs.symlinkSync(outsidePath, symlinkPath)
  const escapedRecordDir = path.join(dataDir, `runs/${runId}/candidates/action-idle/candidate-3`)
  fs.mkdirSync(escapedRecordDir, { recursive: true })
  fs.writeFileSync(path.join(escapedRecordDir, 'candidate.json'), `${JSON.stringify({
    version: 1,
    runId,
    scope: 'action-idle',
    candidate: {
      candidateId: 'candidate-3',
      attemptKind: 'initial',
      dispatchIndex: 3,
      descriptors: { perceptualHash: 'ffff', identityDescriptor: [1, 1], alphaMaskDescriptor: [1, 1] },
      artifacts: [{ role: 'raw-sheet', relativePath: symlinkRelativePath, sha256: fileHash(outsidePath) }]
    }
  }, null, 2)}\n`)

  const candidates = hostModelBridgeModule.__testInternals.loadRetainedQualityFirstActionCandidates({ dataDir, runId, actionId: 'idle' })
  assert.equal(candidates.length, 3)
  assert.equal(candidates[0].candidateId, 'candidate-1')
  assert.equal(candidates[0].rawPath, fs.realpathSync.native(rawPath))
  assert.equal(candidates[0].promptRelativePath, `runs/${runId}/prompts/quality-first/idle-candidate-1.txt`)
  assert.equal(candidates[0].strategyId, 'identity-strict-motion-v1')
  assert.equal(candidates[1].candidateId, 'candidate-2')
  assert.deepEqual(candidates[1].failureCodes, ['provider-generation-failed'])
  assert.equal(candidates[1].rawPath, undefined)
  assert.equal(candidates[2].candidateId, 'candidate-3')
  assert.equal(candidates[2].rawPath, undefined)
  assert.equal(candidates[2].descriptors, undefined)
})


test('video motion processing invalidates old locomotion and review bindings while preserving accepted work and other rows', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-version-'))
  const runId = 'scoped-version'
  const reference = `runs/${runId}/reference.png`
  const frame = path.join(dataDir, `runs/${runId}/frame.png`)
  fs.mkdirSync(path.dirname(frame), { recursive: true })
  await sharp({ create: { width: 192, height: 208, channels: 4, background: '#6789ab' } }).png().toFile(frame)
  fs.copyFileSync(frame, path.join(dataDir, reference))
  const plan = createSpriteAssetPlan({ version: 1, revision: 1, character: { assetClass: 'grounded-compact-character' }, actions: ['idle', 'waving', 'jumping', 'failed', 'waiting', 'review', 'running', 'running-right'].map(actionId => ({ actionId })) })
  const canonical = { sha256: 'a'.repeat(64), relativePath: reference }
  const profile = { version: 1 }
  profile.hash = crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex')
  fs.writeFileSync(path.join(dataDir, `runs/${runId}/character-scale-profile.json`), JSON.stringify(profile))
  const previous = { url: process.env.OPENPET_BRIDGE_URL, token: process.env.OPENPET_BRIDGE_TOKEN, fetch: global.fetch }
  process.env.OPENPET_BRIDGE_URL = 'http://127.0.0.1:1'
  process.env.OPENPET_BRIDGE_TOKEN = 'fixture-token'
  global.fetch = async url => {
    assert.match(String(url), /creator\/model-settings$/)
    return new Response(JSON.stringify({ config: { videoGeneration: { hasApiKey: true, model: 'grok-imagine-video' } } }), { status: 200 })
  }
  try {
    const runtime = await createQualityFirstHostRuntime({ dataDir, run: { runId, input: { referenceImage: { relativePath: reference } } }, planOverride: plan })
    for (const actionId of ['idle', 'waving', 'jumping', 'failed', 'waiting', 'review', 'running', 'running-right', 'running-left']) {
      writeActionCheckpoint({ dataDir, runId, result: { actionId, ok: true,
        bindings: { planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: profile.hash, processorVersion: actionId === 'running' ? 15 : actionId === 'review' ? 15 : 12, qualityProfileHash: getQualityFirstQualityProfile().hash },
        row: { actionId, quality: 'row-real', frames: [{ path: frame, index: 0, durationMs: 120 }] }
      } })
      const locomotion = actionId.startsWith('running-')
      const stateGesture = actionId === 'running' || actionId === 'review'
      const expectedVersion = locomotion ? 14 : actionId === 'review' ? 16 : stateGesture ? 15 : 12
      assert.equal(runtime.processorVersionForAction(actionId), expectedVersion)
      if (!locomotion && actionId !== 'review') {
        const result = await runtime.runAction({ actionId, canonical, profile })
        assert.equal(result.checkpointReused, true, actionId)
      } else {
        assert.equal(resolveReusableActionResult({ dataDir, runId, actionId, planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: profile.hash, processorVersion: runtime.processorVersionForAction(actionId), qualityProfileHash: getQualityFirstQualityProfile().hash, requireBindings: true }), null)
        await runtime.persistActionResult({ actionId, canonical, profile, result: { ok: false, failureCode: 'fixture' } })
        assert.equal(readActionCheckpoints({ dataDir, runId }).actions[actionId].bindings.processorVersion, expectedVersion)
      }
    }
    assert.deepEqual(await runtime.createCharacterScaleProfile({ canonical, idle: { checkpointReused: true } }), profile)
  } finally {
    global.fetch = previous.fetch
    if (previous.url == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previous.url
    if (previous.token == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previous.token
  }
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
    const oldCheckpoint = readActionCheckpoints({ dataDir, runId }).actions.idle
    assert.equal(resolveReusableActionResult({
      dataDir, runId, actionId: 'idle', ...oldCheckpoint.bindings,
      processorVersion: runtime.actionProcessorVersion, requireBindings: true
    }), null, 'a checkpoint evaluated without action intent must not be reused')
    writeActionCheckpoint({
      dataDir, runId,
      result: { ...oldCheckpoint, bindings: { ...oldCheckpoint.bindings, processorVersion: runtime.actionProcessorVersion }, row: { ...oldCheckpoint.row, frames: [{ index: 0, durationMs: 120, path: framePath }] } }
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
    assert.equal(failed.failureCode, 'action_quality_gate_failed')
    assert.equal(failed.diversityStatus, 'degraded')
    assert.deepEqual(failed.warningCodes, ['action_candidate_diversity_insufficient'])
  } finally {
    if (previousUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousUrl
    if (previousToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousToken
  }
})

test('quality-first Backend runs force identity review even when the planner selects a candidate', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-backend-identity-review-'))
  const runId = 'run-backend-review'
  const sourceRelativePath = `runs/${runId}/inputs/reference.png`
  fs.mkdirSync(path.dirname(path.join(dataDir, sourceRelativePath)), { recursive: true })
  await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 80, g: 120, b: 160, alpha: 1 } } }).png().toFile(path.join(dataDir, sourceRelativePath))
  const plan = createSpriteAssetPlan({ version: 1, revision: 1, character: { assetClass: 'grounded-compact-character' }, actions: [{ actionId: 'idle' }] })
  const previousUrl = process.env.OPENPET_BRIDGE_URL
  const previousToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = 'http://127.0.0.1:1'
  process.env.OPENPET_BRIDGE_TOKEN = 'test-token'
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    assert.match(String(url), /\/creator\/hatch-pet\/plan$/)
    return new Response(JSON.stringify({ ok: true, result: {
      proposal: { assetClass: 'grounded-compact-character', actions: [{ actionId: 'idle' }] },
      requireIdentityReviewBeforeActions: false
    } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const runtime = await createQualityFirstHostRuntime({
      dataDir,
      run: {
        runId,
        creatorExecution: 'backend',
        generationTask: { mode: 'full-pet', actions: OFFICIAL_FULL_PET_ACTION_IDS.map((actionId) => ({ actionId })) },
        input: { referenceImage: { relativePath: sourceRelativePath } }
      }
    })
    assert.equal(runtime.requireIdentityReviewBeforeActions, true)
    assert.deepEqual(runtime.plan.actions.map((action) => action.actionId), OFFICIAL_FULL_PET_ACTION_IDS.filter((actionId) => actionId !== 'running-left'))
  } finally {
    global.fetch = originalFetch
    if (previousUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousUrl
    if (previousToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousToken
  }
})

test('quality-first host runtime materializes a warned retained action candidate without Provider generation', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-manual-action-'))
  const runId = 'run-manual-action'
  const sourceRelativePath = `runs/${runId}/inputs/reference.png`
  const canonicalRelativePath = `runs/${runId}/canonical.png`
  for (const relativePath of [sourceRelativePath, canonicalRelativePath]) {
    const absolutePath = path.join(dataDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 80, g: 120, b: 160, alpha: 1 } } }).png().toFile(absolutePath)
  }
  const plan = createSpriteAssetPlan({
    version: 1,
    revision: 1,
    character: { assetClass: 'grounded-compact-character' },
    actions: [{ actionId: 'idle' }]
  })
  const rawRelativePath = `runs/${runId}/candidates/idle/candidate-2/raw/0001.png`
  const rawPath = path.join(dataDir, rawRelativePath)
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  const cellWidth = 1024 / 3
  const cellHeight = 1024 / 2
  const sprite = await sharp({ create: { width: 72, height: 96, channels: 4, background: { r: 90, g: 130, b: 170, alpha: 1 } } }).png().toBuffer()
  const composites = []
  for (let index = 0; index < 6; index += 1) {
    composites.push({
      input: sprite,
      left: Math.floor((index % 3) * cellWidth + ((cellWidth - 72) / 2)),
      top: Math.floor(Math.floor(index / 3) * cellHeight + ((cellHeight - 96) / 2))
    })
  }
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toFile(rawPath)
  const candidateHash = crypto.createHash('sha256').update(fs.readFileSync(rawPath)).digest('hex')
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
    const result = await runtime.materializeActionCandidate({
      actionId: 'idle',
      candidate: {
        candidateId: 'candidate-2',
        sha256: candidateHash,
        technicalEligible: true,
        recommended: false,
        qualityWarningCodes: ['visual-score-overall-below-minimum'],
        artifacts: [{ role: 'raw-sheet', relativePath: rawRelativePath, sha256: candidateHash }],
        selection: { selectionAuthority: 'human-override', qualityOverride: true }
      },
      canonical: { candidateId: 'canonical-1', sha256: 'a'.repeat(64), relativePath: canonicalRelativePath },
      profile: null,
      plan
    })

    assert.equal(result.ok, true)
    assert.equal(result.selectedCandidateId, 'candidate-2')
    assert.equal(result.selectedCandidate.technicalEligible, true)
    assert.equal(result.selectedCandidate.recommended, false)
    assert.equal(result.selectedCandidate.processed.frames.length, 6)
    assert.equal(result.selectedCandidate.processed.frames.every((frame) => fs.existsSync(frame.path)), true)
  } finally {
    if (previousUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousUrl
    if (previousToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousToken
  }
})

test('quality-first host runtime rejects a scale profile whose content no longer matches its embedded hash', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-corrupt-profile-'))
  const runId = 'run-corrupt-profile'
  const sourceRelativePath = `runs/${runId}/inputs/reference.png`
  const canonicalRelativePath = `runs/${runId}/canonical.png`
  for (const relativePath of [sourceRelativePath, canonicalRelativePath]) {
    const absolutePath = path.join(dataDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 80, g: 120, b: 160, alpha: 1 } } }).png().toFile(absolutePath)
  }
  const plan = createSpriteAssetPlan({
    version: 1,
    revision: 1,
    character: { assetClass: 'grounded-compact-character' },
    actions: [{ actionId: 'waving' }]
  })
  const rawRelativePath = `runs/${runId}/candidates/waving/candidate-2/raw/0001.png`
  const rawPath = path.join(dataDir, rawRelativePath)
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 90, g: 130, b: 170, alpha: 1 } } }).png().toFile(rawPath)
  const candidateHash = crypto.createHash('sha256').update(fs.readFileSync(rawPath)).digest('hex')
  const profileBase = { version: 1, maxBodyScaleCv: 0.08 }
  const validHash = crypto.createHash('sha256').update(JSON.stringify(profileBase)).digest('hex')
  const corruptProfile = { ...profileBase, maxBodyScaleCv: 999, hash: validHash }
  const runtime = await createQualityFirstHostRuntime({
    dataDir,
    run: { runId, qualityFirst: { scaleProfileHash: validHash }, input: { referenceImage: { relativePath: sourceRelativePath } } },
    planOverride: plan
  })

  await assert.rejects(() => runtime.materializeActionCandidate({
    actionId: 'waving',
    candidate: {
      candidateId: 'candidate-2',
      sha256: candidateHash,
      technicalEligible: true,
      recommended: true,
      artifacts: [{ role: 'raw-sheet', relativePath: rawRelativePath, sha256: candidateHash }]
    },
    canonical: { candidateId: 'canonical-1', sha256: 'a'.repeat(64), relativePath: canonicalRelativePath },
    profile: corruptProfile,
    plan
  }), (error) => error?.code === 'candidate_binding_stale')
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

  const warned = await evaluateQualityFirstFinalPackage({
    dataDir,
    runId,
    sourcePath: paths.source,
    canonicalPath: paths.canonical,
    spritesheetPath: paths.atlas,
    atlasQaPath,
    allowVisualQualityWarnings: true,
    requestEvaluation: async () => ({ gate: { ok: false, outcome: 'repair', failures: ['visual-score-overall-below-minimum'] }, evidenceRelativePath: `runs/${runId}/evaluations/final-package.json` })
  })
  assert.equal(warned.recommended, false)
  assert.deepEqual(warned.qualityWarningCodes, ['visual-score-overall-below-minimum'])
  assert.equal(warned.gate.ok, false)

  await assert.rejects(() => evaluateQualityFirstFinalPackage({
    dataDir,
    runId,
    sourcePath: paths.source,
    canonicalPath: paths.canonical,
    spritesheetPath: paths.atlas,
    atlasQaPath,
    allowVisualQualityWarnings: true,
    requestEvaluation: async () => ({ gate: { ok: false, outcome: 'cannot-evaluate', failures: ['final-package-evaluation-unavailable'] }, evidenceRelativePath: `runs/${runId}/evaluations/final-package.json` })
  }), (error) => error?.code === 'final_package_visual_gate_failed')

  await assert.rejects(() => evaluateQualityFirstFinalPackage({
    dataDir,
    runId,
    sourcePath: paths.source,
    canonicalPath: paths.canonical,
    spritesheetPath: paths.atlas,
    atlasQaPath,
    requestEvaluation: async () => ({ gate: { ok: false, outcome: 'repair', failures: ['visual-score-overall-below-minimum'] }, evidenceRelativePath: `runs/${runId}/evaluations/final-package.json` })
  }), (error) => error?.code === 'final_package_visual_gate_failed')

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

test('video action candidates build their evaluator board with the accepted canonical', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-action-evaluator-'))
  const runId = 'run-video-action-evaluator'
  const runDir = path.join(dataDir, 'runs', runId)
  const sourcePath = path.join(runDir, 'source.png')
  const canonicalPath = path.join(runDir, 'canonical.png')
  const outputDir = path.join(runDir, 'candidates', 'idle', 'candidate-1', 'processed')
  fs.mkdirSync(outputDir, { recursive: true })
  const framePaths = []
  for (const [index, filePath] of [sourcePath, canonicalPath, ...Array.from({ length: 6 }, (_, frameIndex) => path.join(outputDir, `frame-${frameIndex + 1}.png`))].entries()) {
    await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 30 + index * 15, g: 90, b: 160, alpha: 1 } } }).png().toFile(filePath)
    if (index >= 2) framePaths.push(filePath)
  }
  const requests = []
  const evaluated = await hostModelBridgeModule.__testInternals.evaluateQualityFirstActionCandidate({
    dataDir,
    runId,
    actionId: 'idle',
    action: { motionParameters: { intensity: 'subtle', leadSide: 'viewer-right' } },
    sourcePath,
    canonicalPath,
    candidate: {
      outputDir,
      processed: { frames: framePaths.map((framePath, index) => ({ index, path: framePath })) },
      qa: { ok: true, failures: [] }
    },
    requestEvaluation: async (request) => {
      requests.push(request)
      return {
        evaluation: { scores: { overall: 93 } },
        gate: { ok: true, outcome: 'pass', failures: [] },
        evidenceRelativePath: `runs/${runId}/evaluations/idle.json`
      }
    }
  })

  assert.equal(evaluated.gate.ok, true)
  assert.equal(evaluated.evaluation.scores.overall, 93)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].scope, 'grounded-action')
  assert.equal(requests[0].qa.actionIntent?.actionId, 'idle')
  assert.equal(requests[0].qa.actionIntent?.loop, true)
  assert.equal(requests[0].qa.actionIntent?.frameCount, 6)
  assert.match(requests[0].qa.actionIntent?.framePlan.join(' ') || '', /blink/i)
  assert.match(requests[0].qa.actionIntent.framePlan.join(' '), /subtle intensity.*viewer-right/)
  assert.deepEqual(requests[0].board.regions.slice(0, 2).map((region) => region.role), ['source-identity', 'canonical-identity'])
  assert.equal(fs.existsSync(path.join(outputDir, 'evaluator-board.png')), true)
})

test('video action review uses original normalized detail and retains runtime evidence', async () => {
  const options = []
  const runtimeFrames = Array.from({ length: 6 }, (_, index) => ({ index, path: `runtime-${index}.png` }))
  const reviewFrames = Array.from({ length: 6 }, (_, index) => ({ index, path: `normalized-${index}.png` }))
  await hostModelBridgeModule.__testInternals.evaluateQualityFirstActionCandidate({
    dataDir: '/data', runId: 'review-video', actionId: 'idle', sourcePath: 'source.png', canonicalPath: 'canonical.png',
    candidate: { outputDir: '/data/candidate', processed: { frames: runtimeFrames, reviewFrames }, qa: { ok: true } },
    createBoard: async (input) => { options.push(input); return { path: '/data/board.png', sha256: 'a'.repeat(64), regions: [] } },
    requestEvaluation: async () => ({ gate: { ok: true }, evaluation: {} })
  })
  assert.deepEqual(options[0].candidateFrames, reviewFrames)
  assert.deepEqual(options[0].runtimeFrames, runtimeFrames)
})

test('final package quality stays advisory after any explicit human candidate selection', () => {
  const { hasHumanCandidateSelection } = hostModelBridgeModule.__testInternals
  assert.equal(hasHumanCandidateSelection({
    canonical: { selection: { selectionAuthority: 'human-override', qualityOverride: false } },
    actionResults: {}
  }), true)
  assert.equal(hasHumanCandidateSelection({
    canonical: { selection: { selectionAuthority: 'automatic', qualityOverride: false } },
    actionResults: {
      waving: { selectedCandidate: { selection: { selectionAuthority: 'human-override', qualityOverride: false } } }
    }
  }), true)
  assert.equal(hasHumanCandidateSelection({
    canonical: { selection: { selectionAuthority: 'automatic', qualityOverride: false } },
    actionResults: {}
  }), false)
})

test('host model bridge no longer exports the removed legacy full-pet repair entry point', () => {
  assert.equal(Object.hasOwn(hostModelBridgeModule, 'regenerateFullPetActionsViaHostModelBridge'), false)
})
