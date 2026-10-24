const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')

const {
  createActionEvaluatorBoard,
  createCanonicalEvaluatorBoard,
  createFinalPackageEvaluatorBoard,
  validateEvaluationRegions
} = require('../../examples/plugins/creator-studio/lib/hatch-pet-sprite-review-board')

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-review-board-'))
const writeColor = (outputPath, color) => sharp({ create: { width: 256, height: 256, channels: 4, background: color } }).png().toFile(outputPath)

const writeSparseOfficialAtlas = async (outputPath) => {
  const composites = []
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const frame = await sharp({
        create: {
          width: 28 + ((row + column) % 3) * 4,
          height: 54 + ((row * 2 + column) % 3) * 5,
          channels: 4,
          background: { r: 40 + row * 20, g: 80 + column * 15, b: 180, alpha: 1 }
        }
      }).png().toBuffer()
      composites.push({
        input: frame,
        left: column * 192 + Math.floor((192 - (28 + ((row + column) % 3) * 4)) / 2),
        top: row * 208 + Math.floor((208 - (54 + ((row * 2 + column) % 3) * 5)) * 0.55)
      })
    }
  }
  await sharp({
    create: { width: 1536, height: 1872, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png().toFile(outputPath)
}

const countAlphaPixels = async (filePath, extract) => {
  const { data, info } = await sharp(filePath).extract(extract).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let visible = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visible += 1
  }
  return visible
}

test('canonical evaluator board keeps source and up to four paid candidates in fixed quality-review cells', async () => {
  const dir = createTempDir()
  const paths = ['source', 'a', 'b', 'c', 'd'].map((name) => path.join(dir, `${name}.png`))
  await Promise.all(paths.map((filePath, index) => writeColor(filePath, { r: 50 + index * 40, g: 20, b: 200, alpha: 1 })))
  const result = await createCanonicalEvaluatorBoard({
    sourcePath: paths[0],
    candidates: paths.slice(1).map((candidatePath, index) => ({ candidateId: `candidate-${index + 1}`, path: candidatePath })),
    outputPath: path.join(dir, 'canonical-review.png')
  })

  const metadata = await sharp(result.path).metadata()
  assert.equal(metadata.width, 3072)
  assert.equal(metadata.height, 2048)
  assert.deepEqual(result.regions.map((region) => region.regionId), ['source', 'candidate-1', 'candidate-2', 'candidate-3', 'candidate-4'])
  assert.equal(new Set(result.regions.map((region) => region.sourceSha256)).size, 5)
})

test('action evaluator board uses fixed top references and lower 4x2 frame grid', async () => {
  const dir = createTempDir()
  const sourcePath = path.join(dir, 'source.png')
  const canonicalPath = path.join(dir, 'canonical.png')
  await Promise.all([writeColor(sourcePath, { r: 200, g: 20, b: 20, alpha: 1 }), writeColor(canonicalPath, { r: 20, g: 200, b: 20, alpha: 1 })])
  const frames = []
  for (let index = 0; index < 8; index += 1) {
    const framePath = path.join(dir, `frame-${index}.png`)
    await writeColor(framePath, { r: 20, g: 20 + index * 20, b: 200, alpha: 1 })
    frames.push({ index, path: framePath })
  }
  const result = await createActionEvaluatorBoard({
    sourcePath,
    canonicalPath,
    adjacentPath: '',
    candidateFrames: frames,
    outputPath: path.join(dir, 'action-review.png')
  })
  const metadata = await sharp(result.path).metadata()
  assert.equal(metadata.width, 2048)
  assert.equal(metadata.height, 1536)
  assert.equal(result.regions.filter((region) => region.role === 'candidate-frame').length, 8)
  assert.equal(result.regions.find((region) => region.regionId === 'frame-1').x, 0)
  assert.equal(result.regions.find((region) => region.regionId === 'frame-8').y, 1024)
})

test('final package evaluator board keeps source, canonical, action review, and atlas in fixed regions', async () => {
  const dir = createTempDir()
  const inputs = Object.fromEntries(['source', 'canonical', 'actions', 'atlas'].map((name, index) => [name, path.join(dir, `${name}.png`)]))
  await Promise.all(Object.values(inputs).map((filePath, index) => writeColor(filePath, { r: 30 + index * 40, g: 80, b: 180, alpha: 1 })))

  const result = await createFinalPackageEvaluatorBoard({
    sourcePath: inputs.source,
    canonicalPath: inputs.canonical,
    actionReviewPath: inputs.actions,
    atlasPath: inputs.atlas,
    outputPath: path.join(dir, 'final-package-review.png')
  })

  const metadata = await sharp(result.path).metadata()
  assert.equal(metadata.width, 2048)
  assert.equal(metadata.height, 1536)
  assert.deepEqual(result.regions.map((region) => region.regionId), ['source', 'canonical', 'action-review', 'atlas'])
  assert.deepEqual(result.regions.map((region) => [region.x, region.y, region.width, region.height]), [
    [0, 0, 512, 512],
    [512, 0, 512, 512],
    [1024, 0, 1024, 512],
    [0, 512, 2048, 1024]
  ])
})

test('final package evaluator board expands sparse official atlas cells into readable action details', async () => {
  const dir = createTempDir()
  const sourcePath = path.join(dir, 'source.png')
  const canonicalPath = path.join(dir, 'canonical.png')
  const atlasPath = path.join(dir, 'atlas.png')
  await Promise.all([
    writeColor(sourcePath, { r: 200, g: 20, b: 20, alpha: 1 }),
    writeColor(canonicalPath, { r: 20, g: 200, b: 20, alpha: 1 }),
    writeSparseOfficialAtlas(atlasPath)
  ])

  const result = await createFinalPackageEvaluatorBoard({
    sourcePath,
    canonicalPath,
    actionReviewPath: atlasPath,
    atlasPath,
    outputPath: path.join(dir, 'final-package-readable.png')
  })

  assert.equal(result.regions.find((region) => region.regionId === 'action-review').fitMode, 'readable-action-montage')
  assert.equal(result.regions.find((region) => region.regionId === 'atlas').fitMode, 'atlas-overview+readable-action-montage')
  for (let card = 0; card < 9; card += 1) {
    const actionVisible = await countAlphaPixels(result.path, {
      left: 1024 + (card % 3) * 341,
      top: Math.floor(card / 3) * 170,
      width: card % 3 === 2 ? 342 : 341,
      height: card / 3 === 2 ? 172 : 170
    })
    assert.ok(actionVisible > 5000, `action card ${card + 1} should contain enlarged visible content`)
  }
  const detailVisible = await countAlphaPixels(result.path, { left: 1024, top: 512, width: 1024, height: 1024 })
  assert.ok(detailVisible > 150000, 'atlas proof should include a readable detail montage')
})

test('evaluation evidence rejects unknown review-board region ids', () => {
  assert.throws(() => validateEvaluationRegions({
    evaluation: { defects: [{ regionId: 'missing' }] },
    regions: [{ regionId: 'source' }]
  }), /unknown review-board region/)
})
