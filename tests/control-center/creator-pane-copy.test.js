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


test('creator pane exposes partial import CTA, asset review bench, and retry entry points', () => {
  const source = fs.readFileSync(creatorPanePath, 'utf-8')
  assert.match(source, /creator-asset-review/)
  assert.match(source, /creator-action-matrix/)
  assert.match(source, /creator-import-available-actions/)
  assert.match(source, /查看提示词/)
  assert.match(source, /坏在哪/)
  assert.match(source, /onImportAvailableActions/)
  assert.match(source, /一键重生成失败动作/)
  assert.match(source, /data-testid=\{`creator-retry-action-\$\{action\.actionId\}`\}/)
})

test('creator pane asset review shows compare, process assets, lazy preview and copy feedback', () => {
  const source = fs.readFileSync(creatorPanePath, 'utf-8')
  assert.match(source, /creator-asset-compare/)
  assert.match(source, /creator-process-assets/)
  assert.match(source, /creator-asset-review-guide/)
  assert.match(source, /先导入可用动作/)
  assert.match(source, /一键重生成红项/)
  assert.match(source, /已复制/)
  assert.match(source, /onLoadAssetPreview/)
  assert.match(source, /LazyAssetThumb/)
  assert.match(source, /creator-load-preview/)
})

test('creator pane hook wires import available actions API', () => {
  const hookPath = path.resolve(__dirname, '../../src/control-center/src/hooks/useCreatorPane.ts')
  const source = fs.readFileSync(hookPath, 'utf-8')
  assert.match(source, /importCreatorAvailableActions/)
  assert.match(source, /onImportAvailableActions/)
  assert.match(source, /正在导入可用动作/)
})

test('creator pane hook loads asset previews on demand and marks prompt copy state', () => {
  const hookPath = path.resolve(__dirname, '../../src/control-center/src/hooks/useCreatorPane.ts')
  const source = fs.readFileSync(hookPath, 'utf-8')
  assert.match(source, /getCreatorAssetPreview/)
  assert.match(source, /onLoadAssetPreview/)
  assert.match(source, /setCopiedPromptKey/)
  assert.match(source, /预览仅支持已导入动作/)
  assert.match(source, /已复制/)
})
