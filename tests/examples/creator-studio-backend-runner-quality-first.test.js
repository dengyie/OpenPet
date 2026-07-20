const fs = require('node:fs')
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
  const pending = await runQualityFirstIdentityStage({ dataDir, runId: created.runId, orchestrator, plan: { hash: 'plan' } })
  assert.equal(pending.run.status, 'awaiting_identity_review')
  assert.equal(readRun({ dataDir, runId: created.runId }).qualityFirst.phase, 'awaiting_identity_review')
  const accepted = await acceptQualityFirstCanonicalIdentity({ dataDir, runId: created.runId, candidateId: 'c1', expectedHash: 'a'.repeat(64), orchestrator, plan: { hash: 'plan' }, actions: ['idle'] })
  assert.equal(accepted.run.status, 'ready_for_review')
  assert.deepEqual(calls, [{ candidateId: 'c1', sha256: 'a'.repeat(64) }])
  assert.deepEqual(readRunLogs({ dataDir, runId: created.runId }).map((entry) => entry.event), ['quality-first.identity.started', 'quality-first.identity.awaiting-review', 'quality-first.identity.accepted'])
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
})
