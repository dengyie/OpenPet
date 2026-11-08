const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createActionCandidateRenderer } = require('../../examples/plugins/creator-studio/lib/action-candidate-renderer')
const { runQualityFirstAction } = require('../../examples/plugins/creator-studio/lib/quality-first-action-runner')

for (const actionId of ['jumping', 'review', 'running', 'running-right']) test(`${actionId} quality repair produces one rig candidate through the same persistence and quality gates`, async () => {
  const calls = []; const stored = []
  const render = createActionCandidateRenderer({ action: { actionId }, characterClass: 'grounded-compact-character',
    generateVideo: async request => { calls.push('video'); return { candidateId: request.candidateId, descriptors: { perceptualHash: request.dispatchIndex === 1 ? '0000' : 'ffff', identityDescriptor: [request.dispatchIndex], alphaMaskDescriptor: [request.dispatchIndex] } } },
    generateRig: async request => { calls.push('rig'); assert.ok(request.failureCodes.includes('visual-defect-style-drift')); return { candidateId: request.candidateId, provider: 'canonical-rig', descriptors: { perceptualHash: 'aabb', identityDescriptor: [3], alphaMaskDescriptor: [3] } } }
  })
  const result = await runQualityFirstAction({ context: { actionId }, reserveCreativeDispatch: async () => {}, generateCandidate: render,
    processCandidate: async candidate => ({ ...candidate, qa: { ok: true, failures: [] } }),
    evaluateCandidate: async candidate => ({ gate: candidate.provider === 'canonical-rig' ? { ok: true, failures: [] } : { ok: false, failures: ['visual-defect-style-drift'] }, evaluation: { scores: { overall: candidate.provider === 'canonical-rig' ? 96 : 80 } } }),
    persistCandidate: async candidate => stored.push(candidate.candidateId)
  })
  assert.deepEqual(calls, ['video', 'video', 'rig'])
  assert.equal(result.ok, true)
  assert.equal(result.selectedCandidate.provider, 'canonical-rig')
  assert.equal(result.candidates.length, 3)
  assert.equal(stored.length, 3)
})

test('rig does not mask read/submission failures, runs only for supported repair actions, or replace initial video', async () => {
  const calls = []
  for (const actionId of ['jumping', 'review', 'running', 'running-right', 'running-left']) {
    const render = createActionCandidateRenderer({ action: { actionId }, characterClass: 'grounded-compact-character', generateVideo: async () => { calls.push('video') }, generateRig: async () => { calls.push('rig') } })
    await render({ attemptKind: 'initial', failureCodes: ['visual-defect-style-drift'] })
    await render({ attemptKind: 'repair', failureCodes: ['video_provider_timeout', 'candidate-evaluation-failed'] })
    if (actionId === 'running-left') await render({ attemptKind: 'repair', failureCodes: ['visual-defect-style-drift'] })
  }
  assert.deepEqual(calls, Array(11).fill('video'))

  const readabilityRender = createActionCandidateRenderer({ action: { actionId: 'running-right' }, characterClass: 'grounded-compact-character', generateVideo: async () => { calls.push('video') }, generateRig: async () => { calls.push('rig') } })
  await readabilityRender({ attemptKind: 'repair', failureCodes: ['visual-defect-action-unreadable'] })
  assert.equal(calls.at(-1), 'rig')
})
