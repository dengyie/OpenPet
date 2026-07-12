const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-settings-storage-'))
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath: () => userDataDir,
        isPackaged: false,
        setLoginItemSettings: () => {}
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { settingsPath, defaultSettings, loadSettings, saveSettings } = require('../../src/main/settings')
Module._load = originalLoad

const backupPath = `${settingsPath}.bak`

const resetStore = () => {
  fs.rmSync(settingsPath, { force: true })
  fs.rmSync(backupPath, { force: true })
  for (const entry of fs.readdirSync(userDataDir)) {
    if (entry.startsWith('settings.json.') && entry.endsWith('.tmp')) {
      fs.rmSync(path.join(userDataDir, entry), { force: true })
    }
  }
}

test.beforeEach(resetStore)

test('saveSettings atomically replaces the primary and retains the previous valid file as backup', () => {
  fs.writeFileSync(settingsPath, JSON.stringify({ scale: 1.25 }), 'utf-8')

  saveSettings({ scale: 1.5 })

  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf-8')), { scale: 1.5 })
  assert.deepEqual(JSON.parse(fs.readFileSync(backupPath, 'utf-8')), { scale: 1.25 })
  assert.equal(fs.readdirSync(userDataDir).some((entry) => entry.endsWith('.tmp')), false)
})

test('saveSettings leaves the previous primary unchanged when final replacement fails', () => {
  fs.writeFileSync(settingsPath, JSON.stringify({ scale: 1.25 }), 'utf-8')
  const previousFile = fs.readFileSync(settingsPath, 'utf-8')
  const originalRenameSync = fs.renameSync

  fs.renameSync = (source, destination) => {
    if (destination === settingsPath) throw new Error('simulated replacement failure')
    return originalRenameSync(source, destination)
  }
  try {
    assert.throws(() => saveSettings({ scale: 1.5 }), /simulated replacement failure/)
  } finally {
    fs.renameSync = originalRenameSync
  }

  assert.equal(fs.readFileSync(settingsPath, 'utf-8'), previousFile)
  assert.equal(fs.readdirSync(userDataDir).some((entry) => entry.endsWith('.tmp')), false)
})

test('loadSettings recovers a malformed primary from the last-known-good backup', () => {
  fs.writeFileSync(settingsPath, '{malformed', 'utf-8')
  fs.writeFileSync(backupPath, JSON.stringify({ scale: 1.75, walkSpeed: 3 }), 'utf-8')
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  let settings
  try {
    settings = loadSettings()
  } finally {
    console.warn = originalWarn
  }

  assert.equal(settings.scale, 1.75)
  assert.equal(settings.walkSpeed, 3)
  assert.equal(warnings.some((message) => message.includes('primary')), true)
})

test('loadSettings reports invalid primary and backup before falling back to defaults', () => {
  fs.writeFileSync(settingsPath, '{malformed-primary', 'utf-8')
  fs.writeFileSync(backupPath, '{malformed-backup', 'utf-8')
  const warnings = []
  const errors = []
  const originalWarn = console.warn
  const originalError = console.error
  console.warn = (...args) => warnings.push(args.join(' '))
  console.error = (...args) => errors.push(args.join(' '))
  let settings
  try {
    settings = loadSettings()
  } finally {
    console.warn = originalWarn
    console.error = originalError
  }

  assert.equal(settings.scale, defaultSettings.scale)
  assert.equal(warnings.some((message) => message.includes('primary')), true)
  assert.equal(warnings.some((message) => message.includes('backup')), true)
  assert.equal(errors.some((message) => message.includes('defaults')), true)
})
