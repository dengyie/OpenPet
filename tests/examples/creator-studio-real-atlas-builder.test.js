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

  const metadata = await sharp(result.spritesheetPath).metadata()
  assert.equal(metadata.width, CODEX_ATLAS.width)
  assert.equal(metadata.height, CODEX_ATLAS.height)
  assert.notEqual(
    crypto.createHash('sha256').update(fs.readFileSync(result.spritesheetPath)).digest('hex'),
    crypto.createHash('sha256').update(createMinimalWebp()).digest('hex')
  )
  for (const row of CODEX_ROWS) {
    for (let column = 0; column < row.durations.length; column += 1) {
      const cell = await sharp(result.spritesheetPath)
        .extract({
          left: column * CODEX_ATLAS.cellWidth,
          top: row.row * CODEX_ATLAS.cellHeight,
          width: CODEX_ATLAS.cellWidth,
          height: CODEX_ATLAS.cellHeight
        })
        .ensureAlpha()
        .raw()
        .stats()
      assert.equal(cell.channels[3].max > 0, true, `${row.id} cell ${column} should contain visible pixels`)
    }
  }

  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: 'real-atlas-cat',
    displayName: 'Real Atlas Cat',
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  assert.equal(loadPetPackFromDirectory(outputDir).manifest.id, 'real-atlas-cat')

  const sourceQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'source-image-validation.json'), 'utf-8'))
  const atlasQa = JSON.parse(fs.readFileSync(path.join(qaDir, 'atlas-validation.json'), 'utf-8'))
  assert.equal(sourceQa.ok, true)
  assert.equal(sourceQa.sourceRelativePath, relativePath)
  assert.equal(sourceQa.visiblePixels > 0, true)
  assert.equal(atlasQa.ok, true)
  assert.equal(atlasQa.width, CODEX_ATLAS.width)
  assert.equal(atlasQa.height, CODEX_ATLAS.height)
  assert.equal(atlasQa.sourceRelativePath, relativePath)
  assert.equal(atlasQa.visiblePixels, await countVisiblePixels(result.spritesheetPath))
  assert.equal(JSON.stringify(sourceQa).includes(dataDir), false)
  assert.equal(JSON.stringify(atlasQa).includes(dataDir), false)
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
