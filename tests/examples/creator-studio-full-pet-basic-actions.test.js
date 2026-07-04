const test = require('node:test')
const assert = require('node:assert/strict')

const {
  GENERATED_FULL_PET_ACTION_IDS,
  REQUIRED_REAL_FULL_PET_ACTION_IDS,
  createBasicActionCoverage,
  getMissingRequiredRealActionIds
} = require('../../examples/plugins/creator-studio/lib/full-pet-basic-actions')

test('full-pet basic action policy keeps generation and qa requirements intentionally different', () => {
  assert.deepEqual(REQUIRED_REAL_FULL_PET_ACTION_IDS, ['idle', 'waving'])
  assert.deepEqual(GENERATED_FULL_PET_ACTION_IDS, ['waving'])
})

test('full-pet basic action coverage normalizes duplicate rows and computes missing required actions', () => {
  const coverage = createBasicActionCoverage([
    { actionId: 'idle', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: false },
    { actionId: 'waving', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: true },
    { actionId: 'waving', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: true },
    { actionId: 'waiting', sourceActionId: 'base-pose', sourceRelativePath: 'runs/run-1/frames/base/0001.png', fallback: true }
  ])

  assert.deepEqual(coverage.requiredRealActionIds, ['idle', 'waving'])
  assert.deepEqual(coverage.realActionIds, ['idle'])
  assert.deepEqual(coverage.fallbackActionIds, ['waving', 'waiting'])
  assert.deepEqual(coverage.missingRequiredActionIds, ['waving'])
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
