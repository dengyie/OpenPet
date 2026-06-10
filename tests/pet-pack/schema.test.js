const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizePetPackManifest } = require('../../src/main/pet-pack/schema')

test('normalizes a minimal pet pack manifest with defaults', () => {
  const manifest = normalizePetPackManifest({
    id: 'cat',
    displayName: 'Cat',
    actions: [
      {
        id: 'idle',
        sprite: 'sprites/idle.png',
        frameCount: 16,
        frameMs: 95
      }
    ]
  })

  assert.deepEqual(manifest, {
    schemaVersion: 1,
    id: 'cat',
    displayName: 'Cat',
    version: '1.0.0',
    defaultAction: 'idle',
    clickAction: 'idle',
    actions: [
      {
        id: 'idle',
        label: 'idle',
        kind: 'idle',
        loop: false,
        frameCount: 16,
        frameMs: 95,
        frameWidth: 0,
        frameHeight: 0,
        sprite: 'sprites/idle.png'
      }
    ]
  })
})

test('rejects manifests without actions', () => {
  assert.throws(
    () => normalizePetPackManifest({ id: 'cat', actions: [] }),
    /at least one action/
  )
})
