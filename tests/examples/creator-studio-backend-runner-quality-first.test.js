const fs = require('node:fs')
const crypto = require('node:crypto')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  acceptQualityFirstActionCandidate,
  acceptQualityFirstCanonicalIdentity,
  runQualityFirstActionRepair,
  runQualityFirstIdentityRetry,
  runQualityFirstIdentityStage,
  runGenerationStep
} = require('../../examples/plugins/creator-studio/lib/backend-runner')
const backendRunnerModule = require('../../examples/plugins/creator-studio/lib/backend-runner')
const { createQualityFirstFullPetOrchestrator } = require('../../examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator')
const { createRun, readRun, readRunLogs, writeRun } = require('../../examples/plugins/creator-studio/lib/run-store')
const { writeCandidateRecord } = require('../../examples/plugins/creator-studio/lib/sprite-candidate-store')
const { getQualityFirstQualityProfile } = require('../../examples/plugins/creator-studio/lib/pet-generation-quality-profile')

const createDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-backend-'))
const LEGACY_PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xn9pAAAAAElFTkSuQmCC', 'base64')
const LEGACY_GIF_BYTES = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
const writePngFixture = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, LEGACY_PNG_BYTES)
  return crypto.createHash('sha256').update(LEGACY_PNG_BYTES).digest('hex')
}
const createHashBoundValue = (base) => ({
  ...base,
  hash: crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex')
})
const createCandidateBindings = ({ planHash, canonicalHash, profileHash = '' }) => ({
  planHash,
  canonicalHash,
  profileHash,
  processorVersion: 1,
  qualityProfileHash: getQualityFirstQualityProfile().hash
})

const writeLegacyActionCandidateRecord = ({ dataDir, runId, actionId, candidateId, complete = true, eligible = true, bindings }) => {
  const roles = complete ? ['raw-sheet', 'processed-sheet', 'contact-sheet', 'gif'] : ['raw-sheet']
  const artifacts = roles.map((role) => {
    const extension = role === 'gif' ? 'gif' : 'png'
    const relativePath = `runs/${runId}/candidates/${actionId}/${candidateId}/legacy/${role}.${extension}`
    const absolutePath = path.join(dataDir, relativePath)
    const bytes = role === 'gif' ? LEGACY_GIF_BYTES : LEGACY_PNG_BYTES
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, bytes)
    return {
      role,
      relativePath,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    }
  })
  const rawHash = artifacts.find((artifact) => artifact.role === 'raw-sheet').sha256
  const recordRelativePath = `runs/${runId}/candidates/action-${actionId}/${candidateId}/candidate.json`
  const recordPath = path.join(dataDir, recordRelativePath)
  fs.mkdirSync(path.dirname(recordPath), { recursive: true })
  fs.writeFileSync(recordPath, `${JSON.stringify({
    version: 1,
    runId,
    scope: `action-${actionId}`,
    candidate: {
      candidateId,
      sha256: rawHash,
      eligible,
      ...(bindings ? { bindings } : {}),
      artifacts,
      qa: { ok: true, failures: [] },
      gate: { ok: false, outcome: 'reject', failures: ['visual-score-overall-below-minimum'] }
    }
  }, null, 2)}\n`)
  return { rawHash, recordRelativePath }
}

test('backend persists awaiting identity review and resumes only after exact acceptance', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Quality Pet', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle', name: 'Idle', motionPrompt: 'idle', frameCount: 6, transparentBackground: true }], questions: [] } },
    now: () => '2026-07-20T10:00:00.000Z'
  })
  writeRun({ dataDir, run: { ...created, status: 'confirmed', taskStatus: 'confirmed' } })
  const candidateRelativePath = `runs/${created.runId}/candidates/canonical/c1/raw/0001.png`
  const candidatePath = path.join(dataDir, candidateRelativePath)
  const candidateHash = writePngFixture(candidatePath)
  const calls = []
  const orchestrator = {
    start: async ({ run }) => ({ ...run, status: 'awaiting_identity_review', currentStep: 'identity-review', qualityFirst: { phase: 'awaiting_identity_review', canonicalCandidates: [{ candidateId: 'c1', eligible: true, technicalEligible: true, recommended: true, sha256: candidateHash, relativePath: candidateRelativePath }] } }),
    acceptCanonicalIdentity: async ({ run, candidateId, sha256 }) => {
      calls.push({ candidateId, sha256 })
      return { ...run, status: 'ready_for_review', currentStep: 'review', qualityFirst: { ...run.qualityFirst, phase: 'ready_for_review' } }
    }
  }
  const pending = await runQualityFirstIdentityStage({ dataDir, runId: created.runId, orchestrator, plan: { hash: 'plan' }, requireIdentityReviewBeforeActions: true })
  assert.equal(pending.run.status, 'awaiting_identity_review')
  assert.equal(readRun({ dataDir, runId: created.runId }).qualityFirst.phase, 'awaiting_identity_review')
  const accepted = await acceptQualityFirstCanonicalIdentity({ dataDir, runId: created.runId, candidateId: 'c1', expectedHash: candidateHash, orchestrator, plan: { hash: 'plan' }, actions: ['idle'] })
  assert.equal(accepted.run.status, 'ready_for_review')
  assert.deepEqual(calls, [{ candidateId: 'c1', sha256: candidateHash }])
  assert.deepEqual(readRunLogs({ dataDir, runId: created.runId }).map((entry) => entry.event), [
    'quality-first.identity.started',
    'quality-first.identity.completed',
    'quality-first.identity.awaiting-review',
    'quality-first.identity.accepted'
  ])
})

test('backend forwards a hash-bound quality override for a technical non-recommended canonical', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Preferred Pet', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle' }], questions: [] } }
  })
  const warnings = ['visual-defect-identity-drift', 'visual-score-overall-below-minimum']
  const relativePath = `runs/${created.runId}/candidates/canonical/canonical-4/raw/0001.png`
  const absolutePath = path.join(dataDir, relativePath)
  const candidateHash = writePngFixture(absolutePath)
  writeRun({ dataDir, run: {
    ...created,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    qualityFirst: {
      phase: 'awaiting_identity_review',
      canonicalCandidates: [{
        candidateId: 'canonical-4',
        sha256: candidateHash,
        relativePath,
        technicalEligible: true,
        recommended: false,
        eligible: false,
        qualityWarningCodes: warnings
      }]
    }
  } })
  const calls = []
  const orchestrator = {
    acceptCanonicalIdentity: async (payload) => {
      calls.push({
        candidateId: payload.candidateId,
        sha256: payload.sha256,
        qualityOverride: payload.qualityOverride,
        acknowledgedWarningCodes: payload.acknowledgedWarningCodes
      })
      return {
        ...payload.run,
        status: 'ready_for_review',
        currentStep: 'review',
        qualityFirst: { ...payload.run.qualityFirst, phase: 'ready_for_review' }
      }
    }
  }

  const accepted = await acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId: created.runId,
    candidateId: 'canonical-4',
    expectedHash: candidateHash,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings.slice().reverse(),
    orchestrator,
    plan: { hash: 'plan-hash' },
    actions: ['idle']
  })

  assert.equal(accepted.run.status, 'ready_for_review')
  assert.deepEqual(calls, [{
    candidateId: 'canonical-4',
    sha256: candidateHash,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings.slice().reverse()
  }])
})

test('backend rejects a canonical file changed after review before changing run state', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Hash Bound Pet', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle' }], questions: [] } }
  })
  const relativePath = `runs/${created.runId}/candidates/canonical/canonical-4/raw/0001.png`
  const absolutePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, 'original-canonical')
  const originalHash = crypto.createHash('sha256').update('original-canonical').digest('hex')
  const warnings = ['visual-score-overall-below-minimum']
  writeRun({ dataDir, run: {
    ...created,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    qualityFirst: {
      phase: 'awaiting_identity_review',
      canonicalCandidates: [{
        candidateId: 'canonical-4',
        sha256: originalHash,
        relativePath,
        technicalEligible: true,
        recommended: false,
        eligible: false,
        qualityWarningCodes: warnings
      }]
    }
  } })
  fs.writeFileSync(absolutePath, 'changed-after-review')

  await assert.rejects(() => acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId: created.runId,
    candidateId: 'canonical-4',
    expectedHash: originalHash,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings,
    orchestrator: { acceptCanonicalIdentity: async () => { throw new Error('must not run') } },
    plan: { hash: 'plan-hash' },
    actions: ['idle']
  }), (error) => error?.code === 'candidate_hash_mismatch')

  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'awaiting_identity_review')
})

test('backend rejects missing canonical warning acknowledgement before changing run state', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Protected Review Pet', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle' }], questions: [] } }
  })
  writeRun({ dataDir, run: {
    ...created,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    qualityFirst: {
      phase: 'awaiting_identity_review',
      canonicalCandidates: [{
        candidateId: 'canonical-4',
        sha256: 'f'.repeat(64),
        technicalEligible: true,
        recommended: false,
        eligible: false,
        qualityWarningCodes: ['visual-score-overall-below-minimum']
      }]
    }
  } })

  await assert.rejects(() => acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId: created.runId,
    candidateId: 'canonical-4',
    expectedHash: 'f'.repeat(64),
    qualityOverride: false,
    acknowledgedWarningCodes: [],
    orchestrator: { acceptCanonicalIdentity: async () => { throw new Error('must not run') } },
    plan: { hash: 'plan-hash' },
    actions: ['idle']
  }), (error) => error?.code === 'quality_override_acknowledgement_required')

  const unchanged = readRun({ dataDir, runId: created.runId })
  assert.equal(unchanged.status, 'awaiting_identity_review')
  assert.equal(unchanged.currentStep, 'identity-review')
  assert.equal(Object.hasOwn(unchanged, 'generationLease'), false)
})

test('backend reconstructs technical eligibility for a legacy warned canonical from its current retained file', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Legacy Canonical Pet', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle' }], questions: [] } }
  })
  const relativePath = `runs/${created.runId}/candidates/canonical/canonical-legacy/raw/0001.png`
  const absolutePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  await require('sharp')({ create: { width: 16, height: 16, channels: 4, background: '#8844cc' } }).png().toFile(absolutePath)
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex')
  const warnings = ['visual-score-overall-below-minimum']
  writeRun({ dataDir, run: {
    ...created,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    qualityFirst: {
      phase: 'awaiting_identity_review',
      canonicalCandidates: [{
        candidateId: 'canonical-legacy',
        sha256,
        relativePath,
        eligible: false,
        gate: { ok: false, outcome: 'reject', failures: warnings }
      }]
    }
  } })
  let called = false
  const output = await acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId: created.runId,
    candidateId: 'canonical-legacy',
    expectedHash: sha256,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings,
    orchestrator: {
      acceptCanonicalIdentity: async ({ run }) => {
        called = true
        return { ...run, status: 'ready_for_review', currentStep: 'review', qualityFirst: { ...run.qualityFirst, phase: 'ready_for_review' } }
      }
    },
    plan: { hash: 'plan-hash' },
    actions: ['idle']
  })

  assert.equal(called, true)
  assert.equal(output.run.status, 'ready_for_review')
})

test('backend does not reconstruct legacy canonical eligibility from hash-matched non-image bytes', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Broken Legacy Canonical', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle' }], questions: [] } }
  })
  const relativePath = `runs/${created.runId}/candidates/canonical/canonical-broken/raw/0001.png`
  const absolutePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, 'not-an-image')
  const sha256 = crypto.createHash('sha256').update('not-an-image').digest('hex')
  writeRun({ dataDir, run: {
    ...created,
    status: 'awaiting_identity_review',
    qualityFirst: {
      phase: 'awaiting_identity_review',
      canonicalCandidates: [{ candidateId: 'canonical-broken', sha256, relativePath, eligible: false, gate: { ok: false, failures: ['visual-score-overall-below-minimum'] } }]
    }
  } })

  await assert.rejects(() => acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId: created.runId,
    candidateId: 'canonical-broken',
    expectedHash: sha256,
    qualityOverride: true,
    acknowledgedWarningCodes: ['visual-score-overall-below-minimum'],
    orchestrator: { acceptCanonicalIdentity: async () => { throw new Error('must not continue') } }
  }), (error) => error?.code === 'candidate_decode_failed')
  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'awaiting_identity_review')
})

test('backend rejects a stored technical canonical when its current asset cannot be decoded', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Broken Stored Canonical', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle' }], questions: [] } }
  })
  const relativePath = `runs/${created.runId}/candidates/canonical/canonical-broken/raw/0001.png`
  const absolutePath = path.join(dataDir, relativePath)
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('truncated')])
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, bytes)
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  writeRun({ dataDir, run: {
    ...created,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    qualityFirst: {
      phase: 'awaiting_identity_review',
      canonicalCandidates: [{ candidateId: 'canonical-broken', sha256, relativePath, technicalEligible: true, recommended: true }]
    }
  } })

  await assert.rejects(() => acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId: created.runId,
    candidateId: 'canonical-broken',
    expectedHash: sha256,
    orchestrator: { acceptCanonicalIdentity: async () => { throw new Error('must not continue') } }
  }), (error) => error?.code === 'candidate_decode_failed')
  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'awaiting_identity_review')
})

test('backend rejects a changed sprite plan before accepting canonical identity', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Canonical Plan Binding Pet', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle' }], questions: [] } }
  })
  const relativePath = `runs/${created.runId}/candidates/canonical/canonical-1/raw/0001.png`
  const absolutePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, LEGACY_PNG_BYTES)
  const sha256 = crypto.createHash('sha256').update(LEGACY_PNG_BYTES).digest('hex')
  const currentPlan = createHashBoundValue({ version: 1, actions: ['idle'] })
  const stalePlan = createHashBoundValue({ version: 1, actions: ['jumping'] })
  writeRun({ dataDir, run: {
    ...created,
    status: 'awaiting_identity_review',
    currentStep: 'identity-review',
    qualityFirst: {
      phase: 'awaiting_identity_review',
      planHash: currentPlan.hash,
      canonicalCandidates: [{ candidateId: 'canonical-1', sha256, relativePath, technicalEligible: true, recommended: true }]
    }
  } })

  await assert.rejects(() => acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId: created.runId,
    candidateId: 'canonical-1',
    expectedHash: sha256,
    orchestrator: { acceptCanonicalIdentity: async () => { throw new Error('must not continue') } },
    plan: stalePlan
  }), (error) => error?.code === 'candidate_binding_stale')
  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'awaiting_identity_review')
})

test('backend defaults to the selected canonical and completes actions without a mid-run identity pause', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Automatic Identity Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6 }], questions: [] } }
  })
  writeRun({ dataDir, run: { ...created, status: 'confirmed', taskStatus: 'confirmed' } })
  const calls = []
  const orchestrator = {
    start: async ({ run, actions, requireIdentityReviewBeforeActions, persistRunState }) => {
      calls.push({ actions, requireIdentityReviewBeforeActions })
      const generating = {
        ...run,
        status: 'generating',
        currentStep: 'idle',
        qualityFirst: {
          phase: 'generating-idle',
          requireIdentityReviewBeforeActions: false,
          acceptedCanonical: { candidateId: 'canonical-1', sha256: 'a'.repeat(64) },
          canonicalCandidates: [{ candidateId: 'canonical-1', eligible: true, disposition: 'selected-anchor', sha256: 'a'.repeat(64) }]
        }
      }
      await persistRunState(generating)
      return {
        ...generating,
        status: 'ready_for_review',
        currentStep: 'review',
        qualityFirst: { ...generating.qualityFirst, phase: 'ready_for_review', nextAction: 'human-review' }
      }
    }
  }

  const output = await runQualityFirstIdentityStage({
    dataDir,
    runId: created.runId,
    orchestrator,
    plan: { hash: 'plan', actions: [{ actionId: 'idle' }] },
    actions: ['idle'],
    requireIdentityReviewBeforeActions: false
  })

  assert.equal(output.run.status, 'ready_for_review')
  assert.equal(output.run.backendStatus.state, 'ready')
  assert.deepEqual(calls, [{ actions: ['idle'], requireIdentityReviewBeforeActions: false }])
  assert.equal(readRun({ dataDir, runId: created.runId }).qualityFirst.acceptedCanonical.candidateId, 'canonical-1')
  assert.deepEqual(readRunLogs({ dataDir, runId: created.runId }).map((entry) => entry.event), [
    'quality-first.identity.started',
    'quality-first.identity.completed',
    'quality-first.identity.selected'
  ])
})

test('backend classifies an automatic post-selection failure as an action failure and preserves the selected anchor', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Automatic Failure Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6 }], questions: [] } }
  })
  writeRun({ dataDir, run: { ...created, status: 'confirmed', taskStatus: 'confirmed' } })
  const canonical = { candidateId: 'canonical-1', eligible: true, disposition: 'selected-anchor', sha256: 'a'.repeat(64) }
  const error = new Error('waving provider failed')
  error.code = 'action_generation_error'
  const orchestrator = {
    start: async ({ run, persistRunState }) => {
      await persistRunState({
        ...run,
        status: 'generating',
        currentStep: 'waving',
        qualityFirst: {
          phase: 'generating-actions',
          canonicalCandidates: [canonical],
          acceptedCanonical: canonical,
          actionResults: { idle: { ok: true } },
          nextAction: 'waving'
        }
      })
      throw error
    }
  }

  await assert.rejects(() => runQualityFirstIdentityStage({
    dataDir,
    runId: created.runId,
    orchestrator,
    plan: { hash: 'plan', actions: [{ actionId: 'idle' }] },
    requireIdentityReviewBeforeActions: false
  }), /waving provider failed/)

  const failed = readRun({ dataDir, runId: created.runId })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.qualityFirst.phase, 'generating-actions')
  assert.equal(failed.qualityFirst.acceptedCanonical.candidateId, 'canonical-1')
  assert.equal(readRunLogs({ dataDir, runId: created.runId }).at(-1).event, 'quality-first.actions.failed')
})

test('backend records identity failure with a bounded reason code', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Failed Identity Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6 }], questions: [] } }
  })
  writeRun({ dataDir, run: { ...created, status: 'confirmed', taskStatus: 'confirmed' } })
  const error = new Error('private provider detail /Users/mango/source.png')
  error.code = 'canonical_pool_failed'

  await assert.rejects(() => runQualityFirstIdentityStage({
    dataDir,
    runId: created.runId,
    orchestrator: { start: async () => { throw error } },
    plan: { hash: 'plan' }
  }), /private provider detail/)

  const events = readRunLogs({ dataDir, runId: created.runId })
  assert.deepEqual(events.map((entry) => entry.event), [
    'quality-first.identity.started',
    'quality-first.identity.failed'
  ])
  assert.deepEqual(events[1].data, { failureCode: 'canonical_pool_failed' })
  assert.doesNotMatch(JSON.stringify(events[1]), /\/Users\/|private provider detail/)
})

test('identity stage preserves an unusable canonical pool for review and retry', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Retained Identity Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6 }], questions: [] } }
  })
  writeRun({ dataDir, run: { ...created, status: 'confirmed', taskStatus: 'confirmed' } })
  const error = new Error('canonical_identity_candidates_unusable')
  error.code = 'canonical_identity_candidates_unusable'
  error.canonicalPool = {
    dispatchCount: 4,
    passingCandidateCount: 0,
    candidates: [{
      candidateId: 'canonical-1',
      eligible: false,
      sha256: 'a'.repeat(64),
      relativePath: `runs/${created.runId}/candidates/canonical/canonical-1/raw/0001.png`,
      attemptKind: 'initial',
      diversityProfileId: 'identity-faithful-balanced-v1',
      disposition: 'unusable',
      failureCodes: ['identity-gate-failed']
    }, {
      candidateId: 'canonical-2',
      eligible: false,
      sha256: 'b'.repeat(64),
      attemptKind: 'duplicate-replacement',
      diversityProfileId: 'identity-safe-alternate-neutral-v1',
      duplicateOfCandidateId: 'canonical-1',
      disposition: 'unusable',
      failureCodes: ['incomplete-subject']
    }]
  }

  await assert.rejects(() => runQualityFirstIdentityStage({
    dataDir,
    runId: created.runId,
    orchestrator: { start: async () => { throw error } },
    plan: { hash: 'plan-hash' }
  }), /canonical_identity_candidates_unusable/)

  const failed = readRun({ dataDir, runId: created.runId })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.currentStep, 'canonical-candidates')
  assert.equal(Object.hasOwn(failed, 'generationLease'), false)
  assert.equal(failed.qualityFirst.phase, 'identity-generation-failed')
  assert.equal(failed.qualityFirst.planHash, 'plan-hash')
  assert.equal(failed.qualityFirst.failureCode, 'canonical_identity_candidates_unusable')
  assert.equal(failed.qualityFirst.nextAction, 'retry-identity')
  assert.equal(failed.qualityFirst.passingCandidateCount, 0)
  assert.equal(failed.qualityFirst.canonicalCandidates.length, 2)
  assert.equal(failed.qualityFirst.canonicalCandidates[1].duplicateOfCandidateId, 'canonical-1')
})

test('backend preserves the latest accepted identity state when action generation fails', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Durable Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', motionPrompt: 'idle', frameCount: 6, transparentBackground: true }], questions: [] } }
  })
  const canonicalRelativePath = `runs/${created.runId}/candidates/canonical/canonical-1/raw/0001.png`
  const canonicalPath = path.join(dataDir, canonicalRelativePath)
  const canonicalHash = writePngFixture(canonicalPath)
  const canonical = {
    candidateId: 'canonical-1',
    eligible: true,
    technicalEligible: true,
    recommended: true,
    sha256: canonicalHash,
    relativePath: canonicalRelativePath
  }
  writeRun({ dataDir, run: {
    ...created,
    status: 'awaiting_identity_review',
    taskStatus: 'confirmed',
    qualityFirst: { phase: 'awaiting_identity_review', canonicalCandidates: [canonical], acceptedCanonical: null, actionResults: {} }
  } })
  const orchestrator = {
    acceptCanonicalIdentity: async ({ run, persistRunState }) => {
      await persistRunState({
        ...run,
        status: 'generating',
        currentStep: 'waving',
        qualityFirst: {
          ...run.qualityFirst,
          phase: 'generating-actions',
          acceptedCanonical: canonical,
          scaleProfileHash: 'p'.repeat(64),
          actionResults: { idle: { ok: true, actionId: 'idle' } },
          nextAction: 'waving'
        }
      })
      throw new Error('waving provider failed')
    }
  }

  await assert.rejects(() => acceptQualityFirstCanonicalIdentity({
    dataDir,
    runId: created.runId,
    candidateId: canonical.candidateId,
    expectedHash: canonical.sha256,
    orchestrator,
    plan: { hash: 'plan' },
    actions: ['idle', 'waving']
  }), /waving provider failed/)

  const failed = readRun({ dataDir, runId: created.runId })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.qualityFirst.phase, 'generating-actions')
  assert.equal(failed.qualityFirst.acceptedCanonical.candidateId, canonical.candidateId)
  assert.equal(failed.qualityFirst.scaleProfileHash, 'p'.repeat(64))
  assert.equal(failed.qualityFirst.actionResults.idle.ok, true)
  const failureEvent = readRunLogs({ dataDir, runId: created.runId }).at(-1)
  assert.equal(failureEvent.event, 'quality-first.actions.failed')
  assert.equal(failureEvent.data.failureCode, 'action_generation_error')
  assert.doesNotMatch(JSON.stringify(failureEvent), /\/Users\/|provider prompt|api[_-]?key/i)
})

test('quality-first action repair reruns only the requested action and preserves accepted identity', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Quality Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', motionPrompt: 'idle', frameCount: 6, transparentBackground: true }], questions: [] } }
  })
  const canonical = { candidateId: 'canonical-1', eligible: true, sha256: 'a'.repeat(64), relativePath: `runs/${created.runId}/canonical.png` }
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    taskStatus: 'confirmed',
    generationTask: { ...created.generationTask, pipeline: 'quality-first-v1' },
    qualityFirst: {
      phase: 'ready_for_review',
      acceptedCanonical: canonical,
      actionResults: { idle: { ok: true }, waving: { ok: false, failureCode: 'old-failure' } }
    }
  } })
  const profile = createHashBoundValue({ version: 1 })
  fs.writeFileSync(path.join(dataDir, 'runs', created.runId, 'character-scale-profile.json'), `${JSON.stringify(profile)}\n`)
  const paidCandidatePath = path.join(dataDir, 'runs', created.runId, 'candidates', 'waving', 'candidate-old', 'raw', 'sheet.png')
  const paidPromptPath = path.join(dataDir, 'runs', created.runId, 'prompts', 'quality-first', 'waving-candidate-old.txt')
  fs.mkdirSync(path.dirname(paidCandidatePath), { recursive: true })
  fs.mkdirSync(path.dirname(paidPromptPath), { recursive: true })
  fs.writeFileSync(paidCandidatePath, 'paid-provider-output')
  fs.writeFileSync(paidPromptPath, 'provider-neutral prompt')
  const calls = []
  const runtime = {
    runAction: async ({ actionId, canonical: actualCanonical, profile: actualProfile }) => {
      calls.push({ actionId, canonical: actualCanonical.candidateId, profile: actualProfile.hash })
      return { ok: true, actionId, selectedCandidateId: 'waving-new', candidates: [] }
    },
    persistActionResult: async () => {},
    finalizePackage: async () => ({
      spritesheetRelativePath: `runs/${created.runId}/quality-first/package/spritesheet.webp`,
      artifacts: {
        outputDir: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package'),
        petJson: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package', 'pet.json'),
        spritesheet: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package', 'spritesheet.webp')
      }
    })
  }
  const result = await runQualityFirstActionRepair({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    runtime,
    plan: { hash: 'plan' },
    profile
  })
  assert.deepEqual(calls, [{ actionId: 'waving', canonical: 'canonical-1', profile: profile.hash }])
  assert.equal(result.run.status, 'ready_for_review')
  assert.equal(result.run.qualityFirst.actionResults.waving.ok, true)
  assert.equal(result.run.qualityFirst.actionResults.idle.ok, true)
  assert.equal(result.run.qualityFirst.package.spritesheetRelativePath.endsWith('spritesheet.webp'), true)
  assert.equal(result.run.artifacts.spritesheet.endsWith('spritesheet.webp'), true)
  assert.equal(Object.hasOwn(result.run.qualityFirst.package, 'artifacts'), false)
  assert.equal(fs.existsSync(path.join(dataDir, result.repair.evidenceArchive, 'candidates', 'waving', 'candidate-old', 'raw', 'sheet.png')), true)
  assert.equal(fs.existsSync(path.join(dataDir, result.repair.evidenceArchive, 'prompts', 'quality-first', 'waving-candidate-old.txt')), true)
  assert.deepEqual(readRunLogs({ dataDir, runId: created.runId }).map((entry) => entry.event), [
    'quality-first.action.repair-started',
    'quality-first.action.repaired'
  ])
})

test('manual action selection reuses an exact retained candidate without Provider generation', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Chosen Action Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'waving', 'candidate-2', 'raw', 'sheet.png')
  const candidateHash = writePngFixture(rawPath)
  const warnings = ['visual-defect-motion-unreadable']
  const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64) }
  const profile = createHashBoundValue({ version: 1 })
  const plan = createHashBoundValue({ version: 1, actions: [{ actionId: 'idle' }, { actionId: 'waving' }] })
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-waving',
    candidate: {
      candidateId: 'candidate-2',
      sha256: candidateHash,
      technicalEligible: true,
      recommended: false,
      technicalFailureCodes: [],
      qualityWarningCodes: warnings,
      bindings: createCandidateBindings({ planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: profile.hash }),
      artifacts: [{ role: 'raw-sheet', path: rawPath, sha256: candidateHash }],
      qa: { ok: true, failures: [] },
      gate: { ok: false, outcome: 'reject', failures: warnings }
    }
  })
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    currentStep: 'review',
    qualityFirst: {
      phase: 'ready_for_review',
      planHash: plan.hash,
      acceptedCanonical: canonical,
      scaleProfileHash: profile.hash,
      actionResults: {
        idle: { ok: true, actionId: 'idle', selectedCandidateId: 'idle-candidate' },
        waving: {
          ok: false,
          actionId: 'waving',
          failureCode: 'action_quality_gate_failed',
          candidates: [{
            candidateId: 'candidate-1',
            sha256: 'b'.repeat(64),
            technicalEligible: false,
            recommended: false,
            technicalFailureCodes: ['candidate-processing-failed']
          }, {
            candidateId: 'candidate-2',
            sha256: candidateHash,
            technicalEligible: true,
            recommended: false,
            qualityWarningCodes: warnings,
            candidateRecordRelativePath: record.relativePath
          }]
        }
      }
    }
  } })
  const calls = []
  const runtime = {
    runAction: async () => { throw new Error('manual selection must not call Provider generation') },
    materializeActionCandidate: async ({ actionId, candidate }) => {
      calls.push(['materialize', actionId, candidate.candidateId, candidate.selection.selectionAuthority])
      return {
        ok: true,
        actionId,
        disposition: 'accepted-by-human',
        selectedCandidateId: candidate.candidateId,
        selectedCandidate: candidate,
        candidates: [candidate]
      }
    },
    persistActionResult: async ({ actionId, result }) => calls.push(['persist', actionId, result.selectedCandidateId]),
    finalizePackage: async () => ({
      spritesheetRelativePath: `runs/${created.runId}/quality-first/package/spritesheet.webp`,
      artifacts: { outputDir: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package') }
    })
  }

  const output = await acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-2',
    expectedHash: candidateHash,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings,
    runtime,
    plan,
    profile,
    now: () => '2026-07-28T01:00:00.000Z'
  })

  assert.deepEqual(calls, [
    ['materialize', 'waving', 'candidate-2', 'human-override'],
    ['persist', 'waving', 'candidate-2']
  ])
  assert.equal(output.run.status, 'ready_for_review')
  assert.equal(output.run.qualityFirst.actionResults.waving.ok, true)
  assert.equal(output.run.qualityFirst.actionResults.waving.selectedCandidateId, 'candidate-2')
  assert.equal(output.run.qualityFirst.actionResults.waving.selection.selectionAuthority, 'human-override')
  assert.equal(output.run.qualityFirst.actionResults.waving.selection.qualityOverride, true)
  assert.equal(output.run.qualityFirst.actionResults.idle.ok, true)
  assert.deepEqual(output.run.qualityFirst.actionResults.waving.candidates.map((candidate) => candidate.candidateId), ['candidate-1', 'candidate-2'])
  assert.equal(output.run.qualityFirst.actionResults.waving.candidates[0].technicalEligible, false)
})

test('a real orchestrator action result round-trips through run.json into manual acceptance', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Round Trip Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64), technicalEligible: true, recommended: true }
  const plan = createHashBoundValue({ version: 1, actions: [{ actionId: 'idle' }, { actionId: 'waving' }] })
  const profile = createHashBoundValue({ version: 1, maxBodyScaleCv: 0.08 })
  const candidateId = 'waving-candidate-2'
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'waving', candidateId, 'raw', 'sheet.png')
  const candidateHash = writePngFixture(rawPath)
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-waving',
    candidate: {
      candidateId,
      sha256: candidateHash,
      technicalEligible: true,
      recommended: true,
      technicalFailureCodes: [],
      qualityWarningCodes: [],
      bindings: createCandidateBindings({ planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: profile.hash }),
      artifacts: [{ role: 'raw-sheet', path: rawPath, sha256: candidateHash }],
      qa: { ok: true, failures: [] },
      gate: { ok: true, outcome: 'pass', failures: [] }
    }
  })
  const generatedCandidate = {
    candidateId,
    sha256: candidateHash,
    technicalEligible: true,
    recommended: true,
    technicalFailureCodes: [],
    qualityWarningCodes: [],
    candidateRecordRelativePath: record.relativePath,
    qa: { ok: true, failures: [] },
    gate: { ok: true, outcome: 'pass', failures: [] }
  }
  const orchestrator = createQualityFirstFullPetOrchestrator({
    generateCanonicalCandidatePool: async () => ({ dispatchCount: 1, candidates: [canonical] }),
    runQualityFirstAction: async ({ actionId }) => actionId === 'idle'
      ? { ok: true, actionId, selectedCandidateId: 'idle-candidate', candidates: [] }
      : { ok: false, actionId, failureCode: 'action_candidate_diversity_insufficient', candidates: [generatedCandidate] },
    createCharacterScaleProfile: async () => profile,
    finalizePackage: async () => ({ artifacts: { outputDir: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package') } })
  })
  const generatedRun = await orchestrator.start({
    run: { ...created, status: 'generating' },
    plan,
    actions: ['idle', 'waving']
  })
  writeRun({ dataDir, run: generatedRun })
  const calls = []

  const output = await acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId,
    expectedHash: candidateHash,
    runtime: {
      materializeActionCandidate: async ({ candidate }) => {
        calls.push(['materialize', candidate.candidateId])
        return { ok: true, actionId: 'waving', selectedCandidateId: candidate.candidateId, selectedCandidate: candidate, candidates: [candidate] }
      },
      persistActionResult: async ({ actionId, result }) => calls.push(['persist', actionId, result.selectedCandidateId]),
      finalizePackage: async () => ({ artifacts: { outputDir: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package') } })
    },
    plan,
    profile
  })

  assert.deepEqual(calls, [['materialize', candidateId], ['persist', 'waving', candidateId]])
  assert.equal(output.run.qualityFirst.actionResults.waving.ok, true)
  assert.equal(output.run.qualityFirst.actionResults.waving.selectedCandidateId, candidateId)
})

test('manual action selection reconstructs a legacy candidate only from a complete verified artifact set', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Legacy Action Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const warnings = ['visual-score-overall-below-minimum']
  const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64) }
  const profile = createHashBoundValue({ version: 1 })
  const plan = createHashBoundValue({ version: 1, actions: [{ actionId: 'idle' }, { actionId: 'waving' }] })
  const legacy = writeLegacyActionCandidateRecord({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-legacy',
    bindings: createCandidateBindings({ planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: profile.hash })
  })
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    currentStep: 'review',
    qualityFirst: {
      phase: 'ready_for_review',
      planHash: plan.hash,
      acceptedCanonical: canonical,
      scaleProfileHash: profile.hash,
      actionResults: {
        idle: { ok: true, selectedCandidateId: 'idle-candidate' },
        waving: {
          ok: false,
          candidates: [{
            candidateId: 'candidate-legacy',
            sha256: legacy.rawHash,
            eligible: false,
            qualityWarningCodes: warnings,
            candidateRecordRelativePath: legacy.recordRelativePath
          }]
        }
      }
    }
  } })
  const calls = []
  const output = await acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-legacy',
    expectedHash: legacy.rawHash,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings,
    runtime: {
      materializeActionCandidate: async ({ candidate }) => {
        calls.push(candidate.candidateId)
        return { ok: true, actionId: 'waving', selectedCandidateId: candidate.candidateId, selectedCandidate: candidate, candidates: [candidate] }
      },
      persistActionResult: async () => {},
      finalizePackage: async () => ({ artifacts: { outputDir: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package') } })
    },
    plan,
    profile
  })

  assert.deepEqual(calls, ['candidate-legacy'])
  assert.equal(output.run.qualityFirst.actionResults.waving.selection.qualityOverride, true)
})

test('manual action selection never authorizes legacy eligible alone without processed artifacts', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Incomplete Legacy Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const legacy = writeLegacyActionCandidateRecord({ dataDir, runId: created.runId, actionId: 'waving', candidateId: 'candidate-incomplete', complete: false, eligible: true })
  const profile = createHashBoundValue({ version: 1 })
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    qualityFirst: {
      phase: 'ready_for_review',
      acceptedCanonical: { candidateId: 'canonical-1', sha256: 'a'.repeat(64) },
      scaleProfileHash: profile.hash,
      actionResults: {
        idle: { ok: true },
        waving: { ok: false, candidates: [{ candidateId: 'candidate-incomplete', sha256: legacy.rawHash, eligible: true, candidateRecordRelativePath: legacy.recordRelativePath }] }
      }
    }
  } })

  await assert.rejects(() => acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-incomplete',
    expectedHash: legacy.rawHash,
    runtime: { materializeActionCandidate: async () => { throw new Error('must not materialize') }, persistActionResult: async () => {}, finalizePackage: async () => ({}) },
    plan: { hash: 'plan-hash', actions: [{ actionId: 'idle' }, { actionId: 'waving' }] },
    profile
  }), (error) => error?.code === 'candidate_technically_unusable')

  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'ready_for_review')
})

test('manual action selection rejects a scale profile that does not match the run binding', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Stale Profile Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'waving', 'candidate-2', 'raw', 'sheet.png')
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  fs.writeFileSync(rawPath, 'stale-profile-candidate')
  const sha256 = crypto.createHash('sha256').update('stale-profile-candidate').digest('hex')
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-waving',
    candidate: { candidateId: 'candidate-2', sha256, technicalEligible: true, recommended: true, artifacts: [{ role: 'raw-sheet', path: rawPath, sha256 }] }
  })
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    qualityFirst: {
      phase: 'ready_for_review',
      acceptedCanonical: { candidateId: 'canonical-1', sha256: 'a'.repeat(64) },
      scaleProfileHash: 'p'.repeat(64),
      actionResults: { idle: { ok: true }, waving: { ok: false, candidates: [{ candidateId: 'candidate-2', sha256, technicalEligible: true, recommended: true, candidateRecordRelativePath: record.relativePath }] } }
    }
  } })

  await assert.rejects(() => acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-2',
    expectedHash: sha256,
    runtime: { materializeActionCandidate: async () => { throw new Error('must not materialize') }, persistActionResult: async () => {}, finalizePackage: async () => ({}) },
    profile: { version: 1, hash: 'q'.repeat(64) },
    plan: { hash: 'plan-hash', actions: [{ actionId: 'idle' }, { actionId: 'waving' }] }
  }), (error) => error?.code === 'candidate_binding_stale')
  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'ready_for_review')
})

test('manual action selection rejects a corrupt scale profile before changing run state', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Corrupt Profile Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'waving', 'candidate-2', 'raw', 'sheet.png')
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  fs.writeFileSync(rawPath, 'corrupt-profile-candidate')
  const sha256 = crypto.createHash('sha256').update('corrupt-profile-candidate').digest('hex')
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-waving',
    candidate: { candidateId: 'candidate-2', sha256, technicalEligible: true, recommended: true, artifacts: [{ role: 'raw-sheet', path: rawPath, sha256 }] }
  })
  const validProfile = createHashBoundValue({ version: 1, maxBodyScaleCv: 0.08 })
  const corruptProfile = { ...validProfile, maxBodyScaleCv: 999 }
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    qualityFirst: {
      phase: 'ready_for_review',
      acceptedCanonical: { candidateId: 'canonical-1', sha256: 'a'.repeat(64) },
      scaleProfileHash: validProfile.hash,
      actionResults: { idle: { ok: true }, waving: { ok: false, candidates: [{ candidateId: 'candidate-2', sha256, technicalEligible: true, recommended: true, candidateRecordRelativePath: record.relativePath }] } }
    }
  } })

  await assert.rejects(() => acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-2',
    expectedHash: sha256,
    runtime: { materializeActionCandidate: async () => { throw new Error('must not materialize') }, persistActionResult: async () => {}, finalizePackage: async () => ({}) },
    profile: corruptProfile,
    plan: { hash: 'plan-hash', actions: [{ actionId: 'idle' }, { actionId: 'waving' }] }
  }), (error) => error?.code === 'candidate_binding_stale')

  const unchanged = readRun({ dataDir, runId: created.runId })
  assert.equal(unchanged.status, 'ready_for_review')
  assert.equal(Object.hasOwn(unchanged, 'generationLease'), false)
  assert.equal(unchanged.qualityFirst.actionResults.waving.selectedCandidateId, undefined)
})

test('manual action selection rejects an undecodable retained image before changing run state', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Broken Action Image Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'waving', 'candidate-2', 'raw', 'sheet.png')
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('truncated')])
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  fs.writeFileSync(rawPath, bytes)
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64) }
  const profile = createHashBoundValue({ version: 1 })
  const plan = createHashBoundValue({ version: 1, actions: [{ actionId: 'idle' }, { actionId: 'waving' }] })
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-waving',
    candidate: {
      candidateId: 'candidate-2',
      sha256,
      technicalEligible: true,
      recommended: true,
      bindings: createCandidateBindings({ planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: profile.hash }),
      artifacts: [{ role: 'raw-sheet', path: rawPath, sha256 }]
    }
  })
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    qualityFirst: {
      phase: 'ready_for_review',
      planHash: plan.hash,
      acceptedCanonical: canonical,
      scaleProfileHash: profile.hash,
      actionResults: { idle: { ok: true }, waving: { ok: false, candidates: [{ candidateId: 'candidate-2', sha256, technicalEligible: true, recommended: true, candidateRecordRelativePath: record.relativePath }] } }
    }
  } })

  await assert.rejects(() => acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-2',
    expectedHash: sha256,
    runtime: { materializeActionCandidate: async () => { throw new Error('must not materialize') }, persistActionResult: async () => {}, finalizePackage: async () => ({}) },
    profile,
    plan
  }), (error) => error?.code === 'candidate_decode_failed')
  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'ready_for_review')
})

test('manual action selection rejects a sprite plan that does not match the run binding', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Stale Plan Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'waving', 'candidate-2', 'raw', 'sheet.png')
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  fs.writeFileSync(rawPath, 'stale-plan-candidate')
  const sha256 = crypto.createHash('sha256').update('stale-plan-candidate').digest('hex')
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-waving',
    candidate: { candidateId: 'candidate-2', sha256, technicalEligible: true, recommended: true, artifacts: [{ role: 'raw-sheet', path: rawPath, sha256 }] }
  })
  const profile = createHashBoundValue({ version: 1, maxBodyScaleCv: 0.08 })
  const currentPlan = createHashBoundValue({ version: 1, actions: ['idle', 'waving'] })
  const stalePlan = createHashBoundValue({ version: 1, actions: ['idle', 'jumping'] })
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    qualityFirst: {
      phase: 'ready_for_review',
      planHash: currentPlan.hash,
      acceptedCanonical: { candidateId: 'canonical-1', sha256: 'b'.repeat(64) },
      scaleProfileHash: profile.hash,
      actionResults: { idle: { ok: true }, waving: { ok: false, candidates: [{ candidateId: 'candidate-2', sha256, technicalEligible: true, recommended: true, candidateRecordRelativePath: record.relativePath }] } }
    }
  } })

  await assert.rejects(() => acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-2',
    expectedHash: sha256,
    runtime: { materializeActionCandidate: async () => { throw new Error('must not materialize') }, persistActionResult: async () => {}, finalizePackage: async () => ({}) },
    profile,
    plan: { ...stalePlan, actions: [{ actionId: 'idle' }, { actionId: 'waving' }] }
  }), (error) => error?.code === 'candidate_binding_stale')
  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'ready_for_review')
})

test('manual action selection preserves the exact human choice when checkpoint rebuild fails', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Durable Choice Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'waving', 'candidate-2', 'raw', 'sheet.png')
  const sha256 = writePngFixture(rawPath)
  const warnings = ['visual-score-overall-below-minimum']
  const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64) }
  const profile = createHashBoundValue({ version: 1 })
  const plan = createHashBoundValue({ version: 1, actions: [{ actionId: 'idle' }, { actionId: 'waving' }] })
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-waving',
    candidate: {
      candidateId: 'candidate-2',
      sha256,
      technicalEligible: true,
      recommended: false,
      qualityWarningCodes: warnings,
      bindings: createCandidateBindings({ planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: profile.hash }),
      artifacts: [{ role: 'raw-sheet', path: rawPath, sha256 }]
    }
  })
  const candidateView = { candidateId: 'candidate-2', sha256, technicalEligible: true, recommended: false, qualityWarningCodes: warnings, candidateRecordRelativePath: record.relativePath }
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    qualityFirst: {
      phase: 'ready_for_review',
      planHash: plan.hash,
      acceptedCanonical: canonical,
      scaleProfileHash: profile.hash,
      actionResults: { idle: { ok: true }, waving: { ok: false, candidates: [candidateView] } }
    }
  } })

  await assert.rejects(() => acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    candidateId: 'candidate-2',
    expectedHash: sha256,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings,
    runtime: {
      materializeActionCandidate: async () => { throw Object.assign(new Error('local rebuild failed'), { code: 'override_checkpoint_rebuild_failed' }) },
      persistActionResult: async () => {},
      finalizePackage: async () => ({})
    },
    plan,
    profile,
    now: () => '2026-07-28T04:00:00.000Z'
  }), /local rebuild failed/)

  const failed = readRun({ dataDir, runId: created.runId })
  assert.equal(failed.status, 'recovery-required')
  assert.equal(failed.qualityFirst.actionResults.waving.selectedCandidateId, 'candidate-2')
  assert.equal(failed.qualityFirst.actionResults.waving.selection.selectionAuthority, 'human-override')
  assert.equal(failed.qualityFirst.actionResults.waving.candidates[0].selection.sha256, sha256)
})

for (const scenario of [
  { actionId: 'idle', expectedActionIds: ['idle', 'running-left', 'running-right', 'waving'], expectedCheckpointActionIds: [] },
  { actionId: 'running-right', expectedActionIds: ['idle', 'running-right', 'waving'], expectedCheckpointActionIds: ['idle', 'waving'] }
]) {
  test(`failed ${scenario.actionId} selection removes run-state checkpoints bound to the replaced candidate`, async () => {
    const dataDir = createDataDir()
    const created = createRun({
      dataDir,
      input: { petName: 'Dependency Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'running-right' }, { actionId: 'waving' }], questions: [] } }
    })
    const candidateId = 'candidate-replacement'
    const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', scenario.actionId, candidateId, 'raw', 'sheet.png')
    const sha256 = writePngFixture(rawPath)
    const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64) }
    const profile = createHashBoundValue({ version: 1 })
    const plan = createHashBoundValue({ version: 1, actions: [{ actionId: 'idle' }, { actionId: 'running-right' }, { actionId: 'waving' }] })
    const record = writeCandidateRecord({
      dataDir,
      runId: created.runId,
      scope: `action-${scenario.actionId}`,
      candidate: {
        candidateId,
        sha256,
        technicalEligible: true,
        recommended: true,
        bindings: createCandidateBindings({ planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: scenario.actionId === 'idle' ? '' : profile.hash }),
        artifacts: [{ role: 'raw-sheet', path: rawPath, sha256 }]
      }
    })
    const candidateView = { candidateId, sha256, technicalEligible: true, recommended: true, candidateRecordRelativePath: record.relativePath }
    const oldSelection = { candidateId: 'old-candidate', sha256: 'd'.repeat(64), selectionAuthority: 'human-override', qualityOverride: false, acknowledgedWarningCodes: [] }
    writeRun({ dataDir, run: {
      ...created,
      status: 'ready_for_review',
      artifacts: { generatedImage: { evidence: 'keep' }, outputDir: '/old/package', bundle: '/old/package.zip', spritesheet: '/old/spritesheet.webp' },
      qualityFirst: {
        phase: 'ready_for_review',
        planHash: plan.hash,
        acceptedCanonical: canonical,
        scaleProfileHash: profile.hash,
        package: { bundleRelativePath: `runs/${created.runId}/quality-first/package/old.zip` },
        actionResults: {
          idle: scenario.actionId === 'idle' ? { ok: true, candidates: [candidateView] } : { ok: true },
          'running-right': scenario.actionId === 'running-right'
            ? { ok: true, candidates: [candidateView] }
            : { ok: true, selectedCandidateId: 'old-running', selection: oldSelection, candidates: [{ candidateId: 'old-running', selection: oldSelection, evidence: 'paid-running' }] },
          'running-left': { ok: true, mirroredFrom: 'running-right', evidence: 'derived-running' },
          waving: { ok: true, selectedCandidateId: 'old-waving', selection: oldSelection, candidates: [{ candidateId: 'old-waving', selection: oldSelection, evidence: 'paid-waving' }] }
        }
      }
    } })
    fs.writeFileSync(path.join(dataDir, 'runs', created.runId, 'full-pet-action-checkpoints.json'), `${JSON.stringify({
      version: 1,
      runId: created.runId,
      actions: {
        idle: { actionId: 'idle', ok: true },
        'running-right': { actionId: 'running-right', ok: true },
        'running-left': { actionId: 'running-left', ok: true },
        waving: { actionId: 'waving', ok: true }
      },
      invalidations: []
    }, null, 2)}\n`)

    await assert.rejects(() => acceptQualityFirstActionCandidate({
      dataDir,
      runId: created.runId,
      actionId: scenario.actionId,
      candidateId,
      expectedHash: sha256,
      runtime: {
        materializeActionCandidate: async () => { throw Object.assign(new Error('rebuild failed'), { code: 'override_checkpoint_rebuild_failed' }) },
        persistActionResult: async () => {},
        finalizePackage: async () => ({})
      },
      plan,
      profile: scenario.actionId === 'idle' ? null : profile
    }), /rebuild failed/)

    const failed = readRun({ dataDir, runId: created.runId })
    assert.deepEqual(Object.keys(failed.qualityFirst.actionResults).sort(), scenario.expectedActionIds.slice().sort())
    const checkpoints = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', created.runId, 'full-pet-action-checkpoints.json'), 'utf8'))
    assert.deepEqual(Object.keys(checkpoints.actions).sort(), scenario.expectedCheckpointActionIds.slice().sort())
    assert.equal(failed.qualityFirst.scaleProfileHash, scenario.actionId === 'idle' ? '' : profile.hash)
    if (scenario.actionId === 'idle') {
      for (const actionId of ['running-right', 'running-left', 'waving']) {
        assert.equal(failed.qualityFirst.actionResults[actionId].ok, false)
        assert.equal(failed.qualityFirst.actionResults[actionId].disposition, 'invalidated')
        assert.equal(failed.qualityFirst.actionResults[actionId].failureCode, 'candidate-binding-stale')
        assert.equal(failed.qualityFirst.actionResults[actionId].selectedCandidateId, '')
        assert.equal(failed.qualityFirst.actionResults[actionId].selection, undefined)
      }
      assert.equal(failed.qualityFirst.actionResults.waving.candidates[0].evidence, 'paid-waving')
      assert.equal(failed.qualityFirst.actionResults.waving.candidates[0].selection, null)
      assert.equal(failed.qualityFirst.package, undefined)
      assert.equal(failed.artifacts.bundle, undefined)
      assert.deepEqual(failed.artifacts.generatedImage, { evidence: 'keep' })
    }
  })
}

test('manual idle selection rebuilds the scale profile and preserves old-profile action evidence as stale', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'New Idle Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'waving' }], questions: [] } }
  })
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'idle', 'candidate-2', 'raw', 'sheet.png')
  const candidateHash = writePngFixture(rawPath)
  const warnings = ['visual-score-overall-below-minimum']
  const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64) }
  const plan = createHashBoundValue({ version: 1, actions: [{ actionId: 'idle' }, { actionId: 'waving' }] })
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-idle',
    candidate: {
      candidateId: 'candidate-2',
      sha256: candidateHash,
      technicalEligible: true,
      recommended: false,
      qualityWarningCodes: warnings,
      bindings: createCandidateBindings({ planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: '' }),
      artifacts: [{ role: 'raw-sheet', path: rawPath, sha256: candidateHash }]
    }
  })
  const oldSelection = { candidateId: 'old-waving', sha256: 'd'.repeat(64), selectionAuthority: 'human-override', qualityOverride: false, acknowledgedWarningCodes: [] }
  writeRun({ dataDir, run: {
    ...created,
    status: 'recovery-required',
    currentStep: 'recovery',
    artifacts: { generatedImage: { evidence: 'keep' }, outputDir: '/old/package', bundle: '/old/package.zip', spritesheet: '/old/spritesheet.webp' },
    qualityFirst: {
      phase: 'recovery-required',
      planHash: plan.hash,
      acceptedCanonical: canonical,
      scaleProfileHash: 'o'.repeat(64),
      package: { bundleRelativePath: `runs/${created.runId}/quality-first/package/old.zip` },
      actionResults: {
        idle: { ok: false, candidates: [{ candidateId: 'candidate-2', sha256: candidateHash, technicalEligible: true, recommended: false, qualityWarningCodes: warnings, candidateRecordRelativePath: record.relativePath }] },
        waving: {
          ok: true,
          selectedCandidateId: 'old-waving',
          selection: oldSelection,
          candidates: [{ candidateId: 'old-waving', evidence: 'paid-waving', selection: oldSelection }]
        }
      }
    }
  } })
  const rebuiltProfile = { version: 1, hash: 'n'.repeat(64) }
  const calls = []
  const runtime = {
    materializeActionCandidate: async ({ candidate }) => ({ ok: true, actionId: 'idle', selectedCandidateId: candidate.candidateId, selectedCandidate: candidate, candidates: [candidate] }),
    createCharacterScaleProfile: async ({ idle }) => {
      calls.push(['create-profile', idle.selectedCandidateId])
      return rebuiltProfile
    },
    persistScaleProfile: async ({ profile }) => calls.push(['persist-profile', profile.hash]),
    persistActionResult: async ({ actionId, profile }) => calls.push(['persist-action', actionId, profile.hash]),
    finalizePackage: async ({ profile, actionResults }) => {
      calls.push(['package', profile.hash, Object.keys(actionResults).sort().join(','), actionResults.waving?.ok, actionResults.waving?.failureCode])
      return { artifacts: { outputDir: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package') } }
    }
  }

  const output = await acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'idle',
    candidateId: 'candidate-2',
    expectedHash: candidateHash,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings,
    runtime,
    plan,
    profile: null,
    now: () => '2026-07-28T02:00:00.000Z'
  })

  assert.deepEqual(calls, [
    ['create-profile', 'candidate-2'],
    ['persist-profile', rebuiltProfile.hash],
    ['persist-action', 'idle', rebuiltProfile.hash],
    ['package', rebuiltProfile.hash, 'idle,waving', false, 'candidate-binding-stale']
  ])
  assert.equal(output.run.qualityFirst.scaleProfileHash, rebuiltProfile.hash)
  assert.deepEqual(Object.keys(output.run.qualityFirst.actionResults), ['waving', 'idle'])
  assert.equal(output.run.qualityFirst.actionResults.waving.ok, false)
  assert.equal(output.run.qualityFirst.actionResults.waving.disposition, 'invalidated')
  assert.equal(output.run.qualityFirst.actionResults.waving.failureCode, 'candidate-binding-stale')
  assert.equal(output.run.qualityFirst.actionResults.waving.selectedCandidateId, '')
  assert.equal(output.run.qualityFirst.actionResults.waving.selection, undefined)
  assert.equal(output.run.qualityFirst.actionResults.waving.candidates[0].evidence, 'paid-waving')
  assert.equal(output.run.qualityFirst.actionResults.waving.candidates[0].selection, null)
  assert.equal(output.run.qualityFirst.package.bundleRelativePath, undefined)
  assert.equal(output.run.artifacts.bundle, undefined)
  assert.deepEqual(output.run.artifacts.generatedImage, { evidence: 'keep' })
})

test('manual running-right selection rebuilds the derived running-left action', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Direction Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle' }, { actionId: 'running-right' }], questions: [] } }
  })
  const rawPath = path.join(dataDir, 'runs', created.runId, 'candidates', 'running-right', 'candidate-2', 'raw', 'sheet.png')
  const candidateHash = writePngFixture(rawPath)
  const warnings = ['visual-defect-motion-unreadable']
  const canonical = { candidateId: 'canonical-1', sha256: 'a'.repeat(64) }
  const profile = createHashBoundValue({ version: 1 })
  const plan = createHashBoundValue({ version: 1, actions: [{ actionId: 'idle' }, { actionId: 'running-right' }] })
  const record = writeCandidateRecord({
    dataDir,
    runId: created.runId,
    scope: 'action-running-right',
    candidate: {
      candidateId: 'candidate-2',
      sha256: candidateHash,
      technicalEligible: true,
      recommended: false,
      qualityWarningCodes: warnings,
      bindings: createCandidateBindings({ planHash: plan.hash, canonicalHash: canonical.sha256, profileHash: profile.hash }),
      artifacts: [{ role: 'raw-sheet', path: rawPath, sha256: candidateHash }]
    }
  })
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    currentStep: 'review',
    qualityFirst: {
      phase: 'ready_for_review',
      planHash: plan.hash,
      acceptedCanonical: canonical,
      scaleProfileHash: profile.hash,
      actionResults: {
        idle: { ok: true, selectedCandidateId: 'idle-candidate' },
        'running-right': { ok: false, candidates: [{ candidateId: 'candidate-2', sha256: candidateHash, technicalEligible: true, recommended: false, qualityWarningCodes: warnings, candidateRecordRelativePath: record.relativePath }] },
        'running-left': { ok: true, selectedCandidateId: 'old-mirror' }
      }
    }
  } })
  const calls = []
  const runtime = {
    materializeActionCandidate: async ({ candidate }) => ({ ok: true, actionId: 'running-right', selectedCandidateId: candidate.candidateId, selectedCandidate: candidate, candidates: [candidate] }),
    mirrorRunningLeft: async ({ source }) => {
      calls.push(['mirror', source.selectedCandidateId])
      return { ok: true, actionId: 'running-left', selectedCandidateId: 'candidate-2-mirror', selectedCandidate: { candidateId: 'candidate-2-mirror' }, candidates: [] }
    },
    persistActionResult: async ({ actionId }) => calls.push(['persist', actionId]),
    finalizePackage: async () => ({ artifacts: { outputDir: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package') } })
  }

  const output = await acceptQualityFirstActionCandidate({
    dataDir,
    runId: created.runId,
    actionId: 'running-right',
    candidateId: 'candidate-2',
    expectedHash: candidateHash,
    qualityOverride: true,
    acknowledgedWarningCodes: warnings,
    runtime,
    plan,
    profile,
    now: () => '2026-07-28T03:00:00.000Z'
  })

  assert.deepEqual(calls, [
    ['persist', 'running-right'],
    ['mirror', 'candidate-2'],
    ['persist', 'running-left']
  ])
  assert.equal(output.run.qualityFirst.actionResults['running-right'].selectedCandidateId, 'candidate-2')
  assert.equal(output.run.qualityFirst.actionResults['running-left'].selectedCandidateId, 'candidate-2-mirror')
})

test('quality-first idle recovery can rebuild the missing scale profile from a retained passing candidate', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Recovered Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6 }], questions: [] } }
  })
  const canonical = { candidateId: 'canonical-1', eligible: true, sha256: 'a'.repeat(64), relativePath: `runs/${created.runId}/canonical.png` }
  writeRun({ dataDir, run: {
    ...created,
    status: 'recovery-required',
    taskStatus: 'confirmed',
    generationTask: { ...created.generationTask, pipeline: 'quality-first-v1' },
    qualityFirst: {
      phase: 'recovery-required',
      acceptedCanonical: canonical,
      actionResults: { idle: { ok: false, failureCode: 'action_candidate_diversity_insufficient' } }
    }
  } })
  const calls = []
  const rebuiltProfile = { version: 1, hash: 'p'.repeat(64) }
  const runtime = {
    runAction: async ({ actionId, profile }) => {
      calls.push(['run', actionId, profile])
      return { ok: true, actionId, selectedCandidateId: 'candidate-1', selectedCandidate: { processed: { metrics: { frames: [] } } }, candidates: [] }
    },
    createCharacterScaleProfile: async ({ canonical: actualCanonical, idle }) => {
      calls.push(['create-profile', actualCanonical.candidateId, idle.selectedCandidateId])
      return rebuiltProfile
    },
    persistScaleProfile: async ({ profile }) => calls.push(['persist-profile', profile.hash]),
    persistActionResult: async ({ profile }) => calls.push(['persist-action', profile.hash]),
    orchestrator: {
      continueWithCanonicalIdentity: async ({ candidate, actions }) => {
        calls.push(['resume-actions', candidate.candidateId, actions.join(',')])
        return {
          ...readRun({ dataDir, runId: created.runId }),
          status: 'ready_for_review',
          currentStep: 'review',
          qualityFirst: {
            ...readRun({ dataDir, runId: created.runId }).qualityFirst,
            phase: 'ready_for_review',
            actionResults: { idle: { ok: true }, waving: { ok: true } },
            nextAction: 'human-review'
          },
          artifacts: { outputDir: path.join(dataDir, 'runs', created.runId, 'quality-first', 'package') }
        }
      }
    },
    finalizePackage: async () => {
      throw new Error('idle recovery should resume the remaining planned actions through the orchestrator')
    }
  }

  const result = await runQualityFirstActionRepair({
    dataDir,
    runId: created.runId,
    actionId: 'idle',
    runtime,
    plan: { hash: 'plan', actions: [{ actionId: 'idle' }, { actionId: 'waving' }] },
    profile: null
  })

  assert.equal(result.run.status, 'ready_for_review')
  assert.deepEqual(calls, [
    ['run', 'idle', null],
    ['create-profile', 'canonical-1', 'candidate-1'],
    ['persist-profile', rebuiltProfile.hash],
    ['persist-action', rebuiltProfile.hash],
    ['resume-actions', 'canonical-1', 'idle,waving']
  ])
  assert.equal(result.run.qualityFirst.actionResults.waving.ok, true)
})

test('quality-first identity retry archives paid candidates and returns to identity review', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Quality Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6 }], questions: [] } }
  })
  const candidateDir = path.join(dataDir, 'runs', created.runId, 'candidates', 'canonical', 'old')
  fs.mkdirSync(candidateDir, { recursive: true })
  fs.writeFileSync(path.join(candidateDir, 'raw.png'), 'paid')
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    taskStatus: 'confirmed',
    generationTask: { ...created.generationTask, pipeline: 'quality-first-v1' },
    qualityFirst: { phase: 'ready_for_review', acceptedCanonical: { candidateId: 'old', sha256: 'a'.repeat(64) }, actionResults: { idle: { ok: true } } }
  } })
  const orchestrator = {
    start: async ({ run }) => ({ ...run, status: 'awaiting_identity_review', currentStep: 'identity-review', qualityFirst: { phase: 'awaiting_identity_review', canonicalCandidates: [] } })
  }
  const result = await runQualityFirstIdentityRetry({ dataDir, runId: created.runId, orchestrator, plan: { hash: 'plan' } })
  assert.equal(result.run.status, 'awaiting_identity_review')
  assert.equal(result.run.qualityFirst.phase, 'awaiting_identity_review')
  assert.match(result.repair.evidenceArchive, /repairs/)
  assert.equal(fs.existsSync(path.join(dataDir, result.repair.evidenceArchive, 'candidates', 'canonical', 'old', 'raw.png')), true)
})

test('provider full-pet execution rejects the removed legacy keyframe pipeline', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Legacy Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'legacy-keyframe-v1', actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6 }], questions: [] } }
  })
  writeRun({ dataDir, run: { ...created, status: 'confirmed', taskStatus: 'confirmed', generationTask: { ...created.generationTask, pipeline: 'legacy-keyframe-v1' } } })
  await assert.rejects(() => runGenerationStep({ dataDir, runId: created.runId }), (error) => {
    assert.equal(error.code, 'legacy_full_pet_pipeline_removed')
    return true
  })
})

test('backend runner no longer exports legacy full-pet repair entry points', () => {
  assert.equal(Object.hasOwn(backendRunnerModule, 'runFullPetActionRepair'), false)
  assert.equal(Object.hasOwn(backendRunnerModule, 'runFullPetIdentityRepair'), false)
})

test('quality-first action repair fails closed when final package artifacts cannot be rebuilt', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Quality Pet', backend: 'provider', generationTask: { mode: 'full-pet', pipeline: 'quality-first-v1', actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6 }], questions: [] } }
  })
  const canonical = { candidateId: 'canonical-1', eligible: true, sha256: 'a'.repeat(64), relativePath: `runs/${created.runId}/canonical.png` }
  writeRun({ dataDir, run: {
    ...created,
    status: 'ready_for_review',
    taskStatus: 'confirmed',
    generationTask: { ...created.generationTask, pipeline: 'quality-first-v1' },
    qualityFirst: { phase: 'ready_for_review', acceptedCanonical: canonical, actionResults: { idle: { ok: true }, waving: { ok: false } } }
  } })
  const profile = createHashBoundValue({ version: 1 })
  await assert.rejects(() => runQualityFirstActionRepair({
    dataDir,
    runId: created.runId,
    actionId: 'waving',
    runtime: {
      runAction: async () => ({ ok: true, actionId: 'waving', selectedCandidateId: 'new', candidates: [] }),
      persistActionResult: async () => {},
      finalizePackage: async () => null
    },
    plan: { hash: 'plan' },
    profile
  }), (error) => {
    assert.equal(error.code, 'quality_first_final_package_missing')
    return true
  })
  assert.equal(readRun({ dataDir, runId: created.runId }).status, 'failed')
  assert.deepEqual(readRunLogs({ dataDir, runId: created.runId }).map((entry) => entry.event), [
    'quality-first.action.repair-started',
    'quality-first.action.repair-failed'
  ])
})
