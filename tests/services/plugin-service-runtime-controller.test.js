const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginServiceRuntimeController } = require('../../src/main/services/plugin-service-runtime-controller')

const createController = (overrides = {}) => {
  const calls = {
    resolvePlugin: [],
    getServiceEntry: [],
    getRuntime: [],
    assertNotActive: [],
    spawnRuntime: [],
    createRuntime: [],
    setRuntime: [],
    attachChildHandlers: [],
    appendLog: [],
    scheduleHealthCheck: [],
    getOrCreateRuntime: [],
    checkHealth: [],
    stopRuntime: []
  }

  const plugin = { manifest: { id: 'weather-declaration' } }
  const serviceEntry = { id: 'companion', command: 'npm run service:start', health: { type: 'http', url: 'http://127.0.0.1:8787/health' } }
  const runtime = { pluginId: 'weather-declaration', serviceId: 'companion', status: 'running', health: { status: 'healthy' } }
  const child = { pid: 4321 }

  const controller = createPluginServiceRuntimeController({
    resolvePlugin: (pluginId, options) => {
      calls.resolvePlugin.push({ pluginId, options })
      return plugin
    },
    getServiceEntry: (resolvedPlugin, serviceId) => {
      calls.getServiceEntry.push({ resolvedPlugin, serviceId })
      return serviceEntry
    },
    getRuntime: (pluginId, serviceId) => {
      calls.getRuntime.push({ pluginId, serviceId })
      return overrides.existingRuntime === undefined ? null : overrides.existingRuntime
    },
    assertNotActive: (pluginId, serviceId) => {
      calls.assertNotActive.push({ pluginId, serviceId })
    },
    spawnRuntime: (args) => {
      calls.spawnRuntime.push(args)
      return { child, cwd: '/plugins/weather-declaration', declaration: { command: 'npm run service:start' } }
    },
    createRuntime: (args) => {
      calls.createRuntime.push(args)
      return runtime
    },
    setRuntime: (createdRuntime) => {
      calls.setRuntime.push(createdRuntime)
      return createdRuntime
    },
    attachChildHandlers: (args) => {
      calls.attachChildHandlers.push(args)
      return args.runtime
    },
    appendLog: (entry) => calls.appendLog.push(entry),
    scheduleHealthCheck: (pluginId, serviceId, scheduledRuntime, scheduledEntry) => {
      calls.scheduleHealthCheck.push({ pluginId, serviceId, runtime: scheduledRuntime, serviceEntry: scheduledEntry })
    },
    createRuntimeView: (inputRuntime, inputEntry) => ({
      status: inputRuntime.status,
      serviceId: inputEntry.id,
      health: inputRuntime.health
    }),
    createHealthView: (health, inputEntry) => ({
      ...health,
      serviceId: inputEntry.id
    }),
    getOrCreateRuntime: (pluginId, serviceId, inputEntry) => {
      calls.getOrCreateRuntime.push({ pluginId, serviceId, serviceEntry: inputEntry })
      return runtime
    },
    checkHealth: async (pluginId, serviceId, checkedRuntime, inputEntry, options) => {
      calls.checkHealth.push({ pluginId, serviceId, runtime: checkedRuntime, serviceEntry: inputEntry, options })
      checkedRuntime.health = { status: 'healthy', statusCode: 204 }
    },
    stopRuntime: (pluginId, serviceId, stoppedRuntime) => {
      calls.stopRuntime.push({ pluginId, serviceId, runtime: stoppedRuntime })
      stoppedRuntime.status = 'stopping'
    },
    ...overrides
  })

  return { calls, controller, plugin, runtime, serviceEntry }
}

test('service runtime controller starts a service and schedules health checks', () => {
  const { controller, calls } = createController({ existingRuntime: { health: { status: 'unhealthy' } } })

  const result = controller.start({
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    stopGracePeriodMs: 1500
  })

  assert.deepEqual(result, {
    ok: true,
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    runtime: { status: 'running', serviceId: 'companion', health: { status: 'healthy' } }
  })
  assert.deepEqual(calls.assertNotActive, [{ pluginId: 'weather-declaration', serviceId: 'companion' }])
  assert.equal(calls.spawnRuntime.length, 1)
  assert.equal(calls.createRuntime[0].existingHealth.status, 'unhealthy')
  assert.equal(calls.attachChildHandlers.length, 1)
  assert.equal(calls.scheduleHealthCheck.length, 1)
  assert.equal(calls.appendLog.at(-1).message, 'Service started')
})

test('service runtime controller stops a running service through stop controller', () => {
  const runtime = { pluginId: 'weather-declaration', serviceId: 'companion', status: 'running', health: { status: 'healthy' } }
  const { controller, calls } = createController({
    getRuntime: () => runtime
  })

  const result = controller.stop({ pluginId: 'weather-declaration', serviceId: 'companion' })

  assert.equal(result.ok, true)
  assert.equal(result.runtime.status, 'stopping')
  assert.deepEqual(calls.stopRuntime, [{ pluginId: 'weather-declaration', serviceId: 'companion', runtime }])
  assert.deepEqual(calls.resolvePlugin, [{ pluginId: 'weather-declaration', options: { requireEnabled: false, requireAllowed: false } }])
})

test('service runtime controller checks service health using the runtime view contract', async () => {
  const runtime = { pluginId: 'weather-declaration', serviceId: 'companion', status: 'running', health: { status: 'checking' } }
  const { controller, calls } = createController({
    getOrCreateRuntime: (pluginId, serviceId, serviceEntry) => {
      calls.getOrCreateRuntime.push({ pluginId, serviceId, serviceEntry })
      return runtime
    },
    checkHealth: async (pluginId, serviceId, checkedRuntime, serviceEntry, options) => {
      calls.checkHealth.push({ pluginId, serviceId, runtime: checkedRuntime, serviceEntry, options })
      checkedRuntime.health = { status: 'healthy', statusCode: 204 }
    }
  })

  const result = await controller.check({ pluginId: 'weather-declaration', serviceId: 'companion', reschedule: false })

  assert.deepEqual(result, {
    ok: true,
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    health: { status: 'healthy', statusCode: 204, serviceId: 'companion' },
    runtime: { status: 'running', serviceId: 'companion', health: { status: 'healthy', statusCode: 204 } }
  })
  assert.deepEqual(calls.checkHealth, [{
    pluginId: 'weather-declaration',
    serviceId: 'companion',
    runtime,
    serviceEntry: { id: 'companion', command: 'npm run service:start', health: { type: 'http', url: 'http://127.0.0.1:8787/health' } },
    options: { reschedule: false }
  }])
})
