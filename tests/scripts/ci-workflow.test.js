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

test('CI blocks high production vulnerabilities and critical full-tree vulnerabilities', () => {
  assert.match(workflow, /run: npm audit --omit=dev --audit-level=high/)
  assert.match(workflow, /run: npm audit --include=dev --audit-level=critical/)
  assert.doesNotMatch(workflow, /^\s+run: npm audit\s*$/m)
})

test('CI runs API contract and documentation drift checks as independent gates', () => {
  const apiContractIndex = workflow.indexOf('run: npm run check:api-contract')
  const docsDriftIndex = workflow.indexOf('run: npm run check:docs-drift')
  const testIndex = workflow.indexOf('run: npm test')

  assert.notEqual(apiContractIndex, -1, 'CI should run the API contract gate explicitly')
  assert.notEqual(docsDriftIndex, -1, 'CI should run the documentation drift gate explicitly')
  assert.ok(apiContractIndex < testIndex, 'API contract gate must run before the test suite')
  assert.ok(docsDriftIndex < testIndex, 'Documentation drift gate must run before the test suite')
  assert.match(workflow, /- name: Check API contract\n\s+run: npm run check:api-contract/)
  assert.match(workflow, /- name: Check documentation drift\n\s+run: npm run check:docs-drift/)
})
