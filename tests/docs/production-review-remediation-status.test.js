const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const plan = fs.readFileSync(
  path.resolve(__dirname, '../../docs/superpowers/plans/2026-07-12-production-review-remediation.md'),
  'utf-8'
)

test('production review remediation is a closed execution record', () => {
  assert.match(plan, /Status:\s*Complete/i)
  assert.doesNotMatch(plan, /^\s*- \[ \]/m)
  assert.match(plan, /## Completion Evidence/)

  for (const commit of [
    '6d818b37',
    '57c65f4a',
    'eccea6c6',
    'a2658943',
    '066393ec',
    '69d72c13',
    '7b22aadd',
    'fc935ab2',
    '871941d4',
    'cb3992bb',
    '0792de6c'
  ]) {
    assert.match(plan, new RegExp('\\b' + commit + '\\b'), 'missing completion evidence ' + commit)
  }
})
