const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeGenerationTask } = require('../../examples/plugins/creator-studio/lib/generation-task')

const fullPetTask = (pipeline) => ({
  mode: 'full-pet',
  ...(pipeline ? { pipeline } : {}),
  targetPet: 'new',
  styleSource: 'referenceImage',
  actions: [{ actionId: 'idle', name: 'Idle', frameCount: 6, loop: true }]
})

test('full-pet production tasks accept the explicit quality-first pipeline', () => {
  assert.equal(normalizeGenerationTask(fullPetTask('quality-first-v1')).pipeline, 'quality-first-v1')
})

test('conversation full-pet entry points stamp the quality-first pipeline', () => {
  const { draftGenerationTask } = require('../../examples/plugins/creator-studio/lib/conversation-wizard')
  assert.equal(draftGenerationTask({ prompt: 'Create a full-pet character' }).generationTask.pipeline, 'quality-first-v1')
})

test('single-action tasks retain their dedicated legacy pipeline during full-pet cutover', () => {
  const task = normalizeGenerationTask({
    mode: 'single-action',
    targetPet: 'current',
    styleSource: 'referenceImage',
    actions: [{ actionId: 'wave', name: 'Wave', frameCount: 6 }]
  })
  assert.equal(task.pipeline, 'legacy-keyframe-v1')
})
