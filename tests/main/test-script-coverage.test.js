const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'))

test('package scripts expose core and auxiliary test suites separately', () => {
  const scripts = packageJson.scripts || {}

  assert.equal(scripts.test, 'node --test "tests/**/*.test.js"')
  assert.equal(scripts['check:docs-drift'], 'node scripts/check-docs-drift.js')
  assert.match(scripts['test:core'], /tests\/main\/\*\.test\.js/)
  assert.match(scripts['test:core'], /tests\/services\/\*\.test\.js/)
  assert.match(scripts['test:core'], /tests\/shared\/\*\.test\.js/)
  assert.match(scripts['test:core'], /tests\/pet-pack\/\*\.test\.js/)
  assert.match(scripts['test:core'], /tests\/plugins\/\*\.test\.js/)
  assert.match(scripts['test:core'], /tests\/examples\/\*\.test\.js/)
  assert.match(scripts['test:core'], /tests\/renderer-\*\.test\.js/)
  assert.match(scripts['test:core'], /tests\/control-center\/\*\.test\.js/)
  assert.equal(scripts['test:core:all'], 'npm run test:core && npm run test:control-center')
  assert.match(scripts['test:tools'], /tests\/scripts\/\*\.test\.js/)
  assert.match(scripts['test:tools'], /tests\/release\/\*\.test\.js/)
  assert.equal(scripts['test:control-center'], 'node scripts/run-control-center-playwright.js')
  assert.equal(scripts['create-ai-talk-local-smoke-archive'], 'node scripts/create-ai-talk-local-smoke-archive.js')
  assert.equal(scripts['update-ai-talk-local-smoke-report'], 'node scripts/update-ai-talk-local-smoke-report.js')
  assert.equal(scripts['run-agent-awareness-local-smoke'], 'node scripts/run-agent-awareness-local-smoke.js')
  assert.equal(scripts['create-agent-awareness-local-smoke-archive'], 'node scripts/create-agent-awareness-local-smoke-archive.js')
  assert.equal(scripts['update-agent-awareness-local-smoke-report'], 'node scripts/update-agent-awareness-local-smoke-report.js')
})

test('packaged app includes bundled official plugin directories', () => {
  const buildFiles = Array.isArray(packageJson.build?.files) ? packageJson.build.files : []

  assert.equal(buildFiles.includes('examples/plugins/creator-studio/**/*'), true)
  assert.equal(buildFiles.includes('examples/plugins/agent-awareness/**/*'), true)
})
