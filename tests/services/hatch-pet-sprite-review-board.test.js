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

test('video review retains detail pixels and native runtime previews in separate regions', async () => {
  const dir = createTempDir()
  const detailPath = path.join(dir, 'detail.png')
  const runtimePath = path.join(dir, 'runtime.png')
  const pixels = Buffer.alloc(512 * 512 * 4)
  for (let y = 0; y < 512; y += 1) for (let x = 0; x < 512; x += 1) {
    const offset = (y * 512 + x) * 4
    const value = x % 2 ? 255 : 0
    pixels.set([value, value, value, 255], offset)
  }
  await sharp(pixels, { raw: { width: 512, height: 512, channels: 4 } }).png().toFile(detailPath)
  await sharp(detailPath).resize(128, 128).png().toFile(runtimePath)
  const board = await createActionEvaluatorBoard({
    sourcePath: detailPath, canonicalPath: detailPath,
    candidateFrames: Array.from({ length: 6 }, () => ({ path: detailPath })),
    runtimeFrames: Array.from({ length: 6 }, () => ({ path: runtimePath })),
    outputPath: path.join(dir, 'board.png')
  })
  const detail = board.regions.find(r => r.regionId === 'frame-1')
  const runtime = board.regions.find(r => r.regionId === 'runtime-frame-1')
  assert.ok(runtime, 'runtime-size evidence must remain visible alongside full-resolution frames')
  assert.equal(runtime.width, 128)
  const renderedDetail = await sharp(board.path).extract({ left: detail.x, top: detail.y, width: 512, height: 512 }).raw().toBuffer()
  assert.deepEqual(renderedDetail, pixels, 'detail evidence must not be reconstructed from the lossy runtime reduction')
  const renderedRuntime = await sharp(board.path).extract({ left: runtime.x, top: runtime.y, width: 128, height: 128 }).raw().toBuffer()
  assert.deepEqual(renderedRuntime, await sharp(runtimePath).raw().toBuffer())
  await assert.rejects(createActionEvaluatorBoard({
    sourcePath: detailPath, canonicalPath: detailPath,
    candidateFrames: Array.from({ length: 6 }, () => ({ path: detailPath })), runtimeFrames: [{ path: runtimePath }], outputPath: path.join(dir, 'invalid.png')
  }), /same frame count/)
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
  assert.equal(metadata.height, 2048)
  assert.deepEqual(result.regions.map((region) => region.regionId), ['source', 'canonical', 'action-review', 'atlas'])
  assert.deepEqual(result.regions.map((region) => [region.x, region.y, region.width, region.height]), [
    [0, 0, 512, 512],
    [512, 0, 512, 512],
    [1024, 0, 1024, 512],
    [0, 512, 2048, 1536]
  ])
  const { data, info } = await sharp(result.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let index = 3; index < data.length; index += info.channels) assert.equal(data[index], 255)
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
  assert.equal(result.regions.find((region) => region.regionId === 'atlas').fitMode, 'complete-action-sequences')
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

test('final atlas proof retains every used phase at readable size, including a nonrepresentative work beat', async () => {
  const dir = createTempDir()
  const atlasPath = path.join(dir, 'phase-atlas.png')
  const ordinary = await sharp({ create: { width: 80, height: 110, channels: 4, background: '#ddbb22' } }).png().toBuffer()
  const peak = await sharp({ create: { width: 80, height: 110, channels: 4, background: '#ee22cc' } }).png().toBuffer()
  const rows = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract').OFFICIAL_FULL_PET_ROWS
  const composites = rows.flatMap(row => Array.from({ length: row.frameCount }, (_, index) => ({
    input: row.id === 'running' && index === 4 ? peak : ordinary,
    left: index * 192 + 56,
    top: row.row * 208 + 49
  })))
  await sharp({ create: { width: 1536, height: 1872, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png().toFile(atlasPath)
  const result = await createFinalPackageEvaluatorBoard({ sourcePath: atlasPath, canonicalPath: atlasPath, actionReviewPath: atlasPath, atlasPath, outputPath: path.join(dir, 'complete-phases.png') })
  const atlas = result.regions.find(region => region.regionId === 'atlas')
  const { data, info } = await sharp(result.path).extract({ left: atlas.x, top: atlas.y, width: atlas.width, height: atlas.height }).raw().toBuffer({ resolveWithObject: true })
  let peakPixels = 0
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 210 && data[i + 1] < 80 && data[i + 2] > 170) peakPixels++
  assert.ok(peakPixels > 8000, `the fifth working beat needs readable proof, not only a tiny overview (${peakPixels} pixels)`)
})

test('complete atlas sequences keep a shared crop so airborne offsets survive the proof rendering', async () => {
  const dir = createTempDir()
  const atlasPath = path.join(dir, 'jump-atlas.png')
  const subject = await sharp({ create: { width: 60, height: 60, channels: 4, background: '#cc22dd' } }).png().toBuffer()
  await sharp({ create: { width: 1536, height: 1872, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: subject, left: 66, top: 4 * 208 + 120 },
    { input: subject, left: 2 * 192 + 66, top: 4 * 208 + 20 }
  ]).png().toFile(atlasPath)
  const result = await createFinalPackageEvaluatorBoard({ sourcePath: atlasPath, canonicalPath: atlasPath, actionReviewPath: atlasPath, atlasPath, outputPath: path.join(dir, 'jump-proof.png') })
  const atlas = result.regions.find(region => region.regionId === 'atlas')
  const { data, info } = await sharp(result.path).extract({ left: atlas.x, top: atlas.y, width: atlas.width, height: atlas.height }).raw().toBuffer({ resolveWithObject: true })
  const centers = [0, 2].map(column => {
    let sum = 0, count = 0
    for (let y = 0; y < info.height; y++) for (let x = column * 256; x < (column + 1) * 256; x++) {
      const i = (y * info.width + x) * info.channels
      if (data[i] > 170 && data[i + 1] < 90 && data[i + 2] > 170) { sum += y; count++ }
    }
    assert.ok(count > 0)
    return sum / count
  })
  assert.ok(centers[0] - centers[1] > 80, 'the airborne phase must stay above the grounded contact instead of being independently centered')
})

test('final proof preserves cross-action size ratios rather than fitting every action independently', async () => {
  const dir = createTempDir()
  const atlasPath = path.join(dir, 'shared-scale.png')
  const square = await sharp({ create: { width: 60, height: 60, channels: 4, background: '#cc22dd' } }).png().toBuffer()
  const larger = await sharp({ create: { width: 90, height: 90, channels: 4, background: '#cc22dd' } }).png().toBuffer()
  await sharp({ create: { width: 1536, height: 1872, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: square, left: 66, top: 120 },
    { input: square, left: 66, top: 4 * 208 + 120 },
    { input: square, left: 2 * 192 + 66, top: 4 * 208 + 20 },
    { input: larger, left: 51, top: 7 * 208 + 90 }
  ]).png().toFile(atlasPath)
  const board = await createFinalPackageEvaluatorBoard({ sourcePath: atlasPath, canonicalPath: atlasPath, actionReviewPath: atlasPath, atlasPath, outputPath: path.join(dir, 'board.png') })
  const bounds = async (row) => {
    const { data, info } = await sharp(board.path).extract({ left: 0, top: 512 + row * 170, width: 256, height: 170 }).raw().toBuffer({ resolveWithObject: true })
    let left = info.width, right = -1
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels
      if (data[i] > 170 && data[i + 1] < 90 && data[i + 2] > 170) { left = Math.min(left, x); right = Math.max(right, x) }
    }
    return right - left + 1
  }
  const idleWidth = await bounds(0), jumpWidth = await bounds(4), largeWidth = await bounds(7)
  assert.ok(Math.abs(idleWidth - jumpWidth) <= 1, `identical source subjects must retain equal size across actions (${idleWidth}, ${jumpWidth})`)
  assert.ok(largeWidth / idleWidth > 1.4 && largeWidth / idleWidth < 1.6, 'a real source size mismatch must remain visible instead of being normalized away')
  const jumpRegion = board.regions.find(region => region.regionId === 'sequence-jumping')
  assert.equal(jumpRegion.role, 'final-action-sequence')
  assert.equal(jumpRegion.y, 512 + 4 * 170)
  assert.equal(jumpRegion.width, 5 * 256)
})

test('final summary preserves airborne motion instead of trimming each representative frame', async () => {
  const dir = createTempDir()
  const atlasPath = path.join(dir, 'summary-jump.png')
  const square = await sharp({ create: { width: 60, height: 60, channels: 4, background: '#cc22dd' } }).png().toBuffer()
  await sharp({ create: { width: 1536, height: 1872, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: square, left: 66, top: 4 * 208 + 120 },
    { input: square, left: 2 * 192 + 66, top: 4 * 208 + 20 },
    { input: square, left: 4 * 192 + 66, top: 4 * 208 + 120 }
  ]).png().toFile(atlasPath)
  const board = await createFinalPackageEvaluatorBoard({ sourcePath: atlasPath, canonicalPath: atlasPath, actionReviewPath: atlasPath, atlasPath, outputPath: path.join(dir, 'board.png') })
  const { data, info } = await sharp(board.path).extract({ left: 1024 + 341, top: 170, width: 341, height: 170 }).raw().toBuffer({ resolveWithObject: true })
  const centers = [0, 1].map(slot => {
    let sum = 0, count = 0
    for (let y = 0; y < info.height; y++) for (let x = slot * 113; x < (slot + 1) * 113; x++) {
      const i = (y * info.width + x) * info.channels
      if (data[i] > 170 && data[i + 1] < 90 && data[i + 2] > 170) { sum += y; count++ }
    }
    assert.ok(count > 0)
    return sum / count
  })
  assert.ok(centers[0] - centers[1] > 60, `the summary must preserve jump displacement (${centers.join(', ')})`)
})
