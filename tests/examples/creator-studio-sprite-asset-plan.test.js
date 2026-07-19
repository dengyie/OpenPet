const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createSpriteAssetPlan
} = require('../../examples/plugins/creator-studio/lib/sprite-asset-plan')

const officialActions = [
  'idle',
  'running-right',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review'
]

test('sprite asset plan freezes official action policies and hashes expanded frame plans', () => {
  const plan = createSpriteAssetPlan({
    version: 1,
    revision: 1,
    character: { assetClass: 'grounded-compact-character' },
    actions: officialActions.map((actionId) => ({ actionId }))
  })

  assert.equal(Object.isFrozen(plan), true)
  assert.deepEqual(plan.actions.map((action) => action.actionId), officialActions)
  assert.equal(plan.actions.some((action) => action.actionId === 'running-left'), false)
  assert.deepEqual(plan.actions.find((action) => action.actionId === 'jumping').layout.unusedCells, [5])
  assert.equal(plan.actions.find((action) => action.actionId === 'jumping').anchorPolicy, 'action-relative-root-v1')
  assert.equal(plan.actions.find((action) => action.actionId === 'idle').componentPolicy, 'reference-guided-body-v1')
  assert.match(plan.actions[0].framePlanHash, /^[a-f0-9]{64}$/)
  assert.match(plan.hash, /^[a-f0-9]{64}$/)
})

test('sprite asset plan rejects free-form frames, duplicate actions, and illegal morphology', () => {
  assert.throws(() => createSpriteAssetPlan({ version: 1, revision: 1, character: { assetClass: 'grounded-compact-character' }, actions: [{ actionId: 'idle', framePoses: ['x'] }] }), /unknown field framePoses/)
  assert.throws(() => createSpriteAssetPlan({ version: 1, revision: 1, character: { assetClass: 'grounded-compact-character' }, actions: [{ actionId: 'idle' }, { actionId: 'idle' }] }), /duplicate action/)
  assert.throws(() => createSpriteAssetPlan({ version: 1, revision: 1, character: { assetClass: 'dragon' }, actions: [{ actionId: 'idle' }] }), /character assetClass is invalid/)
})
