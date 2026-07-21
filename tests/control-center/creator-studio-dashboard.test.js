const test = require('node:test')
const assert = require('node:assert/strict')

const loadHelper = () => import('../../src/control-center/src/lib/creator-studio-dashboard.ts')

const createRuntime = (status, health) => ({
  status,
  pid: status === 'running' ? 4321 : null,
  startedAt: status === 'running' ? '2026-07-21T00:00:00.000Z' : '',
  stoppedAt: '',
  command: 'node ./service/studio-service.js',
  cwd: '.',
  exitCode: null,
  signal: '',
  error: '',
  health
})

test('Creator Studio dashboard readiness starts the service and waits through transient unhealthy checks', async () => {
  const { ensureCreatorStudioServiceReady } = await loadHelper()
  const calls = []
  const progress = []
  const runtimes = []
  const unhealthy = { status: 'unhealthy', checkedAt: '2026-07-21T00:00:00.100Z', url: 'http://127.0.0.1:8794/health', statusCode: null, message: 'fetch failed' }
  const healthy = { status: 'healthy', checkedAt: '2026-07-21T00:00:00.300Z', url: 'http://127.0.0.1:8794/health', statusCode: 200, message: 'OK' }
  let healthAttempt = 0

  const result = await ensureCreatorStudioServiceReady({
    api: {
      startPluginService: async (pluginId, serviceId) => {
        calls.push(['start', pluginId, serviceId])
        return { ok: true, pluginId, serviceId, runtime: createRuntime('running', unhealthy) }
      },
      checkPluginServiceHealth: async (pluginId, serviceId) => {
        healthAttempt += 1
        const health = healthAttempt === 1 ? unhealthy : healthy
        calls.push(['health', pluginId, serviceId, health.status])
        return { ok: true, pluginId, serviceId, health, runtime: createRuntime('running', health) }
      }
    },
    pluginId: 'openpet.creator-studio',
    serviceId: 'studio',
    serviceStatus: 'stopped',
    onProgress: (message) => progress.push(message),
    onRuntime: (runtime) => runtimes.push(runtime),
    delay: async () => {}
  })

  assert.equal(result.started, true)
  assert.equal(result.health.status, 'healthy')
  assert.deepEqual(calls, [
    ['start', 'openpet.creator-studio', 'studio'],
    ['health', 'openpet.creator-studio', 'studio', 'unhealthy'],
    ['health', 'openpet.creator-studio', 'studio', 'healthy']
  ])
  assert.match(progress[0], /正在启动 Creator Studio Service/)
  assert.match(progress[1], /正在等待详情服务就绪/)
  assert.equal(runtimes.length, 3)
})

test('Creator Studio dashboard readiness reports the final health reason without opening blindly', async () => {
  const { ensureCreatorStudioServiceReady } = await loadHelper()
  let healthCalls = 0
  const unhealthy = { status: 'unhealthy', checkedAt: '', url: 'http://127.0.0.1:8794/health', statusCode: null, message: 'connection refused' }

  await assert.rejects(
    () => ensureCreatorStudioServiceReady({
      api: {
        startPluginService: async (pluginId, serviceId) => ({ ok: true, pluginId, serviceId, runtime: createRuntime('running', unhealthy) }),
        checkPluginServiceHealth: async (pluginId, serviceId) => {
          healthCalls += 1
          return { ok: true, pluginId, serviceId, health: unhealthy, runtime: createRuntime('running', unhealthy) }
        }
      },
      pluginId: 'openpet.creator-studio',
      serviceId: 'studio',
      serviceStatus: 'stopped',
      maxHealthAttempts: 2,
      delay: async () => {}
    }),
    /Creator Studio Service 启动后未就绪：connection refused/
  )
  assert.equal(healthCalls, 2)
})

test('Creator Studio dashboard readiness refuses to race a stopping service', async () => {
  const { ensureCreatorStudioServiceReady } = await loadHelper()
  let calls = 0
  await assert.rejects(
    () => ensureCreatorStudioServiceReady({
      api: {
        startPluginService: async () => { calls += 1; throw new Error('unexpected start') },
        checkPluginServiceHealth: async () => { calls += 1; throw new Error('unexpected health') }
      },
      pluginId: 'openpet.creator-studio',
      serviceId: 'studio',
      serviceStatus: 'stopping'
    }),
    /正在停止，请稍后重试/
  )
  assert.equal(calls, 0)
})
