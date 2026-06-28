const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../..')

test('plugin service uses the shared runtime registry instead of parallel ad-hoc runtime maps', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src', 'main', 'services', 'plugin-service.js'), 'utf-8')

  assert.match(source, /createPluginRuntimeRegistry/)
  assert.doesNotMatch(source, /const serviceRuntimes = new Map\(\)/)
  assert.doesNotMatch(source, /const setupRuntimes = new Map\(\)/)
  assert.doesNotMatch(source, /const commandRuntimes = new Map\(\)/)
})
