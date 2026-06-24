const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { EventEmitter } = require('node:events')

const {
  startAutomationDesktop2,
  switchToDesktop
} = require('../../scripts/start-automation-desktop-2')

test('switchToDesktop asks System Events for the requested desktop key chord', async () => {
  const spawns = []
  const spawnImpl = (...args) => {
    spawns.push(args)
    const child = new EventEmitter()
    child.once = child.on.bind(child)
    queueMicrotask(() => child.emit('exit', 0))
    return child
  }

  const switched = await switchToDesktop(2, { spawnImpl })

  assert.equal(switched, true)
  assert.equal(spawns[0][0], 'osascript')
  assert.match(spawns[0][1][1], /key code 19 using control down/)
})

test('startAutomationDesktop2 launches npm start with isolated automation env', async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-automation-home-'))
  const spawns = []
  const spawnImpl = (...args) => {
    spawns.push(args)
    const child = new EventEmitter()
    child.once = child.on.bind(child)
    if (args[0] === 'osascript') {
      queueMicrotask(() => child.emit('exit', 0))
    }
    return child
  }

  const result = await startAutomationDesktop2({
    desktopNumber: 2,
    workspaceRoot: '/repo/OpenPet',
    env: {},
    spawnImpl,
    homeDir: tmpHome
  })

  assert.equal(result.desktopNumber, 2)
  assert.equal(result.switched, true)
  assert.match(result.userDataDir, /ibot-automation-desktop-2$/)
  assert.equal(fs.existsSync(result.userDataDir), true)
  assert.equal(spawns[1][0], 'npm')
  assert.deepEqual(spawns[1][1], ['start'])
  assert.equal(spawns[1][2].cwd, '/repo/OpenPet')
  assert.equal(spawns[1][2].env.OPENPET_AUTOMATION_ISOLATION, '1')
  assert.equal(spawns[1][2].env.OPENPET_AUTOMATION_TARGET_DESKTOP, '2')
  assert.equal(spawns[1][2].env.OPENPET_SKIP_DEV_CLEANUP, '1')
  assert.equal(spawns[1][2].env.OPENPET_USER_DATA_DIR, result.userDataDir)
})
