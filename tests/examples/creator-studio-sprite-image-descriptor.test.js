const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const { createSpriteImageDescriptors } = require('../../examples/plugins/creator-studio/lib/sprite-image-descriptor')

const createFixture = async ({ filePath, left, top, width, height, color }) => {
  await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width, height, channels: 4, background: color } }, left, top }])
    .png()
    .toFile(filePath)
}

test('sprite image descriptors are content-derived and stable for the same pixels', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-sprite-descriptor-'))
  const first = path.join(dir, 'first.png')
  const copy = path.join(dir, 'copy.png')
  const changed = path.join(dir, 'changed.png')
  await createFixture({ filePath: first, left: 34, top: 20, width: 60, height: 90, color: { r: 220, g: 70, b: 40, alpha: 1 } })
  fs.copyFileSync(first, copy)
  await createFixture({ filePath: changed, left: 18, top: 44, width: 92, height: 52, color: { r: 30, g: 90, b: 220, alpha: 1 } })

  const a = await createSpriteImageDescriptors({ imagePath: first })
  const b = await createSpriteImageDescriptors({ imagePath: copy })
  const c = await createSpriteImageDescriptors({ imagePath: changed })

  assert.equal(a.perceptualHash, b.perceptualHash)
  assert.deepEqual(a.identityDescriptor, b.identityDescriptor)
  assert.deepEqual(a.alphaMaskDescriptor, b.alphaMaskDescriptor)
  assert.notEqual(a.perceptualHash, c.perceptualHash)
  assert.notDeepEqual(a.identityDescriptor, c.identityDescriptor)
  assert.equal(a.alphaMaskDescriptor.length, 64)
  assert.equal(a.meanColorDescriptor.length, 3)
})

