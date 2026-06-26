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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-import-'))
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

test('action import service inspects a selected frames folder for an action id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-inspect-'))
  const sourceDir = path.join(root, 'source-wave')
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createFrame(path.join(sourceDir, '02_no_bg.png'))
  await createFrame(path.join(sourceDir, '10_no_bg.png'))

  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  const result = await service.inspectActionFrames({ sourceDir, actionId: 'wave' })

  assert.equal(result.folderName, 'source-wave')
  assert.equal(result.actionId, 'wave')
  assert.equal(result.inspection.valid, true)
  assert.deepEqual(result.inspection.errors, [])
})

test('action import service reports duplicate action ids during inspection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-duplicate-'))
  const sourceDir = path.join(root, 'source-idle')
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createFrame(path.join(sourceDir, '01_no_bg.png'))
  await createActionFolder(framesRoot, 'idle')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()

  const result = await service.inspectActionFrames({ sourceDir, actionId: 'idle' })

  assert.equal(result.inspection.valid, false)
  assert.deepEqual(result.inspection.errors, ['Action ID already exists: idle'])
})

test('action import service blocks duplicate action ids during final import', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-import-duplicate-'))
  const sourceDir = path.join(root, 'source-idle')
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createFrame(path.join(sourceDir, '01_no_bg.png'))
  await createActionFolder(framesRoot, 'idle')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()

  await assert.rejects(
    () => service.importActionFrames({ sourceDir, actionId: 'idle' }),
    /Action ID already exists: idle/
  )
})

test('action import service updates default and click actions without dropping actions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-config-'))
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

test('action import service preserves trigger proposal inbox while regenerating config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-trigger-inbox-'))
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  await createActionFolder(framesRoot, 'idle')
  await createActionFolder(framesRoot, 'wave')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()
  const current = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  fs.writeFileSync(configPath, `${JSON.stringify({
    ...current,
    triggerProposalInbox: [{
      id: 'proposal:click:wave:test',
      actionId: 'wave',
      type: 'click',
      status: 'pending'
    }]
  }, null, 2)}\n`, 'utf-8')

  const result = await service.updateActionConfig({
    defaultAction: 'wave',
    clickAction: 'idle'
  })

  assert.equal(result.triggerProposalInbox[0].id, 'proposal:click:wave:test')
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf-8')).triggerProposalInbox[0].actionId, 'wave')
})

test('action import service preserves valid trigger rules while regenerating config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-trigger-rules-'))
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  await createActionFolder(framesRoot, 'idle')
  await createActionFolder(framesRoot, 'wave')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()
  const current = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  fs.writeFileSync(configPath, `${JSON.stringify({
    ...current,
    triggerRules: [{
      id: 'rule:state:wave:test',
      type: 'state',
      actionId: 'wave',
      enabled: true,
      condition: {
        stateKey: 'posture',
        equals: 'resting'
      }
    }]
  }, null, 2)}\n`, 'utf-8')

  const result = await service.updateActionConfig({
    defaultAction: 'wave',
    clickAction: 'idle'
  })

  assert.equal(result.triggerRules.length, 1)
  assert.equal(result.triggerRules[0].id, 'rule:state:wave:test')
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf-8')).triggerRules[0].actionId, 'wave')
})

test('action import service preserves custom labels after regenerating config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-label-'))
  const sourceDir = path.join(root, 'source-wave')
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createFrame(path.join(sourceDir, '01_no_bg.png'))
  await createFrame(path.join(sourceDir, '02_no_bg.png'))
  const service = createActionImportService({ framesRoot, spritesDir, configPath })

  await service.importActionFrames({ sourceDir, actionId: 'wave', label: '挥手' })
  const result = await service.updateActionConfig({ defaultAction: 'wave', clickAction: 'wave' })

  assert.equal(result.actions.find((action) => action.id === 'wave').label, '挥手')
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf-8')).actions[0].label, '挥手')
})

test('action import service deletes an action and regenerates config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-delete-'))
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

test('action import service prunes orphaned trigger rules when deleting an action', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-delete-trigger-rule-'))
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  await createActionFolder(framesRoot, 'idle')
  await createActionFolder(framesRoot, 'wave')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()
  const current = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  fs.writeFileSync(configPath, `${JSON.stringify({
    ...current,
    triggerRules: [{
      id: 'rule:state:wave:test',
      type: 'state',
      actionId: 'wave',
      enabled: true,
      condition: {
        stateKey: 'posture',
        equals: 'resting'
      }
    }]
  }, null, 2)}\n`, 'utf-8')

  const result = await service.deleteAction('wave')

  assert.deepEqual(result.actions.map((action) => action.id), ['idle'])
  assert.deepEqual(result.triggerRules || [], [])
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf-8')).triggerRules || [], [])
})

test('action import service refuses to delete the last valid action', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-delete-last-'))
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  await createActionFolder(framesRoot, 'idle')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()

  await assert.rejects(
    () => service.deleteAction('idle'),
    /Cannot delete the last action/
  )

  assert.equal(fs.existsSync(path.join(framesRoot, 'idle')), true)
  assert.equal(fs.existsSync(path.join(spritesDir, 'idle.png')), true)
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf-8')).defaultAction, 'idle')
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
