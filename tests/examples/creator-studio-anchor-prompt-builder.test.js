const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildActionAnchorPrompt,
  buildActionKeyframePrompt,
  buildActionSpriteRowPrompt,
  buildCharacterAnchorPrompt
} = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')
const { createProviderImageTask } = require('../../examples/plugins/creator-studio/lib/provider-image-task')

const assertProviderNeutral = (prompt) => {
  assert.doesNotMatch(prompt, /\bOpenPet\b/i)
  assert.doesNotMatch(prompt, /\bProvider\b/i)
  assert.doesNotMatch(prompt, /\bbackend\b/i)
  assert.doesNotMatch(prompt, /\b(?:run|action)[-_ ]?id\b/i)
  assert.doesNotMatch(prompt, /\breference[-_ ]?role\b/i)
  assert.doesNotMatch(prompt, /\bcheckpoint\b/i)
  assert.doesNotMatch(prompt, /\bmultipart\b/i)
  assert.doesNotMatch(prompt, /(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\//i)
}

test('quality-first frame-sheet image task uses square canvas and strict action policies', () => {
  const task = createProviderImageTask({
    taskType: 'action-frame-sheet',
    stage: 'final',
    sheet: { frameCount: 8, columns: 4, rows: 2 },
    referenceRole: 'action-anchor-grid',
    action: { name: 'in-place gait', moment: 'alternating contact cycle', movingParts: ['locomotion limbs'], lockedParts: ['identity'], loopIntent: 'closed loop', framePlan: ['contact', 'down', 'passing', 'up', 'opposite contact', 'opposite down', 'opposite passing', 'loop close'] },
    actionClass: 'grounded-locomotion',
    anchorPolicy: 'compact-contact-root-v1',
    componentPolicy: 'reference-guided-body-v1',
    effectPolicy: 'forbid-detached-effects',
    motionPresetId: 'running-right-gait-v1',
    framePlanVersion: 1
  })

  assert.deepEqual(task.canvas, { width: 1024, height: 1024, aspectRatio: '1:1' })
  assert.equal(task.actionClass, 'grounded-locomotion')
  assert.equal(task.anchorPolicy, 'compact-contact-root-v1')
  assert.equal(task.componentPolicy, 'reference-guided-body-v1')
  assert.equal(task.effectPolicy, 'forbid-detached-effects')
  assert.equal(task.motionPresetId, 'running-right-gait-v1')
  assert.equal(task.framePlanVersion, 1)
})

test('quality-first frame-sheet prompt keeps strict policy evidence and gpt image 2 capabilities', () => {
  const result = buildActionSpriteRowPrompt({
    model: 'gpt-image-2',
    referenceRole: 'action-reference-board',
    action: {
      actionId: 'running-right',
      name: 'running right',
      animationType: 'locomotion_loop',
      frameCount: 8,
      actionClass: 'grounded-locomotion',
      anchorPolicy: 'compact-contact-root-v1',
      componentPolicy: 'reference-guided-body-v1',
      effectPolicy: 'forbid-detached-effects',
      motionPresetId: 'running-right-gait-v1',
      framePlanVersion: 1
    }
  })

  assert.equal(result.promptCompiler.modelCapabilityProfile, 'gpt-image-2-v1')
  assert.equal(result.promptCompiler.backgroundStrategy, 'solid-background-then-local-removal')
  assert.equal(result.promptCompiler.actionClass, 'grounded-locomotion')
  assert.equal(result.promptCompiler.anchorPolicy, 'compact-contact-root-v1')
  assert.equal(result.promptCompiler.componentPolicy, 'reference-guided-body-v1')
  assert.equal(result.promptCompiler.effectPolicy, 'forbid-detached-effects')
  assert.equal(result.promptCompiler.motionPresetId, 'running-right-gait-v1')
  assert.equal(result.promptCompiler.framePlanVersion, 1)
  assert.doesNotMatch(result.prompt, /transparent/i)
})

test('quality-first frame-sheet rejects a non-square provider canvas', () => {
  assert.throws(() => createProviderImageTask({
    taskType: 'action-frame-sheet',
    stage: 'final',
    canvas: { width: 1536, height: 1024 },
    sheet: { frameCount: 8, columns: 4, rows: 2 },
    action: { name: 'gait', framePlan: Array.from({ length: 8 }, (_, index) => `frame ${index + 1}`) },
    actionClass: 'grounded-locomotion',
    anchorPolicy: 'compact-contact-root-v1',
    componentPolicy: 'reference-guided-body-v1',
    effectPolicy: 'forbid-detached-effects',
    motionPresetId: 'running-right-gait-v1',
    framePlanVersion: 1
  }), (error) => error?.code === 'image_prompt_contract_invalid' && /square 1024/i.test(error.message))
})

test('character anchor prompt is self-contained and reference authoritative', () => {
  const result = buildCharacterAnchorPrompt({ referenceRole: 'composite-reference-board' })
  assert.equal(result.role, 'character-anchor')
  assert.equal(result.version, 6)
  assert.equal(result.promptCompilerVersion, 3)
  assert.equal(result.promptCompiler.visualPlanVersion, 1)
  assert.equal(result.promptCompiler.providerImageTaskVersion, 3)
  assert.equal(result.promptCompiler.promptRenderer, 'gpt-image-2-v1')
  assert.equal(result.promptCompiler.modelCapabilityProfile, 'gpt-image-2-v1')
  assert.equal(result.promptCompiler.backgroundStrategy, 'solid-background-then-local-removal')
  assert.match(result.prompt, /^DELIVERABLE\nCreate one complete full-body character image at 1024 x 1024 with a 1:1 aspect ratio\./)
  assert.match(result.prompt, /main identity view controls canonical continuity/i)
  assert.match(result.prompt, /every identity-bearing feature.*every body part or accessory visible/is)
  assert.match(result.prompt, /uniform opaque background color/i)
  assert.doesNotMatch(result.prompt, /transparent/i)
  assertProviderNeutral(result.prompt)
})

test('action anchor prompt keeps identity while describing only visible motion', () => {
  const result = buildActionAnchorPrompt({
    referenceRole: 'source-action-reference-board',
    action: { actionId: 'waving', name: 'Waving', motionPrompt: 'Raise the viewer-right front paw and wave gently.', animationType: 'stationary_loop', animatedParts: ['viewer-right front paw'], lockedParts: ['head', 'torso', 'feet/base'] }
  })
  assert.equal(result.role, 'action-anchor')
  assert.equal(result.actionId, 'waving')
  assert.match(result.prompt, /Change only the pose to this exact visible moment/i)
  assert.match(result.prompt, /selected visible waving appendage/i)
  assert.match(result.prompt, /head, torso, feet\/base/i)
  assert.match(result.prompt, /complete full-body action keyframe/i)
  assert.match(result.prompt, /ACTION PLAN/i)
  assertProviderNeutral(result.prompt)
})

test('canonical prompts preserve visible source accessories', () => {
  const result = buildActionSpriteRowPrompt({ action: { actionId: 'waving', name: 'Waving', motionPrompt: 'Wave one front paw.', frameCount: 4 } })
  assert.match(result.prompt, /same visible accessories or garments when present/i)
  assert.match(result.prompt, /Do not invent, remove, duplicate, or redesign visible anatomy or accessories/i)
  assertProviderNeutral(result.prompt)
})

test('action sprite row prompt defines an exact reference-conditioned frame sheet', () => {
  const result = buildActionSpriteRowPrompt({
    referenceRole: 'keyframe-action-reference-board',
    action: { actionId: 'waving', name: 'Waving', motionPrompt: 'Raise the viewer-right front paw and wave gently.', animationType: 'stationary_loop', frameCount: 6, animatedParts: ['viewer-right front paw'], lockedParts: ['head', 'torso', 'feet/base'] }
  })
  assert.equal(result.role, 'action-sprite-row')
  assert.equal(result.frameCount, 6)
  assert.match(result.prompt, /^DELIVERABLE\nCreate one complete animation frame sheet for Waving at 1536 x 1024 with exactly 6 complete full-body character frames arranged in 3 columns and 2 rows\./)
  assert.match(result.prompt, /use the pose examples for the starting pose, motion direction, and motion extreme/i)
  assert.match(result.prompt, /Read cells left to right, then top to bottom/i)
  assert.match(result.prompt, /Cell 1 \(row 1 column 1\).*neutral anchored pose/is)
  assert.match(result.prompt, /Cell 3 \(row 1 column 3\).*greeting pose/is)
  assert.match(result.prompt, /Cell 6 \(row 2 column 3\).*starting pose/is)
  assert.match(result.prompt, /same viewpoint, character scale, subject lighting, and lower-center root/i)
  assert.match(result.prompt, /uniform opaque background color/i)
  assert.doesNotMatch(result.prompt, /\.\./)
  assert.doesNotMatch(result.prompt, /transparent/i)
  assertProviderNeutral(result.prompt)
})

test('action keyframe prompts create separate start and peak images', () => {
  const action = { actionId: 'waving', name: 'Waving', motionPrompt: 'Wave with one front paw.', frameCount: 6 }
  const start = buildActionKeyframePrompt({ keyframeRole: 'start', action })
  const peak = buildActionKeyframePrompt({ keyframeRole: 'peak', action })
  assert.equal(start.keyframeRole, 'start')
  assert.equal(peak.keyframeRole, 'peak')
  assert.match(start.prompt, /full-body neutral pose with the body anchored/i)
  assert.match(peak.prompt, /selected visible waving appendage clearly changed from neutral and fully raised/i)
  assert.match(start.prompt, /uniform opaque background color/i)
  assert.match(peak.prompt, /uniform opaque background color/i)
  assert.doesNotMatch(start.prompt, /transparent/i)
  assert.doesNotMatch(peak.prompt, /transparent/i)
  assertProviderNeutral(start.prompt)
  assertProviderNeutral(peak.prompt)
})

test('sparse wave metadata still produces a complete moving-part contract', () => {
  const result = buildActionSpriteRowPrompt({ action: { actionId: 'dev8-provider-row-wave', motionPrompt: 'One front paw waves beside the face.', frameCount: 6 } })
  assert.match(result.prompt, /Primary motion: the selected visible waving appendage/i)
  assert.match(result.prompt, /seamless stationary loop with a stable body root/i)
  assert.doesNotMatch(result.prompt, /the requested moving part/i)
  assertProviderNeutral(result.prompt)
})

test('four-frame wave plans close the loop by returning to the start pose', () => {
  const result = buildActionSpriteRowPrompt({ action: { actionId: 'waving', motionPrompt: 'Wave one front paw and return to idle.', frameCount: 4, loop: true } })
  assert.match(result.prompt, /Cell 3 .*wave peak/is)
  assert.match(result.prompt, /Cell 4 .*return.*starting pose/is)
  assert.doesNotMatch(result.prompt, /Cell 4 .*tilts slightly outward/is)
})

test('official running metadata produces a complete stationary work-state cycle', () => {
  const result = buildActionSpriteRowPrompt({ action: { actionId: 'running', name: 'Running', motionPrompt: 'Active processing and scanning motion.', frameCount: 8 } })
  assert.match(result.prompt, /seamless stationary loop with a stable body root/i)
  assert.match(result.prompt, /processing|scanning|focused work-state/i)
  assert.match(result.prompt, /visible attention features/i)
  assert.doesNotMatch(result.prompt, /locomotion|gait|contact pose|passing pose/i)
  assertProviderNeutral(result.prompt)
})

test('action identity takes precedence over incidental motion words', () => {
  const waving = buildActionSpriteRowPrompt({ action: { actionId: 'waving', name: 'Waving', motionPrompt: 'Stand still and wave one front paw.', frameCount: 4 } })
  const jumping = buildActionKeyframePrompt({ keyframeRole: 'peak', action: { actionId: 'jumping', name: 'Jumping', motionPrompt: 'Take a short running start, jump upward, then land.', frameCount: 5 } })
  assert.match(waving.prompt, /seamless stationary loop with a stable body root/i)
  assert.match(waving.prompt, /selected visible waving appendage/i)
  assert.match(jumping.prompt, /airborne peak/i)
  assert.match(jumping.prompt, /return to the same baseline/i)
  assertProviderNeutral(waving.prompt)
  assertProviderNeutral(jumping.prompt)
})
