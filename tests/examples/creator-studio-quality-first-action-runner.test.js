const test = require('node:test')
const assert = require('node:assert/strict')

const { runQualityFirstAction } = require('../../examples/plugins/creator-studio/lib/quality-first-action-runner')

const descriptors = (perceptualHash, offset = 0) => ({
  perceptualHash,
  identityDescriptor: [offset, offset + 0.1],
  alphaMaskDescriptor: [offset, offset + 0.2]
})

const createHarness = ({ generated, qaById = {}, evaluationById = {} }) => {
  const calls = { generated: [], processed: [], evaluated: [], reserved: [], persisted: [], archives: [] }
  const queue = [...generated]
  return {
    calls,
    callbacks: {
      reserveCreativeDispatch: ({ attemptKind }) => calls.reserved.push(attemptKind),
      generateCandidate: async ({ attemptKind, failureCodes }) => {
        calls.generated.push({ attemptKind, failureCodes })
        return queue.shift()
      },
      processCandidate: async (candidate) => {
        calls.processed.push(candidate.candidateId)
        return { ...candidate, qa: qaById[candidate.candidateId] || { ok: true, failures: [] } }
      },
      evaluateCandidate: async (candidate) => {
        calls.evaluated.push(candidate.candidateId)
        return evaluationById[candidate.candidateId] || { evaluation: { scores: { overall: 90 } }, gate: { ok: true, outcome: 'pass', failures: [] } }
      },
      persistCandidate: (candidate) => calls.persisted.push(candidate.candidateId),
      archiveCandidateRevision: (entry) => calls.archives.push(entry)
    }
  }
}

test('runner evaluates two distinct initial candidates and selects the best passing result', async () => {
  const h = createHarness({
    generated: [
      { candidateId: 'candidate-1', descriptors: descriptors('0000', 0), identityDistance: 0.2 },
      { candidateId: 'candidate-2', descriptors: descriptors('ffff', 2), identityDistance: 0.1 }
    ],
    evaluationById: {
      'candidate-1': { evaluation: { scores: { overall: 91 } }, gate: { ok: true, outcome: 'pass', failures: [] } },
      'candidate-2': { evaluation: { scores: { overall: 95 } }, gate: { ok: true, outcome: 'pass', failures: [] } }
    }
  })
  const result = await runQualityFirstAction({ context: { actionId: 'waving' }, ...h.callbacks })
  assert.equal(result.ok, true)
  assert.equal(result.selectedCandidateId, 'candidate-2')
  assert.deepEqual(h.calls.generated.map((call) => call.attemptKind), ['initial', 'initial'])
  assert.deepEqual(h.calls.evaluated, ['candidate-1', 'candidate-2'])
  assert.deepEqual(h.calls.persisted, ['candidate-1', 'candidate-2'])
})

test('runner assigns stable unique candidate ids before dispatching to the host generator', async () => {
  const received = []
  const queue = [
    { descriptors: descriptors('0000', 0) },
    { descriptors: descriptors('ffff', 2) },
    { descriptors: descriptors('0f0f', 4) }
  ]
  const result = await runQualityFirstAction({
    context: { actionId: 'waving' },
    reserveCreativeDispatch: () => {},
    generateCandidate: async (input) => {
      received.push({ candidateId: input.candidateId, attemptKind: input.attemptKind })
      return queue.shift()
    },
    processCandidate: async () => ({ qa: { ok: false, failures: ['quality-failed'] } }),
    evaluateCandidate: async () => ({ gate: { ok: false, outcome: 'reject', failures: ['quality-failed'] } }),
    persistCandidate: () => {}
  })
  assert.equal(result.ok, false)
  assert.deepEqual(received, [
    { candidateId: 'candidate-1', attemptKind: 'initial' },
    { candidateId: 'candidate-2', attemptKind: 'initial' },
    { candidateId: 'candidate-3', attemptKind: 'repair' }
  ])
  assert.equal(new Set(received.map((entry) => entry.candidateId)).size, 3)
})

test('runner replaces one duplicate and never accepts a singleton candidate pool', async () => {
  const h = createHarness({ generated: [
    { candidateId: 'candidate-1', descriptors: descriptors('0000', 0) },
    { candidateId: 'candidate-2', descriptors: descriptors('0000', 0) },
    { candidateId: 'candidate-3', descriptors: descriptors('0000', 0) }
  ] })
  const result = await runQualityFirstAction({ context: { actionId: 'waving' }, ...h.callbacks })
  assert.equal(result.ok, false)
  assert.equal(result.failureCode, 'action_candidate_diversity_insufficient')
  assert.equal(result.disposition, 'omitted')
  assert.deepEqual(h.calls.generated.map((call) => call.attemptKind), ['initial', 'initial', 'duplicate-replacement'])
  assert.equal(h.calls.evaluated.length, 0)
  assert.deepEqual(h.calls.persisted, ['candidate-1', 'candidate-2', 'candidate-3'])
})

test('runner performs at most one reason-directed repair after both initial candidates fail', async () => {
  const h = createHarness({
    generated: [
      { candidateId: 'candidate-1', descriptors: descriptors('0000', 0) },
      { candidateId: 'candidate-2', descriptors: descriptors('ffff', 2) },
      { candidateId: 'candidate-3', descriptors: descriptors('0f0f', 4) }
    ],
    qaById: {
      'candidate-1': { ok: false, failures: ['cell-edge-contact'] },
      'candidate-2': { ok: true, failures: [] }
    },
    evaluationById: {
      'candidate-2': { evaluation: { scores: { overall: 70 } }, gate: { ok: false, outcome: 'repair', failures: ['visual-score-overall-below-minimum'] } },
      'candidate-3': { evaluation: { scores: { overall: 95 } }, gate: { ok: true, outcome: 'pass', failures: [] } }
    }
  })
  const result = await runQualityFirstAction({ context: { actionId: 'idle' }, ...h.callbacks })
  assert.equal(result.ok, true)
  assert.equal(result.selectedCandidateId, 'candidate-3')
  assert.equal(h.calls.generated.length, 3)
  assert.deepEqual(h.calls.generated[2], {
    attemptKind: 'repair',
    failureCodes: ['cell-edge-contact', 'visual-score-overall-below-minimum']
  })
  assert.deepEqual(h.calls.evaluated, ['candidate-2', 'candidate-3'])
  assert.deepEqual(h.calls.archives, [{ actionId: 'idle', reasonCodes: ['cell-edge-contact', 'visual-score-overall-below-minimum'] }])
})

test('runner rewrites archived candidate record links after reason-directed repair', async () => {
  const generated = [
    { candidateId: 'candidate-1', descriptors: descriptors('0000', 0) },
    { candidateId: 'candidate-2', descriptors: descriptors('ffff', 2) },
    { candidateId: 'candidate-3', descriptors: descriptors('0f0f', 4) }
  ]
  const result = await runQualityFirstAction({
    context: { actionId: 'waving' },
    reserveCreativeDispatch: () => {},
    generateCandidate: async () => generated.shift(),
    processCandidate: async (candidate) => ({ qa: { ok: true, failures: [] }, candidateId: candidate.candidateId }),
    evaluateCandidate: async (candidate) => candidate.candidateId === 'candidate-3'
      ? { evaluation: { scores: { overall: 95 } }, gate: { ok: true, outcome: 'pass', failures: [] } }
      : { evaluation: { scores: { overall: 70 } }, gate: { ok: false, outcome: 'repair', failures: ['visual-score-overall-below-minimum'] } },
    persistCandidate: (candidate) => {
      candidate.candidateRecordRelativePath = `runs/run-1/candidates/action-waving/${candidate.candidateId}/candidate.json`
    },
    archiveCandidateRevision: () => 'runs/run-1/candidate-archives/action-waving/revision-1'
  })

  assert.equal(result.ok, true)
  assert.equal(result.candidates[0].candidateRecordRelativePath, 'runs/run-1/candidate-archives/action-waving/revision-1/candidate-1/candidate.json')
  assert.equal(result.candidates[1].candidateRecordRelativePath, 'runs/run-1/candidate-archives/action-waving/revision-1/candidate-2/candidate.json')
  assert.equal(result.candidates[2].candidateRecordRelativePath, 'runs/run-1/candidates/action-waving/candidate-3/candidate.json')
})

test('runner blocks idle and omits optional actions when the single repair still fails', async () => {
  for (const [actionId, disposition] of [['idle', 'blocked'], ['waiting', 'omitted']]) {
    const h = createHarness({
      generated: [
        { candidateId: `${actionId}-1`, descriptors: descriptors('0000', 0) },
        { candidateId: `${actionId}-2`, descriptors: descriptors('ffff', 2) },
        { candidateId: `${actionId}-3`, descriptors: descriptors('0f0f', 4) }
      ],
      qaById: {
        [`${actionId}-1`]: { ok: false, failures: ['cell-edge-contact'] },
        [`${actionId}-2`]: { ok: false, failures: ['body-scale-profile-drift'] },
        [`${actionId}-3`]: { ok: false, failures: ['cell-edge-contact'] }
      }
    })
    const result = await runQualityFirstAction({ context: { actionId }, ...h.callbacks })
    assert.equal(result.ok, false)
    assert.equal(result.disposition, disposition)
    assert.equal(h.calls.generated.length, 3)
  }
})

test('runner retains a candidate when processing throws and continues comparing the other candidate', async () => {
  const persisted = []
  const evaluated = []
  const result = await runQualityFirstAction({
    context: { actionId: 'waving' },
    reserveCreativeDispatch: () => {},
    generateCandidate: async ({ attemptKind }) => attemptKind === 'initial' && !evaluated.length
      ? { candidateId: 'broken', descriptors: descriptors('0000', 0) }
      : { candidateId: 'healthy', descriptors: descriptors('ffff', 2) },
    processCandidate: async (candidate) => {
      if (candidate.candidateId === 'broken') throw new Error('processor failed')
      return { qa: { ok: true, failures: [] } }
    },
    evaluateCandidate: async (candidate) => {
      evaluated.push(candidate.candidateId)
      return { evaluation: { scores: { overall: 95 } }, gate: { ok: true, outcome: 'pass', failures: [] } }
    },
    persistCandidate: (candidate) => persisted.push(candidate)
  })
  assert.equal(result.selectedCandidateId, 'healthy')
  assert.equal(persisted.find((candidate) => candidate.candidateId === 'broken').qa.failures.includes('candidate-processing-failed'), true)
  assert.deepEqual(evaluated, ['healthy'])
})

test('runner retains a failed Provider dispatch with request evidence and continues bounded generation', async () => {
  const persisted = []
  let dispatchCount = 0
  const result = await runQualityFirstAction({
    context: { actionId: 'waving' },
    reserveCreativeDispatch: () => {},
    generateCandidate: async () => {
      dispatchCount += 1
      if (dispatchCount === 1) {
        const error = new Error('Provider transport failed')
        error.code = 'provider_transport_failed'
        error.modelAttempts = [{ model: 'gpt-image-2', ok: false, requestId: 'provider-request-failed-1' }]
        throw error
      }
      return { candidateId: `candidate-${dispatchCount}`, descriptors: descriptors(dispatchCount === 2 ? 'ffff' : '0f0f', dispatchCount) }
    },
    processCandidate: async () => ({ qa: { ok: true, failures: [] } }),
    evaluateCandidate: async () => ({ evaluation: { scores: { overall: 95 } }, gate: { ok: true, outcome: 'pass', failures: [] } }),
    persistCandidate: (candidate) => persisted.push(candidate)
  })
  assert.equal(result.ok, true)
  const failed = persisted.find((candidate) => candidate.candidateId === 'candidate-1')
  assert.equal(failed.failureCodes.includes('provider-generation-failed'), true)
  assert.equal(failed.requestId, 'provider-request-failed-1')
  assert.deepEqual(failed.modelAttempts, [{ model: 'gpt-image-2', ok: false, requestId: 'provider-request-failed-1' }])
  assert.equal(dispatchCount, 3)
})
