const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const sharp = require('sharp')
const {
  buildActionFramesFromGeneratedImage,
  repairActionFrameFromGeneratedImage
} = require('../../examples/plugins/creator-studio/lib/action-frame-builder')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-frames-'))

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
  const palette = ['#ff9f1c', '#2ec4b6', '#e71d36', '#577590', '#ffbf69', '#6d597a', '#00afb9', '#8ac926']
  const omitted = new Set(omittedFrameIndexes)
  const composites = Array.from({ length: frameCount }, (_entry, index) => {
    if (omitted.has(index)) return null
    const column = index % columns
    const row = Math.floor(index / columns)
    const fill = palette[index % palette.length]
    return {
      input: Buffer.from(`
        <svg width="${cellWidth}" height="${cellHeight}" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="${128 + ((index % 3) - 1) * 8}" cy="${142 - ((index % 2) * 12)}" rx="70" ry="82" fill="${fill}" />
          <circle cx="${128 + ((index % 4) - 1.5) * 6}" cy="88" r="42" fill="${fill}" opacity="0.82" />
        </svg>
      `),
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

  for (let index = 1; index <= 3; index += 1) {
    await sharp({
      create: {
        width: 196,
        height: 212,
        channels: 4,
        background: { r: index * 40, g: 180 - (index * 20), b: 90 + (index * 30), alpha: 1 }
      }
    })
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
