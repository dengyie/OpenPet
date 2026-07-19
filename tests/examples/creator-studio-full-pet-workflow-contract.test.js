const test = require('node:test')
const assert = require('node:assert/strict')

const {
  FULL_PET_COMMAND_SHUTDOWN_GRACE_MS,
  FULL_PET_COMMAND_TIMEOUT_MS,
  FULL_PET_WORKFLOW_MAX_DURATION_MS
} = require('../../examples/plugins/creator-studio/lib/full-pet-workflow-contract')

test('quality-first full-pet workflow reserves twelve hours plus shutdown grace', () => {
  assert.equal(FULL_PET_WORKFLOW_MAX_DURATION_MS, 43_200_000)
  assert.equal(FULL_PET_COMMAND_SHUTDOWN_GRACE_MS, 300_000)
  assert.equal(FULL_PET_COMMAND_TIMEOUT_MS, 43_500_000)
})
