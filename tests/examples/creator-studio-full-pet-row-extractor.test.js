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

const createOpaqueGrid = async ({ outputPath, actionId = 'jumping', includeUnusedCell = false }) => {
  const frameCount = actionId === 'jumping' ? 5 : 4
  const columns = actionId === 'jumping' ? 3 : 2
  const rows = 2
  const composites = Array.from({ length: frameCount + (includeUnusedCell ? 1 : 0) }, (_entry, index) => ({
    input: Buffer.from(
      `<svg width="${CELL_WIDTH}" height="${CELL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${CELL_WIDTH}" height="${CELL_HEIGHT}" fill="#faf8f4"/>
        <rect x="${58 + (index % 3)}" y="${88 - (index % 4)}" width="${58 + (index % 4)}" height="76" fill="#d89b45"/>
      </svg>`
    ),
    left: (index % columns) * CELL_WIDTH,
    top: Math.floor(index / columns) * CELL_HEIGHT
  }))
  await sharp({
    create: {
      width: columns * CELL_WIDTH,
      height: rows * CELL_HEIGHT,
      channels: 4,
      background: { r: 250, g: 248, b: 244, alpha: 1 }
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

test('extracts opaque provider grids only after removing the edge background', async () => {
  const tempDir = createTempDir()
  const stripPath = path.join(tempDir, 'jumping-grid.png')
  const outputDir = path.join(tempDir, 'jumping')
  await createOpaqueGrid({ outputPath: stripPath })

  const result = await extractRowStripFrames({
    stripPath,
    actionId: 'jumping',
    outputDir,
    layout: { columns: 3, rows: 2 }
  })

  assert.equal(result.frames.length, 5)
  for (const frame of result.frames) {
    assert.equal(await alphaAt({ framePath: frame.path, x: 0, y: 0 }), 0)
    const inspected = await inspectFrame(frame.path)
    assert.equal(inspected.visiblePixels < CELL_WIDTH * CELL_HEIGHT * 0.5, true)
  }
})

test('rejects visible characters in unused provider grid cells', async () => {
  const tempDir = createTempDir()
  const stripPath = path.join(tempDir, 'jumping-extra-cell-grid.png')
  await createOpaqueGrid({ outputPath: stripPath, includeUnusedCell: true })

  await assert.rejects(
    extractRowStripFrames({
      stripPath,
      actionId: 'jumping',
      outputDir: path.join(tempDir, 'jumping-extra'),
      layout: { columns: 3, rows: 2 }
    }),
    /unused grid cell contains visible content/i
  )
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


test('idle extraction applies cross-frame registration lock for baseline and scale', async () => {
  const dataDir = createTempDir()
  const stripPath = path.join(dataDir, 'idle-strip.png')
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'official-row-frames', 'idle')
  // Build a 3x2 grid with intentionally drifting placement/scale for the same silhouette.
  const columns = 3
  const rows = 2
  const frameCount = 6
  const composites = Array.from({ length: frameCount }, (_entry, index) => {
    const width = 50 + (index * 6)
    const height = 70 + (index * 4)
    const x = 20 + (index * 8)
    const y = 40 + ((index % 3) * 10)
    return {
      input: Buffer.from(
        `<svg width="${CELL_WIDTH}" height="${CELL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
          <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#d89b45"/>
        </svg>`
      ),
      left: (index % columns) * CELL_WIDTH,
      top: Math.floor(index / columns) * CELL_HEIGHT
    }
  })
  await sharp({
    create: {
      width: columns * CELL_WIDTH,
      height: rows * CELL_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(composites).png().toFile(stripPath)

  const extracted = await extractRowStripFrames({
    dataDir,
    stripPath,
    actionId: 'idle',
    outputDir,
    layout: { columns, rows }
  })

  assert.equal(extracted.frames.length, 6)
  assert.ok(extracted.extraction.registrationLock)
  assert.equal(typeof extracted.extraction.registrationLock.targetScale, 'number')
  assert.equal(typeof extracted.extraction.registrationLock.targetBaseline, 'number')

  const baselines = []
  const centers = []
  for (const frame of extracted.frames) {
    const { data, info } = await sharp(frame.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1, sumX = 0, count = 0
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const alpha = data[(y * info.width + x) * info.channels + 3]
        if (alpha <= 8) continue
        count += 1
        sumX += x
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    assert.ok(count > 0)
    baselines.push(maxY)
    centers.push(sumX / count)
  }
  const baselineRange = Math.max(...baselines) - Math.min(...baselines)
  const centerRange = Math.max(...centers) - Math.min(...centers)
  assert.equal(baselineRange <= 2, true)
  assert.equal(centerRange <= 4, true)
})
