const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')

const {
  extractRowStripFrames,
  mirrorRowFrames
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-extractor')

const CELL_WIDTH = 192
const CELL_HEIGHT = 208

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-row-extractor-'))

const createSyntheticStrip = async ({ outputPath, frameCount, blocks }) => {
  const composites = blocks.map((block, index) => ({
    input: Buffer.from(
      `<svg width="${CELL_WIDTH}" height="${CELL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${block.x}" y="${block.y}" width="${block.width}" height="${block.height}" fill="${block.color}"/>
      </svg>`
    ),
    left: index * CELL_WIDTH,
    top: 0
  }))
  await sharp({
    create: {
      width: frameCount * CELL_WIDTH,
      height: CELL_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)
}

const inspectFrame = async (framePath) => {
  const { data, info } = await sharp(framePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let visiblePixels = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visiblePixels += 1
  }
  return { info, visiblePixels }
}

const alphaAt = async ({ framePath, x, y }) => {
  const { data, info } = await sharp(framePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return data[(y * info.width + x) * info.channels + 3]
}

test('extracts official row strip into fixed 192x208 png frames', async () => {
  const tempDir = createTempDir()
  const stripPath = path.join(tempDir, 'waving-strip.png')
  const outputDir = path.join(tempDir, 'frames')
  await createSyntheticStrip({
    outputPath: stripPath,
    frameCount: 4,
    blocks: [
      { x: 20, y: 90, width: 24, height: 36, color: '#ff0000' },
      { x: 42, y: 88, width: 24, height: 36, color: '#00ff00' },
      { x: 64, y: 86, width: 24, height: 36, color: '#0000ff' },
      { x: 86, y: 84, width: 24, height: 36, color: '#ff00ff' }
    ]
  })

  const result = await extractRowStripFrames({
    stripPath,
    actionId: 'waving',
    outputDir
  })

  assert.equal(result.actionId, 'waving')
  assert.equal(result.frames.length, 4)
  assert.deepEqual(result.frames.map((frame) => path.basename(frame.path)), ['01.png', '02.png', '03.png', '04.png'])
  assert.equal(result.extraction.sourceWidth, CELL_WIDTH * 4)
  assert.equal(result.extraction.sourceHeight, CELL_HEIGHT)
  for (const frame of result.frames) {
    const inspected = await inspectFrame(frame.path)
    assert.equal(inspected.info.width, CELL_WIDTH)
    assert.equal(inspected.info.height, CELL_HEIGHT)
    assert.equal(inspected.visiblePixels, 24 * 36)
  }
})

test('mirrors running-left frames horizontally without reversing frame order', async () => {
  const tempDir = createTempDir()
  const stripPath = path.join(tempDir, 'running-right-strip.png')
  const sourceDir = path.join(tempDir, 'running-right')
  const mirrorDir = path.join(tempDir, 'running-left')
  await createSyntheticStrip({
    outputPath: stripPath,
    frameCount: 8,
    blocks: Array.from({ length: 8 }, (_, index) => ({
      x: 10 + index,
      y: 80,
      width: 18,
      height: 30,
      color: index === 0 ? '#ff0000' : '#0000ff'
    }))
  })
  const source = await extractRowStripFrames({
    stripPath,
    actionId: 'running-right',
    outputDir: sourceDir
  })

  const mirrored = await mirrorRowFrames({
    frames: source.frames,
    actionId: 'running-left',
    outputDir: mirrorDir
  })

  assert.equal(mirrored.actionId, 'running-left')
  assert.equal(mirrored.frames.length, 8)
  assert.equal(await alphaAt({ framePath: mirrored.frames[0].path, x: CELL_WIDTH - 11, y: 85 }), 255)
  assert.equal(await alphaAt({ framePath: mirrored.frames[0].path, x: 10, y: 85 }), 0)
  assert.equal(await alphaAt({ framePath: mirrored.frames[1].path, x: CELL_WIDTH - 12, y: 85 }), 255)
  assert.deepEqual(mirrored.frames.map((frame) => path.basename(frame.path)), [
    '01.png',
    '02.png',
    '03.png',
    '04.png',
    '05.png',
    '06.png',
    '07.png',
    '08.png'
  ])
})

test('rejects official row strip paths outside data directory', async () => {
  const dataDir = createTempDir()
  const outsideDir = createTempDir()
  const stripPath = path.join(outsideDir, 'waving-strip.png')
  await createSyntheticStrip({
    outputPath: stripPath,
    frameCount: 4,
    blocks: [
      { x: 20, y: 90, width: 24, height: 36, color: '#ff0000' },
      { x: 42, y: 88, width: 24, height: 36, color: '#00ff00' },
      { x: 64, y: 86, width: 24, height: 36, color: '#0000ff' },
      { x: 86, y: 84, width: 24, height: 36, color: '#ff00ff' }
    ]
  })

  await assert.rejects(
    extractRowStripFrames({
      dataDir,
      stripPath,
      actionId: 'waving',
      outputDir: path.join(dataDir, 'runs', 'run-1', 'rows', 'waving', 'frames')
    }),
    /Official row strip path escaped/
  )
})

test('rejects official row frame output paths outside data directory', async () => {
  const dataDir = createTempDir()
  const outsideDir = createTempDir()
  const stripPath = path.join(dataDir, 'runs', 'run-1', 'rows', 'waving', 'strip.png')
  fs.mkdirSync(path.dirname(stripPath), { recursive: true })
  await createSyntheticStrip({
    outputPath: stripPath,
    frameCount: 4,
    blocks: [
      { x: 20, y: 90, width: 24, height: 36, color: '#ff0000' },
      { x: 42, y: 88, width: 24, height: 36, color: '#00ff00' },
      { x: 64, y: 86, width: 24, height: 36, color: '#0000ff' },
      { x: 86, y: 84, width: 24, height: 36, color: '#ff00ff' }
    ]
  })

  await assert.rejects(
    extractRowStripFrames({
      dataDir,
      stripPath,
      actionId: 'waving',
      outputDir: path.join(outsideDir, 'waving-frames')
    }),
    /Official row frame output path escaped/
  )
})

test('rejects official row frame output paths through symlinks escaping data directory', async (t) => {
  const dataDir = createTempDir()
  const outsideDir = createTempDir()
  const linkPath = path.join(dataDir, 'linked-outside')
  const stripPath = path.join(dataDir, 'runs', 'run-1', 'rows', 'waving', 'strip.png')
  fs.mkdirSync(path.dirname(stripPath), { recursive: true })
  await createSyntheticStrip({
    outputPath: stripPath,
    frameCount: 4,
    blocks: [
      { x: 20, y: 90, width: 24, height: 36, color: '#ff0000' },
      { x: 42, y: 88, width: 24, height: 36, color: '#00ff00' },
      { x: 64, y: 86, width: 24, height: 36, color: '#0000ff' },
      { x: 86, y: 84, width: 24, height: 36, color: '#ff00ff' }
    ]
  })
  try {
    fs.symlinkSync(outsideDir, linkPath)
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }

  await assert.rejects(
    extractRowStripFrames({
      dataDir,
      stripPath,
      actionId: 'waving',
      outputDir: path.join(linkPath, 'waving-frames')
    }),
    /Official row frame output path escaped/
  )
})

test('rejects mirror source frame paths outside data directory', async () => {
  const dataDir = createTempDir()
  const outsideDir = createTempDir()
  const stripPath = path.join(outsideDir, 'running-right-strip.png')
  const sourceDir = path.join(outsideDir, 'running-right')
  await createSyntheticStrip({
    outputPath: stripPath,
    frameCount: 8,
    blocks: Array.from({ length: 8 }, (_, index) => ({
      x: 10 + index,
      y: 80,
      width: 18,
      height: 30,
      color: '#0000ff'
    }))
  })
  const source = await extractRowStripFrames({
    stripPath,
    actionId: 'running-right',
    outputDir: sourceDir
  })

  await assert.rejects(
    mirrorRowFrames({
      dataDir,
      frames: source.frames,
      actionId: 'running-left',
      outputDir: path.join(dataDir, 'runs', 'run-1', 'rows', 'running-left', 'frames')
    }),
    /Official row frame path escaped/
  )
})
