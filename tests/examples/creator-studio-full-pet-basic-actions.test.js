const test = require('node:test')
const assert = require('node:assert/strict')

const {
  FALLBACK_ONLY_FULL_PET_ACTION_IDS,
  FULL_PET_ACTION_POLICY,
  FULL_PET_ACTION_SUPPORT,
  GENERATED_FULL_PET_ACTION_IDS,
  OPTIONAL_ATTEMPTED_REAL_FULL_PET_ACTION_IDS,
  REQUIRED_REAL_FULL_PET_ACTION_IDS,
  createBasicActionCoverage,
  getMissingRequiredRealActionIds
} = require('../../examples/plugins/creator-studio/lib/full-pet-basic-actions')

test('full-pet basic action policy keeps generation and qa requirements intentionally different', () => {
  assert.deepEqual(
    REQUIRED_REAL_FULL_PET_ACTION_IDS,
    ['idle']
  )
  assert.deepEqual(DIRECTIONAL_FULL_PET_ACTION_PAIRS, [{
    sourceActionId: 'running-right',
    derivedActionId: 'running-left'
  }])
  assert.equal(OPTIONAL_REAL_FULL_PET_ACTION_IDS.includes('waving'), true)
  assert.deepEqual(
    GENERATED_FULL_PET_ACTION_IDS,
    ['idle', 'running-right', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review']
  )
  assert.equal(GENERATED_FULL_PET_ACTION_IDS.includes('running-left'), false)
})

test('full-pet basic action policy keeps optional expansion order explicit without widening the default generation set', () => {
  assert.deepEqual(
    OPTIONAL_ATTEMPTED_REAL_FULL_PET_ACTION_IDS,
    ['waiting', 'running-right', 'running-left']
  )
  assert.deepEqual(
    FALLBACK_ONLY_FULL_PET_ACTION_IDS,
    ['jumping', 'failed', 'running', 'review']
  )

  const waitingPolicy = FULL_PET_ACTION_POLICY.find((entry) => entry.actionId === 'waiting')
  const wavingPolicy = FULL_PET_ACTION_POLICY.find((entry) => entry.actionId === 'waving')
  assert.equal(waitingPolicy.support, FULL_PET_ACTION_SUPPORT.OPTIONAL_ATTEMPTED_REAL)
  assert.equal(waitingPolicy.attemptGeneratedPose, false)
  assert.equal(waitingPolicy.expansionRank, 1)
  assert.equal(wavingPolicy.support, FULL_PET_ACTION_SUPPORT.REQUIRED_REAL)
  assert.equal(wavingPolicy.attemptGeneratedPose, true)
  assert.equal(GENERATED_FULL_PET_ACTION_IDS.includes('waiting'), false)
})

test('full-pet basic action coverage normalizes duplicate rows and computes missing required actions', () => {
  const coverage = createBasicActionCoverage([
    { actionId: 'idle', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: true, quality: 'base-preview' },
    { actionId: 'waving', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: true },
    { actionId: 'waving', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: true },
    { actionId: 'waiting', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: true }
  ])

  assert.equal(coverage.baseIdentityCoverage, true)
  assert.deepEqual(
    coverage.requiredRealActionIds,
    ['idle']
  )
  assert.deepEqual(coverage.realActionIds, [])
  assert.deepEqual(coverage.fallbackActionIds, ['idle', 'waving', 'waiting'])
  assert.deepEqual(
    coverage.missingRequiredActionIds,
    ['idle']
  )
  assert.deepEqual(
    coverage.requiredOfficialActionIds,
    ['idle']
  )
  assert.deepEqual(
    coverage.missingRequiredOfficialActionIds,
    ['idle']
  )
  assert.deepEqual(coverage.previewFallbackActionIds, ['idle', 'waving', 'waiting'])
  assert.equal(coverage.rows.find((row) => row.actionId === 'idle').quality, 'base-preview')
  assert.equal(coverage.rows.length, 4)
})

test('full-pet basic action qa keeps legacy compatibility when required coverage was never recorded', () => {
  assert.deepEqual(
    getMissingRequiredRealActionIds({
      realActionIds: ['idle'],
      missingRequiredActionIds: ['waving']
    }),
    []
  )
})

test('full-pet basic action qa treats official missing rows separately from legacy import blockers', () => {
  const coverage = createBasicActionCoverage([
    { actionId: 'idle', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: true, quality: 'base-preview' }
  ])

  assert.deepEqual(
    getMissingRequiredRealActionIds(coverage),
    ['idle']
  )
  assert.deepEqual(
    coverage.missingRequiredOfficialActionIds,
    ['idle']
  )
})

test('full-pet basic action qa recomputes missing required coverage when recorded metadata is incomplete', () => {
  assert.deepEqual(
    getMissingRequiredRealActionIds({
      requiredRealActionIds: ['idle', 'waving'],
      realActionIds: ['idle'],
      missingRequiredActionIds: []
    }),
    ['waving']
  )
})

test('full-pet basic action coverage records available and safely omitted actions', () => {
  const coverage = createBasicActionCoverage([
    { actionId: 'idle', quality: 'row-real' },
    { actionId: 'waving', quality: 'row-real' }
  ], [{
    actionId: 'running-right',
    ok: false,
    failureConditions: ['identity-descriptor-distance-high']
  }])

  assert.deepEqual(coverage.requiredRealActionIds, ['idle'])
  assert.deepEqual(coverage.availableActionIds, ['idle', 'waving'])
  assert.equal(coverage.omittedActionIds.includes('running-right'), true)
  assert.deepEqual(coverage.actionAvailability['running-right'], {
    available: false,
    reason: 'identity-descriptor-distance-high'
  })
  assert.deepEqual(coverage.actionAvailability.idle, {
    available: true,
    quality: 'row-real'
  })
})
