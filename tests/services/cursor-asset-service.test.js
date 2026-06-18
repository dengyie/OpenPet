const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const { createCursorAssetService } = require('../../src/main/services/cursor-asset-service')

test('cursor asset service resizes oversized bitmap cursors to browser-safe dimensions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-assets-'))
  const sourcePath = path.join(root, 'huge-cursor.png')
  const cursorDir = path.join(root, 'cursors')

  await sharp({
    create: {
      width: 1254,
      height: 1254,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 }
    }
  }).png().toFile(sourcePath)

  const service = createCursorAssetService({ cursorDir })
  const cursor = await service.importCursor(sourcePath)
  const metadata = await sharp(cursor.assetPath).metadata()

  assert.equal(cursor.enabled, true)
  assert.equal(cursor.fileName, 'huge-cursor.png')
  assert.equal(path.extname(cursor.assetPath), '.png')
  assert.equal(metadata.width, 64)
  assert.equal(metadata.height, 64)
  assert.match(cursor.assetUrl, /^file:\/\//)
})

test('cursor asset service repairs previously saved oversized bitmap cursors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-repair-'))
  const assetPath = path.join(root, 'old-cursor.png')
  const cursorDir = path.join(root, 'cursors')

  await sharp({
    create: {
      width: 256,
      height: 128,
      channels: 4,
      background: { r: 0, g: 128, b: 255, alpha: 1 }
    }
  }).png().toFile(assetPath)

  const service = createCursorAssetService({ cursorDir })
  const repaired = await service.repairCursor({
    enabled: true,
    assetPath,
    assetUrl: `file://${assetPath}`,
    fileName: 'old-cursor.png'
  })
  const metadata = await sharp(repaired.assetPath).metadata()

  assert.equal(repaired.enabled, true)
  assert.equal(repaired.fileName, 'old-cursor.png')
  assert.notEqual(repaired.assetPath, assetPath)
  assert.equal(metadata.width, 64)
  assert.equal(metadata.height, 32)
})
