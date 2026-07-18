const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildActionSpriteRowPrompt
} = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')
const {
  buildCharacterAnchorPrompt
} = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')
const {
  resolveImageModelCapabilities
} = require('../../examples/plugins/creator-studio/lib/image-model-capabilities')
const {
  createVisualPlan
} = require('../../examples/plugins/creator-studio/lib/visual-plan')

test('unknown image models use the conservative opaque cutout capability profile', () => {
  const profile = resolveImageModelCapabilities('grok-imagine-image')

  assert.equal(profile.supportsDirectTransparency, false)
  assert.equal(profile.cutoutStrategy, 'solid-background-then-local-removal')
  assert.equal(profile.promptRenderer, 'structured-image-edit-v1')
})

test('mixed product and visual briefs preserve visible appearance requirements', () => {
  const plan = createVisualPlan({
    appearanceIntent: [
      'Create a reusable desktop pet with a visible red scarf and soft watercolor rendering.'
    ]
  })

  assert.equal(plan.subject.mediumAndStyle.length, 1)
  assert.match(plan.subject.mediumAndStyle[0], /visible red scarf/i)
  assert.match(plan.subject.mediumAndStyle[0], /soft watercolor rendering/i)
  assert.doesNotMatch(plan.subject.mediumAndStyle[0], /reusable|desktop pet/i)
})

test('mixed brief cleanup preserves visual details on both sides of product language', () => {
  const plan = createVisualPlan({
    appearanceIntent: [
      'Create a fluffy orange reusable desktop pet rendered in hand-painted watercolor.'
    ]
  })

  assert.equal(plan.subject.mediumAndStyle.length, 1)
  assert.match(plan.subject.mediumAndStyle[0], /fluffy orange/i)
  assert.match(plan.subject.mediumAndStyle[0], /hand-painted watercolor/i)
  assert.doesNotMatch(plan.subject.mediumAndStyle[0], /reusable|desktop pet/i)
})

test('mixed brief cleanup keeps visual style before a later visual boundary', () => {
  const plan = createVisualPlan({
    appearanceIntent: [
      'Create a reusable desktop pet in soft watercolor style with a red scarf.'
    ]
  })

  assert.equal(plan.subject.mediumAndStyle.length, 1)
  assert.doesNotMatch(plan.subject.mediumAndStyle[0], /^(?:create|make|design|generate)\s+(?:at|for|in|on|with|as|of|to|from)\b/i)
  assert.match(plan.subject.mediumAndStyle[0], /soft watercolor style/i)
  assert.match(plan.subject.mediumAndStyle[0], /red scarf/i)
  assert.doesNotMatch(plan.subject.mediumAndStyle[0], /reusable|desktop pet/i)
})

test('mixed brief cleanup preserves visual residue without a boundary keyword', () => {
  const result = buildCharacterAnchorPrompt({
    model: 'gpt-image-2',
    appearanceIntent: [
      'Create a reusable plush watercolor character for the application.'
    ]
  })

  assert.match(result.prompt, /plush watercolor character/i)
  assert.doesNotMatch(result.prompt, /reusable|application/i)
  assert.ok(result.warnings.includes('visual_plan_product_language_removed'))
})

test('compiled prompts retain mixed brief visual details without product language', () => {
  const result = buildCharacterAnchorPrompt({
    model: 'grok-imagine-image',
    appearanceIntent: [
      'Create a reusable desktop pet with a visible red scarf and soft watercolor rendering.'
    ]
  })

  assert.match(result.prompt, /visible red scarf/i)
  assert.match(result.prompt, /soft watercolor rendering/i)
  assert.doesNotMatch(result.prompt, /reusable|desktop pet/i)
  assert.match(result.prompt, /uniform opaque background color/i)
  assert.ok(result.warnings.includes('visual_plan_product_language_removed'))
})

test('official running work state uses stationary processing motion instead of locomotion', () => {
  const result = buildActionSpriteRowPrompt({
    action: {
      actionId: 'running',
      name: 'Running',
      motionPrompt: 'Running motion',
      frameCount: 6,
      loop: true
    }
  })

  assert.equal(result.promptCompiler.frameBeatCount, 6)
  assert.match(result.prompt, /processing|focus|scanning/i)
  assert.match(result.prompt, /stable body root|root remains fixed/i)
  assert.doesNotMatch(result.prompt, /locomotion|gait|contact pose|passing pose/i)
})

test('official running-right action retains directional locomotion semantics', () => {
  const result = buildActionSpriteRowPrompt({
    action: {
      actionId: 'running-right',
      name: 'Running Right',
      motionPrompt: 'Directional movement to the right',
      frameCount: 8,
      loop: true
    }
  })

  assert.match(result.prompt, /locomotion/i)
  assert.match(result.prompt, /contact pose/i)
  assert.match(result.prompt, /passing pose/i)
})
