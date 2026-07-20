const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  acceptQualityFirstCanonicalIdentity,
  runQualityFirstIdentityStage
} = require('../../examples/plugins/creator-studio/lib/backend-runner')
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
