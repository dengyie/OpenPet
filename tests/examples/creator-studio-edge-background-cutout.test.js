const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const { removeOpaqueEdgeBackground } = require('../../examples/plugins/creator-studio/lib/edge-background-cutout')

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-edge-cutout-test-'))

const writeStripedBackgroundSubject = async (filePath) => {
  await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: { r: 252, g: 252, b: 250, alpha: 1 }
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="32" height="128" fill="#efefef" />
          <rect x="64" y="0" width="32" height="128" fill="#f4f4f4" />
          <circle cx="64" cy="68" r="28" fill="#d99a3e" />
          <circle cx="54" cy="60" r="4" fill="#3f8b40" />
          <circle cx="74" cy="60" r="4" fill="#3f8b40" />
        </svg>
      `),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(filePath)
}

test('edge background cutout clears RGB channels for transparent background pixels', async () => {
  const tempDir = makeTempDir()
  const sourcePath = path.join(tempDir, 'striped-source.png')
  await writeStripedBackgroundSubject(sourcePath)

  const result = await removeOpaqueEdgeBackground(sourcePath)

  assert.equal(result.removed, true)
  const { data, info } = await sharp(result.buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let transparentPixels = 0
  let transparentPixelsWithRgb = 0
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const index = pixel * info.channels
    if (data[index + 3] !== 0) continue
    transparentPixels += 1
    if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) {
      transparentPixelsWithRgb += 1
    }
  }

  assert.equal(transparentPixels > 0, true)
  assert.equal(transparentPixelsWithRgb, 0)
})
