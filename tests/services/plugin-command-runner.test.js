const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const { PassThrough } = require('stream')

const {
  readCommandResult,
  runPluginCommandEntryProcess
} = require('../../src/main/services/plugin-command-runner')
const {
  createPluginBridgeKey
} = require('../../src/main/services/plugin-command-bridge-server')

const createChild = ({ pid = 1234, stdin = new PassThrough() } = {}) => {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = stdin
  child.killedWith = []
  child.kill = (signal) => {
    child.killedWith.push(signal)
    return true
  }
  return child
}

const createHarness = ({ child = createChild(), commandProcessTimeoutMs = 0 } = {}) => {
  const logs = []
  const commandRuntimes = new Map()
  const commandBridgeRuntimes = new Map()
  const unrefCalls = []
  const bridgeServer = {
    ensureStarted: async () => 8317,
    createBridgeBaseUrl: ({ pluginId, commandId, runId }) => `http://127.0.0.1:8317/plugins/bridge/${pluginId}/${commandId}/${runId}`,
    unrefWhenIdle: () => unrefCalls.push('unref')
  }
  const options = {
    plugin: { manifest: { id: 'weather-declaration' } },
    commandEntry: { command: 'node worker.js', cwd: '.' },
    commandId: 'announce',
    payload: { message: 'hello' },
    config: { enabled: true },
    runtimeKey: 'weather-declaration:announce',
    commandRuntimes,
    commandBridgeRuntimes,
    commandBridgeServer: bridgeServer,
    createPluginBridgeRunId: () => 'run-1',
    createPluginBridgeToken: () => 'token-1',
    createPluginBridgeKey,
    createPluginBridgeHandlers: () => ({ context: async () => ({ ok: true }) }),
    createPluginCreatorDirs: () => ({
      dataDir: '/tmp/openpet-plugin/data',
      cacheDir: '/tmp/openpet-plugin/cache',
      logDir: '/tmp/openpet-plugin/logs'
    }),
    cloneJsonValue: (value) => JSON.parse(JSON.stringify(value)),
    resolveCommandCwd: () => '/tmp/openpet-plugin',
    spawnCommandProcess: () => child,
    stopRuntimeProcessWithFallback: (runtime, signal) => {
      runtime.child?.kill?.(signal)
    },
    resolveStopWaiter: (runtime) => runtime?.resolveStopCompleted?.(),
    appendLog: (entry) => logs.push(entry),
    commandProcessTimeoutMs
  }
  return { child, commandBridgeRuntimes, commandRuntimes, logs, options, unrefCalls }
}

const flushAsyncSetup = () => new Promise((resolve) => setImmediate(resolve))

test('readCommandResult returns the last structured JSON line', () => {
  assert.deepEqual(readCommandResult('plain\n{"ok":false}\n{"ok":true,"value":3}\n'), { ok: true, value: 3 })
  assert.equal(readCommandResult('plain output'), null)
})

test('plugin command runner resolves successful child output and cleans runtimes', async () => {
  const harness = createHarness()
  const resultPromise = runPluginCommandEntryProcess(harness.options)
  await flushAsyncSetup()

  assert.equal(harness.commandRuntimes.has('weather-declaration:announce'), true)
  assert.equal(harness.commandBridgeRuntimes.has('weather-declaration:announce:run-1'), true)
  harness.child.stdout.write('{"ok":true,"message":"done"}\n')
  harness.child.stderr.write('minor warning')
  harness.child.emit('exit', 0, null)

  const result = await resultPromise

  assert.deepEqual(result, {
    ok: true,
    pluginId: 'weather-declaration',
    commandId: 'announce',
    exitCode: 0,
    result: { ok: true, message: 'done' },
    stderr: 'minor warning'
  })
  assert.equal(harness.commandRuntimes.size, 0)
  assert.equal(harness.commandBridgeRuntimes.size, 0)
  assert.deepEqual(harness.unrefCalls, ['unref'])
})

test('plugin command runner rejects child process errors and cleans waiters', async () => {
  const harness = createHarness()
  const resultPromise = runPluginCommandEntryProcess(harness.options)
  await flushAsyncSetup()
  const runtime = harness.commandRuntimes.get('weather-declaration:announce')
  let stopResolved = false
  runtime.stopCompleted = new Promise((resolve) => {
    runtime.resolveStopCompleted = () => {
      stopResolved = true
      resolve()
    }
  })

  harness.child.emit('error', new Error('spawn failed'))

  await assert.rejects(resultPromise, /spawn failed/)
  assert.equal(stopResolved, true)
  assert.equal(harness.commandRuntimes.size, 0)
  assert.equal(harness.commandBridgeRuntimes.size, 0)
})

test('plugin command runner rejects stdin errors and kills the child', async () => {
  const harness = createHarness()
  const resultPromise = runPluginCommandEntryProcess(harness.options)
  await flushAsyncSetup()

  harness.child.stdin.emit('error', new Error('stdin closed'))

  await assert.rejects(resultPromise, /stdin closed/)
  assert.deepEqual(harness.child.killedWith, ['SIGTERM'])
  assert.equal(harness.commandRuntimes.size, 0)
  assert.equal(harness.commandBridgeRuntimes.size, 0)
})
