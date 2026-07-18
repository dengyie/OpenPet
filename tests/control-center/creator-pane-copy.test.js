const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const creatorPanePath = path.resolve(__dirname, '../../src/control-center/src/panes/CreatorPane.tsx')

test('creator pane copy explains internal anchor preparation instead of rejecting composite-board wording', () => {
  const source = fs.readFileSync(creatorPanePath, 'utf-8')

  assert.doesNotMatch(source, /不要使用拼图、三视图或多视图合成图/)
  assert.match(source, /OpenPet 会在内部准备角色锚定视图和动作锚定视图/)
  assert.match(source, /上传的图片仍是身份最高优先级/)
})

test('creator pane exposes only bounded hatch-pet shadow fields and non-authoritative copy', () => {
  const source = fs.readFileSync(creatorPanePath, 'utf-8')
  assert.match(source, /hatchPetAgent\.mode/)
  assert.match(source, /hatchPetAgent\.status/)
  assert.match(source, /hatchPetAgent\.decision/)
  assert.match(source, /hatchPetAgent\.decisionId/)
  assert.doesNotMatch(source, /hatchPetAgent\.(raw|message|path|output)/)
})

test('creator pane renders workflow stage and action progress feedback', () => {
  const source = fs.readFileSync(creatorPanePath, 'utf-8')
  assert.match(source, /creator-progress-stages/)
  assert.match(source, /creator-progress-actions/)
  assert.match(source, /creator-progress-summary/)
  assert.match(source, /preview-ready/)
  assert.match(source, /阶段：/)
})

test('creator pane hook gives explicit feedback for non-previewable states and stopped dashboard service', () => {
  const hookPath = path.resolve(__dirname, '../../src/control-center/src/hooks/useCreatorPane.ts')
  const source = fs.readFileSync(hookPath, 'utf-8')
  assert.match(source, /当前状态不可预览/)
 assert.match(source, /serviceStatus !== 'running'/)
 assert.match(source, /请先启动 Creator Studio Service/)
 assert.match(source, /setInterval/)
  assert.match(source, /lastRun\.diagnostics/)
})
