const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')

const { createPluginCommandEntryProcessController } = require('../../src/main/services/plugin-command-entry-process-controller')

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
  child.stdin = new EventEmitter()
  child.stdin.writes = []
  child.stdin.end = (text) => {
    child.stdin.writes.push(text)
  }
  return child
}

const createController = (overrides = {}) => {
  const logs = []
  const bridgeRuns = []
  const deletedRuns = []
  const runtimes = []
  const deletedRuntimes = []
  const timers = []
  const child = overrides.child || createChild()

  const controller = createPluginCommandEntryProcessController({
    appendLog: (entry) => logs.push(entry),
    appendLimitedOutput: (text, chunk) => `${text || ''}${String(chunk || '')}`,
    cloneJsonValue: (value) => value,
    createBridgeRun: async (payload) => {
      bridgeRuns.push(payload)
      return { runId: 'run-1', baseUrl: 'http://127.0.0.1:8787', token: 'bridge-token' }
    },
    deleteBridgeRun: (...args) => deletedRuns.push(args),
    createBridgeHandlers: (plugin, commandId) => ({ pluginId: plugin.manifest.id, commandId }),
    ensureCreatorDirs: () => ({
      dataDir: '/tmp/openpet/data',
      cacheDir: '/tmp/openpet/cache',
      logDir: '/tmp/openpet/logs'
    }),
    createEnv: () => ({ PATH: '/usr/bin' }),
    parseCommand: () => ({ file: 'node', args: ['command.js'] }),
    resolveCwd: () => '/plugins/weather-declaration/commands',
    spawnCommandProcess: () => child,
    setRuntime: (runtime) => {
      runtimes.push(runtime)
      return runtime
    },
    deleteRuntime: (...args) => deletedRuntimes.push(args),
    attachStopHandler: (runtime) => {
      runtime.stop = ({ reason = 'Command stopped' } = {}) => {
        runtime.status = 'stopping'
        runtime.stopReason = reason
        return true
      }
      return runtime
    },
    readCommandResult: (text) => {
      try {
        return JSON.parse(text)
      } catch (_) {
        return null
      }
    },
    commandProcessTimeoutMs: overrides.commandProcessTimeoutMs,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} }
      timers.push(timer)
      return timer
    },
    clearTimer: () => {},
    ...overrides
  })

  return {
    child,
    controller,
    deletedRuns,
    deletedRuntimes,
    logs,
    runtimes,
    timers,
    bridgeRuns
  }
}

const waitForControllerInit = () => new Promise((resolve) => setImmediate(resolve))

test('command entry process controller runs success path with bridge env and stdin payload', async () => {
  const state = createController()

  const run = state.controller.run({
    plugin: { manifest: { id: 'weather-declaration' } },
    commandEntry: { command: 'node command.js', cwd: 'commands' },
    commandId: 'forecast',
    payload: { city: 'London' },
    config: { units: 'metric' }
  })

  await waitForControllerInit()

  state.child.stdout.emit('data', '{"ok":true,"message":"Bring an umbrella"}')
  state.child.stderr.emit('data', 'warn output')
  state.child.emit('exit', 0, '')
  state.child.emit('close', 0, '')

  const result = await run

  assert.equal(result.ok, true)
  assert.equal(result.pluginId, 'weather-declaration')
  assert.equal(result.commandId, 'forecast')
  assert.deepEqual(result.result, { ok: true, message: 'Bring an umbrella' })
  assert.equal(result.stderr, 'warn output')
  assert.equal(state.bridgeRuns.length, 1)
  assert.equal(state.runtimes[0].pid, 4321)
  assert.deepEqual(state.deletedRuns[0], ['weather-declaration', 'forecast', 'run-1'])
  assert.deepEqual(state.deletedRuntimes[0], ['weather-declaration', 'forecast'])
  assert.match(state.child.stdin.writes[0], /"payload":\{"city":"London"\}/)
  assert.match(state.child.stdin.writes[0], /"config":\{"units":"metric"\}/)
  assert.match(state.child.stdin.writes[0], /"extensionDir":"\/plugins\/weather-declaration\/commands"/)
  assert.equal(state.logs[0].message, 'Command stdout: {"ok":true,"message":"Bring an umbrella"}')
  assert.equal(state.logs[1].message, 'Command stderr: warn output')
})

test('command entry process controller surfaces structured errors on non-zero exit', async () => {
  const state = createController()

  const run = state.controller.run({
    plugin: { manifest: { id: 'weather-declaration' } },
    commandEntry: { command: 'node command.js', cwd: 'commands' },
    commandId: 'forecast',
    payload: {},
    config: {}
  })

  await waitForControllerInit()

  state.child.stdout.emit('data', '{"ok":false,"error":"runId is required"}')
  state.child.emit('exit', 1, '')
  state.child.emit('close', 1, '')

  await assert.rejects(run, /runId is required/)
  assert.deepEqual(state.deletedRuns[0], ['weather-declaration', 'forecast', 'run-1'])
  assert.deepEqual(state.deletedRuntimes[0], ['weather-declaration', 'forecast'])
})

test('command entry process controller rejects stopped commands with logged error marker', async () => {
  const state = createController()

  const run = state.controller.run({
    plugin: { manifest: { id: 'weather-declaration' } },
    commandEntry: { command: 'node command.js', cwd: 'commands' },
    commandId: 'forecast',
    payload: {},
    config: {}
  })

  await waitForControllerInit()

  state.runtimes[0].stop({ reason: 'Command stopped' })
  state.child.emit('exit', 0, '')
  state.child.emit('close', 0, '')

  let rejection
  try {
    await run
  } catch (error) {
    rejection = error
  }

  assert.ok(rejection)
  assert.match(rejection.message, /Command stopped/)
  assert.equal(rejection.openpetLogged, true)
  assert.equal(state.logs.at(-1).message, 'Command stopped')
})

test('command entry process controller times out stalled commands and kills the child', async () => {
  const state = createController({ commandProcessTimeoutMs: 1 })

  const run = state.controller.run({
    plugin: { manifest: { id: 'weather-declaration' } },
    commandEntry: { command: 'node command.js', cwd: 'commands' },
    commandId: 'forecast',
    payload: {},
    config: {}
  })

  await waitForControllerInit()

  assert.equal(state.timers[0].delay, 1)
  state.timers[0].callback()

  await assert.rejects(run, /Plugin command timed out after 1ms/)
  assert.deepEqual(state.child.killCalls, ['SIGTERM'])
  assert.deepEqual(state.deletedRuns[0], ['weather-declaration', 'forecast', 'run-1'])
  assert.deepEqual(state.deletedRuntimes[0], ['weather-declaration', 'forecast'])
})

test('command entry process controller waits for close so trailing stdout is included in final result parsing', async () => {
  const state = createController()

  const run = state.controller.run({
    plugin: { manifest: { id: 'weather-declaration' } },
    commandEntry: { command: 'node command.js', cwd: 'commands' },
    commandId: 'forecast',
    payload: {},
    config: {}
  })

  await waitForControllerInit()

  state.child.stdout.emit('data', '{"ok":true,')
  state.child.emit('exit', 0, '')
  state.child.stdout.emit('data', '"message":"tail chunk"}')
  state.child.emit('close', 0, '')

  const result = await run

  assert.deepEqual(result.result, { ok: true, message: 'tail chunk' })
})
