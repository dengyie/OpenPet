const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { browserInstallPath, hasRequiredBrowserInstalls, resolveBrowserRoot } = require('../../scripts/run-full-node-tests')

test('full Node test runner chooses a cache containing the matching Playwright revision', (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-browser-cache-'))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const selectedRoot = path.join(tempDirectory, 'openpet-playwright-20261008')
  for (const name of ['chromium', 'chromium-headless-shell']) {
    const executable = browserInstallPath(selectedRoot, name, '1223', 'darwin', 'arm64')
    fs.mkdirSync(path.dirname(executable), { recursive: true })
    fs.writeFileSync(executable, '')
  }

  assert.equal(hasRequiredBrowserInstalls(selectedRoot, '1223', 'darwin', 'arm64'), true)
  assert.equal(hasRequiredBrowserInstalls(tempDirectory, '1223', 'darwin', 'arm64'), false)

  assert.equal(resolveBrowserRoot({
    revision: '1223',
    explicit: '',
    tempDirectory,
    defaultCacheDirectory: '/missing/default-cache',
      platform: 'darwin',
      architecture: 'arm64'
  }), selectedRoot)
})

test('full Node test runner honors an explicit matching browser cache first', (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-browser-cache-'))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const explicitRoot = path.join(tempDirectory, 'explicit')
  const automaticRoot = path.join(tempDirectory, 'openpet-playwright-20261008')
  for (const root of [explicitRoot, automaticRoot]) {
    for (const name of ['chromium', 'chromium-headless-shell']) {
      const executable = browserInstallPath(root, name, '1223', 'darwin', 'arm64')
      fs.mkdirSync(path.dirname(executable), { recursive: true })
      fs.writeFileSync(executable, '')
    }
  }
  assert.equal(hasRequiredBrowserInstalls(explicitRoot, '1223', 'darwin', 'arm64'), true)

  assert.equal(resolveBrowserRoot({
    revision: '1223',
    explicit: explicitRoot,
    tempDirectory,
    defaultCacheDirectory: '/missing/default-cache',
    platform: 'darwin',
    architecture: 'arm64'
  }), explicitRoot)
})
