const fs = require('node:fs')
const crypto = require('node:crypto')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  acceptQualityFirstCanonicalIdentity,
  runQualityFirstActionRepair,
  runQualityFirstIdentityRetry,
  runQualityFirstIdentityStage,
  runGenerationStep
} = require('../../examples/plugins/creator-studio/lib/backend-runner')
const backendRunnerModule = require('../../examples/plugins/creator-studio/lib/backend-runner')
const { createRun, readRun, readRunLogs, writeRun } = require('../../examples/plugins/creator-studio/lib/run-store')

const createDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-backend-'))

test('backend persists awaiting identity review and resumes only after exact acceptance', async () => {
  const dataDir = createDataDir()
  const created = createRun({
    dataDir,
    input: { petName: 'Quality Pet', backend: 'provider', generationTask: { mode: 'full-pet', actions: [{ actionId: 'idle', name: 'Idle', motionPrompt: 'idle', frameCount: 6, transparentBackground: true }], questions: [] } },
    now: () => '2026-07-20T10:00:00.000Z'
  })
  writeRun({ dataDir, run: { ...created, status: 'confirmed', taskStatus: 'confirmed' } })
  const calls = []
  const orchestrator = {
    start: async ({ run }) => ({ ...run, status: 'awaiting_identity_review', currentStep: 'identity-review', qualityFirst: { phase: 'awaiting_identity_review', canonicalCandidates: [{ candidateId: 'c1', eligible: true, sha256: 'a'.repeat(64) }] } }),
    acceptCanonicalIdentity: async ({ run, candidateId, sha256 }) => {
      calls.push({ candidateId, sha256 })
      return { ...run, status: 'ready_for_review', currentStep: 'review', qualityFirst: { ...run.qualityFirst, phase: 'ready_for_review' } }
    }
  }
  const pending = await runQualityFirstIdentityStage({ dataDir, runId: created.runId, orchestrator, plan: { hash: 'plan' }, requireIdentityReviewBeforeActions: true })
  assert.equal(pending.run.status, 'awaiting_identity_review')
  assert.equal(readRun({ dataDir, runId: created.runId }).qualityFirst.phase, 'awaiting_identity_review')
  const accepted = await acceptQualityFirstCanonicalIdentity({ dataDir, runId: created.runId, candidateId: 'c1', expectedHash: 'a'.repeat(64), orchestrator, plan: { hash: 'plan' }, actions: ['idle'] })
  assert.equal(accepted.run.status, 'ready_for_review')
  assert.deepEqual(calls, [{ candidateId: 'c1', sha256: 'a'.repeat(64) }])
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
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, 'canonical-four')
  const candidateHash = crypto.createHash('sha256').update('canonical-four').digest('hex')
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
  const canonical = { candidateId: 'canonical-1', eligible: true, sha256: 'a'.repeat(64) }
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
  const profile = { version: 1, hash: 'p'.repeat(64) }
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
  const profile = { version: 1, hash: 'p'.repeat(64) }
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
