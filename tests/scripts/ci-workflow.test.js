const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const workflowPath = path.join(__dirname, '../../.github/workflows/ci.yml')
const workflow = fs.readFileSync(workflowPath, 'utf-8')

test('CI cancels superseded runs and bounds the verify job', () => {
  assert.match(
    workflow,
    /^concurrency:\n  group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n  cancel-in-progress: true$/m
  )
  assert.match(workflow, /^  verify:\n    timeout-minutes: 30\n    runs-on: ubuntu-latest$/m)
})

test('CI installs Playwright Chromium before running Node tests', () => {
  const installIndex = workflow.indexOf('run: npx playwright install --with-deps chromium')
  const testIndex = workflow.indexOf('run: npm test')

  assert.notEqual(installIndex, -1, 'CI should install the Chromium binary and Linux dependencies')
  assert.notEqual(testIndex, -1, 'CI should retain the Node test step')
  assert.ok(installIndex < testIndex, 'Chromium installation must happen before npm test')
})
