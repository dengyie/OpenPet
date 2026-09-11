const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { loadPetPackFromDirectory } = require('../../apps/desktop/src/pet/pet-pack/loader')

const BUNDLED_PACKS_DIR = path.join(__dirname, '..', '..', 'assets', 'pet-packs')
const EXPECTED_BUNDLED_PACKS = ['chispa', 'doro', 'duodong']

test('bundled codex pet assets are present and loadable', () => {
  for (const packId of EXPECTED_BUNDLED_PACKS) {
    const packRoot = path.join(BUNDLED_PACKS_DIR, packId)
    assert.equal(fs.existsSync(path.join(packRoot, 'pet.json')), true, `${packId} pet.json should exist`)
    assert.equal(fs.existsSync(path.join(packRoot, 'spritesheet.webp')), true, `${packId} spritesheet should exist`)

    const pack = loadPetPackFromDirectory(packRoot)

    assert.equal(pack.manifest.id, packId)
    assert.equal(pack.source.type, 'codex-pet')
    assert.equal(pack.manifest.actions.length, 9)
    assert.equal(pack.manifest.actions[0].frameWidth, 192)
    assert.equal(pack.manifest.actions[0].frameHeight, 208)
    assert.equal(pack.manifest.actions[0].atlas.columns, 8)
    assert.equal(pack.manifest.actions[0].atlas.rows, 9)
  }
})
