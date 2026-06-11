const test = require('node:test')
const assert = require('node:assert/strict')

const { findSemanticAction } = require('../../src/main/services/ai-action-orchestrator')

const actions = [
  { id: 'idle', label: '待机', kind: 'idle' },
  { id: 'feed', label: '喂食', kind: 'click' },
  { id: 'wave', label: '挥手', kind: 'greeting' },
  { id: 'done', label: '完成', kind: 'success' }
]

test('findSemanticAction matches explicit action labels', () => {
  assert.deepEqual(findSemanticAction('我来给小猫喂食。', actions), {
    actionId: 'feed',
    label: '喂食',
    kind: 'click',
    matchedTerm: '喂食'
  })
})

test('findSemanticAction matches limited kind terms', () => {
  assert.deepEqual(findSemanticAction('Hello, I am here.', actions), {
    actionId: 'wave',
    label: '挥手',
    kind: 'greeting',
    matchedTerm: 'hello'
  })
})

test('findSemanticAction ignores idle actions', () => {
  assert.equal(findSemanticAction('保持待机就好。', actions), null)
})

test('findSemanticAction prefers explicit ids over kind terms', () => {
  assert.deepEqual(findSemanticAction('wave hello', actions), {
    actionId: 'wave',
    label: '挥手',
    kind: 'greeting',
    matchedTerm: 'wave'
  })
})

test('findSemanticAction avoids partial ascii token matches', () => {
  assert.equal(findSemanticAction('The sidewalk is quiet.', actions), null)
})

test('findSemanticAction does not treat generic click wording as intent', () => {
  assert.equal(findSemanticAction('请点击保存按钮。', actions), null)
  assert.equal(findSemanticAction('Click the save button.', actions), null)
})
