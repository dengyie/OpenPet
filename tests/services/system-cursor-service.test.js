const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const { PassThrough } = require('stream')
const { spawnSync } = require('child_process')
const { setTimeout: delay } = require('timers/promises')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createSystemCursorService,
  materializeSystemCursorAsset
} = require('../../src/main/services/system-cursor-service')

const cursor = {
  enabled: true,
  assetPath: '/tmp/openpet-cursor.png',
  assetUrl: 'file:///tmp/openpet-cursor.png',
  fileName: 'openpet-cursor.png',
  width: 48,
  height: 48,
  hotspotX: 4,
  hotspotY: 6
}

const createFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-system-cursor-'))
  const helperPath = path.join(root, 'OpenPetSystemCursor')
  const imagePath = path.join(root, 'cursor.png')
  fs.writeFileSync(helperPath, '#!/bin/sh\n')
  fs.chmodSync(helperPath, 0o755)
  fs.writeFileSync(imagePath, Buffer.from('cursor'))
  return { root, helperPath, imagePath }
}

const createFakeChild = ({ onSignal } = {}) => {
  const child = new EventEmitter()
  child.pid = 4242
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.signals = []
  child.kill = (signal = 'SIGTERM') => {
    child.signals.push(signal)
    child.killed = signal === 'SIGKILL'
    onSignal?.(signal, child)
    return true
  }
  return child
}

const emitJsonLine = (child, payload) => {
  child.stdout.write(`${JSON.stringify(payload)}\n`)
}

test('system cursor service rejects whole-computer mode outside macOS', async () => {
  const service = createSystemCursorService({
    platform: 'win32',
    projectRoot: '/workspace/OpenPet',
    userDataPath: '/tmp/openpet',
    appLogService: { record: () => {} }
  })

  assert.equal(service.getStatus().supported, false)
  await assert.rejects(service.apply(cursor), /only supported on macOS/i)
})

test('system cursor service starts the helper and becomes active only after ready', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const spawnCalls = []
  const child = createFakeChild({
    onSignal: (signal, currentChild) => {
      if (signal === 'SIGTERM') queueMicrotask(() => currentChild.emit('exit', 0, signal))
    }
  })
  const service = createSystemCursorService({
    platform: 'darwin',
    arch: 'arm64',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: (...args) => {
      spawnCalls.push(args)
      queueMicrotask(() => emitJsonLine(child, { event: 'ready', version: '1' }))
      return child
    },
    parentPid: 12345,
    versionFactory: () => '1'
  })

  const applyPromise = service.apply(cursor)
  assert.equal(service.getStatus().active, false)
  const status = await applyPromise

  assert.equal(status.active, true)
  assert.equal(status.helperPid, 4242)
  assert.equal(spawnCalls.length, 1)
  assert.deepEqual(spawnCalls[0][1].slice(0, 2), ['--config', path.join(fixture.root, 'system-cursor-runtime', 'config.json')])
  assert.deepEqual(spawnCalls[0][1].slice(2), ['--parent-pid', '12345'])
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.root, 'system-cursor-runtime', 'config.json'), 'utf-8')).hotspotY, 6)

  await service.stop('test')
  assert.equal(service.getStatus().active, false)
  assert.deepEqual(child.signals, ['SIGTERM'])
})

test('system cursor service updates the active helper without spawning a second overlay', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  let nextVersion = 0
  let spawnCount = 0
  const configPath = path.join(fixture.root, 'system-cursor-runtime', 'config.json')
  const child = createFakeChild({
    onSignal: (signal, currentChild) => {
      if (signal === 'SIGHUP') {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        queueMicrotask(() => emitJsonLine(currentChild, { event: 'updated', version: config.version }))
      }
      if (signal === 'SIGTERM') queueMicrotask(() => currentChild.emit('exit', 0, signal))
    }
  })
  const service = createSystemCursorService({
    platform: 'darwin',
    arch: 'arm64',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => {
      spawnCount += 1
      queueMicrotask(() => emitJsonLine(child, { event: 'ready', version: '1' }))
      return child
    },
    versionFactory: () => String(++nextVersion)
  })

  await service.apply(cursor)
  await service.apply({ ...cursor, width: 72, height: 72, hotspotX: 6, hotspotY: 9 })

  assert.equal(spawnCount, 1)
  assert.deepEqual(child.signals, ['SIGHUP'])
  const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert.equal(savedConfig.version, '2')
  assert.equal(savedConfig.width, 72)
  assert.equal(savedConfig.hotspotY, 9)
  await service.dispose()
})

test('system cursor service rejects activation when the helper exits before ready', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const child = createFakeChild()
  const service = createSystemCursorService({
    platform: 'darwin',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => {
      queueMicrotask(() => child.emit('exit', 1, null))
      return child
    },
    versionFactory: () => 'failed-start'
  })

  await assert.rejects(service.apply(cursor), /before reporting ready/i)
  assert.equal(service.getStatus().active, false)
})

test('system cursor service does not leak a protocol timeout when spawning throws synchronously', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const service = createSystemCursorService({
    platform: 'darwin',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => { throw new Error('spawn failed') },
    protocolTimeoutMs: 5,
    versionFactory: () => 'spawn-failed'
  })

  await assert.rejects(service.apply(cursor), /spawn failed/)
  await delay(20)
  assert.equal(service.getStatus().active, false)
})

test('system cursor service waits for a timed-out generation to exit before accepting replacement readiness', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  let oldExited = false
  const oldChild = createFakeChild({
    onSignal: (signal, currentChild) => {
      if (signal === 'SIGKILL') {
        queueMicrotask(() => {
          oldExited = true
          currentChild.emit('exit', 0, signal)
        })
      }
    }
  })
  const replacementChild = createFakeChild()
  replacementChild.pid = 5252
  let spawnCount = 0
  const service = createSystemCursorService({
    platform: 'darwin',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => {
      spawnCount += 1
      if (spawnCount === 1) return oldChild
      if (!oldExited) queueMicrotask(() => emitJsonLine(oldChild, { event: 'ready', version: 'shared-version' }))
      return replacementChild
    },
    versionFactory: () => 'shared-version',
    protocolTimeoutMs: 10,
    stopTimeoutMs: 5
  })

  await assert.rejects(service.apply(cursor), /timed out waiting for ready/)

  let replacementSettled = false
  const replacement = service.apply(cursor).finally(() => {
    replacementSettled = true
  })
  while (spawnCount < 2) await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(oldExited, true)
  assert.equal(replacementSettled, false)
  emitJsonLine(replacementChild, { event: 'ready', version: 'shared-version' })
  const status = await replacement

  assert.equal(status.active, true)
  assert.equal(status.helperPid, 5252)
  assert.deepEqual(oldChild.signals, ['SIGTERM', 'SIGKILL'])

  let updateSettled = false
  const update = service.apply({ ...cursor, width: 72 }).finally(() => {
    updateSettled = true
  })
  while (!replacementChild.signals.includes('SIGHUP')) await new Promise((resolve) => setImmediate(resolve))
  emitJsonLine(oldChild, { event: 'updated', version: 'shared-version' })
  oldChild.emit('exit', 9, null)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(updateSettled, false)
  assert.equal(service.getStatus().active, true)
  emitJsonLine(replacementChild, { event: 'updated', version: 'shared-version' })
  await update
})

test('system cursor service reports an unexpected helper exit after activation', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const unexpectedExits = []
  const child = createFakeChild()
  const service = createSystemCursorService({
    platform: 'darwin',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => {
      queueMicrotask(() => emitJsonLine(child, { event: 'ready', version: 'active' }))
      return child
    },
    versionFactory: () => 'active',
    onUnexpectedExit: (event) => unexpectedExits.push(event)
  })

  await service.apply(cursor)
  child.emit('exit', 9, null)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(service.getStatus().active, false)
  assert.equal(unexpectedExits.length, 1)
  assert.equal(unexpectedExits[0].code, 9)
})

test('system cursor service contains synchronous fallback callback failures', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const logs = []
  const child = createFakeChild()
  const service = createSystemCursorService({
    platform: 'darwin',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: (entry) => logs.push(entry) },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => {
      queueMicrotask(() => emitJsonLine(child, { event: 'ready', version: 'active' }))
      return child
    },
    versionFactory: () => 'active',
    onUnexpectedExit: () => { throw new Error('fallback failed') }
  })

  await service.apply(cursor)
  assert.doesNotThrow(() => child.emit('exit', 9, null))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(logs.some((entry) => entry.event === 'system-cursor.fallback.failed'), true)
})

test('system cursor service preserves unexpected-exit fallback when SIGTERM cannot be sent', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const unexpectedExits = []
  const child = createFakeChild()
  child.kill = () => false
  const service = createSystemCursorService({
    platform: 'darwin',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => {
      queueMicrotask(() => emitJsonLine(child, { event: 'ready', version: 'active' }))
      return child
    },
    versionFactory: () => 'active',
    onUnexpectedExit: (event) => unexpectedExits.push(event)
  })

  await service.apply(cursor)
  await assert.rejects(service.stop('test'), /Failed to stop/)
  child.emit('exit', 9, null)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(unexpectedExits.length, 1)
})

test('system cursor service treats a synchronous SIGTERM exit as expected', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const unexpectedExits = []
  const child = createFakeChild({
    onSignal: (signal, currentChild) => {
      if (signal === 'SIGTERM') currentChild.emit('exit', 0, signal)
    }
  })
  const service = createSystemCursorService({
    platform: 'darwin',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => {
      queueMicrotask(() => emitJsonLine(child, { event: 'ready', version: 'active' }))
      return child
    },
    versionFactory: () => 'active',
    onUnexpectedExit: (event) => unexpectedExits.push(event)
  })

  await service.apply(cursor)
  await service.stop('test')

  assert.equal(unexpectedExits.length, 0)
  assert.equal(service.getStatus().active, false)
})

test('system cursor service fails within a bounded time when SIGKILL cannot be sent', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const child = createFakeChild()
  child.kill = (signal) => signal !== 'SIGKILL'
  const service = createSystemCursorService({
    platform: 'darwin',
    projectRoot: fixture.root,
    userDataPath: fixture.root,
    appLogService: { record: () => {} },
    resolveHelperPath: () => fixture.helperPath,
    prepareCursorAsset: async () => fixture.imagePath,
    spawnProcess: () => {
      queueMicrotask(() => emitJsonLine(child, { event: 'ready', version: 'active' }))
      return child
    },
    versionFactory: () => 'active',
    stopTimeoutMs: 5
  })

  await service.apply(cursor)
  await assert.rejects(service.stop('test'), /force-stop/)
})

test('materializeSystemCursorAsset converts a data URL into a managed PNG', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const assetUrl = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>')}`

  const assetPath = await materializeSystemCursorAsset({
    cursor: { ...cursor, assetPath: 'builtin://red', assetUrl },
    outputDir: path.join(fixture.root, 'assets')
  })

  assert.equal(path.extname(assetPath), '.png')
  assert.equal(fs.existsSync(assetPath), true)
  assert.ok(fs.statSync(assetPath).size > 0)
})

test('system cursor service module loads in a packaged layout without the development build script', (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const packagedServiceDir = path.join(fixture.root, 'app.asar.unpacked', 'src', 'main', 'services')
  fs.mkdirSync(packagedServiceDir, { recursive: true })
  const packagedServicePath = path.join(packagedServiceDir, 'system-cursor-service.js')
  fs.copyFileSync(path.resolve(__dirname, '..', '..', 'src', 'main', 'services', 'system-cursor-service.js'), packagedServicePath)

  const result = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', packagedServicePath], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      NODE_PATH: path.resolve(__dirname, '..', '..', 'node_modules')
    }
  })

  assert.equal(result.status, 0, result.stderr)
})
