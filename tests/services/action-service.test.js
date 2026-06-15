const test = require('node:test')
const assert = require('node:assert/strict')

const { createActionService } = require('../../src/main/services/action-service')

test('action service returns legacy animation config as runtime actions', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'eat',
      actions: [
        { id: 'idle', label: '待机', loop: true, frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453, sprite: 'sprites/idle.png' },
        { id: 'eat', label: '喂食', loop: false, frameCount: 16, frameMs: 85, frameWidth: 381, frameHeight: 253, sprite: 'sprites/eat.png' }
      ]
    })
  })

  assert.deepEqual(service.getConfig(), {
    defaultAction: 'idle',
    clickAction: 'eat',
    actions: [
      {
        id: 'idle',
        label: '待机',
        kind: 'idle',
        loop: true,
        frameCount: 16,
        frameMs: 95,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'file:///app/openpet/sprites/idle.png'
      },
      {
        id: 'eat',
        label: '喂食',
        kind: 'click',
        loop: false,
        frameCount: 16,
        frameMs: 85,
        frameWidth: 381,
        frameHeight: 253,
        sprite: 'file:///app/openpet/sprites/eat.png'
      }
    ]
  })
  assert.deepEqual(service.listActions().map((action) => action.id), ['idle', 'eat'])
  assert.equal(service.getAction('eat').label, '喂食')
})

test('action service can expose the normalized pet pack while preserving animation config shape', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadPetPack: () => ({
      rootPath: '/packs/cat',
      manifest: {
        id: 'cat',
        displayName: 'Cat',
        defaultAction: 'idle',
        clickAction: 'eat',
        actions: [
          { id: 'idle', sprite: 'sprites/idle.png' },
          { id: 'eat', sprite: 'sprites/eat.png' }
        ]
      }
    })
  })

  assert.equal(service.getPetPack().manifest.id, 'cat')
  assert.deepEqual(service.getConfig(), {
    defaultAction: 'idle',
    clickAction: 'eat',
    actions: [
      { id: 'idle', sprite: 'file:///packs/cat/sprites/idle.png' },
      { id: 'eat', sprite: 'file:///packs/cat/sprites/eat.png' }
    ]
  })
})

test('action service resolves active pet pack sprites for the desktop renderer', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadPetPack: () => ({
      rootPath: '/app/openpet/assets/pet-packs/duodong',
      manifest: {
        id: 'duodong',
        displayName: '多栋',
        defaultAction: 'idle',
        clickAction: 'waving',
        actions: [
          {
            id: 'idle',
            label: 'Idle',
            sprite: 'spritesheet.webp',
            frameWidth: 192,
            frameHeight: 208,
            atlas: { columns: 8, rows: 9 }
          }
        ]
      }
    })
  })

  assert.equal(
    service.getConfig().actions[0].sprite,
    'file:///app/openpet/assets/pet-packs/duodong/spritesheet.webp'
  )
})

test('action service can expose preview-safe file urls for sprites', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        { id: 'idle', label: '待机', frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453, sprite: 'cat_anime/sprites/idle.png' }
      ]
    })
  })

  assert.deepEqual(service.getPreviewConfig().actions.map((action) => ({
    id: action.id,
    sprite: action.sprite,
    previewSprite: action.previewSprite
  })), [
    {
      id: 'idle',
      sprite: 'file:///app/openpet/cat_anime/sprites/idle.png',
      previewSprite: 'file:///app/openpet/cat_anime/sprites/idle.png'
    }
  ])
})
