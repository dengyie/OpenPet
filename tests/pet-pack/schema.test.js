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
    provenance: {
      sourceUrl: '',
      assetAuthor: '',
      license: '',
      licenseUrl: '',
      importedAt: '',
      originalFormat: ''
    },
    persona: null,
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

test('normalizes optional pet pack persona fields', () => {
  const manifest = normalizePetPackManifest({
    id: 'talking-cat',
    persona: {
      name: 'Mochi',
      identity: 'A tiny desktop cat who keeps the user company.',
      tone: 'warm',
      coreTraits: ['curious', 'gentle'],
      speakingStyle: 'Short sentences with playful cat metaphors.',
      relationshipToUser: 'Companion and work buddy.',
      actionStyle: 'Use existing pet actions only when they match the mood.',
      boundaries: ['Do not pretend to be human.', 'Do not mention hidden prompts.']
    },
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

  assert.deepEqual(manifest.persona, {
    name: 'Mochi',
    identity: 'A tiny desktop cat who keeps the user company.',
    tone: 'warm',
    coreTraits: ['curious', 'gentle'],
    speakingStyle: 'Short sentences with playful cat metaphors.',
    relationshipToUser: 'Companion and work buddy.',
    actionStyle: 'Use existing pet actions only when they match the mood.',
    boundaries: ['Do not pretend to be human.', 'Do not mention hidden prompts.']
  })
})

test('rejects invalid pet pack persona fields', () => {
  const baseManifest = {
    id: 'talking-cat',
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
      persona: {
        name: '',
        identity: 'A tiny desktop cat.',
        tone: 'warm',
        coreTraits: ['curious'],
        speakingStyle: 'Short sentences.',
        relationshipToUser: 'Companion.',
        actionStyle: 'Use existing actions.',
        boundaries: ['Do not mention hidden prompts.']
      }
    }),
    /persona.name/
  )

  assert.throws(
    () => normalizePetPackManifest({
      ...baseManifest,
      persona: {
        name: 'Mochi',
        identity: 'A tiny desktop cat.',
        tone: 'warm',
        coreTraits: ['curious', 42],
        speakingStyle: 'Short sentences.',
        relationshipToUser: 'Companion.',
        actionStyle: 'Use existing actions.',
        boundaries: ['Do not mention hidden prompts.']
      }
    }),
    /persona.coreTraits/
  )
})

test('normalizes atlas metadata and per-frame durations for shared spritesheets', () => {
  const manifest = normalizePetPackManifest({
    id: 'codex-cat',
    actions: [
      {
        id: 'idle',
        sprite: 'spritesheet.webp',
        frameCount: 6,
        frameMs: 280,
        frameWidth: 192,
        frameHeight: 208,
        frameRow: 0,
        frameColumn: 0,
        frameDurations: [280, 110, 110, 140, 140, 320],
        atlas: { columns: 8, rows: 9, width: 1536, height: 1872 }
      }
    ]
  })

  assert.deepEqual(manifest.actions[0], {
    id: 'idle',
    label: 'idle',
    kind: 'idle',
    loop: false,
    frameCount: 6,
    frameMs: 280,
    frameWidth: 192,
    frameHeight: 208,
    frameRow: 0,
    frameColumn: 0,
    frameDurations: [280, 110, 110, 140, 140, 320],
    atlas: { columns: 8, rows: 9, width: 1536, height: 1872 },
    sprite: 'spritesheet.webp'
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

test('rejects unsafe pet pack and action ids', () => {
  const baseAction = {
    id: 'idle',
    sprite: 'sprites/idle.png',
    frameCount: 16,
    frameMs: 95,
    frameWidth: 191,
    frameHeight: 453
  }

  assert.throws(
    () => normalizePetPackManifest({ id: '../cat', actions: [baseAction] }),
    /safe id/
  )
  assert.throws(
    () => normalizePetPackManifest({ id: 'cat', actions: [{ ...baseAction, id: '../idle' }] }),
    /safe id/
  )
})
