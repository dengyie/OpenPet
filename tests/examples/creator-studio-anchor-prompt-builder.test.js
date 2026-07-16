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
  assert.equal(result.version, 5)
  assert.equal(result.promptCompilerVersion, 2)
  assert.deepEqual(result.promptCompiler, {
    promptCompilerVersion: 2,
    taskType: 'character-image',
    stage: 'identity',
    width: 1024,
    height: 1024,
    aspectRatio: '1:1',
    referenceImageCount: 1,
    requestedOutputCount: 1,
    promptSafety: 'provider-neutral'
  })
  assert.match(result.prompt, /^Create exactly one 1024 x 1024 image with a 1:1 aspect ratio\./)
  assert.match(result.prompt, /main identity view and the supporting identity views/i)
  assert.match(result.prompt, /If written appearance details conflict with the image, follow the image/i)
  assert.match(result.prompt, /same face and eye design.*markings.*accessories.*body proportions.*rendering style/is)
  assert.match(result.prompt, /lower center of the canvas/i)
  assert.match(result.prompt, /transparent background/i)
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
  assert.match(result.prompt, /performing Waving/i)
  assert.match(result.prompt, /waving front paw/i)
  assert.match(result.prompt, /head, torso, feet\/base/i)
  assert.match(result.prompt, /clearest motion extreme/i)
  assert.match(result.prompt, /complete full-body character/i)
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

  assert.match(result.prompt, /same accessories and clothing when visible/i)
  assert.match(result.prompt, /same accessories and clothing when visible/i)
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
  assert.match(result.prompt, /^Create exactly one 1536 x 1024 image with a 3:2 aspect ratio\./)
  assert.match(result.prompt, /one identity view followed by ordered pose examples/i)
  assert.match(result.prompt, /exactly 6 full-body frames in 3 columns and 2 rows/i)
  assert.match(result.prompt, /left to right and then top to bottom/i)
  assert.match(result.prompt, /Frame 1: start pose.*neutral/is)
  assert.match(result.prompt, /Frame 3: peak pose.*fully raised/is)
  assert.match(result.prompt, /Frame 6: return pose.*starting pose/is)
  assert.match(result.prompt, /same lower-center root, viewpoint, scale, identity, lighting/i)
  assert.match(result.prompt, /unused cell completely empty and transparent/i)
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
  assert.match(start.prompt, /starting pose before the main motion/i)
  assert.match(peak.prompt, /waving front paw clearly changed from neutral and fully raised beside the face/i)
  assert.match(start.prompt, /one clean isolated full-body character on a transparent background/i)
  assert.match(peak.prompt, /one clean isolated full-body character on a transparent background/i)
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

  assert.match(result.prompt, /Animate these parts clearly: waving front paw/i)
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

  assert.match(result.prompt, /Frame 3:.*fully raised/is)
  assert.match(result.prompt, /Frame 4:.*return.*starting pose/is)
  assert.doesNotMatch(result.prompt, /Frame 4:.*tilts slightly outward/is)
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

  assert.match(result.prompt, /^Create exactly one 1536 x 1024 image with a 3:2 aspect ratio\./)
  assert.match(result.prompt, /seamless in-place locomotion cycle/i)
  assert.match(result.prompt, /exactly 8 full-body frames in 4 columns and 2 rows/i)
  assert.match(result.prompt, /contact pose/i)
  assert.match(result.prompt, /passing pose/i)
  assert.match(result.prompt, /opposite contact pose/i)
  assert.match(result.prompt, /legs, arms, wings, tail, and locomotion parts/i)
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
  assert.match(waving.prompt, /waving front paw/i)
  assert.match(jumping.prompt, /airborne peak/i)
  assert.match(jumping.prompt, /return to the same baseline/i)
  assertProviderNeutral(waving.prompt)
  assertProviderNeutral(jumping.prompt)
})
