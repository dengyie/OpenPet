#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const playwrightCoreDirectory = path.dirname(require.resolve('playwright-core'))
const browserManifest = JSON.parse(fs.readFileSync(path.join(playwrightCoreDirectory, 'browsers.json'), 'utf8'))
const chromiumRevision = browserManifest.browsers.find((browser) => browser.name === 'chromium')?.revision

function browserInstallPath(root, name, revision, platform = process.platform, architecture = process.arch) {
  const platformDirectory = {
    darwin: architecture === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac',
    linux: 'chrome-linux',
    win32: 'chrome-win'
  }[platform]
  if (!platformDirectory) return null
  if (name === 'chromium') {
    const executable = platform === 'darwin'
      ? path.join('Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
      : platform === 'win32' ? 'chrome.exe' : 'chrome'
    return path.join(root, `chromium-${revision}`, platformDirectory, executable)
  }
  const shellPlatformDirectory = platform === 'darwin'
    ? architecture === 'arm64' ? 'chrome-headless-shell-mac-arm64' : 'chrome-headless-shell-mac'
    : platform === 'win32' ? 'chrome-headless-shell-win64' : 'chrome-headless-shell-linux64'
  const executable = platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'
  return path.join(root, `chromium_headless_shell-${revision}`, shellPlatformDirectory, executable)
}

function candidateDirectories({ explicit, tempDirectory, defaultCacheDirectory, fallbackCacheDirectory }) {
  const candidates = []
  if (explicit && explicit !== '0') candidates.push(path.resolve(explicit))
  candidates.push(path.join(tempDirectory, 'openpet-playwright-20261008'))
  candidates.push(path.join('/tmp', 'openpet-playwright-20261008'))
  candidates.push(path.join(tempDirectory, 'openpet-playwright'))
  candidates.push(path.join('/tmp', 'openpet-playwright'))
  candidates.push(defaultCacheDirectory)
  if (fallbackCacheDirectory) candidates.push(fallbackCacheDirectory)
  return [...new Set(candidates)]
}

function hasRequiredBrowserInstalls(root, revision, platform = process.platform, architecture = process.arch) {
  return ['chromium', 'chromium-headless-shell']
    .every((name) => fs.existsSync(browserInstallPath(root, name, revision, platform, architecture)))
}

function resolveBrowserRoot({ revision, explicit, tempDirectory, defaultCacheDirectory, fallbackCacheDirectory, platform = process.platform, architecture = process.arch }) {
  return candidateDirectories({ explicit, tempDirectory, defaultCacheDirectory, fallbackCacheDirectory })
    .find((root) => hasRequiredBrowserInstalls(root, revision, platform, architecture))
}

function main() {
  const browserRoot = resolveBrowserRoot({
    revision: chromiumRevision,
    explicit: process.env.PLAYWRIGHT_BROWSERS_PATH,
    tempDirectory: os.tmpdir(),
    defaultCacheDirectory: path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    fallbackCacheDirectory: path.join(os.homedir(), '.cache', 'ms-playwright')
  })
  if (browserRoot) process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot

  const result = spawnSync(process.execPath, ['--test', 'tests/**/*.test.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

if (require.main === module) main()

module.exports = { browserInstallPath, candidateDirectories, hasRequiredBrowserInstalls, resolveBrowserRoot }
