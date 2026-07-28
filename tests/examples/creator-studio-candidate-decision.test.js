const test = require('node:test')
const assert = require('node:assert')

const {
  assertHumanCandidateSelection,
  createCandidateSelection,
  normalizeCandidateDecision
} = require('../../examples/plugins/creator-studio/lib/candidate-decision')

const hash = (character) => character.repeat(64)

test('candidate decision keeps technical eligibility independent from quality recommendation', () => {
  const candidate = normalizeCandidateDecision({
    candidate: {
      candidateId: 'canonical-4',
      sha256: hash('f'),
      gate: { ok: false, outcome: 'reject', failures: ['visual-score-overall-below-minimum'] }
    },
    technicalEligible: true,
    recommended: false,
    qualityWarningCodes: ['visual-score-overall-below-minimum']
  })

  assert.equal(candidate.technicalEligible, true)
  assert.equal(candidate.recommended, false)
  assert.deepEqual(candidate.technicalFailureCodes, [])
  assert.deepEqual(candidate.qualityWarningCodes, ['visual-score-overall-below-minimum'])
  assert.equal(candidate.gate.ok, false)
})

test('human override binds the exact warned candidate without rewriting its recommendation', () => {
  const candidate = normalizeCandidateDecision({
    candidate: { candidateId: 'canonical-4', sha256: hash('f') },
    technicalEligible: true,
    recommended: false,
    qualityWarningCodes: ['visual-defect-identity-drift', 'visual-score-overall-below-minimum']
  })

  const selection = createCandidateSelection({
    candidate,
    expectedHash: hash('f'),
    authority: 'human-override',
    qualityOverride: true,
    acknowledgedWarningCodes: ['visual-score-overall-below-minimum', 'visual-defect-identity-drift'],
    now: () => '2026-07-28T00:00:00.000Z'
  })

  assert.equal(candidate.recommended, false)
  assert.deepEqual(selection, {
    candidateId: 'canonical-4',
    sha256: hash('f'),
    selectionAuthority: 'human-override',
    qualityOverride: true,
    acknowledgedWarningCodes: ['visual-defect-identity-drift', 'visual-score-overall-below-minimum'],
    selectedAt: '2026-07-28T00:00:00.000Z'
  })
})

test('recommended candidates can be selected by a human without a quality override', () => {
  const candidate = normalizeCandidateDecision({
    candidate: { candidateId: 'canonical-1', sha256: hash('a') },
    technicalEligible: true,
    recommended: true
  })

  const selection = createCandidateSelection({
    candidate,
    expectedHash: hash('a'),
    authority: 'human-override',
    qualityOverride: false,
    acknowledgedWarningCodes: [],
    now: () => '2026-07-28T00:00:00.000Z'
  })

  assert.equal(selection.qualityOverride, false)
  assert.deepEqual(selection.acknowledgedWarningCodes, [])
})

test('human selection rejects a technically unusable candidate', () => {
  const candidate = normalizeCandidateDecision({
    candidate: { candidateId: 'broken', sha256: hash('b') },
    technicalEligible: false,
    recommended: false,
    technicalFailureCodes: ['candidate-asset-missing']
  })

  assert.throws(() => assertHumanCandidateSelection({
    candidate,
    expectedHash: hash('b'),
    qualityOverride: true,
    acknowledgedWarningCodes: []
  }), (error) => error?.code === 'candidate_technically_unusable')
})

test('human selection rejects a mismatched hash', () => {
  const candidate = normalizeCandidateDecision({
    candidate: { candidateId: 'canonical-4', sha256: hash('f') },
    technicalEligible: true,
    recommended: false,
    qualityWarningCodes: ['visual-score-overall-below-minimum']
  })

  assert.throws(() => assertHumanCandidateSelection({
    candidate,
    expectedHash: hash('e'),
    qualityOverride: true,
    acknowledgedWarningCodes: candidate.qualityWarningCodes
  }), (error) => error?.code === 'candidate_hash_mismatch')
})

test('human selection requires current quality warnings for a non-recommended candidate', () => {
  const candidate = normalizeCandidateDecision({
    candidate: { candidateId: 'canonical-4', sha256: hash('f') },
    technicalEligible: true,
    recommended: false,
    qualityWarningCodes: ['visual-defect-identity-drift', 'visual-score-overall-below-minimum']
  })

  assert.throws(() => assertHumanCandidateSelection({
    candidate,
    expectedHash: hash('f'),
    qualityOverride: false,
    acknowledgedWarningCodes: candidate.qualityWarningCodes
  }), (error) => error?.code === 'quality_override_acknowledgement_required')

  assert.throws(() => assertHumanCandidateSelection({
    candidate,
    expectedHash: hash('f'),
    qualityOverride: true,
    acknowledgedWarningCodes: ['visual-score-overall-below-minimum']
  }), (error) => error?.code === 'quality_override_evidence_stale')
})
