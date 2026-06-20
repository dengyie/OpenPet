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

test('cursor asset service estimates the hotspot from the first visible non-background pixel', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-hotspot-'))
  const sourcePath = path.join(root, 'arrow-cursor.png')
  const cursorDir = path.join(root, 'cursors')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="#ffffff"/>
      <path d="M13 8 L42 35 L28 36 L36 54 L27 58 L19 39 L8 49 Z" fill="#111827"/>
    </svg>
  `
  await sharp(Buffer.from(svg)).png().toFile(sourcePath)

  const service = createCursorAssetService({ cursorDir })
  const cursor = await service.importCursor(sourcePath)

  assert.equal(cursor.width, 64)
  assert.equal(cursor.height, 64)
  assert.equal(cursor.hotspotX, 13)
  assert.equal(cursor.hotspotY, 8)
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
  assert.equal(repaired.width, 64)
  assert.equal(repaired.height, 32)
})

test('cursor asset service scales repaired hotspots into the resized bitmap coordinate system', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-hotspot-scale-'))
  const assetPath = path.join(root, 'huge-arrow.png')
  const cursorDir = path.join(root, 'cursors')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
      <rect width="640" height="320" fill="#ffffff"/>
      <path d="M160 80 L440 220 L300 225 L350 300 L295 310 L250 230 L120 280 Z" fill="#111827"/>
    </svg>
  `
  await sharp(Buffer.from(svg)).png().toFile(assetPath)

  const service = createCursorAssetService({ cursorDir })
  const repaired = await service.repairCursor({
    enabled: true,
    assetPath,
    assetUrl: `file://${assetPath}`,
    fileName: 'huge-arrow.png',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  })

  assert.equal(repaired.width, 64)
  assert.equal(repaired.height, 32)
  assert.equal(repaired.hotspotX, 15)
  assert.equal(repaired.hotspotY, 8)
})

test('cursor asset service re-estimates hotspots after resizing even when the legacy hotspot was in bounds', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-hotspot-small-legacy-'))
  const assetPath = path.join(root, 'huge-arrow-small-legacy.png')
  const cursorDir = path.join(root, 'cursors')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
      <rect width="640" height="320" fill="#ffffff"/>
      <path d="M160 80 L440 220 L300 225 L350 300 L295 310 L250 230 L120 280 Z" fill="#111827"/>
    </svg>
  `
  await sharp(Buffer.from(svg)).png().toFile(assetPath)

  const service = createCursorAssetService({ cursorDir })
  const repaired = await service.repairCursor({
    enabled: true,
    assetPath,
    assetUrl: `file://${assetPath}`,
    fileName: 'huge-arrow-small-legacy.png',
    width: 640,
    height: 320,
    hotspotX: 12,
    hotspotY: 4
  })

  assert.equal(repaired.width, 64)
  assert.equal(repaired.height, 32)
  assert.equal(repaired.hotspotX, 15)
  assert.equal(repaired.hotspotY, 8)
})

test('cursor asset service repairs out-of-bounds legacy hotspots for browser-safe assets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-hotspot-bounds-'))
  const assetPath = path.join(root, 'safe-arrow.png')
  const cursorDir = path.join(root, 'cursors')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32">
      <rect width="64" height="32" fill="#ffffff"/>
      <path d="M16 8 L44 22 L30 23 L35 30 L29 31 L25 23 L12 28 Z" fill="#111827"/>
    </svg>
  `
  await sharp(Buffer.from(svg)).png().toFile(assetPath)

  const service = createCursorAssetService({ cursorDir })
  const repaired = await service.repairCursor({
    enabled: true,
    assetPath,
    assetUrl: `file://${assetPath}`,
    fileName: 'safe-arrow.png',
    width: 64,
    height: 32,
    hotspotX: 160,
    hotspotY: 80
  })

  assert.equal(repaired.assetPath, assetPath)
  assert.equal(repaired.hotspotX, 15)
  assert.equal(repaired.hotspotY, 8)
})

test('cursor asset service repairs legacy cursor metadata without rewriting browser-safe assets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-metadata-'))
  const assetPath = path.join(root, 'safe-cursor.png')
  const cursorDir = path.join(root, 'cursors')

  await sharp({
    create: {
      width: 48,
      height: 32,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).png().toFile(assetPath)

  const service = createCursorAssetService({ cursorDir })
  const repaired = await service.repairCursor({
    enabled: true,
    assetPath,
    assetUrl: `file://${assetPath}`,
    fileName: 'safe-cursor.png',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  })

  assert.equal(repaired.assetPath, assetPath)
  assert.equal(repaired.width, 48)
  assert.equal(repaired.height, 32)
})

test('cursor asset service repairs legacy zero hotspots from visible cursor content', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-hotspot-repair-'))
  const assetPath = path.join(root, 'safe-arrow.png')
  const cursorDir = path.join(root, 'cursors')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="#ffffff"/>
      <path d="M13 8 L42 35 L28 36 L36 54 L27 58 L19 39 L8 49 Z" fill="#111827"/>
    </svg>
  `
  await sharp(Buffer.from(svg)).png().toFile(assetPath)

  const service = createCursorAssetService({ cursorDir })
  const repaired = await service.repairCursor({
    enabled: true,
    assetPath,
    assetUrl: `file://${assetPath}`,
    fileName: 'safe-arrow.png',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  })

  assert.equal(repaired.assetPath, assetPath)
  assert.equal(repaired.hotspotX, 13)
  assert.equal(repaired.hotspotY, 8)
})
