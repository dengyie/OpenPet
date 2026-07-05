const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')

const { FULL_PET_ROW_QUALITY } = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
const { analyzeRowFrames } = require('../../examples/plugins/creator-studio/lib/full-pet-row-qa')

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-row-qa-'))

const writeFrame = async ({ outputPath, rects }) => {
  const body = rects.map((rect) => (
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${rect.color || '#ff0000'}"/>`
  )).join('')
  await sharp(Buffer.from(
    `<svg width="192" height="208" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
  ))
    .ensureAlpha()
    .png()
    .toFile(outputPath)
}

const writeFrames = async ({ outputDir, frameCount, createRects }) => {
  fs.mkdirSync(outputDir, { recursive: true })
  const frames = []
  for (let index = 0; index < frameCount; index += 1) {
    const framePath = path.join(outputDir, `${String(index + 1).padStart(2, '0')}.png`)
    await writeFrame({ outputPath: framePath, rects: createRects(index) })
    frames.push({ index, path: framePath })
  }
  return frames
}

test('varied stable official row becomes row-real', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'waving'),
    frameCount: 4,
    createRects: (index) => [
      { x: 74, y: 94, width: 42 + index * 2, height: 54, color: '#f6b73c' },
      { x: 88 + index * 4, y: 70 - index * 2, width: 10, height: 28 + index * 3, color: '#1c7ed6' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'waving',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.ROW_REAL)
  assert.equal(qa.frameCount, 4)
  assert.equal(qa.expectedFrameCount, 4)
  assert.equal(qa.uniqueFrameCount, 4)
  assert.deepEqual(qa.errors, [])
  assert.ok(qa.baselineDrift <= 30)
})

test('repeated static row is rejected', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'static'),
    frameCount: 6,
    createRects: () => [
      { x: 72, y: 96, width: 48, height: 58, color: '#f6b73c' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'idle',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.equal(qa.uniqueFrameCount, 1)
  assert.ok(qa.errors.includes('row_repeated_static'))
})

test('translated base-like content is rejected as transform-like', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'translated'),
    frameCount: 6,
    createRects: (index) => [
      { x: 58 + index * 4, y: 92, width: 56, height: 64, color: '#f6b73c' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'running',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.equal(qa.uniqueFrameCount, 6)
  assert.ok(qa.errors.includes('row_transform_like'))
})

test('approved mirror row keeps approved-mirror quality when varied and stable', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'mirror'),
    frameCount: 8,
    createRects: (index) => [
      { x: 62 + index, y: 98, width: 50 + (index % 3), height: 56, color: '#f6b73c' },
      { x: 82 + index * 2, y: 150 - (index % 2), width: 20, height: 10 + (index % 4), color: '#1c7ed6' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'running-left',
    frames,
    sourceKind: 'approved-mirror'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.APPROVED_MIRROR)
  assert.equal(qa.frameCount, 8)
  assert.equal(qa.expectedFrameCount, 8)
  assert.equal(qa.uniqueFrameCount, 8)
  assert.deepEqual(qa.errors, [])
})
