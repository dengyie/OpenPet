const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildActionAnchorPrompt,
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
})

test('action anchor prompt locks identity while describing local motion', () => {
  const result = buildActionAnchorPrompt({
    characterBrief: 'Golden British Shorthair with green eyes.',
    referenceRole: 'character-anchor',
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
  assert.match(result.prompt, /same character identity/i)
  assert.match(result.prompt, /do not add.*collar.*scarf.*bell/is)
  assert.match(result.prompt, /stable lower-center root/i)
  assert.match(result.prompt, /body, head, feet\/base, and face remain locked/i)
  assert.match(result.prompt, /only the target limb changes/i)
})
