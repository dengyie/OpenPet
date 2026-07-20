const test = require('node:test')
const assert = require('node:assert/strict')

const { createQualityFirstFullPetOrchestrator } = require('../../examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator')

const createHarness = ({ idleOk = true, finalizePackage = async () => ({ spritesheetRelativePath: 'runs/run-1/quality-first/package/spritesheet.webp', artifacts: { outputDir: '/data/runs/run-1/quality-first/package' } }) } = {}) => {
  const calls = { canonical: 0, actions: [], mirrors: 0, recovery: 0 }
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
    runQualityFirstAction: async ({ actionId }) => {
      calls.actions.push(actionId)
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
    now: () => '2026-07-20T12:00:00.000Z'
  })
  return { orchestrator, calls }
}

test('start generates canonical candidates and blocks all action generation until identity acceptance', async () => {
  const h = createHarness()
  const run = await h.orchestrator.start({ run: { runId: 'run-1', status: 'generating' }, plan: { hash: 'plan-hash' }, sourceReference: { relativePath: 'inputs/ref.png' } })
  assert.equal(run.status, 'awaiting_identity_review')
  assert.equal(run.qualityFirst.phase, 'awaiting_identity_review')
  assert.equal(h.calls.canonical, 1)
  assert.deepEqual(h.calls.actions, [])
})

test('canonical acceptance runs idle first, locks scale profile, continues optional actions, and mirrors running-left', async () => {
  const h = createHarness()
  const pending = await h.orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' } })
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
  const pending = await h.orchestrator.start({ run: { runId: 'run-1', artifacts: { retained: true } }, plan: { hash: 'plan-hash' } })
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
  const pending = await h.orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' } })
  const run = await h.orchestrator.acceptCanonicalIdentity({ run: pending, candidateId: 'canonical-1', sha256: 'a'.repeat(64), actions: ['idle', 'waving'] })
  assert.equal(run.status, 'recovery-required')
  assert.equal(run.qualityFirst.nextAction, 'export-recovery-bundle')
  assert.deepEqual(h.calls.actions, ['idle'])
  assert.equal(h.calls.recovery, 1)
})

test('identity acceptance requires an eligible candidate and exact hash', async () => {
  const h = createHarness()
  const pending = await h.orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' } })
  await assert.rejects(() => h.orchestrator.acceptCanonicalIdentity({ run: pending, candidateId: 'canonical-2', sha256: 'wrong' }), /not eligible or hash/i)
})

test('canonical pool rejects fewer than three distinct eligible candidates', async () => {
  const orchestrator = createQualityFirstFullPetOrchestrator({
    generateCanonicalCandidatePool: async () => ({ dispatchCount: 4, candidates: [{ candidateId: 'one', eligible: true, sha256: 'same' }] }),
    runQualityFirstAction: async () => ({ ok: true }),
    createCharacterScaleProfile: async () => ({ hash: 'hash' })
  })
  await assert.rejects(() => orchestrator.start({ run: { runId: 'run-1' }, plan: {} }), /canonical_candidate_diversity_insufficient/)
})

test('canonical acceptance fails closed when final package artifacts are missing', async () => {
  const h = createHarness({ finalizePackage: async () => null })
  const pending = await h.orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' } })
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
    finalizePackage: async () => ({ artifacts: { outputDir: '/data/package' } })
  })
  const pending = await orchestrator.start({ run: { runId: 'run-1' }, plan: { hash: 'plan-hash' } })

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
})
