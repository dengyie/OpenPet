const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const { createCursorAssetService } = require('../../src/main/services/cursor-asset-service')

const writeTinyCursor = async (targetPath, background = { r: 255, g: 255, b: 255, alpha: 1 }) => {
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background
    }
  }).png().toFile(targetPath)
}

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

  assert.equal(path.extname(cursor.assetPath), '.png')
  assert.equal(metadata.width, 64)
  assert.equal(metadata.height, 64)
  assert.match(cursor.assetUrl, /^file:\/\//)
  assert.equal(cursor.width, 64)
  assert.equal(cursor.height, 64)
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
    fileName: 'old-cursor.png',
    hotspotX: 0,
    hotspotY: 0
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

test('cursor asset service deletes managed cursor files but leaves unrelated paths untouched', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-assets-'))
  const cursorDir = path.join(tempRoot, 'cursors')
  const sourceFile = path.join(tempRoot, 'cursor.png')
  const outsideFile = path.join(tempRoot, 'outside.png')

  await writeTinyCursor(sourceFile)
  fs.writeFileSync(outsideFile, 'keep-me')

  const service = createCursorAssetService({ cursorDir })
  const imported = await service.importCursor(sourceFile)

  assert.equal(fs.existsSync(imported.assetPath), true)
  service.deleteAssets([imported.assetPath, outsideFile, 'builtin://kitty'])

  assert.equal(fs.existsSync(imported.assetPath), false)
  assert.equal(fs.existsSync(outsideFile), true)
})

test('cursor asset service assigns unique cursor ids even when the same source image is imported twice', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-assets-'))
  const cursorDir = path.join(tempRoot, 'cursors')
  const sourceFile = path.join(tempRoot, 'cursor.png')

  await writeTinyCursor(sourceFile, { r: 255, g: 0, b: 255, alpha: 1 })

  const service = createCursorAssetService({ cursorDir })
  const firstImport = await service.importCursor(sourceFile)
  const secondImport = await service.importCursor(sourceFile)

  assert.notEqual(firstImport.id, secondImport.id)
  assert.equal(firstImport.assetPath, secondImport.assetPath)
})

test('cursor asset service rejects .cur files because the picker only supports PNG and WEBP images', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-assets-'))
  const cursorDir = path.join(tempRoot, 'cursors')
  const sourceFile = path.join(tempRoot, 'cursor.cur')

  fs.writeFileSync(sourceFile, 'not-a-supported-cursor-image')

  const service = createCursorAssetService({ cursorDir })

  await assert.rejects(
    () => service.importCursor(sourceFile),
    /Cursor image must be a \.png or \.webp file/
  )
})
