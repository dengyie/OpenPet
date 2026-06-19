const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createCursorAssetService } = require('../../src/main/services/cursor-asset-service')

test('cursor asset service deletes managed cursor files but leaves unrelated paths untouched', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-cursor-assets-'))
  const cursorDir = path.join(tempRoot, 'cursors')
  const sourceFile = path.join(tempRoot, 'cursor.png')
  const outsideFile = path.join(tempRoot, 'outside.png')

  fs.writeFileSync(
    sourceFile,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WHQr2QAAAAASUVORK5CYII=', 'base64')
  )
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

  fs.writeFileSync(
    sourceFile,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WHQr2QAAAAASUVORK5CYII=', 'base64')
  )

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
