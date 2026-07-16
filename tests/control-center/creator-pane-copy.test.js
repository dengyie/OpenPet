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
