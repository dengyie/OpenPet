const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildActionAnchorPrompt,
  buildActionKeyframePrompt,
  buildActionSpriteRowPrompt,
  buildCharacterAnchorPrompt
} = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')

test('character anchor prompt makes source image identity authoritative', () => {
  const result = buildCharacterAnchorPrompt({
    characterBrief: 'Make the pet cheerful, but keep the real golden cat identity.',
    referenceRole: 'composite-reference-board'
  })

  assert.equal(result.role, 'character-anchor')
  assert.match(result.prompt, /source image is the highest identity authority/i)
  assert.match(result.prompt, /If the written description conflicts with the reference image, follow the reference image/i)
  assert.match(result.prompt, /do not copy.*board layout/i)
  assert.match(result.prompt, /Preserve.*eyes.*markings.*proportions.*silhouette/is)
  assert.match(result.prompt, /same species/i)
  assert.match(result.prompt, /never output a dog, corgi, fox, mascot, or different animal/i)
  assert.match(result.prompt, /Do not add.*collar.*scarf.*bell/is)
  assert.match(result.prompt, /one full-body centered pet source image/i)
  assert.match(result.prompt, /neutral front-facing identity pose/i)
  assert.match(result.prompt, /Do not choose action pose panels.*paw up.*waving.*running.*stretching/is)
  assert.match(result.prompt, /front.*sitting.*identity.*authority/is)
})

test('action anchor prompt locks identity while guiding provider sprite-row generation', () => {
  const result = buildActionAnchorPrompt({
    characterBrief: 'Golden British Shorthair with green eyes.',
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
  assert.match(result.prompt, /Action ID: waving/)
  assert.match(result.prompt, /Raise the viewer-right front paw and wave gently/)
  assert.match(result.prompt, /original user source image is the highest identity authority/i)
  assert.match(result.prompt, /stitched board.*source identity panels.*action or pose panels/is)
  assert.match(result.prompt, /same character identity/i)
  assert.match(result.prompt, /Do not average, simplify, recolor, or reinterpret/i)
  assert.match(result.prompt, /do not add.*collar.*scarf.*bell/is)
  assert.match(result.prompt, /stable lower-center root/i)
  assert.match(result.prompt, /provider sprite-row generation/i)
  assert.match(result.prompt, /body, head, feet\/base, and face remain locked/i)
  assert.match(result.prompt, /only the target limb changes/i)
  assert.match(result.prompt, /waving or paw-up action.*single raised front paw/is)
})

test('canonical prompts preserve source accessories instead of forbidding them outright', () => {
  const result = buildActionSpriteRowPrompt({
    characterBrief: 'The exact black cat wearing its distinctive red collar.',
    action: {
      actionId: 'waving',
      name: 'Waving',
      motionPrompt: 'Wave one front paw.',
      frameCount: 4
    }
  })

  assert.match(result.prompt, /same.*accessories.*as the original user source image/is)
  assert.match(result.prompt, /new, extra, changed, or missing (?:collar|accessories)/i)
  assert.doesNotMatch(result.prompt, /Negative prompt:[^\n]*(?:^|, )collar(?:,|$)/i)
})

test('action sprite row prompt defines keyframed provider sprite sheet contract', () => {
  const result = buildActionSpriteRowPrompt({
    characterBrief: 'Use the exact golden shaded cat from the source image.',
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
  assert.equal(result.actionId, 'waving')
  assert.equal(result.frameCount, 6)
  assert.match(result.prompt, /complete transparent-background OpenPet sprite sheet/i)
  assert.match(result.prompt, /single local conditioning board/i)
  assert.match(result.prompt, /The conditioning board is guidance only, not deliverable output/i)
  assert.match(result.prompt, /original user source image.*highest identity authority/is)
  assert.match(result.prompt, /normalized start keyframe/is)
  assert.match(result.prompt, /normalized peak keyframe/is)
  assert.match(result.prompt, /fixed template.*clear whitespace.*safe padding.*shared lower-center root/is)
  assert.match(result.prompt, /6 animation frames/i)
  assert.match(result.prompt, /3 columns x 2 rows/i)
  assert.match(result.prompt, /equal-sized cells/i)
  assert.match(result.prompt, /one full-body pet per cell/i)
  assert.match(result.prompt, /unused grid cells.*empty.*transparent/i)
  assert.match(result.prompt, /single conditioning board/i)
  assert.match(result.prompt, /Generate the missing in-between frames/i)
  assert.match(result.prompt, /do not copy keyframes as repeated static cells/i)
  assert.match(result.prompt, /Frame 1.*start.*neutral/is)
  assert.match(result.prompt, /Frame 3.*peak.*fully raised/is)
  assert.match(result.prompt, /Frame 6.*return.*starting pose/is)
  assert.match(result.prompt, /original user source image is the highest identity authority/i)
  assert.match(result.prompt, /provider-generated start keyframe and peak\/end keyframe/i)
  assert.match(result.prompt, /Keep the body, head, torso, feet\/base, and lower-center root anchored/i)
  assert.match(result.prompt, /Only the viewer-right front paw should move noticeably/i)
  assert.match(result.prompt, /Do not copy.*reference labels.*presentation panels/is)
  assert.match(result.prompt, /Negative prompt:.*copied pseudo sprite sheet.*sprite sheet grid labels/is)
})

test('action keyframe prompt creates separate provider start and peak frames', () => {
  const start = buildActionKeyframePrompt({
    characterBrief: 'Exact golden cat identity.',
    referenceRole: 'source-identity-reference',
    keyframeRole: 'start',
    action: {
      actionId: 'waving',
      motionPrompt: 'Wave with one front paw.',
      frameCount: 6
    }
  })
  const peak = buildActionKeyframePrompt({
    characterBrief: 'Exact golden cat identity.',
    referenceRole: 'source-identity-reference',
    keyframeRole: 'peak',
    action: {
      actionId: 'waving',
      motionPrompt: 'Wave with one front paw.',
      frameCount: 6
    }
  })

  assert.equal(start.role, 'action-keyframe')
  assert.equal(start.keyframeRole, 'start')
  assert.match(start.prompt, /START FRAME/i)
  assert.match(start.prompt, /both front paws\/limbs down/i)
  assert.match(start.prompt, /no grid, no sprite sheet/i)

  assert.equal(peak.keyframeRole, 'peak')
  assert.match(peak.prompt, /PEAK\/END FRAME/i)
  assert.match(peak.prompt, /waving front paw.*clearly changed from neutral/is)
  assert.match(peak.prompt, /lower-center root remain stable/i)
  assert.match(peak.prompt, /no grid, no sprite sheet/i)
})

test('action sprite row prompt infers wave moving part when action metadata is sparse', () => {
  const result = buildActionSpriteRowPrompt({
    action: {
      actionId: 'dev8-provider-row-wave',
      motionPrompt: 'One front paw waves beside the face.',
      frameCount: 6
    }
  })

  assert.match(result.prompt, /Only the waving front paw should move noticeably/i)
  assert.doesNotMatch(result.prompt, /Only the the requested moving part/i)
  assert.match(result.prompt, /Animated parts:\n- waving front paw/i)
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

test('action sprite row prompt infers a complete locomotion contract for sparse running actions', () => {
  const result = buildActionSpriteRowPrompt({
    action: {
      actionId: 'running',
      name: 'Running',
      motionPrompt: 'Run in place with a complete readable gait cycle.',
      frameCount: 8
    }
  })

  assert.match(result.prompt, /Animation type: locomotion_loop/i)
  assert.match(result.prompt, /4 columns x 2 rows/i)
  assert.match(result.prompt, /contact pose/i)
  assert.match(result.prompt, /passing pose/i)
  assert.match(result.prompt, /opposite contact pose/i)
  assert.match(result.prompt, /legs.*locomotion parts/i)
  assert.doesNotMatch(result.prompt, /Only the the requested moving part/i)
})

test('action keyframe prompt infers airborne peak semantics for sparse jumping actions', () => {
  const result = buildActionKeyframePrompt({
    keyframeRole: 'peak',
    action: {
      actionId: 'jumping',
      name: 'Jumping',
      motionPrompt: 'Jump upward and land back on the same baseline.',
      frameCount: 5
    }
  })

  assert.match(result.prompt, /Animation type: vertical_bounce/i)
  assert.match(result.prompt, /airborne peak/i)
  assert.match(result.prompt, /return.*baseline/i)
})

test('action identity takes precedence over incidental motion words in the description', () => {
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

  assert.match(waving.prompt, /Animation type: stationary_loop/i)
  assert.match(waving.prompt, /waving front paw/i)
  assert.match(jumping.prompt, /Animation type: vertical_bounce/i)
  assert.match(jumping.prompt, /airborne peak/i)
})
