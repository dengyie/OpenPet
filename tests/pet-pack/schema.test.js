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
        frameMs: 95,
        frameWidth: 191,
        frameHeight: 453
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
        frameWidth: 191,
        frameHeight: 453,
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

test('rejects actions with invalid runtime numbers', () => {
  const baseManifest = {
    id: 'cat',
    actions: [
      {
        id: 'idle',
        sprite: 'sprites/idle.png',
        frameCount: 16,
        frameMs: 95,
        frameWidth: 191,
        frameHeight: 453
      }
    ]
  }

  assert.throws(
    () => normalizePetPackManifest({
      ...baseManifest,
      actions: [{ ...baseManifest.actions[0], frameCount: 0 }]
    }),
    /frameCount/
  )
  assert.throws(
    () => normalizePetPackManifest({
      ...baseManifest,
      actions: [{ ...baseManifest.actions[0], frameMs: 6000 }]
    }),
    /frameMs/
  )
  assert.throws(
    () => normalizePetPackManifest({
      ...baseManifest,
      actions: [{ ...baseManifest.actions[0], frameWidth: Number.NaN }]
    }),
    /frameWidth/
  )
  assert.throws(
    () => normalizePetPackManifest({
      ...baseManifest,
      actions: [{ ...baseManifest.actions[0], frameHeight: -1 }]
    }),
    /frameHeight/
  )
})

test('rejects unsafe sprite paths', () => {
  assert.throws(
    () => normalizePetPackManifest({
      id: 'cat',
      actions: [
        {
          id: 'idle',
          sprite: '../secrets.png',
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453
        }
      ]
    }),
    /safe relative path/
  )
})
