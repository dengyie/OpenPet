const test = require('node:test')
const assert = require('node:assert/strict')

const { createPetPackManifestFromActions } = require('../../src/main/pet-pack/importer')

test('creates a normalized pet pack manifest from generated action metadata', () => {
  const manifest = createPetPackManifestFromActions({
    id: 'cat',
    displayName: 'Cat',
    defaultAction: 'idle',
    clickAction: 'eat',
    actions: [
      { id: 'idle', sprite: 'sprites/idle.png', frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453 },
      { id: 'eat', sprite: 'sprites/eat.png', frameCount: 16, frameMs: 85, frameWidth: 381, frameHeight: 253 }
    ]
  })

  assert.equal(manifest.id, 'cat')
  assert.equal(manifest.defaultAction, 'idle')
  assert.equal(manifest.clickAction, 'eat')
  assert.deepEqual(manifest.actions.map((action) => action.kind), ['idle', 'click'])
})
