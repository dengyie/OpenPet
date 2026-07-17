const test = require('node:test')
const assert = require('node:assert/strict')

const {
  HUMAN_REASON_CODES,
  QUALITY_GUIDANCE_PHRASES,
  createQualityGuidanceLines,
  resolveGuidanceReasonCodes
} = require('../../examples/plugins/creator-studio/lib/pet-generation-human-examples')

const createReasonCounts = (...reasonCodes) => Object.fromEntries(
  [...HUMAN_REASON_CODES].map((reasonCode) => [reasonCode, reasonCodes.includes(reasonCode) ? 1 : 0])
)

const createGlobalGuidance = (...reasonCodes) => ({
  reasonCounts: createReasonCounts(...reasonCodes),
  byActionId: {}
})

test('direction mismatch guidance is limited to locomotion actions', () => {
  const qualityGuidance = createGlobalGuidance('direction-mismatch')

  assert.deepEqual(resolveGuidanceReasonCodes({
    qualityGuidance,
    actionId: 'running-right',
    animationType: 'locomotion_loop'
  }), ['direction-mismatch'])

  for (const animationType of ['', 'stationary_loop', 'vertical_bounce', 'reaction', 'emote']) {
    assert.deepEqual(resolveGuidanceReasonCodes({
      qualityGuidance,
      actionId: 'waiting',
      animationType
    }), [], animationType || 'no animation type')
  }
})

test('baseline guidance is limited to grounded, stationary, locomotion, and bounce actions', () => {
  const qualityGuidance = createGlobalGuidance('baseline-instability')

  for (const animationType of ['stationary_loop', 'locomotion_loop', 'vertical_bounce']) {
    assert.deepEqual(resolveGuidanceReasonCodes({ qualityGuidance, animationType }), ['baseline-instability'])
  }
  for (const animationType of ['', 'pose_transition', 'reaction', 'emote']) {
    assert.deepEqual(resolveGuidanceReasonCodes({ qualityGuidance, animationType }), [])
  }
})

test('static and transform-only motion guidance require an animation type', () => {
  const qualityGuidance = createGlobalGuidance('static-motion', 'transform-only-motion')

  assert.deepEqual(resolveGuidanceReasonCodes({ qualityGuidance, animationType: '' }), [])
  assert.deepEqual(resolveGuidanceReasonCodes({
    qualityGuidance,
    animationType: 'stationary_loop'
  }), ['static-motion', 'transform-only-motion'])
})

test('identity, edge, background, and scale guidance remains globally applicable', () => {
  const globalReasons = [
    'identity-drift',
    'edge-contact',
    'background-contamination',
    'scale-instability'
  ]
  const qualityGuidance = createGlobalGuidance(...globalReasons)

  assert.deepEqual(resolveGuidanceReasonCodes({ qualityGuidance }), globalReasons)
  const lines = createQualityGuidanceLines({ qualityGuidance })
  assert.deepEqual(lines, globalReasons.map((reasonCode) => QUALITY_GUIDANCE_PHRASES[reasonCode]))
})

test('action-scoped guidance applies only to its matching action', () => {
  const qualityGuidance = {
    reasonCounts: createReasonCounts('semantic-mismatch'),
    byActionId: {
      waving: createReasonCounts('semantic-mismatch')
    }
  }

  assert.deepEqual(resolveGuidanceReasonCodes({
    qualityGuidance,
    actionId: 'waving',
    animationType: 'stationary_loop'
  }), ['semantic-mismatch'])
  assert.deepEqual(resolveGuidanceReasonCodes({
    qualityGuidance,
    actionId: 'waiting',
    animationType: 'stationary_loop'
  }), [])
})
