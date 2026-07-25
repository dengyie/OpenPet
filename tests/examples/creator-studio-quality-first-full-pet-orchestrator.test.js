const test = require('node:test')
const assert = require('node:assert/strict')

const { createQualityFirstFullPetOrchestrator } = require('../../examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator')

const createHarness = ({ idleOk = true, finalizePackage = async () => ({ spritesheetRelativePath: 'runs/run-1/quality-first/package/spritesheet.webp', artifacts: { outputDir: '/data/runs/run-1/quality-first/package' } }) } = {}) => {
  const calls = { canonical: 0, actions: [], actionCanonicals: [], mirrors: 0, recovery: 0, events: [] }
  const orchestrator = createQualityFirstFullPetOrchestrator({
    generateCanonicalCandidatePool: async () => {
      calls.canonical += 1
      return {
        dispatchCount: 3,
        candidates: [
          { candidateId: 'canonical-1', eligible: true, sha256: 'a'.repeat(64), score: 90 },
          { candidateId: 'canonical-2', eligible: true, sha256: 'b'.repeat(64), score: 92 },
          { candidateId: 'canonical-3', eligible: true, sha256: 'c'.repeat(64), score: 91 }
        ]
      }
    },
    runQualityFirstAction: async ({ actionId, canonical }) => {
      calls.actions.push(actionId)
      calls.actionCanonicals.push(canonical?.candidateId || '')
      return { ok: actionId === 'idle' ? idleOk : actionId !== 'waving', actionId, selectedCandidateId: `${actionId}-candidate` }
    },
    createCharacterScaleProfile: async () => ({ hash: 'p'.repeat(64) }),
    mirrorRunningLeft: async () => {
      calls.mirrors += 1
      return { ok: true, actionId: 'running-left', mirroredFrom: 'running-right' }
    },
    createRecoveryBundle: async () => {
      calls.recovery += 1
      return { relativePath: 'runs/run-1/recovery/recovery.json' }
    },
    finalizePackage,
    recordEvent: (event) => calls.events.push(event),
    now: () => '2026-07-20T12:00:00.000Z'
  })
  return { orchestrator, calls }
}

test('default start deterministically selects the best passing canonical and continues to final human review', async () => {
  const h = createHarness()
  const run = await h.orchestrator.start({
    run: { runId: 'run-1', status: 'generating' },
    plan: { hash: 'plan-hash' },
    sourceReference: { relativePath: 'inputs/ref.png' },
    actions: ['idle'],
    requireIdentityReviewBeforeActions: false
  })

  assert.equal(run.status, 'ready_for_review')
  assert.equal(run.qualityFirst.phase, 'ready_for_review')
  assert.equal(run.qualityFirst.acceptedCanonical.candidateId, 'canonical-2')
  assert.equal(run.qualityFirst.canonicalCandidates.find((candidate) => candidate.candidateId === 'canonical-2').disposition, 'selected-anchor')
  assert.deepEqual(h.calls.actions, ['idle'])
  assert.deepEqual(h.calls.actionCanonicals, ['canonical-2'])
})

test('start generates canonical candidates and blocks all action generation until identity acceptance', async () => {
  const h = createHarness()
  const run = await h.orchestrator.start({ run: { runId: 'run-1', status: 'generating' }, plan: { hash: 'plan-hash' }, sourceReference: { relativePath: 'inputs/ref.png' }, requireIdentityReviewBeforeActions: true })
  assert.equal(run.status, 'awaiting_identity_review')
  assert.equal(run.qualityFirst.phase, 'awaiting_identity_review')
  assert.equal(h.calls.canonical, 1)
  assert.deepEqual(h.calls.actions, [])
})

test('canonical acceptance runs idle first, locks scale profile, continues optional actions, and mirrors running-left', async () => {
  const h = createHarness()
  const pending = await h.orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' }, requireIdentityReviewBeforeActions: true })
  const run = await h.orchestrator.acceptCanonicalIdentity({
    run: pending,
    candidateId: 'canonical-2',
    sha256: 'b'.repeat(64),
    plan: { hash: 'plan-hash' },
    actions: ['idle', 'running-right', 'running-left', 'waving']
  })
  assert.equal(run.status, 'ready_for_review')
  assert.equal(run.qualityFirst.phase, 'ready_for_review')
  assert.deepEqual(h.calls.actions, ['idle', 'running-right', 'waving'])
  assert.equal(h.calls.mirrors, 1)
  assert.deepEqual(run.qualityFirst.omittedActionIds, ['waving'])
  assert.equal(run.qualityFirst.scaleProfileHash, 'p'.repeat(64))
  assert.deepEqual(h.calls.events.filter((entry) => entry.scope === 'action').map((entry) => [entry.actionId, entry.status]), [
    ['idle', 'started'],
    ['idle', 'completed'],
    ['running-right', 'started'],
    ['running-right', 'completed'],
    ['waving', 'started'],
    ['waving', 'failed']
  ])
})

test('canonical acceptance publishes finalized package artifacts for the existing approval and import contract', async () => {
  const artifacts = {
    outputDir: '/data/runs/run-1/quality-first/package',
    petJson: '/data/runs/run-1/quality-first/package/pet.json',
    spritesheet: '/data/runs/run-1/quality-first/package/spritesheet.webp',
    bundle: '/data/runs/run-1/quality-first/package/pet.codex-pet.zip',
    qa: '/data/runs/run-1/quality-first/qa/atlas-validation.json',
    sourceImageQa: '/data/runs/run-1/quality-first/qa/source-image-validation.json',
    generatedImage: { outputs: [{ dataRelativePath: 'runs/run-1/candidates/canonical/canonical-1/raw.png' }] }
  }
  const h = createHarness()
  h.orchestrator = createQualityFirstFullPetOrchestrator({
    generateCanonicalCandidatePool: async () => ({
      dispatchCount: 3,
      candidates: [
        { candidateId: 'canonical-1', eligible: true, sha256: 'a'.repeat(64) },
        { candidateId: 'canonical-2', eligible: true, sha256: 'b'.repeat(64) },
        { candidateId: 'canonical-3', eligible: true, sha256: 'c'.repeat(64) }
      ]
    }),
    runQualityFirstAction: async ({ actionId }) => ({ ok: true, actionId, selectedCandidateId: `${actionId}-candidate` }),
    createCharacterScaleProfile: async () => ({ hash: 'p'.repeat(64) }),
    finalizePackage: async () => ({
      spritesheetRelativePath: 'runs/run-1/quality-first/package/spritesheet.webp',
      atlasQaRelativePath: 'runs/run-1/quality-first/qa/atlas-validation.json',
      artifacts
    })
  })
  const pending = await h.orchestrator.start({ run: { runId: 'run-1', artifacts: { retained: true } }, plan: { hash: 'plan-hash' }, requireIdentityReviewBeforeActions: true })
  const run = await h.orchestrator.acceptCanonicalIdentity({
    run: pending,
    candidateId: 'canonical-1',
    sha256: 'a'.repeat(64),
    plan: { hash: 'plan-hash' },
    actions: ['idle']
  })

  assert.deepEqual(run.artifacts, { retained: true, ...artifacts })
  assert.equal(run.qualityFirst.package.spritesheetRelativePath, 'runs/run-1/quality-first/package/spritesheet.webp')
  assert.equal(Object.hasOwn(run.qualityFirst.package, 'artifacts'), false)
})

test('idle failure produces recovery-required state and never runs optional actions', async () => {
  const h = createHarness({ idleOk: false })
  const pending = await h.orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' }, requireIdentityReviewBeforeActions: true })
  const run = await h.orchestrator.acceptCanonicalIdentity({ run: pending, candidateId: 'canonical-1', sha256: 'a'.repeat(64), actions: ['idle', 'waving'] })
  assert.equal(run.status, 'recovery-required')
  assert.equal(run.qualityFirst.nextAction, 'export-recovery-bundle')
  assert.deepEqual(h.calls.actions, ['idle'])
  assert.equal(h.calls.recovery, 1)
})

test('identity acceptance requires an eligible candidate and exact hash', async () => {
  const h = createHarness()
  const pending = await h.orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' }, requireIdentityReviewBeforeActions: true })
  await assert.rejects(() => h.orchestrator.acceptCanonicalIdentity({ run: pending, candidateId: 'canonical-2', sha256: 'wrong' }), /not eligible or hash/i)
})

test('one passing canonical continues even when the other paid candidates are duplicates or unusable', async () => {
  const orchestrator = createQualityFirstFullPetOrchestrator({
    generateCanonicalCandidatePool: async () => ({
      dispatchCount: 4,
      candidates: [
        {
          candidateId: 'canonical-1',
          eligible: true,
          sha256: 'a'.repeat(64),
          score: 95,
          relativePath: 'runs/run-1/candidates/canonical/canonical-1/raw/0001.png',
          attemptKind: 'initial',
          diversityProfileId: 'identity-faithful-balanced-v1',
          promptText: 'secret prompt must not escape'
        },
        {
          candidateId: 'canonical-2',
          eligible: true,
          sha256: 'b'.repeat(64),
          score: 94,
          relativePath: 'runs/run-1/candidates/canonical/canonical-2/raw/0001.png',
          attemptKind: 'duplicate-replacement',
          diversityProfileId: 'identity-safe-alternate-neutral-v1',
          duplicateOfCandidateId: 'canonical-1',
          previewDataUrl: 'data:image/png;base64,secret'
        },
        {
          candidateId: 'canonical-3',
          eligible: false,
          sha256: 'c'.repeat(64),
          relativePath: '/Users/mango/private.png',
          failureCodes: ['identity-gate-failed']
        }
      ]
    }),
    runQualityFirstAction: async ({ actionId, canonical }) => ({ ok: true, actionId, selectedCandidateId: `${canonical.candidateId}-${actionId}` }),
    createCharacterScaleProfile: async () => ({ hash: 'hash' }),
    finalizePackage: async () => ({ artifacts: { outputDir: '/data/package' } })
  })

  const run = await orchestrator.start({
    run: { runId: 'run-1' },
    plan: { hash: 'plan-hash' },
    actions: ['idle'],
    requireIdentityReviewBeforeActions: false
  })

  assert.equal(run.status, 'ready_for_review')
  assert.equal(run.qualityFirst.acceptedCanonical.candidateId, 'canonical-1')
  assert.equal(run.qualityFirst.canonicalCandidates[0].disposition, 'selected-anchor')
  assert.equal(run.qualityFirst.canonicalCandidates[1].eligible, true)
  assert.equal(run.qualityFirst.canonicalCandidates[1].disposition, 'duplicate-alternate')
  assert.equal(run.qualityFirst.canonicalCandidates[1].duplicateOfCandidateId, 'canonical-1')
  assert.equal(run.qualityFirst.canonicalCandidates[2].disposition, 'unusable')
  assert.equal(run.qualityFirst.canonicalCandidates[2].relativePath, undefined)
  assert.equal(Object.hasOwn(run.qualityFirst.canonicalCandidates[0], 'promptText'), false)
  assert.doesNotMatch(JSON.stringify(run.qualityFirst), /\/Users\/|data:image|secret prompt/i)
})

test('canonical generation fails only when no candidate passes the quality gates', async () => {
  const orchestrator = createQualityFirstFullPetOrchestrator({
    generateCanonicalCandidatePool: async () => ({
      dispatchCount: 4,
      candidates: [
        { candidateId: 'canonical-1', eligible: false, sha256: 'a'.repeat(64), failureCodes: ['identity-gate-failed'], relativePath: 'runs/run-1/candidates/canonical/canonical-1/raw.png' },
        { candidateId: 'canonical-2', eligible: false, sha256: 'b'.repeat(64), failureCodes: ['incomplete-subject'], relativePath: '/Users/mango/private.png', promptText: 'secret' }
      ]
    }),
    runQualityFirstAction: async () => ({ ok: true }),
    createCharacterScaleProfile: async () => ({ hash: 'hash' })
  })

  await assert.rejects(
    () => orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' }, requireIdentityReviewBeforeActions: false }),
    (error) => {
      assert.equal(error.code, 'canonical_identity_candidates_unusable')
      assert.equal(error.canonicalPool.dispatchCount, 4)
      assert.equal(error.canonicalPool.passingCandidateCount, 0)
      assert.equal(error.canonicalPool.candidates.length, 2)
      assert.equal(error.canonicalPool.candidates[0].relativePath, 'runs/run-1/candidates/canonical/canonical-1/raw.png')
      assert.equal(error.canonicalPool.candidates[1].relativePath, undefined)
      assert.doesNotMatch(JSON.stringify(error.canonicalPool), /\/Users\/|secret/i)
      return true
    }
  )
})

test('canonical acceptance fails closed when final package artifacts are missing', async () => {
  const h = createHarness({ finalizePackage: async () => null })
  const pending = await h.orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' }, requireIdentityReviewBeforeActions: true })
  await assert.rejects(() => h.orchestrator.acceptCanonicalIdentity({
    run: pending,
    candidateId: 'canonical-1',
    sha256: 'a'.repeat(64),
    plan: { hash: 'plan-hash' },
    actions: ['idle']
  }), (error) => {
    assert.equal(error.code, 'quality_first_final_package_missing')
    return true
  })
})

test('canonical acceptance durably publishes identity, profile, and completed actions before later failure', async () => {
  const snapshots = []
  const events = []
  const orchestrator = createQualityFirstFullPetOrchestrator({
    generateCanonicalCandidatePool: async () => ({
      dispatchCount: 3,
      candidates: [
        { candidateId: 'canonical-1', eligible: true, sha256: 'a'.repeat(64) },
        { candidateId: 'canonical-2', eligible: true, sha256: 'b'.repeat(64) },
        { candidateId: 'canonical-3', eligible: true, sha256: 'c'.repeat(64) }
      ]
    }),
    runQualityFirstAction: async ({ actionId }) => {
      if (actionId === 'waving') throw new Error('waving provider failed')
      return { ok: true, actionId, selectedCandidateId: `${actionId}-candidate` }
    },
    createCharacterScaleProfile: async () => ({ hash: 'p'.repeat(64) }),
    finalizePackage: async () => ({ artifacts: { outputDir: '/data/package' } }),
    recordEvent: (event) => events.push(event)
  })
  const pending = await orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' }, requireIdentityReviewBeforeActions: true })

  await assert.rejects(() => orchestrator.acceptCanonicalIdentity({
    run: pending,
    candidateId: 'canonical-1',
    sha256: 'a'.repeat(64),
    plan: { hash: 'plan-hash' },
    actions: ['idle', 'running-right', 'waving'],
    persistRunState: async (value) => snapshots.push(structuredClone(value))
  }), /waving provider failed/)

  assert.equal(snapshots[0].qualityFirst.acceptedCanonical.candidateId, 'canonical-1')
  assert.equal(snapshots.some((entry) => entry.qualityFirst.scaleProfileHash === 'p'.repeat(64)), true)
  const latest = snapshots.at(-1)
  assert.equal(latest.qualityFirst.phase, 'generating-actions')
  assert.equal(latest.qualityFirst.actionResults.idle.ok, true)
  assert.equal(latest.qualityFirst.actionResults['running-right'].ok, true)
  assert.equal(latest.qualityFirst.nextAction, 'waving')
  assert.deepEqual(events.at(-1), {
    scope: 'action',
    status: 'failed',
    runId: 'run-1',
    actionId: 'waving',
    failureCode: 'action_generation_error',
    message: 'waving provider failed'
  })
})
