const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')
const { spawn } = require('child_process')
const sharp = require('sharp')

const { buildMacosSystemCursorHelper } = require('../../scripts/build-macos-system-cursor-helper')

const shouldRun = process.platform === 'darwin' && process.env.OPENPET_RUN_NATIVE_CURSOR_SMOKE === '1'

const waitForMessage = (messages, event, version, timeoutMs = 4000) => new Promise((resolve, reject) => {
  const timeoutId = setTimeout(() => reject(new Error(`Timed out waiting for ${event}:${version}`)), timeoutMs)
  messages.once(`${event}:${version}`, (message) => {
    clearTimeout(timeoutId)
    resolve(message)
  })
})

test('macOS cursor helper activates, updates, and exits cleanly', { skip: !shouldRun }, async (t) => {
  const projectRoot = path.resolve(__dirname, '..', '..')
  const build = buildMacosSystemCursorHelper({ projectRoot })
  const helperPath = build.outputPath || path.join(projectRoot, 'build', 'native', process.arch, 'OpenPetSystemCursor')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-native-cursor-smoke-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const imagePath = path.join(root, 'cursor.png')
  const configPath = path.join(root, 'config.json')
  await sharp({
    create: {
      width: 24,
      height: 24,
      channels: 4,
      background: { r: 255, g: 80, b: 120, alpha: 1 }
    }
  }).png().toFile(imagePath)
  fs.writeFileSync(configPath, JSON.stringify({
    version: 'smoke-1',
    imagePath,
    width: 24,
    height: 24,
    hotspotX: 12,
    hotspotY: 12
  }))

  const child = spawn(helperPath, ['--config', configPath, '--parent-pid', String(process.pid)], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const messages = new (require('events').EventEmitter)()
  const stderr = []
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line)
    messages.emit(`${message.event}:${message.version || ''}`, message)
  })
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)))
  const exitPromise = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))

  await waitForMessage(messages, 'ready', 'smoke-1')
  assert.equal(child.exitCode, null)

  fs.writeFileSync(configPath, JSON.stringify({
    version: 'smoke-2',
    imagePath,
    width: 32,
    height: 32,
    hotspotX: 16,
    hotspotY: 16
  }))
  const updatedPromise = waitForMessage(messages, 'updated', 'smoke-2')
  child.kill('SIGHUP')
  await updatedPromise

  child.kill('SIGTERM')
  const exit = await exitPromise
  assert.deepEqual(exit, { code: 0, signal: null })
  assert.deepEqual(stderr, [])
})

