const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const sharp = require('sharp')

const { CODEX_ATLAS, CODEX_ROWS } = require('../../src/main/pet-pack/codex-pet')
const { loadPetPackFromDirectory } = require('../../src/main/pet-pack/loader')
const { createMinimalWebp } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')
const { FULL_PET_ROW_QUALITY } = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
const { extractRowStripFrames } = require('../../examples/plugins/creator-studio/lib/full-pet-row-extractor')
const { createFullPetRowJobManifest } = require('../../examples/plugins/creator-studio/lib/full-pet-row-jobs')
const { buildRealAtlasFromGeneratedImage } = require('../../examples/plugins/creator-studio/lib/real-atlas-builder')

const makeTempDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-real-atlas-'))

const writeSourcePng = async ({ dataDir, relativePath = 'runs/run-1/frames/base/0001.png', rgba = { r: 30, g: 180, b: 110, alpha: 1 } } = {}) => {
  const absolutePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  await sharp({
    create: {
      width: 96,
      height: 112,
      channels: 4,
      background: rgba
    }
  })
    .png()
    .toFile(absolutePath)
  return { relativePath, absolutePath }
}

const writeStripedPetSourcePng = async ({ dataDir, relativePath = 'runs/run-1/frames/base/striped.png' } = {}) => {
  const absolutePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 252, g: 252, b: 250, alpha: 1 }
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="64" height="512" fill="#eeeeee" opacity="0.7" />
          <rect x="128" y="0" width="64" height="512" fill="#eeeeee" opacity="0.7" />
          <rect x="256" y="0" width="64" height="512" fill="#eeeeee" opacity="0.7" />
          <rect x="384" y="0" width="64" height="512" fill="#eeeeee" opacity="0.7" />
          <ellipse cx="256" cy="292" rx="92" ry="124" fill="#d99a3e" />
          <circle cx="256" cy="184" r="78" fill="#e7ad54" />
          <circle cx="218" cy="180" r="12" fill="#3f8b40" />
          <circle cx="294" cy="180" r="12" fill="#3f8b40" />
          <ellipse cx="256" cy="276" rx="44" ry="86" fill="#f4dfbd" />
          <ellipse cx="214" cy="424" rx="34" ry="18" fill="#d99a3e" />
          <ellipse cx="298" cy="424" rx="34" ry="18" fill="#d99a3e" />
        </svg>
      `),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(absolutePath)
  return { relativePath, absolutePath }
}

const createGenerationResult = (relativePath) => ({
  backend: 'local',
  model: 'local-pet-sprite',
  generatedAt: '2026-06-20T00:00:00.000Z',
  outputs: [{
    dataRelativePath: relativePath,
    mimeType: 'image/png',
    sha256: 'source-sha'
  }]
})

const countVisiblePixels = async (imagePath) => {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let visible = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visible += 1
  }
  return visible
}

const countVisiblePixelsInCell = async ({ imagePath, row, column }) => {
  const { data, info } = await sharp(imagePath)
    .extract({
      left: column * CODEX_ATLAS.cellWidth,
      top: row.row * CODEX_ATLAS.cellHeight,
      width: CODEX_ATLAS.cellWidth,
      height: CODEX_ATLAS.cellHeight
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let visible = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visible += 1
  }
  return visible
}

const countNearTransparentPixelsWithRgb = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let nearTransparentPixelsWithRgb = 0
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const index = pixel * info.channels
    if (data[index + 3] > 8) continue
    if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) {
      nearTransparentPixelsWithRgb += 1
    }
  }
  return nearTransparentPixelsWithRgb
}

const getRowCellHashes = async (spritesheetPath, row) => {
  const hashes = []
  for (let column = 0; column < row.durations.length; column += 1) {
    const { data } = await sharp(spritesheetPath)
      .extract({
        left: column * CODEX_ATLAS.cellWidth,
        top: row.row * CODEX_ATLAS.cellHeight,
        width: CODEX_ATLAS.cellWidth,
        height: CODEX_ATLAS.cellHeight
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    hashes.push(crypto.createHash('sha256').update(data).digest('hex'))
  }
  return hashes
}

const writeOfficialFrame = async ({ outputPath, rowIndex, frameIndex }) => {
  await sharp(Buffer.from(
    `<svg width="${CODEX_ATLAS.cellWidth}" height="${CODEX_ATLAS.cellHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${58 + rowIndex}" y="${96 - (frameIndex % 3)}" width="${46 + (frameIndex % 4)}" height="58" fill="#f6b73c"/>
      <rect x="${78 + frameIndex * 3}" y="${74 + (rowIndex % 4)}" width="12" height="${26 + (frameIndex % 5)}" fill="#1c7ed6"/>
      <rect x="${90 - (frameIndex % 2)}" y="150" width="${20 + (rowIndex % 3)}" height="8" fill="#2f9e44"/>
    </svg>`
  ))
    .ensureAlpha()
    .png()
    .toFile(outputPath)
}

const writeJitteredOfficialFrame = async ({ outputPath, frameIndex }) => {
  const offsets = [
    { x: 8, y: 2 },
    { x: 52, y: 40 },
    { x: 18, y: 16 },
    { x: 78, y: 58 }
  ]
  const offset = offsets[frameIndex]
  await sharp(Buffer.from(
    `<svg width="${CODEX_ATLAS.cellWidth}" height="${CODEX_ATLAS.cellHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${offset.x}" y="${offset.y + 58}" width="${54 + frameIndex}" height="${72 - frameIndex}" fill="#f6b73c"/>
      <rect x="${offset.x + 28 + frameIndex * 4}" y="${offset.y + 34}" width="12" height="${28 + frameIndex * 3}" fill="#1c7ed6"/>
      <rect x="${offset.x + 18}" y="${offset.y + 128 - (frameIndex % 2)}" width="${22 + frameIndex}" height="8" fill="#2f9e44"/>
    </svg>`
  ))
    .ensureAlpha()
    .png()
    .toFile(outputPath)
}

const writeTranslatedOfficialFrame = async ({ outputPath, frameIndex }) => {
  await sharp(Buffer.from(
    `<svg width="${CODEX_ATLAS.cellWidth}" height="${CODEX_ATLAS.cellHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${40 + frameIndex * 10}" y="${84 + frameIndex * 4}" width="58" height="72" fill="#f6b73c"/>
    </svg>`
  ))
    .ensureAlpha()
    .png()
    .toFile(outputPath)
}

const createOfficialFrameSvgBuffer = ({ rowIndex, frameIndex }) => Buffer.from(
  `<svg width="${CODEX_ATLAS.cellWidth}" height="${CODEX_ATLAS.cellHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${58 + rowIndex}" y="${96 - (frameIndex % 3)}" width="${46 + (frameIndex % 4)}" height="58" fill="#f6b73c"/>
    <rect x="${78 + frameIndex * 3}" y="${74 + (rowIndex % 4)}" width="12" height="${26 + (frameIndex % 5)}" fill="#1c7ed6"/>
    <rect x="${90 - (frameIndex % 2)}" y="150" width="${20 + (rowIndex % 3)}" height="8" fill="#2f9e44"/>
  </svg>`
)

const writeOfficialRowStrip = async ({ outputPath, row }) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const composites = row.durations.map((_duration, frameIndex) => ({
    input: createOfficialFrameSvgBuffer({ rowIndex: row.row, frameIndex }),
    left: frameIndex * CODEX_ATLAS.cellWidth,
    top: 0
  }))
  await sharp({
    create: {
      width: row.durations.length * CODEX_ATLAS.cellWidth,
      height: CODEX_ATLAS.cellHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)
}

const writeOfficialRows = async ({ rootDir }) => {
  const rows = []
  for (const row of CODEX_ROWS) {
    const frameDir = path.join(rootDir, row.id)
    fs.mkdirSync(frameDir, { recursive: true })
    const frames = []
    for (let frameIndex = 0; frameIndex < row.durations.length; frameIndex += 1) {
      const framePath = path.join(frameDir, `${String(frameIndex + 1).padStart(2, '0')}.png`)
      await writeOfficialFrame({ outputPath: framePath, rowIndex: row.row, frameIndex })
      frames.push({ index: frameIndex, path: framePath })
    }
    rows.push({
      actionId: row.id,
      sourceRelativePath: `runs/run-1/rows/${row.id}/strip.png`,
      quality: row.id === 'running-left'
        ? FULL_PET_ROW_QUALITY.APPROVED_MIRROR
        : FULL_PET_ROW_QUALITY.ROW_REAL,
      frames
    })
  }
  return { rows }
}

test('real atlas builder creates a Codex atlas from generated image pixels', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({ dataDir })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')

  const result = await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: createGenerationResult(relativePath),
    outputDir,
    qaDir
  })

  const metadata = await sharp(result.previewPath).metadata()
  assert.equal(metadata.width, CODEX_ATLAS.cellWidth)
  assert.equal(metadata.height, CODEX_ATLAS.cellHeight)
  assert.equal(result.previewOnly, true)
  assert.equal(result.spritesheetPath, '')
  assert.equal(fs.existsSync(path.join(outputDir, 'spritesheet.webp')), false)
  assert.equal(fs.existsSync(path.join(outputDir, 'pet.json')), false)
  assert.notEqual(
    crypto.createHash('sha256').update(fs.readFileSync(result.previewPath)).digest('hex'),
    crypto.createHash('sha256').update(createMinimalWebp()).digest('hex')
  )
  const sourceQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'source-image-validation.json'), 'utf-8'))
  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  assert.equal(sourceQa.ok, true)
  assert.equal(sourceQa.sourceRelativePath, relativePath)
  assert.equal(sourceQa.visiblePixels > 0, true)
  assert.equal(sourceQa.sourceSha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(dataDir, relativePath))).digest('hex'))
  assert.equal(atlasQa.ok, true)
  assert.equal(atlasQa.width, CODEX_ATLAS.width)
  assert.equal(atlasQa.height, CODEX_ATLAS.height)
  assert.equal(atlasQa.atlasSha256, crypto.createHash('sha256').update(fs.readFileSync(result.spritesheetPath)).digest('hex'))
  assert.equal(atlasQa.sourceRelativePath, relativePath)
  assert.equal(atlasQa.basicActions.baseIdentityCoverage, true)
  assert.deepEqual(atlasQa.basicActions.requiredRealActionIds, [])
  assert.deepEqual(atlasQa.basicActions.realActionIds, [])
  assert.equal(atlasQa.basicActions.fallbackActionIds.includes('waving'), true)
  assert.equal(atlasQa.basicActions.fallbackActionIds.includes('idle'), true)
  assert.deepEqual(atlasQa.basicActions.missingRequiredActionIds, [])
  assert.equal(atlasQa.basicActions.missingRequiredOfficialActionIds.includes('idle'), true)
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'idle').fallback, true)
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'idle').quality, 'base-preview')
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'waving').fallback, true)
  assert.equal(atlasQa.visiblePixels, await countVisiblePixels(result.previewPath))
  assert.equal(JSON.stringify(sourceQa).includes(dataDir), false)
  assert.equal(JSON.stringify(atlasQa).includes(dataDir), false)
})

test('real atlas builder removes opaque edge backgrounds from preview fallback sprites', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeStripedPetSourcePng({ dataDir })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')

  const result = await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: createGenerationResult(relativePath),
    outputDir,
    qaDir
  })

  const sourceQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'source-image-validation.json'), 'utf-8'))
  assert.equal(sourceQa.sourceBackgroundRemoved, true)
  assert.equal(sourceQa.sourceBackgroundRemovedRatio > 0.25, true)
  assert.equal(await countNearTransparentPixelsWithRgb(result.spritesheetPath), 0)
  const idleVisiblePixels = await countVisiblePixelsInCell({
    imagePath: result.spritesheetPath,
    row: CODEX_ROWS.find((row) => row.id === 'idle'),
    column: 0
  })
  assert.equal(idleVisiblePixels < CODEX_ATLAS.cellWidth * CODEX_ATLAS.cellHeight * 0.55, true)
})

test('real atlas builder keeps preview fallback rows visually stable instead of manufacturing motion variants', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({ dataDir })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')

  const result = await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: createGenerationResult(relativePath),
    outputDir,
    qaDir
  })

  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  for (const row of CODEX_ROWS) {
    const uniqueFrameCount = new Set(await getRowCellHashes(result.spritesheetPath, row)).size
    assert.equal(uniqueFrameCount, 1, `${row.id} preview fallback should not manufacture motion`)
    assert.equal(
      atlasQa.frame.rows.find((candidate) => candidate.id === row.id)?.uniqueFrameCount,
      uniqueFrameCount
    )
    assert.equal(
      atlasQa.frame.rows.find((candidate) => candidate.id === row.id)?.sourceQuality,
      row.id === 'idle' ? 'base-preview' : 'synthesized-preview'
    )
  }
})

test('real atlas builder composes official row package into complete Codex action coverage', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({ dataDir })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')
  const officialRows = await writeOfficialRows({
    rootDir: path.join(dataDir, 'runs', 'run-1', 'official-row-frames')
  })

  const result = await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: createGenerationResult(relativePath),
    outputDir,
    qaDir,
    officialRows
  })

  const metadata = await sharp(result.spritesheetPath).metadata()
  assert.equal(metadata.width, CODEX_ATLAS.width)
  assert.equal(metadata.height, CODEX_ATLAS.height)
  for (const row of CODEX_ROWS) {
    for (let column = 0; column < CODEX_ATLAS.columns; column += 1) {
      const visiblePixels = await countVisiblePixelsInCell({
        imagePath: result.spritesheetPath,
        row,
        column
      })
      assert.equal(
        visiblePixels > 0,
        column < row.durations.length,
        `${row.id} cell ${column} visibility should match official frame coverage`
      )
    }
  }

  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  const sourceQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'source-image-validation.json'), 'utf-8'))
  const rowQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'full-pet-row-validation.json'), 'utf-8'))
  assert.equal(atlasQa.ok, true)
  assert.equal(sourceQa.sourceSha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(dataDir, relativePath))).digest('hex'))
  assert.equal(atlasQa.atlasSha256, crypto.createHash('sha256').update(fs.readFileSync(result.spritesheetPath)).digest('hex'))
  assert.equal(atlasQa.visualReview.contactSheet, 'runs/run-1/qa/full-pet-contact-sheet.png')
  assert.equal(fs.existsSync(path.join(dataDir, atlasQa.visualReview.contactSheet)), true)
  const contactSheetMetadata = await sharp(path.join(dataDir, atlasQa.visualReview.contactSheet)).metadata()
  assert.equal(contactSheetMetadata.width, CODEX_ATLAS.width)
  assert.equal(contactSheetMetadata.height, CODEX_ATLAS.height)
  assert.deepEqual(
    atlasQa.visualReview.previews.map((preview) => [preview.actionId, preview.path, preview.frameCount]),
    CODEX_ROWS.map((row) => [
      row.id,
      `runs/run-1/qa/previews/${row.id}.gif`,
      row.durations.length
    ])
  )
  for (const preview of atlasQa.visualReview.previews) {
    const previewPath = path.join(dataDir, preview.path)
    const metadata = await sharp(previewPath, { animated: true }).metadata()
    assert.equal(metadata.width, CODEX_ATLAS.cellWidth)
    assert.equal(metadata.pageHeight, CODEX_ATLAS.cellHeight)
    assert.equal(metadata.pages, preview.frameCount)
  }
  assert.deepEqual(atlasQa.basicActions.realActionIds, CODEX_ROWS.map((row) => row.id))
  assert.deepEqual(atlasQa.basicActions.fallbackActionIds, [])
  assert.deepEqual(atlasQa.basicActions.missingRequiredOfficialActionIds, [])
  assert.deepEqual(
    atlasQa.basicActions.rows.map((row) => [row.actionId, row.fallback, row.quality]),
    CODEX_ROWS.map((row) => [
      row.id,
      false,
      row.id === 'running-left' ? FULL_PET_ROW_QUALITY.APPROVED_MIRROR : FULL_PET_ROW_QUALITY.ROW_REAL
    ])
  )
  assert.deepEqual(
    rowQa.rows.map((row) => [row.actionId, row.quality]),
    CODEX_ROWS.map((row) => [
      row.id,
      row.id === 'running-left' ? FULL_PET_ROW_QUALITY.APPROVED_MIRROR : FULL_PET_ROW_QUALITY.ROW_REAL
    ])
  )
  assert.equal(JSON.stringify(atlasQa).includes(dataDir), false)
  assert.equal(JSON.stringify(rowQa).includes(dataDir), false)
})

test('real atlas builder applies stable-slots before composing jittered official rows', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({ dataDir })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')
  const officialRows = await writeOfficialRows({
    rootDir: path.join(dataDir, 'runs', 'run-1', 'official-row-frames')
  })
  const waving = officialRows.rows.find((row) => row.actionId === 'waving')
  for (const [frameIndex, frame] of waving.frames.entries()) {
    await writeJitteredOfficialFrame({ outputPath: frame.path, frameIndex })
  }

  const result = await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: createGenerationResult(relativePath),
    outputDir,
    qaDir,
    officialRows
  })

  const rowQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'full-pet-row-validation.json'), 'utf-8'))
  const wavingQa = rowQa.rows.find((row) => row.actionId === 'waving')
  assert.equal(wavingQa.quality, FULL_PET_ROW_QUALITY.ROW_REAL)
  assert.deepEqual(wavingQa.errors, [])
  assert.equal(wavingQa.stabilization.method, 'stable-slots')
  assert.equal(wavingQa.stabilization.frameWidth, CODEX_ATLAS.cellWidth)
  assert.equal(wavingQa.stabilization.frameHeight, CODEX_ATLAS.cellHeight)
  assert.equal(wavingQa.preStabilization.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.equal(wavingQa.preStabilization.errors.includes('row_centroid_drift'), true)
  assert.equal(wavingQa.preStabilization.errors.includes('row_baseline_drift'), true)
  assert.equal(wavingQa.baselineDrift <= 30, true)
  assert.equal(wavingQa.centroidDrift <= 40, true)
  assert.equal(
    fs.existsSync(path.join(dataDir, 'runs', 'run-1', 'qa', 'stable-rows', 'waving', 'stable-slots-metadata.json')),
    true
  )

  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  assert.equal(atlasQa.frame.rows.find((row) => row.id === 'waving').sourceQuality, FULL_PET_ROW_QUALITY.ROW_REAL)
  assert.equal(new Set(await getRowCellHashes(result.spritesheetPath, CODEX_ROWS.find((row) => row.id === 'waving'))).size, 4)
  assert.equal(JSON.stringify(rowQa).includes(dataDir), false)
})

test('real atlas builder still rejects transform-like official rows after stable-slots retry', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({ dataDir })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')
  const officialRows = await writeOfficialRows({
    rootDir: path.join(dataDir, 'runs', 'run-1', 'official-row-frames')
  })
  const running = officialRows.rows.find((row) => row.actionId === 'running')
  for (const [frameIndex, frame] of running.frames.entries()) {
    await writeTranslatedOfficialFrame({ outputPath: frame.path, frameIndex })
  }

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: createGenerationResult(relativePath),
      outputDir,
      qaDir,
      officialRows
    }),
    /Official full-pet row running failed QA:/
  )
  assert.equal(
    fs.existsSync(path.join(dataDir, 'runs', 'run-1', 'qa', 'stable-rows', 'running', 'stable-slots-metadata.json')),
    false
  )
})

test('real atlas builder accepts row frames extracted from official row job manifest outputs', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({ dataDir })
  const manifest = createFullPetRowJobManifest({
    runId: 'run-1',
    baseSourceRelativePath: relativePath,
    canonicalReferenceRelativePath: 'runs/run-1/references/canonical-base.png'
  })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')
  const officialRows = []

  for (const row of CODEX_ROWS) {
    const job = manifest.jobs.find((candidate) => candidate.actionId === row.id)
    const stripPath = path.join(dataDir, job.outputRelativePath)
    const frameDir = path.join(dataDir, 'runs', 'run-1', 'rows', row.id, 'frames')
    await writeOfficialRowStrip({ outputPath: stripPath, row })
    const extracted = await extractRowStripFrames({
      dataDir,
      stripPath,
      actionId: row.id,
      outputDir: frameDir
    })
    officialRows.push({
      actionId: row.id,
      sourceRelativePath: job.outputRelativePath,
      quality: row.id === 'running-left'
        ? FULL_PET_ROW_QUALITY.APPROVED_MIRROR
        : FULL_PET_ROW_QUALITY.ROW_REAL,
      frames: extracted.frames
    })
  }

  await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: createGenerationResult(relativePath),
    outputDir,
    qaDir,
    officialRows: { rows: officialRows }
  })

  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  const rowQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'full-pet-row-validation.json'), 'utf-8'))
  assert.deepEqual(atlasQa.basicActions.realActionIds, CODEX_ROWS.map((row) => row.id))
  assert.deepEqual(atlasQa.basicActions.missingRequiredOfficialActionIds, [])
  assert.equal(rowQa.rows.length, CODEX_ROWS.length)
  assert.equal(rowQa.rows.every((row) => row.quality === FULL_PET_ROW_QUALITY.ROW_REAL || row.quality === FULL_PET_ROW_QUALITY.APPROVED_MIRROR), true)
  assert.equal(JSON.stringify(atlasQa).includes(dataDir), false)
  assert.equal(JSON.stringify(rowQa).includes(dataDir), false)
})

test('real atlas builder rejects official row frame paths outside data directory', async () => {
  const dataDir = makeTempDataDir()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-real-atlas-row-outside-'))
  const outsideFramePath = path.join(outsideDir, 'outside-frame.png')
  const { relativePath } = await writeSourcePng({ dataDir })
  await writeOfficialFrame({
    outputPath: outsideFramePath,
    rowIndex: 0,
    frameIndex: 0
  })
  const officialRows = await writeOfficialRows({
    rootDir: path.join(dataDir, 'runs', 'run-1', 'official-row-frames')
  })
  officialRows.rows.find((row) => row.actionId === 'idle').frames[0].path = outsideFramePath

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: createGenerationResult(relativePath),
      outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
      qaDir: path.join(dataDir, 'runs', 'run-1', 'qa'),
      officialRows
    }),
    /Official full-pet row frame path escaped/
  )
})

test('real atlas builder rejects approved-mirror quality for non-running-left official rows', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({ dataDir })
  const officialRows = await writeOfficialRows({
    rootDir: path.join(dataDir, 'runs', 'run-1', 'official-row-frames')
  })
  officialRows.rows.find((row) => row.actionId === 'waving').quality = FULL_PET_ROW_QUALITY.APPROVED_MIRROR

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: createGenerationResult(relativePath),
      outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
      qaDir: path.join(dataDir, 'runs', 'run-1', 'qa'),
      officialRows
    }),
    /Only running-left may use approved-mirror/
  )
})

test('real atlas builder strips unsafe official row source paths from qa artifacts', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({ dataDir })
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')
  const officialRows = await writeOfficialRows({
    rootDir: path.join(dataDir, 'runs', 'run-1', 'official-row-frames')
  })
  officialRows.rows.find((row) => row.actionId === 'idle').sourceRelativePath = '/Users/mango/private/idle-strip.png'

  await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: createGenerationResult(relativePath),
    outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
    qaDir,
    officialRows
  })

  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'idle').sourceRelativePath, '')
  assert.equal(JSON.stringify(atlasQa).includes('/Users/mango'), false)
})

test('real atlas builder does not count action-specific single images as official row-strip actions', async () => {
  const dataDir = makeTempDataDir()
  const base = await writeSourcePng({
    dataDir,
    relativePath: 'runs/run-1/frames/base/0001.png',
    rgba: { r: 30, g: 180, b: 110, alpha: 1 }
  })
  const idle = await writeSourcePng({
    dataDir,
    relativePath: 'runs/run-1/frames/base/idle/0001.png',
    rgba: { r: 90, g: 120, b: 240, alpha: 1 }
  })
  const waving = await writeSourcePng({
    dataDir,
    relativePath: 'runs/run-1/frames/base/waving/0001.png',
    rgba: { r: 240, g: 120, b: 90, alpha: 1 }
  })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')

  await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: {
      ...createGenerationResult(base.relativePath),
      outputs: [
        { dataRelativePath: base.relativePath, mimeType: 'image/png', sha256: 'base-sha' },
        { dataRelativePath: idle.relativePath, mimeType: 'image/png', sha256: 'idle-sha', actionId: 'idle' },
        { dataRelativePath: waving.relativePath, mimeType: 'image/png', sha256: 'waving-sha', actionId: 'waving' }
      ]
    },
    outputDir,
    qaDir
  })

  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  assert.deepEqual(atlasQa.basicActions.realActionIds, [])
  assert.deepEqual(atlasQa.basicActions.missingRequiredActionIds, [])
  assert.equal(atlasQa.basicActions.missingRequiredOfficialActionIds.includes('idle'), true)
  assert.equal(atlasQa.basicActions.missingRequiredOfficialActionIds.includes('waving'), true)
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'idle').sourceRelativePath, idle.relativePath)
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'waving').sourceRelativePath, waving.relativePath)
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'idle').quality, 'single-image-preview')
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'waving').quality, 'single-image-preview')
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'waiting').fallback, true)
})

test('real atlas builder does not count transparent action-specific outputs as real basic actions', async () => {
  const dataDir = makeTempDataDir()
  const base = await writeSourcePng({
    dataDir,
    relativePath: 'runs/run-1/frames/base/0001.png',
    rgba: { r: 30, g: 180, b: 110, alpha: 1 }
  })
  const transparentWaving = await writeSourcePng({
    dataDir,
    relativePath: 'runs/run-1/frames/base/waving/0001.png',
    rgba: { r: 240, g: 120, b: 90, alpha: 0 }
  })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')

  const result = await buildRealAtlasFromGeneratedImage({
    dataDir,
    generationResult: {
      ...createGenerationResult(base.relativePath),
      outputs: [
        { dataRelativePath: base.relativePath, mimeType: 'image/png', sha256: 'base-sha' },
        { dataRelativePath: transparentWaving.relativePath, mimeType: 'image/png', sha256: 'transparent-waving-sha', actionId: 'waving' }
      ]
    },
    outputDir,
    qaDir
  })

  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  const wavingCell = await sharp(result.spritesheetPath)
    .extract({
      left: 0,
      top: 3 * CODEX_ATLAS.cellHeight,
      width: CODEX_ATLAS.cellWidth,
      height: CODEX_ATLAS.cellHeight
    })
    .ensureAlpha()
    .raw()
    .stats()

  assert.deepEqual(atlasQa.basicActions.realActionIds, [])
  assert.equal(atlasQa.basicActions.fallbackActionIds.includes('waving'), true)
  assert.deepEqual(atlasQa.basicActions.missingRequiredActionIds, [])
  assert.equal(atlasQa.basicActions.rows.find((row) => row.actionId === 'waving').fallback, true)
  assert.equal(await countVisiblePixels(result.previewPath) > 0, true)
})

test('real atlas builder rejects missing generated image outputs', async () => {
  const dataDir = makeTempDataDir()

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [] },
      outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
      qaDir: path.join(dataDir, 'runs', 'run-1', 'qa')
    }),
    /Generated image is missing/
  )
})

test('real atlas builder rejects generated image paths outside data directory', async () => {
  const dataDir = makeTempDataDir()

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: createGenerationResult('../escape.png'),
      outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
      qaDir: path.join(dataDir, 'runs', 'run-1', 'qa')
    }),
    /Generated image path escaped/
  )
})

test('real atlas builder rejects generated image symlinks escaping data directory', async (t) => {
  const dataDir = makeTempDataDir()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-real-atlas-outside-'))
  const outsidePath = path.join(outsideDir, 'outside.png')
  await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 255, g: 120, b: 80, alpha: 1 }
    }
  })
    .png()
    .toFile(outsidePath)
  const relativePath = 'runs/run-1/frames/base/escape.png'
  const symlinkPath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true })
  try {
    fs.symlinkSync(outsidePath, symlinkPath)
  } catch (error) {
    t.skip(`File symlinks are unavailable: ${error.message}`)
    return
  }

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: createGenerationResult(relativePath),
      outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
      qaDir: path.join(dataDir, 'runs', 'run-1', 'qa')
    }),
    /Generated image path escaped/
  )
})

test('real atlas builder rejects undecodable generated images', async () => {
  const dataDir = makeTempDataDir()
  const relativePath = 'runs/run-1/frames/base/not-an-image.png'
  const sourcePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
  fs.writeFileSync(sourcePath, 'not an image')

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: createGenerationResult(relativePath),
      outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
      qaDir: path.join(dataDir, 'runs', 'run-1', 'qa')
    }),
    /Generated image could not be decoded/
  )
})

test('real atlas builder rejects generated images with no visible pixels', async () => {
  const dataDir = makeTempDataDir()
  const { relativePath } = await writeSourcePng({
    dataDir,
    rgba: { r: 255, g: 255, b: 255, alpha: 0 }
  })

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: createGenerationResult(relativePath),
      outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
      qaDir: path.join(dataDir, 'runs', 'run-1', 'qa')
    }),
    /Generated image contains no visible pixels/
  )
})

test('real atlas builder rejects generated images that exceed the size limit', async () => {
  const dataDir = makeTempDataDir()
  const relativePath = 'runs/run-1/frames/base/too-large.png'
  const sourcePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
  fs.writeFileSync(sourcePath, Buffer.alloc((25 * 1024 * 1024) + 1, 1))

  await assert.rejects(
    buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: createGenerationResult(relativePath),
      outputDir: path.join(dataDir, 'runs', 'run-1', 'outputs'),
      qaDir: path.join(dataDir, 'runs', 'run-1', 'qa')
    }),
    /Generated image is too large to process/
  )
})
