const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')

const { FULL_PET_ROW_QUALITY } = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
const { analyzeRowFrames } = require('../../examples/plugins/creator-studio/lib/full-pet-row-qa')
const { stabilizeRowFrames } = require('../../examples/plugins/creator-studio/lib/full-pet-row-stable-slots')

const CELL_WIDTH = 192
const CELL_HEIGHT = 208

const makeTempDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-row-stable-slots-'))

const writeFrame = async ({ outputPath, rects }) => {
  const body = rects.map((rect) => (
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${rect.color || '#ff0000'}"/>`
  )).join('')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await sharp(Buffer.from(
    `<svg width="${CELL_WIDTH}" height="${CELL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
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

test('stable-slots reduces extraction jitter while preserving real row variation', async () => {
  const dataDir = makeTempDataDir()
  const sourceDir = path.join(dataDir, 'runs', 'run-1', 'rows', 'waving', 'jittered')
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'rows', 'waving', 'stable')
  const offsets = [
    { x: 8, y: 2 },
    { x: 52, y: 40 },
    { x: 18, y: 16 },
    { x: 78, y: 58 }
  ]
  const frames = await writeFrames({
    outputDir: sourceDir,
    frameCount: 4,
    createRects: (index) => {
      const offset = offsets[index]
      return [
        { x: offset.x, y: offset.y + 58, width: 54 + index, height: 72 - index, color: '#f6b73c' },
        { x: offset.x + 28 + index * 4, y: offset.y + 34, width: 12, height: 28 + index * 3, color: '#1c7ed6' },
        { x: offset.x + 18, y: offset.y + 128 - (index % 2), width: 22 + index, height: 8, color: '#2f9e44' }
      ]
    }
  })

  const before = await analyzeRowFrames({
    actionId: 'waving',
    frames,
    sourceKind: 'row-strip'
  })

  assert.equal(before.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.equal(
    before.errors.includes('row_centroid_drift') || before.errors.includes('row_baseline_drift'),
    true
  )

  const result = await stabilizeRowFrames({
    dataDir,
    actionId: 'waving',
    frames,
    outputDir
  })
  const after = await analyzeRowFrames({
    actionId: 'waving',
    frames: result.frames,
    sourceKind: 'row-strip'
  })

  assert.equal(after.quality, FULL_PET_ROW_QUALITY.ROW_REAL)
  assert.equal(after.frameCount, 4)
  assert.equal(after.uniqueFrameCount, 4)
  assert.deepEqual(after.errors, [])
  assert.equal(result.stabilization.method, 'stable-slots')
  assert.equal(result.stabilization.frameWidth, CELL_WIDTH)
  assert.equal(result.stabilization.frameHeight, CELL_HEIGHT)
  assert.ok(after.centroidDrift < before.centroidDrift)
  assert.ok(after.baselineDrift < before.baselineDrift)
  assert.equal(fs.existsSync(path.join(outputDir, 'stable-slots-metadata.json')), true)
})

test('stable-slots does not make repeated static rows pass QA', async () => {
  const dataDir = makeTempDataDir()
  const frames = await writeFrames({
    outputDir: path.join(dataDir, 'rows', 'idle', 'static'),
    frameCount: 6,
    createRects: () => [
      { x: 64, y: 82, width: 58, height: 72, color: '#f6b73c' }
    ]
  })

  const result = await stabilizeRowFrames({
    dataDir,
    actionId: 'idle',
    frames,
    outputDir: path.join(dataDir, 'rows', 'idle', 'stable')
  })
  const qa = await analyzeRowFrames({
    actionId: 'idle',
    frames: result.frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(qa.errors.includes('row_repeated_static'))
})

test('stable-slots does not make transform-like translated rows pass QA', async () => {
  const dataDir = makeTempDataDir()
  const frames = await writeFrames({
    outputDir: path.join(dataDir, 'rows', 'running', 'translated'),
    frameCount: 6,
    createRects: (index) => [
      { x: 40 + index * 10, y: 84 + index * 4, width: 58, height: 72, color: '#f6b73c' }
    ]
  })

  const result = await stabilizeRowFrames({
    dataDir,
    actionId: 'running',
    frames,
    outputDir: path.join(dataDir, 'rows', 'running', 'stable')
  })
  const qa = await analyzeRowFrames({
    actionId: 'running',
    frames: result.frames,
    sourceKind: 'row-strip'
  })

  assert.equal(qa.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.equal(
    qa.errors.includes('row_repeated_static') || qa.errors.includes('row_transform_like'),
    true
  )
})

test('stable-slots rejects source frame paths outside dataDir', async () => {
  const dataDir = makeTempDataDir()
  const outsideDir = makeTempDataDir()
  const frames = await writeFrames({
    outputDir: outsideDir,
    frameCount: 4,
    createRects: () => [
      { x: 64, y: 82, width: 58, height: 72, color: '#f6b73c' }
    ]
  })

  await assert.rejects(
    stabilizeRowFrames({
      dataDir,
      actionId: 'waving',
      frames,
      outputDir: path.join(dataDir, 'rows', 'waving', 'stable')
    }),
    /Official row frame path escaped/
  )
})

test('stable-slots rejects output directories outside dataDir', async () => {
  const dataDir = makeTempDataDir()
  const outsideDir = makeTempDataDir()
  const frames = await writeFrames({
    outputDir: path.join(dataDir, 'rows', 'waving', 'source'),
    frameCount: 4,
    createRects: () => [
      { x: 64, y: 82, width: 58, height: 72, color: '#f6b73c' }
    ]
  })

  await assert.rejects(
    stabilizeRowFrames({
      dataDir,
      actionId: 'waving',
      frames,
      outputDir: path.join(outsideDir, 'stable')
    }),
    /Official row stable-slots output path escaped/
  )
})

test('stable-slots rejects output directories through symlinks escaping dataDir', async (t) => {
  const dataDir = makeTempDataDir()
  const outsideDir = makeTempDataDir()
  const linkPath = path.join(dataDir, 'linked-outside')
  const frames = await writeFrames({
    outputDir: path.join(dataDir, 'rows', 'waving', 'source'),
    frameCount: 4,
    createRects: () => [
      { x: 64, y: 82, width: 58, height: 72, color: '#f6b73c' }
    ]
  })
  try {
    fs.symlinkSync(outsideDir, linkPath)
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }

  await assert.rejects(
    stabilizeRowFrames({
      dataDir,
      actionId: 'waving',
      frames,
      outputDir: path.join(linkPath, 'stable')
    }),
    /Official row stable-slots output path escaped/
  )
})

test('stable-slots rejects frame count mismatches', async () => {
  const dataDir = makeTempDataDir()
  const frames = await writeFrames({
    outputDir: path.join(dataDir, 'rows', 'waving', 'source'),
    frameCount: 3,
    createRects: () => [
      { x: 64, y: 82, width: 58, height: 72, color: '#f6b73c' }
    ]
  })

  await assert.rejects(
    stabilizeRowFrames({
      dataDir,
      actionId: 'waving',
      frames,
      outputDir: path.join(dataDir, 'rows', 'waving', 'stable')
    }),
    /Official row stable-slots frame count mismatch/
  )
})
