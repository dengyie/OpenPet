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
const {
  FULL_PET_ROW_QUALITY,
  OFFICIAL_FULL_PET_ACTION_IDS
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
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
  assert.equal(atlasQa.ok, false)
  assert.equal(atlasQa.previewOnly, true)
  assert.equal(atlasQa.reason, 'official_action_rows_required')
  assert.equal(atlasQa.previewSha256, crypto.createHash('sha256').update(fs.readFileSync(result.previewPath)).digest('hex'))
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
