const test = require('node:test')
const assert = require('node:assert/strict')

const { createActionService } = require('../../src/main/services/action-service')

test('action service returns legacy animation config as runtime actions', () => {
  const service = createActionService({
    getPetAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'eat',
      actions: [
        { id: 'idle', label: '待机', loop: true, sprite: 'sprites/idle.png' },
        { id: 'eat', label: '喂食', loop: false, sprite: 'sprites/eat.png' }
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
        frameCount: 1,
        frameMs: 100,
        frameWidth: 0,
        frameHeight: 0,
        sprite: 'sprites/idle.png'
      },
      {
        id: 'eat',
        label: '喂食',
        kind: 'click',
        loop: false,
        frameCount: 1,
        frameMs: 100,
        frameWidth: 0,
        frameHeight: 0,
        sprite: 'sprites/eat.png'
      }
    ]
  })
  assert.deepEqual(service.listActions().map((action) => action.id), ['idle', 'eat'])
  assert.equal(service.getAction('eat').label, '喂食')
})

test('action service can expose the normalized pet pack while preserving animation config shape', () => {
  const service = createActionService({
    loadPetPack: () => ({
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
      { id: 'idle', sprite: 'sprites/idle.png' },
      { id: 'eat', sprite: 'sprites/eat.png' }
    ]
  })
})
