const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const { generateSpritesFromFrames, inspectFrameFolder } = require('../../src/main/services/sprite-generator')

const createFrame = async (filePath, width, height) => {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.8 }
    }
  }).png().toFile(filePath)
}

const createTrimmedFrame = async (filePath, width, height, visible) => {
  const transparent = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).png().toBuffer()

  const visiblePatch = await sharp({
    create: {
      width: visible.width,
      height: visible.height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 }
    }
  }).png().toBuffer()

  await sharp(transparent)
    .composite([{ input: visiblePatch, left: visible.x, top: visible.y }])
    .png()
    .toFile(filePath)
}

test('sprite generator discovers frame folders and writes animations config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-sprites-'))
  const framesRoot = path.join(root, 'flames')
  const spritesDir = path.join(root, 'sprites')
  const configPath = path.join(root, 'animations.json')
  const waveDir = path.join(framesRoot, 'wave')
  fs.mkdirSync(waveDir, { recursive: true })
  await createFrame(path.join(waveDir, '02_no_bg.png'), 12, 14)
  await createFrame(path.join(waveDir, '01_no_bg.png'), 10, 10)

  const result = await generateSpritesFromFrames({ framesRoot, spritesDir, configPath })

  assert.equal(result.actions.length, 1)
  assert.equal(result.defaultAction, 'wave')
  assert.equal(result.clickAction, 'wave')
  assert.deepEqual({
    id: result.actions[0].id,
    label: result.actions[0].label,
    loop: result.actions[0].loop,
    frameMs: result.actions[0].frameMs,
    frameWidth: result.actions[0].frameWidth,
    frameHeight: result.actions[0].frameHeight,
    sprite: result.actions[0].sprite,
    frameCount: result.actions[0].frameCount
  }, {
    id: 'wave',
    label: 'wave',
    loop: false,
    frameMs: 95,
    frameWidth: 12,
    frameHeight: 14,
    sprite: path.posix.join('cat_anime', 'sprites', 'wave.png'),
    frameCount: 2
  })
  assert.equal(Array.isArray(result.actions[0].frames), true)
  assert.deepEqual(result.actions[0].viewport, { x: 0, y: 0, width: 12, height: 14, padding: 8 })
  assert.equal(fs.existsSync(path.join(spritesDir, 'wave.png')), true)
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf-8')), result)
})

test('sprite generator inspects frame folders before import', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-inspect-'))
  await createFrame(path.join(root, '10_no_bg.png'), 18, 12)
  await createFrame(path.join(root, '02_no_bg.png'), 10, 20)
  fs.writeFileSync(path.join(root, 'notes.txt'), 'ignore me')

  const result = await inspectFrameFolder(root)

  assert.equal(result.valid, true)
  assert.equal(result.frameCount, 2)
  assert.equal(result.maxWidth, 18)
  assert.equal(result.maxHeight, 20)
  assert.deepEqual(result.frames.map((frame) => frame.fileName), ['02_no_bg.png', '10_no_bg.png'])
  assert.deepEqual(result.skippedFiles, ['notes.txt'])
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.warnings, ['Frame dimensions differ; frames will be centered in the largest cell'])
})

test('sprite generator records alpha trim metadata and action viewport bounds', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-trim-'))
  const framesRoot = path.join(root, 'flames')
  const spritesDir = path.join(root, 'sprites')
  const configPath = path.join(root, 'animations.json')
  const waveDir = path.join(framesRoot, 'wave')
  fs.mkdirSync(waveDir, { recursive: true })
  await createTrimmedFrame(path.join(waveDir, '01_no_bg.png'), 20, 20, { x: 4, y: 6, width: 7, height: 8 })
  await createTrimmedFrame(path.join(waveDir, '02_no_bg.png'), 20, 20, { x: 8, y: 3, width: 5, height: 12 })

  const result = await generateSpritesFromFrames({ framesRoot, spritesDir, configPath })
  const action = result.actions[0]

  assert.deepEqual(action.frames.map((frame) => frame.trim), [
    { x: 4, y: 6, width: 7, height: 8 },
    { x: 8, y: 3, width: 5, height: 12 }
  ])
  assert.deepEqual(action.viewport, { x: 4, y: 3, width: 9, height: 12, padding: 8 })
})

test('sprite generator reports missing alpha channel in frame inspection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-inspect-alpha-'))
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  }).png().toFile(path.join(root, '01.png'))

  const result = await inspectFrameFolder(root)

  assert.equal(result.valid, false)
  assert.equal(result.frameCount, 1)
  assert.deepEqual(result.errors, ['01.png has no alpha channel'])
  assert.deepEqual(result.warnings, [])
})

test('sprite generator reports empty frame folders as errors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-inspect-empty-'))

  const result = await inspectFrameFolder(root)

  assert.equal(result.valid, false)
  assert.equal(result.frameCount, 0)
  assert.deepEqual(result.errors, ['No image files found'])
  assert.deepEqual(result.warnings, [])
})
