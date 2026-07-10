const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const {
  buildActionSpriteReferenceBoard,
  buildAnchorReferenceBoard
} = require('../../examples/plugins/creator-studio/lib/anchor-reference-board')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-anchor-board-'))

const writeSourceImage = async (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await sharp({
    create: {
      width: 240,
      height: 260,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="240" height="260" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="120" cy="150" rx="70" ry="82" fill="#d8a24a"/>
          <circle cx="120" cy="78" r="54" fill="#e8b75f"/>
          <circle cx="84" cy="40" r="20" fill="#d8a24a"/>
          <circle cx="156" cy="40" r="20" fill="#d8a24a"/>
          <ellipse cx="99" cy="78" rx="8" ry="10" fill="#3f8a42"/>
          <ellipse cx="141" cy="78" rx="8" ry="10" fill="#3f8a42"/>
          <ellipse cx="120" cy="168" rx="36" ry="54" fill="#f3dfbd"/>
        </svg>
      `),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(filePath)
}

const writeSolidSourceImage = async (filePath, background) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await sharp({
    create: {
      width: 240,
      height: 240,
      channels: 4,
      background
    }
  })
    .png()
    .toFile(filePath)
}

const readPixel = async ({ imagePath, x, y }) => {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const index = ((y * info.width) + x) * info.channels
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
    alpha: data[index + 3]
  }
}

const assertColorNear = (actual, expected, tolerance = 18) => {
  assert.equal(actual.alpha, expected.alpha)
  assert.ok(Math.abs(actual.r - expected.r) <= tolerance, `expected r ${actual.r} near ${expected.r}`)
  assert.ok(Math.abs(actual.g - expected.g) <= tolerance, `expected g ${actual.g} near ${expected.g}`)
  assert.ok(Math.abs(actual.b - expected.b) <= tolerance, `expected b ${actual.b} near ${expected.b}`)
}

test('anchor reference board creates one 1024 conditioning image and metadata', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'inputs/source/cat.png')
  await writeSourceImage(sourcePath)

  const result = await buildAnchorReferenceBoard({
    dataDir,
    runId: 'run-anchor',
    sourceReferences: [{
      path: sourcePath,
      fileName: 'cat.png',
      relativePath: 'inputs/source/cat.png',
      role: 'canonical-reference'
    }],
    characterBrief: 'Golden British Shorthair with green eyes.'
  })

  assert.equal(result.role, 'composite-reference-board')
  assert.equal(result.width, 1024)
  assert.equal(result.height, 1024)
  assert.equal(result.sourceCount, 1)
  assert.equal(result.relativePath, 'runs/run-anchor/inputs/anchors/composite-reference-board.png')
  assert.equal(result.metadataRelativePath, 'runs/run-anchor/inputs/anchors/composite-reference-board.json')
  assert.equal(fs.existsSync(result.path), true)
  assert.equal(fs.existsSync(result.metadataPath), true)

  const metadata = JSON.parse(fs.readFileSync(result.metadataPath, 'utf-8'))
  assert.equal(metadata.role, 'composite-reference-board')
  assert.equal(metadata.sourceCount, 1)
  assert.equal(metadata.characterBrief, 'Golden British Shorthair with green eyes.')
  assert.deepEqual(metadata.sources.map((source) => source.role), ['canonical-reference'])

  const imageMetadata = await sharp(result.path).metadata()
  assert.equal(imageMetadata.width, 1024)
  assert.equal(imageMetadata.height, 1024)
})

test('anchor reference board rejects output paths outside the Creator Studio data directory', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'inputs/source/cat.png')
  await writeSourceImage(sourcePath)

  await assert.rejects(
    () => buildAnchorReferenceBoard({
      dataDir,
      runId: 'run-anchor',
      sourceReferences: [{ path: sourcePath, fileName: 'cat.png' }],
      characterBrief: 'Golden cat.',
      outputRelativeDir: '../escape'
    }),
    /Anchor reference board output path escaped the Creator Studio data directory/
  )
})

test('anchor reference board rejects source images outside the Creator Studio data directory', async () => {
  const dataDir = makeDataDir()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-anchor-board-outside-'))
  const sourcePath = path.join(outsideDir, 'cat.png')
  await writeSourceImage(sourcePath)

  await assert.rejects(
    () => buildAnchorReferenceBoard({
      dataDir,
      runId: 'run-anchor',
      sourceReferences: [{ path: sourcePath, fileName: 'cat.png' }]
    }),
    /source image.*stay inside.*data directory/i
  )
})

test('anchor reference board renders additional source images as secondary panels in one provider image', async () => {
  const dataDir = makeDataDir()
  const sourcePaths = [
    path.join(dataDir, 'inputs/source/primary.png'),
    path.join(dataDir, 'inputs/source/secondary-blue.png'),
    path.join(dataDir, 'inputs/source/secondary-green.png')
  ]
  await writeSolidSourceImage(sourcePaths[0], { r: 224, g: 169, b: 72, alpha: 1 })
  await writeSolidSourceImage(sourcePaths[1], { r: 36, g: 112, b: 224, alpha: 1 })
  await writeSolidSourceImage(sourcePaths[2], { r: 52, g: 172, b: 88, alpha: 1 })

  const result = await buildAnchorReferenceBoard({
    dataDir,
    runId: 'run-anchor',
    sourceReferences: sourcePaths.map((sourcePath, index) => ({
      path: sourcePath,
      fileName: path.basename(sourcePath),
      relativePath: `inputs/source/${path.basename(sourcePath)}`,
      role: index === 0 ? 'front-reference' : 'supplemental-reference'
    })),
    characterBrief: 'Keep the visible pet identity from the references.'
  })

  const metadata = JSON.parse(fs.readFileSync(result.metadataPath, 'utf-8'))
  assert.equal(metadata.sourceCount, 3)
  assert.deepEqual(metadata.sources.map((source) => source.layout.role), [
    'primary',
    'secondary',
    'secondary'
  ])

  const primaryLayout = metadata.sources[0].layout
  const secondaryLayouts = metadata.sources.slice(1).map((source) => source.layout)
  assert.ok(primaryLayout.width > secondaryLayouts[0].width)
  assert.ok(primaryLayout.height > secondaryLayouts[0].height)
  for (const layout of metadata.sources.map((source) => source.layout)) {
    assert.ok(layout.left >= 0)
    assert.ok(layout.top >= 0)
    assert.ok(layout.left + layout.width <= 1024)
    assert.ok(layout.top + layout.height <= 1024)
  }

  assertColorNear(await readPixel({
    imagePath: result.path,
    x: secondaryLayouts[0].left + Math.floor(secondaryLayouts[0].width / 2),
    y: secondaryLayouts[0].top + Math.floor(secondaryLayouts[0].height / 2)
  }), { r: 36, g: 112, b: 224, alpha: 255 })
  assertColorNear(await readPixel({
    imagePath: result.path,
    x: secondaryLayouts[1].left + Math.floor(secondaryLayouts[1].width / 2),
    y: secondaryLayouts[1].top + Math.floor(secondaryLayouts[1].height / 2)
  }), { r: 52, g: 172, b: 88, alpha: 255 })
})

test('anchor reference board can write a final action conditioning board role without overwriting the composite board', async () => {
  const dataDir = makeDataDir()
  const identityPath = path.join(dataDir, 'inputs/source/identity.png')
  const actionPath = path.join(dataDir, 'inputs/source/action-anchor.png')
  await writeSolidSourceImage(identityPath, { r: 224, g: 169, b: 72, alpha: 1 })
  await writeSolidSourceImage(actionPath, { r: 36, g: 112, b: 224, alpha: 1 })

  const result = await buildAnchorReferenceBoard({
    dataDir,
    runId: 'run-anchor',
    sourceReferences: [{
      path: identityPath,
      fileName: 'identity.png',
      relativePath: 'inputs/source/identity.png',
      role: 'source-identity-reference'
    }, {
      path: actionPath,
      fileName: 'action-anchor.png',
      relativePath: 'inputs/source/action-anchor.png',
      role: 'action-pose-reference'
    }],
    characterBrief: 'Identity panel wins; action panel is pose guidance.',
    outputRelativeDir: 'runs/run-anchor/inputs/anchors/actions',
    boardRole: 'final-action-reference-board',
    fileBaseName: 'waving-final-reference-board'
  })

  assert.equal(result.role, 'final-action-reference-board')
  assert.equal(result.relativePath, 'runs/run-anchor/inputs/anchors/actions/waving-final-reference-board.png')
  assert.equal(result.metadataRelativePath, 'runs/run-anchor/inputs/anchors/actions/waving-final-reference-board.json')
  assert.equal(fs.existsSync(result.path), true)
  assert.equal(fs.existsSync(result.metadataPath), true)

  const metadata = JSON.parse(fs.readFileSync(result.metadataPath, 'utf-8'))
  assert.equal(metadata.role, 'final-action-reference-board')
  assert.deepEqual(metadata.sources.map((source) => source.role), [
    'source-identity-reference',
    'action-pose-reference'
  ])
})

test('action sprite conditioning board uses a fixed three-panel template instead of a pseudo sprite sheet', async () => {
  const dataDir = makeDataDir()
  const identityPath = path.join(dataDir, 'inputs/source/identity.png')
  const startPath = path.join(dataDir, 'inputs/source/start.png')
  const peakPath = path.join(dataDir, 'inputs/source/peak.png')
  await writeSolidSourceImage(identityPath, { r: 224, g: 169, b: 72, alpha: 1 })
  await writeSolidSourceImage(startPath, { r: 36, g: 112, b: 224, alpha: 1 })
  await writeSolidSourceImage(peakPath, { r: 52, g: 172, b: 88, alpha: 1 })

  const result = await buildActionSpriteReferenceBoard({
    dataDir,
    runId: 'run-conditioning-board',
    sourceReferences: [{
      path: identityPath,
      fileName: 'identity.png',
      relativePath: 'inputs/source/identity.png',
      role: 'canonical-reference'
    }, {
      path: startPath,
      fileName: 'start.png',
      relativePath: 'inputs/source/start.png',
      role: 'action-start-keyframe'
    }, {
      path: peakPath,
      fileName: 'peak.png',
      relativePath: 'inputs/source/peak.png',
      role: 'action-peak-keyframe'
    }],
    action: {
      actionId: 'waving',
      frameCount: 6
    },
    characterBrief: 'Golden British Shorthair with green eyes.'
  })

  assert.equal(result.role, 'keyframe-action-reference-board')
  assert.equal(result.relativePath, 'runs/run-conditioning-board/inputs/keyframes/actions/action-row-reference-board.png')
  const metadata = JSON.parse(fs.readFileSync(result.metadataPath, 'utf-8'))
  assert.equal(metadata.layoutMode, 'single-conditioning-board')
  assert.equal(Array.isArray(metadata.frames), false)
  assert.equal(Array.isArray(metadata.panels), true)
  assert.equal(metadata.panels.length, 3)
  assert.deepEqual(metadata.panels.map((panel) => panel.sourceRole), [
    'canonical-reference',
    'action-start-keyframe',
    'action-peak-keyframe'
  ])
  assert.deepEqual(metadata.sources.map((source) => source.role), [
    'canonical-reference',
    'action-start-keyframe',
    'action-peak-keyframe'
  ])

  const mainPanel = metadata.panels[0].layout
  const startPanel = metadata.panels[1].layout
  const peakPanel = metadata.panels[2].layout
  assert.ok(mainPanel.width > startPanel.width)
  assert.ok(mainPanel.height > startPanel.height)
  assert.equal(startPanel.top, peakPanel.top)
  assert.equal(startPanel.height, peakPanel.height)

  assertColorNear(await readPixel({
    imagePath: result.path,
    x: mainPanel.left + Math.floor(mainPanel.width / 2),
    y: mainPanel.top + Math.floor(mainPanel.height / 2)
  }), { r: 224, g: 169, b: 72, alpha: 255 })
  assertColorNear(await readPixel({
    imagePath: result.path,
    x: startPanel.left + Math.floor(startPanel.width / 2),
    y: startPanel.top + Math.floor(startPanel.height / 2)
  }), { r: 36, g: 112, b: 224, alpha: 255 })
  assertColorNear(await readPixel({
    imagePath: result.path,
    x: peakPanel.left + Math.floor(peakPanel.width / 2),
    y: peakPanel.top + Math.floor(peakPanel.height / 2)
  }), { r: 52, g: 172, b: 88, alpha: 255 })
})
