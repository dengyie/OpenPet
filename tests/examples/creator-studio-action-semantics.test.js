const test = require('node:test')
const assert = require('node:assert/strict')

const {
  expandMotionPreset,
  getDefaultMotionPresetId
} = require('../../examples/plugins/creator-studio/lib/action-semantics')

test('official motion presets expand into exact frame plans', () => {
  const running = expandMotionPreset({
    actionId: 'running-right',
    motionPresetId: 'running-right-gait-v1',
    motionParameters: { intensity: 'normal', leadSide: 'viewer-left' },
    frameCount: 8
  })

  assert.equal(running.framePlan.length, 8)
  assert.deepEqual(running.semanticChecks, ['contact', 'down', 'passing', 'up', 'opposite-contact', 'opposite-down', 'opposite-passing', 'loop-close'])
  assert.match(running.framePlan[0], /contact/i)
  assert.match(running.framePlan[7], /loop/i)
  assert.match(running.hash, /^[a-f0-9]{64}$/)
  assert.equal(getDefaultMotionPresetId('jumping'), 'jumping-five-phase-v1')
})

test('official motion presets reject free-form, unknown, and reordered contracts', () => {
  assert.throws(() => expandMotionPreset({ actionId: 'running-right', motionPresetId: 'made-up', frameCount: 8 }), /Unsupported motion preset/)
  assert.throws(() => expandMotionPreset({ actionId: 'running-right', motionPresetId: 'running-right-gait-v1', frameCount: 6 }), /requires 8 frames/)
  assert.throws(() => expandMotionPreset({ actionId: 'running-right', motionPresetId: 'running-right-gait-v1', motionParameters: { prompt: 'free form' }, frameCount: 8 }), /unknown motion parameter/)
})
