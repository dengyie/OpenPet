const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const sharp = require('sharp')
const {
  buildCanonicalActionFramesFromGeneratedImage,
  buildActionFramesFromGeneratedImage,
  repairActionFrameFromGeneratedImage
} = require('../../examples/plugins/creator-studio/lib/action-frame-builder')
const { assertActionFrameQaPassed } = require('../../examples/plugins/creator-studio/lib/action-frame-qa')
const {
  writeBadStaticActionSheet,
  writeGoodSubtleWaveSheet
} = require('../fixtures/creator-studio/action-quality-fixtures')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-frames-'))

const createCatFrameSvg = ({
  width = 196,
  height = 212,
  body = '#d89b45',
  head = '#e2ad5b',
  chest = '#f2dcc0',
  eye = '#4f8c42',
  nose = '#7b4b2a',
  pawLift = 0,
  pawAngle = 0
} = {}) => `
  <svg width="${width}" height="${height}" viewBox="0 0 196 212" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="98" cy="130" rx="48" ry="58" fill="${body}" />
    <circle cx="98" cy="78" r="42" fill="${head}" />
    <circle cx="72" cy="43" r="16" fill="${head}" />
    <circle cx="124" cy="43" r="16" fill="${head}" />
    <ellipse cx="98" cy="146" rx="25" ry="36" fill="${chest}" opacity="0.92" />
    <ellipse cx="84" cy="80" rx="7" ry="8" fill="${eye}" />
    <ellipse cx="112" cy="80" rx="7" ry="8" fill="${eye}" />
    <ellipse cx="98" cy="96" rx="10" ry="7" fill="${chest}" opacity="0.95" />
    <circle cx="98" cy="93" r="3" fill="${nose}" />
    <ellipse cx="75" cy="188" rx="16" ry="9" fill="${body}" />
    <ellipse cx="121" cy="188" rx="16" ry="9" fill="${body}" />
    <g transform="rotate(${pawAngle} 132 ${122 - pawLift})">
      <ellipse cx="132" cy="${122 - pawLift}" rx="11" ry="32" fill="${body}" />
      <circle cx="132" cy="${92 - pawLift}" r="11" fill="${head}" />
    </g>
    <ellipse cx="64" cy="135" rx="11" ry="32" fill="${body}" />
  </svg>
`

const writeSingleCatFrame = async ({ filePath, width = 196, height = 212, background, ...catOptions }) => {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: background || { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: Buffer.from(createCatFrameSvg({ width, height, ...catOptions })), left: 0, top: 0 }])
    .png()
    .toFile(filePath)
}

const createActionSheetPng = async ({
  filePath,
  frameCount = 8,
  background = { r: 0, g: 0, b: 0, alpha: 0 },
  omittedFrameIndexes = []
}) => {
  const columns = Math.max(1, Math.min(4, frameCount))
  const rows = Math.max(1, Math.ceil(frameCount / columns))
  const cellWidth = 256
  const cellHeight = 256
  const wave = [
    { pawLift: 0, pawAngle: 0 },
    { pawLift: 10, pawAngle: -6 },
    { pawLift: 22, pawAngle: -14 },
    { pawLift: 26, pawAngle: 10 },
    { pawLift: 18, pawAngle: -8 },
    { pawLift: 8, pawAngle: 4 },
    { pawLift: 3, pawAngle: 0 },
    { pawLift: 2, pawAngle: 1 }
  ]
  const omitted = new Set(omittedFrameIndexes)
  const composites = Array.from({ length: frameCount }, (_entry, index) => {
    if (omitted.has(index)) return null
    const column = index % columns
    const row = Math.floor(index / columns)
    const pose = wave[index % wave.length]
    return {
      input: Buffer.from(createCatFrameSvg({ width: cellWidth, height: cellHeight, ...pose })),
      left: column * cellWidth,
      top: row * cellHeight
    }
  }).filter(Boolean)

  await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 4,
      background
    }
  })
    .composite(composites)
    .png()
    .toFile(filePath)
}

const createSlicedSingleCharacterSheetPng = async ({ filePath, frameCount = 16 }) => {
  const columns = Math.max(1, Math.min(4, frameCount))
  const rows = Math.max(1, Math.ceil(frameCount / columns))
  const cellWidth = 256
  const cellHeight = 256
  const width = columns * cellWidth
  const height = rows * cellHeight

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect x="72" y="72" width="${width - 144}" height="${height - 96}" rx="220" fill="#d89b45" />
          <ellipse cx="${width / 2}" cy="${height * 0.56}" rx="${width * 0.33}" ry="${height * 0.39}" fill="#d89b45" />
          <circle cx="${width / 2}" cy="${height * 0.24}" r="${width * 0.19}" fill="#e2ad5b" />
          <circle cx="${width * 0.39}" cy="${height * 0.12}" r="90" fill="#e2ad5b" />
          <circle cx="${width * 0.61}" cy="${height * 0.12}" r="90" fill="#e2ad5b" />
          <ellipse cx="${width * 0.34}" cy="${height * 0.53}" rx="120" ry="56" fill="#c98735" />
          <ellipse cx="${width * 0.66}" cy="${height * 0.53}" rx="120" ry="56" fill="#c98735" />
          <ellipse cx="${width * 0.45}" cy="${height * 0.9}" rx="90" ry="64" fill="#c98735" />
          <ellipse cx="${width * 0.57}" cy="${height * 0.9}" rx="90" ry="64" fill="#c98735" />
        </svg>
      `),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(filePath)
}

test('action frame builder creates ordered transparent frames and QA evidence', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  const sourcePath = path.join(sourceDir, '0001.png')
  await createActionSheetPng({ filePath: sourcePath, frameCount: 8 })

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'shy-spin',
      name: 'Shy Spin',
      frameCount: 8,
      loop: false,
      triggerProposal: { type: 'click', binding: 'clickAction' }
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/shy-spin'),
    qaDir
  })

  assert.equal(result.actionId, 'shy-spin')
  assert.equal(result.frameCount, 8)
  assert.equal(fs.existsSync(path.join(result.framesDir, '0001.png')), true)
  assert.equal(fs.existsSync(path.join(result.framesDir, '0008.png')), true)
  assert.equal(fs.existsSync(result.qaPath), true)
  assert.equal(fs.existsSync(result.contactSheetPath), true)

  const metadata = await sharp(path.join(result.framesDir, '0001.png')).metadata()
  const firstFrame = fs.readFileSync(path.join(result.framesDir, '0001.png'))
  const lastFrame = fs.readFileSync(path.join(result.framesDir, '0008.png'))
  assert.equal(metadata.width, 192)
  assert.equal(metadata.height, 208)
  assert.equal(metadata.hasAlpha, true)
  assert.equal(firstFrame.equals(lastFrame), false)
  const contactSheetMetadata = await sharp(result.contactSheetPath).metadata()
  assert.equal(contactSheetMetadata.width > 192, true)
  assert.equal(contactSheetMetadata.height > 208, true)

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, true)
  assert.equal(qa.actionId, 'shy-spin')
  assert.equal(qa.frameCount, 8)
  assert.deepEqual(qa.sourceRelativePaths, ['runs/demo/frames/base/0001.png'])
  assert.equal(qa.extraction.mode, 'action-sheet')
  assert.deepEqual(qa.extraction.layout, { columns: 4, rows: 2 })
  assert.equal(qa.contactSheetRelativePath, 'runs/demo/qa/action-frame-contact-sheet.png')
  assert.equal(qa.frames.length, 8)
  assert.equal(qa.frames.every((frame) => frame.visiblePixels > 0), true)
  assert.equal(qa.frames.every((frame) => frame.sourceCell && Number.isInteger(frame.sourceCell.column)), true)
  assert.equal(JSON.stringify(qa).includes(dataDir), false)
})

test('action frame builder trims a plain opaque action-sheet background into usable frames', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  const sourcePath = path.join(sourceDir, '0001.png')
  await createActionSheetPng({
    filePath: sourcePath,
    frameCount: 4,
    background: { r: 250, g: 248, b: 244, alpha: 1 }
  })

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'hop',
      name: 'Hop',
      frameCount: 4,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/hop'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, true)
  assert.equal(qa.frames.every((frame) => frame.visiblePixels > 0), true)
})

test('action frame builder rejects sliced single-character sheets as failed QA', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  const sourcePath = path.join(sourceDir, '0001.png')
  await createSlicedSingleCharacterSheetPng({ filePath: sourcePath, frameCount: 16 })

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'bad-wave',
      name: 'Bad Wave',
      frameCount: 16,
      loop: false
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/bad-wave'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, false)
  assert.equal(qa.frames.length, 16)
  assert.equal(qa.frames.every((frame) => frame.visiblePixels > 0), true)
  assert.match(qa.errors.join('\n'), /cropped|sliced|touch/i)
  assert.equal(qa.quality.metrics.sourceCellEdgeTouchCount > 8, true)
})

test('action frame builder rejects static action sheets as failed motion QA', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  await writeBadStaticActionSheet({
    filePath: path.join(sourceDir, '0001.png'),
    frameCount: 6
  })

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'static-wave',
      name: 'Static Wave',
      frameCount: 6,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/static-wave'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, false)
  assert.match(qa.errors.join('\n'), /action_repeated_static/)
  assert.equal(qa.quality.metrics.uniqueFrameCount, 1)
  assert.equal(qa.quality.metrics.adjacentFrameDiff.averageChangedPixelRatio, 0)
})

test('action frame builder accepts subtle waving sheets with stable anchors', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  await writeGoodSubtleWaveSheet({
    filePath: path.join(sourceDir, '0001.png'),
    frameCount: 6
  })

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'subtle-wave',
      name: 'Subtle Wave',
      frameCount: 6,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/subtle-wave'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, true)
  assert.equal(qa.quality.metrics.uniqueFrameCount >= 4, true)
  assert.equal(qa.quality.metrics.reusedFrameCount, 0)
  assert.equal(qa.quality.metrics.adjacentFrameDiff.averageChangedPixelRatio > 0.003, true)
})

test('canonical action synthesis creates stable local-motion frames from one approved source', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  await writeSingleCatFrame({
    filePath: path.join(sourceDir, '0001.png'),
    width: 1024,
    height: 1024
  })

  const result = await buildCanonicalActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'canonical-wave',
      name: 'Canonical Wave',
      frameCount: 6,
      loop: false,
      synthesisMode: 'canonical-frame'
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/canonical-wave'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, true)
  assert.equal(qa.extraction.mode, 'canonical-local-synthesis')
  assert.equal(qa.synthesis.mode, 'canonical-frame')
  assert.equal(qa.synthesis.source, 'single-approved-canonical-frame')
  assert.equal(qa.frames.length, 6)
  assert.equal(qa.quality.metrics.uniqueFrameCount >= 5, true)
  assert.equal(qa.quality.metrics.reusedFrameCount, 0)
  assert.equal(qa.quality.metrics.frameBounds.baselineY.range <= 6, true)
  assert.equal(qa.quality.metrics.visiblePixels.ratio < 1.25, true)
  assert.equal(qa.quality.metrics.adjacentFrameDiff.averageChangedPixelRatio > 0.003, true)
  assert.equal(qa.quality.metrics.adjacentFrameDiff.averageChangedPixelRatio < 0.65, true)
  assert.equal(qa.quality.metrics.identityCoreDiff.averageChangedPixelRatio < 0.52, true)
})

test('action frame builder rejects identity drift even when frame anchors are stable', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  const variants = [
    { body: '#d89b45', head: '#e2ad5b', chest: '#f2dcc0', eye: '#4f8c42' },
    { body: '#b76e38', head: '#d99c4b', chest: '#f8ead7', eye: '#1f1f1f' },
    { body: '#e7b55f', head: '#f0c874', chest: '#fff3df', eye: '#4f8c42' },
    { body: '#c88742', head: '#dea557', chest: '#f2dcc0', eye: '#8f5a32' },
    { body: '#df9c3c', head: '#f1bd61', chest: '#fff2e4', eye: '#222222' },
    { body: '#a46b3d', head: '#c99052', chest: '#ead1af', eye: '#4f8c42' }
  ]

  for (const [index, variant] of variants.entries()) {
    await writeSingleCatFrame({
      filePath: path.join(sourceDir, `${String(index + 1).padStart(4, '0')}.png`),
      width: 1024,
      height: 1024,
      ...variant
    })
  }

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: variants.map((_variant, index) => ({
        dataRelativePath: `runs/demo/frames/base/${String(index + 1).padStart(4, '0')}.png`,
        mimeType: 'image/png'
      }))
    },
    action: {
      actionId: 'identity-drift-wave',
      name: 'Identity Drift Wave',
      frameCount: 6,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/identity-drift-wave'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, false)
  assert.match(qa.errors.join('\n'), /identity drift|whole sprite|face\/body core/i)
  assert.equal(qa.quality.metrics.frameBounds.baselineY.range, 0)
  assert.equal(qa.quality.metrics.visiblePixels.ratio < 1.2, true)
  assert.equal(qa.quality.metrics.adjacentFrameDiff.averageChangedPixelRatio > 0.65, true)
  assert.equal(qa.quality.metrics.identityCoreDiff.averageChangedPixelRatio > 0.52, true)
  assert.equal(qa.quality.metrics.excessiveWholeSpriteChangePairCount > 0, true)
  assert.equal(qa.quality.metrics.excessiveIdentityCoreChangePairCount > 0, true)
})

test('action frame qa rejects frames modified after validation', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  await writeGoodSubtleWaveSheet({
    filePath: path.join(sourceDir, '0001.png'),
    frameCount: 6
  })

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'tamper-wave',
      name: 'Tamper Wave',
      frameCount: 6,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/tamper-wave'),
    qaDir
  })

  assertActionFrameQaPassed({
    dataDir,
    actionFrames: {
      actionId: result.actionId,
      frameCount: result.frameCount,
      frameWidth: result.frameWidth,
      frameHeight: result.frameHeight,
      framesDir: result.framesDir,
      qa: result.qaPath
    },
    operation: 'import'
  })

  fs.writeFileSync(path.join(result.framesDir, '0003.png'), fs.readFileSync(path.join(result.framesDir, '0002.png')))

  assert.throws(
    () => assertActionFrameQaPassed({
      dataDir,
      actionFrames: {
        actionId: result.actionId,
        frameCount: result.frameCount,
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        framesDir: result.framesDir,
        qa: result.qaPath
      },
      operation: 'import'
    }),
    /Action frame file hash must match QA before import/
  )
})

test('action frame builder rejects unsafe action ids', async () => {
  const dataDir = makeDataDir()
  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: '../bad', name: 'Bad', frameCount: 8 },
      outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/bad'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /actionId is invalid/
  )
})

test('action frame builder repairs one frame and updates QA evidence', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  const outputFramesDir = path.join(dataDir, 'runs/demo/frames/actions/shy-spin')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createActionSheetPng({ filePath: path.join(sourceDir, '0001.png'), frameCount: 8 })
  const action = {
    actionId: 'shy-spin',
    name: 'Shy Spin',
    frameCount: 8,
    loop: false,
    triggerProposal: { type: 'click', binding: 'clickAction' }
  }
  const generationResult = {
    outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
  }
  await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult,
    action,
    outputFramesDir,
    qaDir
  })
  const brokenFramePath = path.join(outputFramesDir, '0003.png')
  fs.writeFileSync(brokenFramePath, Buffer.from('broken-frame'))

  const repaired = await repairActionFrameFromGeneratedImage({
    dataDir,
    generationResult,
    action,
    outputFramesDir,
    qaDir,
    fileName: '0003.png',
    now: () => '2026-06-24T00:00:00.000Z'
  })

  const metadata = await sharp(brokenFramePath).metadata()
  const contactSheetMetadata = await sharp(repaired.contactSheetPath).metadata()
  const qa = JSON.parse(fs.readFileSync(repaired.qaPath, 'utf-8'))
  assert.equal(repaired.actionId, 'shy-spin')
  assert.equal(repaired.frameIndex, 2)
  assert.equal(metadata.width, 192)
  assert.equal(metadata.height, 208)
  assert.equal(contactSheetMetadata.width > 192, true)
  assert.equal(qa.contactSheetRelativePath, 'runs/demo/qa/action-frame-contact-sheet.png')
  assert.equal(qa.frames[2].fileName, '0003.png')
  assert.equal(qa.frames[2].visiblePixels > 0, true)
  assert.deepEqual(qa.repairs, [{ fileName: '0003.png', repairedAt: '2026-06-24T00:00:00.000Z' }])
  assert.equal(JSON.stringify(qa).includes(dataDir), false)
})

test('action frame builder repairs legacy QA by backfilling missing frame hashes', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  const outputFramesDir = path.join(dataDir, 'runs/demo/frames/actions/legacy-wave')
  fs.mkdirSync(sourceDir, { recursive: true })
  await writeGoodSubtleWaveSheet({
    filePath: path.join(sourceDir, '0001.png'),
    frameCount: 6
  })
  const action = {
    actionId: 'legacy-wave',
    name: 'Legacy Wave',
    frameCount: 6,
    loop: true
  }
  const generationResult = {
    outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
  }
  const built = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult,
    action,
    outputFramesDir,
    qaDir
  })
  const legacyQa = JSON.parse(fs.readFileSync(built.qaPath, 'utf-8'))
  legacyQa.frames = legacyQa.frames.map((frame) => {
    const { sha256, fileSha256, ...legacyFrame } = frame
    return legacyFrame
  })
  fs.writeFileSync(built.qaPath, `${JSON.stringify(legacyQa, null, 2)}\n`)

  const repaired = await repairActionFrameFromGeneratedImage({
    dataDir,
    generationResult,
    action,
    outputFramesDir,
    qaDir,
    fileName: '0004.png',
    now: () => '2026-07-06T00:00:00.000Z'
  })
  const qa = JSON.parse(fs.readFileSync(repaired.qaPath, 'utf-8'))

  assert.equal(qa.ok, true)
  assert.equal(qa.frames.length, 6)
  assert.equal(qa.frames.every((frame) => typeof frame.sha256 === 'string' && frame.sha256.length === 64), true)
  assert.equal(qa.frames.every((frame) => typeof frame.fileSha256 === 'string' && frame.fileSha256.length === 64), true)
  assert.equal(qa.quality.metrics.uniqueFrameCount >= 4, true)
  assert.doesNotMatch(qa.errors.join('\n'), /action_repeated_static|action_insufficient_unique_frames/)
})

test('action frame builder rejects repair frame names outside the action range', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createActionSheetPng({ filePath: path.join(sourceDir, '0001.png'), frameCount: 8 })

  await assert.rejects(
    () => repairActionFrameFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'safe-action', name: 'Safe Action', frameCount: 8 },
      outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/safe-action'),
      qaDir: path.join(dataDir, 'runs/demo/qa'),
      fileName: '0009.png'
    }),
    /outside the action frame range/
  )
})

test('action frame builder marks repair QA incomplete when prior QA evidence is missing', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const outputFramesDir = path.join(dataDir, 'runs/demo/frames/actions/shy-spin')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createActionSheetPng({ filePath: path.join(sourceDir, '0001.png'), frameCount: 8 })

  const repaired = await repairActionFrameFromGeneratedImage({
    dataDir,
    generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
    action: { actionId: 'shy-spin', name: 'Shy Spin', frameCount: 8 },
    outputFramesDir,
    qaDir,
    fileName: '0003.png',
    now: () => '2026-06-24T00:00:00.000Z'
  })
  const qa = JSON.parse(fs.readFileSync(repaired.qaPath, 'utf-8'))

  assert.equal(qa.ok, false)
  assert.equal(qa.frames.length, 3)
  assert.deepEqual(qa.warnings, ['Action frame QA is incomplete after repair.'])
})

test('action frame builder rejects unsafe frame counts', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createActionSheetPng({ filePath: path.join(sourceDir, '0001.png'), frameCount: 8 })

  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'too-many', name: 'Too Many', frameCount: 33 },
      outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/too-many'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /frameCount must be between/
  )
})

test('action frame builder rejects output directories outside data directory', async () => {
  const dataDir = makeDataDir()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-frames-outside-'))
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createActionSheetPng({ filePath: path.join(sourceDir, '0001.png'), frameCount: 8 })

  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'safe-action', name: 'Safe Action', frameCount: 8 },
      outputFramesDir: path.join(outsideDir, 'frames'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /action frames output directory must stay inside/
  )

  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'safe-action', name: 'Safe Action', frameCount: 8 },
      outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/safe-action'),
      qaDir: path.join(outsideDir, 'qa')
    }),
    /action QA directory must stay inside/
  )
})

test('action frame builder rejects output directories through symlinked parents', async (t) => {
  const dataDir = makeDataDir()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-frames-symlink-'))
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createActionSheetPng({ filePath: path.join(sourceDir, '0001.png'), frameCount: 8 })
  const linkPath = path.join(dataDir, 'linked-outside')
  try {
    fs.symlinkSync(outsideDir, linkPath, 'dir')
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip('symlinks are not available in this environment')
      return
    }
    throw error
  }

  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'safe-action', name: 'Safe Action', frameCount: 8 },
      outputFramesDir: path.join(linkPath, 'frames'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /action frames output directory must stay inside/
  )
})

test('action frame builder supports provider multi-output frame sources without heuristic derivation', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })

  const wave = [
    { pawLift: 0, pawAngle: 0 },
    { pawLift: 18, pawAngle: -10 },
    { pawLift: 4, pawAngle: 5 }
  ]
  for (let index = 1; index <= 3; index += 1) {
    await writeSingleCatFrame({
      filePath: path.join(sourceDir, `${String(index).padStart(4, '0')}.png`),
      width: 196,
      height: 212,
      ...wave[index - 1]
    })
  }

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [
        { dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0002.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0003.png', mimeType: 'image/png' }
      ]
    },
    action: {
      actionId: 'blink',
      name: 'Blink',
      frameCount: 3,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/blink'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, true)
  assert.equal(qa.extraction.mode, 'multi-output')
  assert.deepEqual(qa.sourceRelativePaths, [
    'runs/demo/frames/base/0001.png',
    'runs/demo/frames/base/0002.png',
    'runs/demo/frames/base/0003.png'
  ])
  assert.equal(qa.frames.every((frame) => !frame.sourceCell), true)
})

test('action frame builder fails QA for large opaque multi-output provider frames', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })

  for (let index = 1; index <= 3; index += 1) {
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 240 - (index * 8), g: 240 - (index * 8), b: 240 - (index * 8), alpha: 1 }
      }
    })
      .composite([{
        input: Buffer.from(`
          <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="${512 + (index * 12)}" cy="620" rx="230" ry="310" fill="#d89b45" />
            <circle cx="${512 + (index * 12)}" cy="330" r="130" fill="#e2ad5b" />
          </svg>
        `),
        left: 0,
        top: 0
      }])
      .png()
      .toFile(path.join(sourceDir, `${String(index).padStart(4, '0')}.png`))
  }

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [
        { dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0002.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0003.png', mimeType: 'image/png' }
      ]
    },
    action: {
      actionId: 'opaque-wave',
      name: 'Opaque Wave',
      frameCount: 3,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/opaque-wave'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, false)
  assert.match(qa.errors.join('\n'), /opaque|background|cutout/i)
  assert.equal(qa.quality.metrics.opaqueMultiOutputFrameCount, 3)
  assert.equal(qa.quality.metrics.largeOpaqueMultiOutputFrameCount, 3)
})

test('action frame builder fails QA for small opaque multi-output provider frames', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  const wave = [
    { pawLift: 0, pawAngle: 0 },
    { pawLift: 16, pawAngle: -8 },
    { pawLift: 4, pawAngle: 5 }
  ]

  for (let index = 1; index <= 3; index += 1) {
    await writeSingleCatFrame({
      filePath: path.join(sourceDir, `${String(index).padStart(4, '0')}.png`),
      width: 196,
      height: 212,
      background: { r: 245, g: 245, b: 245, alpha: 1 },
      ...wave[index - 1]
    })
  }

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [
        { dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0002.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0003.png', mimeType: 'image/png' }
      ]
    },
    action: {
      actionId: 'small-opaque-wave',
      name: 'Small Opaque Wave',
      frameCount: 3,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/small-opaque-wave'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, false)
  assert.match(qa.errors.join('\n'), /opaque|background|cutout/i)
  assert.equal(qa.quality.metrics.opaqueMultiOutputFrameCount, 3)
  assert.equal(qa.quality.metrics.largeOpaqueMultiOutputFrameCount, 0)
})

test('action frame builder fails QA for unstable visible area below legacy tolerance', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  const sizes = [
    { rx: 100, ry: 300 },
    { rx: 210, ry: 220 },
    { rx: 110, ry: 290 }
  ]

  for (const [index, size] of sizes.entries()) {
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{
        input: Buffer.from(`
          <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="512" cy="630" rx="${size.rx}" ry="${size.ry}" fill="#d89b45" />
            <circle cx="512" cy="${620 - size.ry}" r="${Math.max(58, Math.floor(size.rx * 0.5))}" fill="#e2ad5b" />
          </svg>
        `),
        left: 0,
        top: 0
      }])
      .png()
      .toFile(path.join(sourceDir, `${String(index + 1).padStart(4, '0')}.png`))
  }

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [
        { dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0002.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0003.png', mimeType: 'image/png' }
      ]
    },
    action: {
      actionId: 'scale-drift',
      name: 'Scale Drift',
      frameCount: 3,
      loop: true
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/scale-drift'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, false)
  assert.match(qa.errors.join('\n'), /unstable visible area/i)
  assert.equal(qa.quality.metrics.visiblePixels.ratio > 1.8, true)
  assert.equal(qa.quality.metrics.visiblePixels.ratio < 2.4, true)
})

test('action frame builder falls back across multiple action-sheet outputs when earlier sheets miss cells', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createActionSheetPng({
    filePath: path.join(sourceDir, '0001.png'),
    frameCount: 8,
    omittedFrameIndexes: [5, 6, 7]
  })
  await createActionSheetPng({
    filePath: path.join(sourceDir, '0002.png'),
    frameCount: 8
  })

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [
        { dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' },
        { dataRelativePath: 'runs/demo/frames/base/0002.png', mimeType: 'image/png' }
      ]
    },
    action: {
      actionId: 'wave-fallback',
      name: 'Wave Fallback',
      frameCount: 8,
      loop: false
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/wave-fallback'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, true)
  assert.equal(qa.extraction.mode, 'action-sheet-fallback')
  assert.deepEqual(qa.sourceRelativePaths, [
    'runs/demo/frames/base/0001.png',
    'runs/demo/frames/base/0002.png'
  ])
  assert.equal(qa.frames.length, 8)
  assert.deepEqual(qa.frames.slice(0, 5).map((frame) => frame.sourceOutputIndex), [0, 0, 0, 0, 0])
  assert.deepEqual(qa.frames.slice(5).map((frame) => frame.sourceOutputIndex), [1, 1, 1])
})

test('action frame builder fails QA when later single-sheet cells reuse previous frames', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createActionSheetPng({
    filePath: path.join(sourceDir, '0001.png'),
    frameCount: 8,
    omittedFrameIndexes: [5, 6, 7]
  })

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'wave-recover',
      name: 'Wave Recover',
      frameCount: 8,
      loop: false
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/wave-recover'),
    qaDir
  })

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  const frame5 = fs.readFileSync(path.join(result.framesDir, '0005.png'))
  const frame6 = fs.readFileSync(path.join(result.framesDir, '0006.png'))
  const frame8 = fs.readFileSync(path.join(result.framesDir, '0008.png'))
  assert.equal(qa.ok, false)
  assert.equal(qa.frames.length, 8)
  assert.equal(Array.isArray(qa.warnings), true)
  assert.equal(qa.warnings.length, 3)
  assert.match(qa.errors.join('\n'), /action_reused_frames/)
  assert.equal(qa.quality.metrics.reusedFrameCount, 3)
  assert.match(qa.warnings[0], /Frame 0006\.png reused previous valid frame/i)
  assert.equal(qa.frames[5].reusedPreviousFrame, true)
  assert.equal(qa.frames[5].reusedFromFileName, '0005.png')
  assert.equal(frame5.equals(frame6), true)
  assert.equal(frame6.equals(frame8), true)
})
