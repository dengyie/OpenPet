const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildActionAnchorPrompt,
  buildActionKeyframePrompt,
  buildActionSpriteRowPrompt,
  buildCharacterAnchorPrompt
} = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')

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

test('character anchor prompt is self-contained and reference authoritative', () => {
  const result = buildCharacterAnchorPrompt({
    characterBrief: 'Make the pet cheerful, but keep the real golden cat identity.',
    referenceRole: 'composite-reference-board'
  })

  assert.equal(result.role, 'character-anchor')
  assert.equal(result.version, 6)
  assert.equal(result.promptCompilerVersion, 3)
  assert.equal(result.promptCompiler.visualPlanVersion, 1)
  assert.equal(result.promptCompiler.providerImageTaskVersion, 3)
  assert.equal(result.promptCompiler.promptCompilerVersion, 3)
  assert.equal(result.promptCompiler.taskType, 'character-image')
  assert.equal(result.promptCompiler.stage, 'identity')
  assert.equal(result.promptCompiler.width, 1024)
  assert.equal(result.promptCompiler.height, 1024)
  assert.equal(result.promptCompiler.aspectRatio, '1:1')
  assert.equal(result.promptCompiler.referenceImageCount, 1)
  assert.equal(result.promptCompiler.requestedOutputCount, 1)
  assert.equal(result.promptCompiler.promptRenderer, 'gpt-image-2-v1')
  assert.equal(result.promptCompiler.modelCapabilityProfile, 'gpt-image-2-v1')
  assert.equal(result.promptCompiler.backgroundStrategy, 'solid-background-then-local-removal')
  assert.equal(result.promptCompiler.promptSafety, 'provider-neutral-model-aware')
  assert.match(result.prompt, /^DELIVERABLE\nCreate one complete full-body character image at 1024 x 1024 with a 1:1 aspect ratio\./)
  assert.match(result.prompt, /The main identity view controls canonical continuity, and the supporting identity views supplies visible identity details/i)
  assert.doesNotMatch(result.prompt, /Its the /i)
  assert.match(result.prompt, /every identity-bearing feature.*every body part or accessory visible in the reference/is)
  assert.doesNotMatch(result.prompt, /ACTION PLAN|FRAME PLAN|Do not preserve the neutral reference pose/i)
  assert.match(result.prompt, /lower center of the canvas/i)
  assert.match(result.prompt, /uniform opaque background color/i)
  assert.match(result.prompt, /downstream background removal/i)
  assert.doesNotMatch(result.prompt, /transparent/i)
  assertProviderNeutral(result.prompt)
})

test('action anchor prompt keeps identity while describing only visible motion', () => {
  const result = buildActionAnchorPrompt({
    referenceRole: 'source-action-reference-board',
    action: {
      actionId: 'waving',
      name: 'Waving',
      motionPrompt: 'Raise the viewer-right front paw and wave gently.',
      animationType: 'stationary_loop',
      animatedParts: ['viewer-right front paw'],
      lockedParts: ['head', 'torso', 'feet/base']
    }
  })

  assert.equal(result.role, 'action-anchor')
  assert.equal(result.actionId, 'waving')
  assert.match(result.prompt, /Change only the pose to this exact visible moment/i)
  assert.match(result.prompt, /selected visible waving appendage/i)
  assert.match(result.prompt, /head, torso, feet\/base/i)
  assert.match(result.prompt, /complete full-body action keyframe/i)
  assert.match(result.prompt, /ACTION PLAN/i)
  assert.match(result.prompt, /viewer-right front paw/i)
  assertProviderNeutral(result.prompt)
})

test('canonical prompts preserve visible source accessories', () => {
  const result = buildActionSpriteRowPrompt({
    action: {
      actionId: 'waving',
      name: 'Waving',
      motionPrompt: 'Wave one front paw.',
      frameCount: 4
    }
  })

  assert.match(result.prompt, /same visible accessories or garments when present/i)
  assert.match(result.prompt, /Do not invent, remove, duplicate, or redesign visible anatomy or accessories/i)
  assertProviderNeutral(result.prompt)
})

test('action sprite row prompt defines an exact reference-conditioned frame sheet', () => {
  const result = buildActionSpriteRowPrompt({
    referenceRole: 'keyframe-action-reference-board',
    action: {
      actionId: 'waving',
      name: 'Waving',
      motionPrompt: 'Raise the viewer-right front paw and wave gently.',
      animationType: 'stationary_loop',
      frameCount: 6,
      animatedParts: ['viewer-right front paw'],
      lockedParts: ['head', 'torso', 'feet/base']
    }
  })

  assert.equal(result.role, 'action-sprite-row')
  assert.equal(result.frameCount, 6)
  assert.match(result.prompt, /^DELIVERABLE\nCreate one 1536 x 1024 animation frame sheet with exactly 6 complete full-body character frames arranged in 3 columns and 2 rows\./)
  assert.match(result.prompt, /pose examples only for the action moments they visibly represent/i)
  assert.match(result.prompt, /Read cells left to right, then top to bottom/i)
  assert.match(result.prompt, /Cell 1 \(row 1 column 1\).*neutral anchored pose/is)
  assert.match(result.prompt, /Cell 3 \(row 1 column 3\).*greeting pose/is)
  assert.match(result.prompt, /Cell 6 \(row 2 column 3\).*starting pose/is)
  assert.match(result.prompt, /same viewpoint, character scale, subject lighting, and lower-center root/i)
  assert.match(result.prompt, /uniform opaque background color/i)
  assert.doesNotMatch(result.prompt, /transparent/i)
  assertProviderNeutral(result.prompt)
})

test('action keyframe prompts create separate start and peak images', () => {
  const action = {
    actionId: 'waving',
    name: 'Waving',
    motionPrompt: 'Wave with one front paw.',
    frameCount: 6
  }
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
  const result = buildActionSpriteRowPrompt({
    action: {
      actionId: 'dev8-provider-row-wave',
      motionPrompt: 'One front paw waves beside the face.',
      frameCount: 6
    }
  })

  assert.match(result.prompt, /Primary motion: the selected visible waving appendage/i)
  assert.match(result.prompt, /seamless stationary loop with a stable body root/i)
  assert.doesNotMatch(result.prompt, /the requested moving part/i)
  assertProviderNeutral(result.prompt)
})

test('four-frame wave plans close the loop by returning to the start pose', () => {
  const result = buildActionSpriteRowPrompt({
    action: {
      actionId: 'waving',
      motionPrompt: 'Wave one front paw and return to idle.',
      frameCount: 4,
      loop: true
    }
  })

  assert.match(result.prompt, /Cell 3 .*wave peak/is)
  assert.match(result.prompt, /Cell 4 .*return.*starting pose/is)
  assert.doesNotMatch(result.prompt, /Cell 4 .*tilts slightly outward/is)
})

test('sparse running metadata produces a complete locomotion cycle', () => {
  const result = buildActionSpriteRowPrompt({
    action: {
      actionId: 'running',
      name: 'Running',
      motionPrompt: 'Run in place with a complete readable gait cycle.',
      frameCount: 8
    }
  })

  assert.match(result.prompt, /^DELIVERABLE\nCreate one 1536 x 1024 animation frame sheet with exactly 8 complete full-body character frames arranged in 4 columns and 2 rows\./)
  assert.match(result.prompt, /seamless in-place locomotion cycle/i)
  assert.match(result.prompt, /exactly 8 complete full-body character frames arranged in 4 columns and 2 rows/i)
  assert.match(result.prompt, /contact pose/i)
  assert.match(result.prompt, /passing pose/i)
  assert.match(result.prompt, /opposite contact pose/i)
  assert.match(result.prompt, /visible locomotion appendages and supporting body motion/i)
  assert.doesNotMatch(result.prompt, /\b(?:ears?|paws?|tails?|wings?|clothing)\b/i)
  assertProviderNeutral(result.prompt)
})

test('action identity takes precedence over incidental motion words', () => {
  const waving = buildActionSpriteRowPrompt({
    action: {
      actionId: 'waving',
      name: 'Waving',
      motionPrompt: 'Stand still and wave one front paw.',
      frameCount: 4
    }
  })
  const jumping = buildActionKeyframePrompt({
    keyframeRole: 'peak',
    action: {
      actionId: 'jumping',
      name: 'Jumping',
      motionPrompt: 'Take a short running start, jump upward, then land.',
      frameCount: 5
    }
  })

  assert.match(waving.prompt, /seamless stationary loop with a stable body root/i)
  assert.match(waving.prompt, /selected visible waving appendage/i)
  assert.match(jumping.prompt, /airborne peak/i)
  assert.match(jumping.prompt, /return to the same baseline/i)
  assertProviderNeutral(waving.prompt)
  assertProviderNeutral(jumping.prompt)
})
