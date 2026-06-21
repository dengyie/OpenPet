const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { getLegacyPetAnimations, loadPetPackFromDirectory, loadLegacyPetPack } = require('../../src/main/pet-pack/loader')
const { createMinimalWebp: createFixtureWebp } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')

const WRONG_SIZE_WEBP = Buffer.from(
  'UklGRmYBAABXRUJQVlA4IFoBAAAQJQCdASqAAaABPm02mkmkIyKhIAgAgA2JaW7hd2Ee3AAAFZu14uTkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk4UAAD+/w2D/90GWcNNv//6tD/1aH/q0P27AAAAAAAAAAAAAAAAAAAAAAAA',
  'base64'
)

const TRANSPARENT_FIXTURE_ATLAS_WEBP = Buffer.from([
  'UklGRpgAAABXRUJQVlA4TIsAAAAv/8XTEQcQEREAUKT//ymi/6n//e9///vf//73',
  'v//973//+9///ve///3vf//73//+97///e9///vf//73v//973//+9///ve///3',
  'vf//73//+97///e9///vf//73v//973//+9///ve///3vf//73//+97///e9///',
  'vf//73v//973//+9///q8CAA=='
].join(''), 'base64')

const createWebpHeader = ({ width, height }) => {
  const riffSize = 22
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(riffSize, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8X', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  buffer.writeUInt8(0, 20)
  buffer.writeUIntLE(width - 1, 24, 3)
  buffer.writeUIntLE(height - 1, 27, 3)
  return buffer
}

const createTruncatedVp8WebpHeader = ({ width, height }) => {
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(22, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8 ', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  buffer.writeUInt16LE(width, 26)
  buffer.writeUInt16LE(height, 28)
  return buffer
}

test('loads and normalizes a pet pack manifest from a directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-pet-pack-'))
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

test('loads a Codex-compatible pet manifest from a directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-pet-'))
  fs.writeFileSync(path.join(root, 'spritesheet.webp'), createFixtureWebp())
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: 'codex-cat',
    displayName: 'Codex Cat',
    description: 'A generated Codex pet.',
    spritesheetPath: 'spritesheet.webp'
  }))

  const pack = loadPetPackFromDirectory(root)

  assert.equal(pack.rootPath, root)
  assert.equal(pack.source.type, 'codex-pet')
  assert.equal(pack.manifest.id, 'codex-cat')
  assert.equal(pack.manifest.displayName, 'Codex Cat')
  assert.equal(pack.manifest.defaultAction, 'idle')
  assert.equal(pack.manifest.clickAction, 'waving')
  assert.deepEqual(pack.manifest.actions.map((action) => action.id), [
    'idle',
    'running-right',
    'running-left',
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review'
  ])
  assert.deepEqual(pack.manifest.actions[0], {
    id: 'idle',
    label: 'Idle',
    kind: 'idle',
    loop: true,
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

test('rejects Codex pet atlases without decodable visible pixels', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-pet-empty-atlas-'))
  fs.writeFileSync(path.join(root, 'spritesheet.webp'), TRANSPARENT_FIXTURE_ATLAS_WEBP)
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: 'codex-cat',
    displayName: 'Codex Cat',
    spritesheetPath: 'spritesheet.webp'
  }))

  assert.throws(
    () => loadPetPackFromDirectory(root),
    /Codex pet atlas must contain visible pixels/
  )
})

test('rejects Codex pet manifests with unsafe spritesheet paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-pet-unsafe-'))
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: 'codex-cat',
    displayName: 'Codex Cat',
    spritesheetPath: '../spritesheet.webp'
  }))

  assert.throws(
    () => loadPetPackFromDirectory(root),
    /spritesheetPath must be a safe relative path/
  )
})

test('rejects Codex pet atlases with unexpected dimensions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-pet-size-'))
  fs.writeFileSync(path.join(root, 'spritesheet.webp'), WRONG_SIZE_WEBP)
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: 'codex-cat',
    displayName: 'Codex Cat',
    spritesheetPath: 'spritesheet.webp'
  }))

  assert.throws(
    () => loadPetPackFromDirectory(root),
    /Codex pet atlas must be 1536x1872/
  )
})

test('rejects Codex pet atlases without image data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-pet-empty-webp-'))
  fs.writeFileSync(path.join(root, 'spritesheet.webp'), createWebpHeader({ width: 1536, height: 1872 }))
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: 'codex-cat',
    displayName: 'Codex Cat',
    spritesheetPath: 'spritesheet.webp'
  }))

  assert.throws(
    () => loadPetPackFromDirectory(root),
    /Codex pet atlas WebP image data could not be read/
  )
})

test('rejects Codex pet atlases with truncated VP8 image data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-pet-truncated-vp8-'))
  fs.writeFileSync(path.join(root, 'spritesheet.webp'), createTruncatedVp8WebpHeader({ width: 1536, height: 1872 }))
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: 'codex-cat',
    displayName: 'Codex Cat',
    spritesheetPath: 'spritesheet.webp'
  }))

  assert.throws(
    () => loadPetPackFromDirectory(root),
    /Codex pet atlas WebP image data could not be read/
  )
})

test('rejects Codex pet atlases that contain no visible pixels', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-pet-transparent-'))
  fs.writeFileSync(path.join(root, 'spritesheet.webp'), TRANSPARENT_FIXTURE_ATLAS_WEBP)
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: 'codex-cat',
    displayName: 'Codex Cat',
    spritesheetPath: 'spritesheet.webp'
  }))

  assert.throws(
    () => loadPetPackFromDirectory(root),
    /Codex pet atlas must contain visible pixels/
  )
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
    provenance: {
      sourceUrl: '',
      assetAuthor: '',
      license: '',
      licenseUrl: '',
      importedAt: '',
      originalFormat: ''
    },
    persona: null,
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

test('reads legacy animations config from disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-legacy-animations-'))
  const configPath = path.join(root, 'animations.json')
  fs.writeFileSync(configPath, JSON.stringify({
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [
      { id: 'idle', sprite: 'sprites/idle.png' },
      { id: 'wave', sprite: 'sprites/wave.png' }
    ]
  }))

  assert.deepEqual(getLegacyPetAnimations({ configPath }), {
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [
      { id: 'idle', sprite: 'sprites/idle.png' },
      { id: 'wave', sprite: 'sprites/wave.png' }
    ]
  })
})
