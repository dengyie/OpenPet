const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')

const { getSpriteLayout } = require('../../examples/plugins/creator-studio/lib/action-sheet-layout')
const { processSpriteSheet } = require('../../examples/plugins/creator-studio/lib/sprite-frame-processor')

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-sprite-processor-'))

test('sprite processor splits exact cells and applies one sheet-level scale', async () => {
  const dir = createTempDir()
  const inputPath = path.join(dir, 'raw-sheet.png')
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <rect x="200" y="120" width="110" height="320" fill="#cc3344"/>
    <rect x="712" y="120" width="110" height="320" fill="#cc3344"/>
    <rect x="200" y="632" width="110" height="320" fill="#cc3344"/>
    <rect x="712" y="632" width="110" height="320" fill="#cc3344"/>
  </svg>`
  await sharp(Buffer.from(svg)).ensureAlpha().png().toFile(inputPath)

  const result = await processSpriteSheet({
    inputPath,
    outputDir: path.join(dir, 'processed'),
    layout: getSpriteLayout(4),
    profile: { characterClass: 'grounded-compact-character', anchorPolicy: 'compact-contact-root-v1', runtimeStandingHeightPx: 92 },
    actionPolicy: { actionId: 'waving', anchorPolicy: 'compact-contact-root-v1' }
  })

  assert.equal(result.frames.length, 4)
  assert.equal(new Set(result.metrics.frames.map((frame) => frame.appliedScale)).size, 1)
  assert.equal(result.metrics.frames.some((frame) => frame.pasteClamped), false)
  assert.equal(result.metrics.frames.some((frame) => frame.edgeTouch), false)
  for (const frame of result.frames) assert.equal(fs.existsSync(frame.path), true)
  assert.equal(fs.existsSync(result.contactSheet.path), true)
  assert.equal(fs.existsSync(result.gif.path), true)
  assert.equal(result.hashes.contactSheet, result.contactSheet.sha256)
  assert.equal(result.hashes.gif, result.gif.sha256)
  const gifMetadata = await sharp(result.gif.path, { animated: true }).metadata()
  assert.equal(gifMetadata.pages, 4)
})

test('sprite processor rejects visible pixels in declared unused cells', async () => {
  const dir = createTempDir()
  const inputPath = path.join(dir, 'raw-sheet.png')
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <rect x="200" y="120" width="110" height="320" fill="#cc3344"/>
    <rect x="712" y="120" width="110" height="320" fill="#cc3344"/>
    <rect x="200" y="632" width="110" height="320" fill="#cc3344"/>
    <rect x="712" y="632" width="110" height="320" fill="#cc3344"/>
  </svg>`
  await sharp(Buffer.from(svg)).ensureAlpha().png().toFile(inputPath)
  await assert.rejects(() => processSpriteSheet({
    inputPath,
    outputDir: path.join(dir, 'processed'),
    layout: { columns: 3, rows: 2, cellCount: 6, unusedCells: [5] },
    profile: { characterClass: 'grounded-compact-character' }
  }), /unused-cell-contamination/)
})

test('sprite processor records raw jumping trajectory for candidate QA', async () => {
  const dir = createTempDir()
  const inputPath = path.join(dir, 'jump-sheet.png')
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <rect x="120" y="600" width="120" height="220" fill="#cc3344"/>
    <rect x="440" y="500" width="120" height="220" fill="#cc3344"/>
    <rect x="760" y="300" width="120" height="180" fill="#cc3344"/>
    <rect x="120" y="600" width="120" height="220" fill="#cc3344"/>
    <rect x="440" y="500" width="120" height="220" fill="#cc3344"/>
  </svg>`
  await sharp(Buffer.from(svg)).ensureAlpha().png().toFile(inputPath)
  const result = await processSpriteSheet({
    inputPath,
    outputDir: path.join(dir, 'processed'),
    layout: { columns: 3, rows: 2, cellCount: 6, unusedCells: [5] },
    profile: { characterClass: 'grounded-compact-character' },
    actionPolicy: { actionId: 'jumping', anchorPolicy: 'action-relative-root-v1', minJumpExcursionRatio: 0.1 }
  })

  assert.ok(result.metrics.rawTrajectory.maxY - result.metrics.rawTrajectory.minY > 0.1)
})

test('sprite processor records paste clamp without cropping the paid candidate', async () => {
  const dir = createTempDir()
  const inputPath = path.join(dir, 'oversized-sheet.png')
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="20" width="470" height="470" fill="#cc3344"/>
    <rect x="532" y="20" width="470" height="470" fill="#cc3344"/>
    <rect x="20" y="532" width="470" height="470" fill="#cc3344"/>
    <rect x="532" y="532" width="470" height="470" fill="#cc3344"/>
  </svg>`
  await sharp(Buffer.from(svg)).ensureAlpha().png().toFile(inputPath)
  const result = await processSpriteSheet({
    inputPath,
    outputDir: path.join(dir, 'processed'),
    layout: getSpriteLayout(4),
    profile: { characterClass: 'grounded-compact-character', runtimeStandingHeightPx: 180 },
    actionPolicy: { actionId: 'waving', anchorPolicy: 'compact-contact-root-v1' }
  })

  assert.equal(result.metrics.frames.every((frame) => frame.pasteClamped), true)
  assert.equal(result.metrics.frames.every((frame) => frame.outputSuppressed), true)
  assert.equal(result.frames.every((frame) => fs.existsSync(frame.path)), true)
})
