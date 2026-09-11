const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const canonicalIpcPath = path.join(projectRoot, 'apps', 'desktop', 'src', 'ipc', 'index.js')
const deprecatedDirectoryEntryPath = path.join(projectRoot, 'src', 'main', 'ipc', 'index.js')

test('main resolves IPC through the canonical file without a directory entry', () => {
  const mainSource = fs.readFileSync(path.join(projectRoot, 'apps', 'desktop', 'main.js'), 'utf-8')

  assert.equal(require.resolve('../../apps/desktop/src/ipc'), canonicalIpcPath)
  assert.match(mainSource, /require\('\.\/src\/ipc'\)/)
  assert.equal(fs.existsSync(deprecatedDirectoryEntryPath), false)
})
