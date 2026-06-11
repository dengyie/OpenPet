const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const { createActionImportService } = require('../../src/main/services/action-import-service')

const createFrame = async (filePath) => {
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 100, b: 255, alpha: 0.9 }
    }
  }).png().toFile(filePath)
}

const createActionFolder = async (framesRoot, actionId) => {
  const actionDir = path.join(framesRoot, actionId)
  fs.mkdirSync(actionDir, { recursive: true })
  await createFrame(path.join(actionDir, '01_no_bg.png'))
  await createFrame(path.join(actionDir, '02_no_bg.png'))
}

test('action import service copies selected frames folder and regenerates actions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-action-import-'))
  const sourceDir = path.join(root, 'source-wave')
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createFrame(path.join(sourceDir, '01_no_bg.png'))
  await createFrame(path.join(sourceDir, '02_no_bg.png'))

  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  const result = await service.importActionFrames({
    sourceDir,
    actionId: 'wave',
    label: '挥手'
  })

  assert.equal(fs.existsSync(path.join(framesRoot, 'wave', '01_no_bg.png')), true)
  assert.equal(fs.existsSync(path.join(spritesDir, 'wave.png')), true)
  assert.equal(result.importedAction.id, 'wave')
  assert.equal(result.importedAction.label, '挥手')
  assert.equal(result.actions.length, 1)
})

test('action import service updates default and click actions without dropping actions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-action-config-'))
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  await createActionFolder(framesRoot, 'idle')
  await createActionFolder(framesRoot, 'wave')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()

  const result = await service.updateActionConfig({
    defaultAction: 'wave',
    clickAction: 'idle'
  })

  assert.equal(result.defaultAction, 'wave')
  assert.equal(result.clickAction, 'idle')
  assert.deepEqual(result.actions.map((action) => action.id).sort(), ['idle', 'wave'])
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf-8')).defaultAction, 'wave')
})

test('action import service deletes an action and regenerates config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-action-delete-'))
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  await createActionFolder(framesRoot, 'idle')
  await createActionFolder(framesRoot, 'wave')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()

  const result = await service.deleteAction('wave')

  assert.equal(fs.existsSync(path.join(framesRoot, 'wave')), false)
  assert.equal(fs.existsSync(path.join(spritesDir, 'wave.png')), false)
  assert.deepEqual(result.actions.map((action) => action.id), ['idle'])
  assert.equal(result.defaultAction, 'idle')
  assert.equal(result.clickAction, 'idle')
})

test('action import service rejects unsafe action ids', async () => {
  const service = createActionImportService({
    framesRoot: '/tmp/flames',
    spritesDir: '/tmp/sprites',
    configPath: '/tmp/animations.json'
  })

  await assert.rejects(
    () => service.importActionFrames({ sourceDir: '/tmp/source', actionId: '../bad' }),
    /Invalid action id/
  )
})
