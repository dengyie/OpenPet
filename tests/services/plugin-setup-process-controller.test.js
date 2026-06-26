const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')

const { createPluginSetupProcessController } = require('../../src/main/services/plugin-setup-process-controller')

const createChild = (pid = 4321) => {
  const child = new EventEmitter()
  child.pid = pid
  child.killCalls = []
  child.kill = (signal) => {
    child.killCalls.push(signal)
    return true
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

const createController = (overrides = {}) => {
  const child = overrides.child || createChild()
  const logs = []
  const runtimes = []
  const controller = createPluginSetupProcessController({
    appendLog: (entry) => logs.push(entry),
    parseCommand: () => ({ file: 'npm', args: ['install'] }),
    resolveCwd: () => '/plugins/weather-declaration',
    createEnv: () => ({ PATH: '/usr/bin' }),
    spawnSetupProcess: () => child,
    setRuntime: (runtime) => {
      runtimes.push(runtime)
      return runtime
    },
    attachStopHandler: (runtime) => {
      runtime.stop = ({ signal = 'SIGTERM' } = {}) => {
        runtime.status = 'stopping'
        runtime.error = ''
        runtime.exitCode = null
        runtime.lastRunAt = '2026-06-26T00:00:00.000Z'
        child.kill(signal)
        return true
      }
      return runtime
    },
    createRuntimeView: (runtime) => ({
      status: runtime.status || 'not-run',
      lastRunAt: runtime.lastRunAt || '',
      exitCode: Number.isFinite(runtime.exitCode) ? runtime.exitCode : null,
      error: runtime.error || ''
    }),
    now: () => '2026-06-26T00:00:00.000Z',
    ...overrides
  })
  return { child, controller, logs, runtimes }
}

const waitForControllerInit = () => new Promise((resolve) => setImmediate(resolve))

test('setup process controller runs the success path and returns runtime view', async () => {
  const state = createController()

  const run = state.controller.run({
    pluginId: 'weather-declaration',
    manifest: { id: 'weather-declaration', basePath: '/plugins/weather-declaration' },
    setupId: 'install-deps',
    setupEntry: { command: 'npm install', cwd: '.' }
  })

  await waitForControllerInit()

  state.child.stdout.emit('data', 'ready\n')
  state.child.stderr.emit('data', 'warn\n')
  state.child.emit('exit', 0, '')
  state.child.emit('close', 0, '')

  const result = await run

  assert.equal(result.ok, true)
  assert.equal(result.pluginId, 'weather-declaration')
  assert.equal(result.setupId, 'install-deps')
  assert.deepEqual(result.runtime, {
    status: 'succeeded',
    lastRunAt: '2026-06-26T00:00:00.000Z',
    exitCode: 0,
    error: ''
  })
  assert.equal(state.runtimes[0].pid, 4321)
  assert.equal(state.logs[0].message, 'Setup started')
  assert.equal(state.logs[1].message, 'Setup stdout: ready')
  assert.equal(state.logs[2].message, 'Setup stderr: warn')
  assert.equal(state.logs[3].message, 'Setup completed')
})

test('setup process controller marks non-zero exits as failed', async () => {
  const state = createController()

  const run = state.controller.run({
    pluginId: 'weather-declaration',
    manifest: { id: 'weather-declaration', basePath: '/plugins/weather-declaration' },
    setupId: 'install-deps',
    setupEntry: { command: 'npm install', cwd: '.' }
  })

  await waitForControllerInit()

  state.child.emit('exit', 1, '')
  state.child.emit('close', 1, '')

  const result = await run

  assert.deepEqual(result.runtime, {
    status: 'failed',
    lastRunAt: '2026-06-26T00:00:00.000Z',
    exitCode: 1,
    error: 'Setup exited with code 1'
  })
  assert.equal(state.logs.at(-1).message, 'Setup failed')
})

test('setup process controller rejects when a stop request fails the running setup', async () => {
  const state = createController()

  const run = state.controller.run({
    pluginId: 'weather-declaration',
    manifest: { id: 'weather-declaration', basePath: '/plugins/weather-declaration' },
    setupId: 'install-deps',
    setupEntry: { command: 'npm install', cwd: '.' }
  })

  await waitForControllerInit()

  state.runtimes[0].failStop(new Error('setup stop failed'))

  await assert.rejects(run, /setup stop failed/)
})

test('setup process controller waits for close so trailing stderr is logged before completion', async () => {
  const state = createController()

  const run = state.controller.run({
    pluginId: 'weather-declaration',
    manifest: { id: 'weather-declaration', basePath: '/plugins/weather-declaration' },
    setupId: 'install-deps',
    setupEntry: { command: 'npm install', cwd: '.' }
  })

  await waitForControllerInit()

  state.child.emit('exit', 0, '')
  state.child.stderr.emit('data', 'late warn\n')
  state.child.emit('close', 0, '')

  const result = await run

  assert.equal(result.runtime.status, 'succeeded')
  assert.equal(state.logs.at(-2).message, 'Setup stderr: late warn')
  assert.equal(state.logs.at(-1).message, 'Setup completed')
})
