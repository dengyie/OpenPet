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

test('recolor-only frames are rejected as missing locomotion motion', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'recolor-running'),
    frameCount: 6,
    createRects: (index) => [
      { x: 62, y: 94, width: 68, height: 72, color: `hsl(${index * 45}, 70%, 55%)` },
      { x: 78, y: 166, width: 16, height: 18, color: `hsl(${index * 45}, 70%, 45%)` },
      { x: 108, y: 166, width: 16, height: 18, color: `hsl(${index * 45}, 70%, 45%)` }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'running',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.equal(qa.alphaMaskUniqueFrameCount, 1)
  assert.ok(qa.errors.includes('row_locomotion_motion_missing'))
})

test('recolor-only waving is rejected when the silhouette never moves', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'recolor-waving'),
    frameCount: 4,
    createRects: (index) => [
      { x: 62, y: 92, width: 68, height: 78, color: '#f6b73c' },
      { x: 128, y: 70, width: 14, height: 42, color: `hsl(${index * 36}, 65%, 45%)` }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'waving',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.equal(qa.alphaMaskUniqueFrameCount, 1)
  assert.ok(qa.errors.includes('row_waving_motion_missing'))
})

test('upper-body-only motion is rejected for running rows', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'upper-only-running'),
    frameCount: 6,
    createRects: (index) => [
      { x: 62, y: 96, width: 68, height: 70, color: '#f6b73c' },
      { x: 78, y: 166, width: 16, height: 18, color: '#d49a2d' },
      { x: 108, y: 166, width: 16, height: 18, color: '#d49a2d' },
      { x: 128 + index * 3, y: 70 - index, width: 12, height: 32 + index, color: '#1c7ed6' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'running',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.equal(qa.lowerAlphaMaskUniqueFrameCount, 1)
  assert.ok(qa.errors.includes('row_locomotion_lower_body_motion_missing'))
})

test('running rejects trivial one-pixel lower-body changes as fake gait motion', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'pixel-running'),
    frameCount: 6,
    createRects: (index) => [
      { x: 62, y: 92, width: 68, height: 78, color: '#f6b73c' },
      { x: 78, y: 170, width: 16, height: 16, color: '#d49a2d' },
      { x: 108, y: 170, width: 16, height: 16, color: '#d49a2d' },
      { x: 96 + index, y: 186, width: 1, height: 1, color: '#1c7ed6' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'running',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(qa.errors.includes('row_locomotion_lower_body_motion_missing'))
  assert.equal(qa.motion.lower.averageChangedRatio < 0.01, true)
})

test('jumping rows require a real vertical pose progression', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'flat-jump'),
    frameCount: 5,
    createRects: (index) => [
      { x: 66 - index, y: 96, width: 60 + index * 2, height: 72, color: '#f6b73c' },
      { x: 86 + index * 2, y: 70, width: 12, height: 24 + index, color: '#1c7ed6' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'jumping',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(qa.errors.includes('row_vertical_motion_missing'))
})

test('jumping rows must land back near the starting baseline', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'no-landing-jump'),
    frameCount: 5,
    createRects: (index) => [
      { x: 66, y: 104 - (index * 10), width: 60, height: 72, color: '#f6b73c' },
      { x: 86, y: 78 - (index * 10), width: 12, height: 24, color: '#1c7ed6' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'jumping',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(qa.errors.includes('row_vertical_return_missing'))
  assert.equal(qa.verticalMotion.returnDrift >= 30, true)
})

test('official rows reject nearly opaque frames even with a tiny transparent gutter', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'nearly-opaque'),
    frameCount: 4,
    createRects: (index) => [
      { x: 2, y: 2, width: 188, height: 204, color: '#f6b73c' },
      { x: 20 + index, y: 20, width: 6, height: 6, color: '#1c7ed6' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'waving',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(qa.errors.includes('row_opaque_coverage') || qa.errors.includes('row_frame_touches_edge'))
  assert.equal(qa.maxAlphaCoverage > 0.9, true)
})

test('official rows reject large same-color identity silhouette redesigns', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'shape-drift'),
    frameCount: 4,
    createRects: (index) => index % 2 === 0
      ? [
          { x: 76, y: 70, width: 48, height: 110, color: '#f6b73c' },
          { x: 124, y: 82, width: 28, height: 34, color: '#f6b73c' }
        ]
      : [
          { x: 54, y: 96, width: 104, height: 52, color: '#f6b73c' },
          { x: 88, y: 58, width: 36, height: 38, color: '#f6b73c' }
        ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'waving',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(qa.errors.includes('row_identity_shape_drift'))
  assert.equal(qa.motion.identityCore.maxChangedRatio > 0.4, true)
})

test('official rows reject foreground colors that conflict with provider keyframe identity', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'wrong-identity-wave'),
    frameCount: 4,
    createRects: (index) => [
      { x: 68, y: 92, width: 60, height: 76, color: '#3157d5' },
      { x: 126 + index * 3, y: 68 - index, width: 12, height: 32 + index * 2, color: '#2b48b8' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'waving',
    frames,
    sourceKind: 'row-strip',
    identityReferenceMeanRgb: { r: 216, g: 160, b: 78 }
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(qa.errors.includes('row_identity_reference_mismatch'))
  assert.ok(qa.identityReference.maxMeanRgbDistance > 120)
})

test('official rows reject cropped frames that touch the output boundary', async () => {
  const tempDir = createTempDir()
  const frames = await writeFrames({
    outputDir: path.join(tempDir, 'cropped-wave'),
    frameCount: 4,
    createRects: (index) => [
      { x: 0, y: 72, width: 72 + index * 2, height: 94, color: '#f6b73c' },
      { x: 70 + index * 3, y: 60, width: 14, height: 34 + index, color: '#1c7ed6' }
    ]
  })

  const qa = await analyzeRowFrames({
    actionId: 'waving',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(qa.errors.includes('row_frame_touches_edge'))
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
