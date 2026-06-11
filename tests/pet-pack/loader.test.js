const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadPetPackFromDirectory, loadLegacyPetPack } = require('../../src/main/pet-pack/loader')

test('loads and normalizes a pet pack manifest from a directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-pet-pack-'))
  fs.mkdirSync(path.join(root, 'sprites'))
  fs.writeFileSync(path.join(root, 'sprites', 'idle.png'), '')
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: 'cat',
    displayName: 'Cat',
    defaultAction: 'idle',
    actions: [
      { id: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
    ]
  }))

  const pack = loadPetPackFromDirectory(root)

  assert.equal(pack.rootPath, root)
  assert.equal(pack.manifest.id, 'cat')
  assert.equal(pack.manifest.defaultAction, 'idle')
  assert.equal(pack.manifest.actions[0].sprite, 'sprites/idle.png')
})

test('fills legacy animation defaults before strict manifest normalization', () => {
  const pack = loadLegacyPetPack({
    id: 'legacy-cat',
    displayName: 'Legacy Cat',
    getPetAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'eat',
      actions: [
        { id: 'idle', label: '待机', loop: true, sprite: 'sprites/idle.png' },
        { id: 'eat', label: '喂食', loop: false, sprite: 'sprites/eat.png' }
      ]
    })
  })

  assert.deepEqual(pack.manifest.actions.map((action) => ({
    id: action.id,
    frameCount: action.frameCount,
    frameMs: action.frameMs,
    frameWidth: action.frameWidth,
    frameHeight: action.frameHeight
  })), [
    { id: 'idle', frameCount: 1, frameMs: 100, frameWidth: 1, frameHeight: 1 },
    { id: 'eat', frameCount: 1, frameMs: 100, frameWidth: 1, frameHeight: 1 }
  ])
})

test('converts legacy animation config into a pet pack manifest', () => {
  const pack = loadLegacyPetPack({
    id: 'legacy-cat',
    displayName: 'Legacy Cat',
    getPetAnimations: () => ({
      defaultAction: 'bai_no_bg',
      clickAction: 'eat_no_bg',
      actions: [
        {
          id: 'bai_no_bg',
          label: '待机',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/bai_no_bg.png'
        },
        {
          id: 'eat_no_bg',
          label: '喂食',
          loop: false,
          frameCount: 16,
          frameMs: 85,
          frameWidth: 381,
          frameHeight: 253,
          sprite: 'cat_anime/sprites/eat_no_bg.png'
        }
      ]
    })
  })

  assert.deepEqual(pack.manifest, {
    schemaVersion: 1,
    id: 'legacy-cat',
    displayName: 'Legacy Cat',
    version: '1.0.0',
    defaultAction: 'bai_no_bg',
    clickAction: 'eat_no_bg',
    actions: [
      {
        id: 'bai_no_bg',
        label: '待机',
        kind: 'idle',
        loop: true,
        frameCount: 16,
        frameMs: 95,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/bai_no_bg.png'
      },
      {
        id: 'eat_no_bg',
        label: '喂食',
        kind: 'click',
        loop: false,
        frameCount: 16,
        frameMs: 85,
        frameWidth: 381,
        frameHeight: 253,
        sprite: 'cat_anime/sprites/eat_no_bg.png'
      }
    ]
  })
  assert.equal(pack.source.type, 'legacy-cat-anime')
})
