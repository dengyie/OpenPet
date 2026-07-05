const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('path')
const { EventEmitter } = require('events')

const { createPluginService } = require('../../src/main/services/plugin-service')

const createBareSettingsService = (initialSettings = {}) => {
  let current = {
    ...initialSettings,
    plugins: {
      enabled: {},
      ...(initialSettings.plugins || {})
    }
  }
  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const createFakeServiceProcess = ({ pid = 4321 } = {}) => {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.killCalls = []
  child.kill = (signal = 'SIGTERM') => {
    child.killCalls.push(signal)
    return true
  }
  return child
}

const createSlowStoppingServiceProcess = ({ pid = 4321 } = {}) => createFakeServiceProcess({ pid })

const createDeclarationOnlyPluginDir = ({
  pluginId = 'weather-declaration',
  pluginName = 'Weather Declaration',
  serviceId = 'companion',
  serviceTitle = 'Companion Service',
  serviceHealth = { type: 'http', url: 'http://127.0.0.1:8787/health' }
} = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-declaration-plugin-'))
  const pluginPath = path.join(root, pluginId)
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: pluginId,
    name: pluginName,
    version: '1.0.0',
    profile: 'runtime',
    entries: {
      commands: [],
      setup: [],
      services: [{
        id: serviceId,
        title: serviceTitle,
        command: 'node ./service.js',
        cwd: '.',
        health: serviceHealth
      }],
      dashboards: []
    }
  }))
  return root
}

const createPluginCopyRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-plugin-copy-'))
  fs.cpSync(path.resolve(__dirname, '../../examples/plugins/agent-awareness'), path.join(root, 'agent-awareness'), {
    recursive: true
  })
  return root
}

test('plugin service discovers bundled agent-awareness plugin and gates service start behind native execution approval', async () => {
  const spawned = []
  const child = createSlowStoppingServiceProcess()
  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'openpet.agent-awareness': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [path.resolve(__dirname, '../../examples/plugins')],
    spawnServiceProcess: (file, args, options) => {
      spawned.push({ file, args, options, child })
      return child
    }
  })

  const plugin = service.listPlugins().find((entry) => entry.id === 'openpet.agent-awareness')
  assert.ok(plugin)
  assert.equal(plugin.enabled, true)
  assert.equal(plugin.requiresNativeExecution, true)
  assert.equal(plugin.nativeExecutionApproved, false)
  assert.equal(plugin.entries.services[0].id, 'agent-awareness')
  assert.equal(plugin.entries.services[0].runtime.status, 'stopped')
  assert.equal(spawned.length, 0)

  assert.throws(
    () => service.startService('openpet.agent-awareness', 'agent-awareness'),
    /native execution is not approved/
  )
  assert.equal(spawned.length, 0)

  service.setNativeExecutionApproved('openpet.agent-awareness', true)
  const started = await service.startService('openpet.agent-awareness', 'agent-awareness')

  assert.equal(started.ok, true)
  assert.equal(started.runtime.status, 'running')
  assert.equal(spawned.length, 1)
  assert.equal(spawned[0].file, 'node')
  assert.deepEqual(spawned[0].args, ['./service/agent-awareness-service.js'])
  assert.equal(path.basename(spawned[0].options.cwd), 'agent-awareness')
  assert.equal(service.listPlugins().find((entry) => entry.id === 'openpet.agent-awareness').entries.services[0].runtime.status, 'running')

  const stopped = service.stopService('openpet.agent-awareness', 'agent-awareness')
  assert.equal(stopped.runtime.status, 'stopping')
  child.emit('exit', 0, 'SIGTERM')
  assert.equal(service.listPlugins().find((entry) => entry.id === 'openpet.agent-awareness').entries.services[0].runtime.status, 'stopped')
})

test('plugin service summarizes agent-awareness health responses into the service health note', async () => {
  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'openpet.agent-awareness': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [path.resolve(__dirname, '../../examples/plugins')],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : ''
      },
      text: async () => JSON.stringify({
        ok: true,
        service: 'agent-awareness',
        diagnostics: {
          activeSessionCount: 3,
          sessionCount: 23,
          totalEvents: 1250
        }
      })
    })
  })

  const result = await service.checkServiceHealth('openpet.agent-awareness', 'agent-awareness')

  assert.equal(result.ok, true)
  assert.equal(result.health.status, 'healthy')
  assert.equal(result.health.message, '3 active · 23 sessions · 1,250 events')
  assert.equal(
    service.listPlugins().find((entry) => entry.id === 'openpet.agent-awareness').entries.services[0].runtime.health.message,
    '3 active · 23 sessions · 1,250 events'
  )
})

test('plugin service does not expose arbitrary healthy JSON health bodies in the service health note', async () => {
  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'openpet.agent-awareness': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [path.resolve(__dirname, '../../examples/plugins')],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : ''
      },
      text: async () => JSON.stringify({
        ok: true,
        service: 'manual-companion',
        message: 'Leaky message /Users/mango/private/OpenPet sk-test-secret',
        diagnostics: {
          cwd: '/Users/mango/private/OpenPet'
        }
      })
    })
  })

  const result = await service.checkServiceHealth('openpet.agent-awareness', 'agent-awareness')

  assert.equal(result.ok, true)
  assert.equal(result.health.status, 'healthy')
  assert.equal(result.health.message, 'OK')
  assert.equal(result.health.message.includes('/Users/mango/private'), false)
  assert.equal(result.health.message.includes('sk-test-secret'), false)
})

test('plugin service keeps unhealthy health notes on the HTTP fallback even when the body is JSON', async () => {
  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'openpet.agent-awareness': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [path.resolve(__dirname, '../../examples/plugins')],
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      headers: {
        get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : ''
      },
      text: async () => JSON.stringify({
        ok: false,
        service: 'agent-awareness',
        error: 'Do not surface this raw provider body'
      })
    })
  })

  const result = await service.checkServiceHealth('openpet.agent-awareness', 'agent-awareness')

  assert.equal(result.ok, true)
  assert.equal(result.health.status, 'unhealthy')
  assert.equal(result.health.statusCode, 503)
  assert.equal(result.health.message, 'HTTP 503')
})

test('plugin service reserves the agent-awareness summary format for the real bundled plugin service only', async () => {
  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : ''
      },
      text: async () => JSON.stringify({
        ok: true,
        service: 'agent-awareness',
        diagnostics: {
          activeSessionCount: 9,
          sessionCount: 19,
          totalEvents: 1299
        }
      })
    })
  })

  const result = await service.checkServiceHealth('weather-declaration', 'companion')

  assert.equal(result.ok, true)
  assert.equal(result.health.status, 'healthy')
  assert.equal(result.health.message, 'OK')
})

test('plugin service runCommand keeps agent-awareness command results free of raw local paths', async () => {
  const pluginRoot = createPluginCopyRoot()
  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'openpet.agent-awareness': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [pluginRoot]
  })

  service.setNativeExecutionApproved('openpet.agent-awareness', true)
  const result = await service.runCommand('openpet.agent-awareness', 'codex-hook-plan', { port: 8795 })
  const serialized = JSON.stringify(result)

  assert.equal(result.ok, true)
  assert.equal(result.commandId, 'codex-hook-plan')
  assert.equal(result.result.authFile, 'plugin-auth-file')
  assert.equal(result.result.instructionsFile, 'codex-hook-plan.md')
  assert.equal(result.result.serviceUrl, '[redacted-local-url]')
  assert.equal(serialized.includes(pluginRoot), false)
  assert.equal(serialized.includes('/Users/'), false)
  assert.equal(serialized.includes('/tmp/'), false)
})

test('plugin service runCommand executes agent-awareness hook install and uninstall commands through the shipped manifest surface', async () => {
  const pluginRoot = createPluginCopyRoot()
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-service-hooks-'))
  const previousCodexHome = process.env.OPENPET_CODEX_HOME
  fs.writeFileSync(path.join(codexHome, 'hooks.json'), JSON.stringify({
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo existing-stop' }] }]
    }
  }, null, 2))

  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'openpet.agent-awareness': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [pluginRoot]
  })

  process.env.OPENPET_CODEX_HOME = codexHome
  service.setNativeExecutionApproved('openpet.agent-awareness', true)

  try {
    const install = await service.runCommand('openpet.agent-awareness', 'install-codex-hooks')
    const uninstall = await service.runCommand('openpet.agent-awareness', 'uninstall-codex-hooks')
    const serialized = JSON.stringify({ install, uninstall })
    const hooksConfig = JSON.parse(fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf-8'))

    assert.equal(install.ok, true)
    assert.equal(install.result.installed, true)
    assert.equal(install.result.stateFile, 'hook-install-state.json')
    assert.equal(uninstall.ok, true)
    assert.equal(uninstall.result.removed, true)
    assert.equal(uninstall.result.stateFile, 'hook-install-state.json')
    assert.equal(hooksConfig.hooks.Stop[0].hooks[0].command, 'echo existing-stop')
    assert.equal(JSON.stringify(hooksConfig).includes('openpet-agent-awareness.js'), false)
    assert.equal(serialized.includes(pluginRoot), false)
    assert.equal(serialized.includes(codexHome), false)
    assert.equal(serialized.includes('/tmp/'), false)
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.OPENPET_CODEX_HOME
    } else {
      process.env.OPENPET_CODEX_HOME = previousCodexHome
    }
  }
})

test('plugin service runCommand keeps doctor results free of raw local paths and local URLs', async () => {
  const pluginRoot = createPluginCopyRoot()
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-doctor-command-'))
  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'openpet.agent-awareness': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [pluginRoot]
  })

  service.setNativeExecutionApproved('openpet.agent-awareness', true)
  const result = await service.runCommand('openpet.agent-awareness', 'doctor', {
    port: 65530,
    paths: { dataDir }
  })
  const serialized = JSON.stringify(result)

  assert.equal(result.ok, true)
  assert.equal(result.commandId, 'doctor')
  assert.equal(result.result.nativeExecutionApproved, true)
  assert.equal(result.result.checks.find((check) => check.id === 'native-execution-approval').ok, true)
  assert.equal(result.result.checks.find((check) => check.id === 'native-execution-approval').value, 'approved')
  assert.equal(result.result.checks.find((check) => check.id === 'data-dir').value, 'plugin-data-dir')
  assert.equal(result.result.checks.find((check) => check.id === 'polling-sessions-dir').value, 'codex:sessions')
  assert.equal(result.result.checks.find((check) => check.id === 'hook-plan').value, 'codex-hook-plan.md')
  assert.equal(result.result.serviceHealth.url, '[local-url]')
  assert.equal(serialized.includes(dataDir), false)
  assert.equal(serialized.includes(pluginRoot), false)
  assert.equal(serialized.includes('127.0.0.1:65530'), false)
  assert.equal(serialized.includes('/tmp/'), false)
})

test('plugin service command logs redact agent-awareness local paths and loopback URLs', async () => {
  const pluginRoot = createPluginCopyRoot()
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-doctor-logs-'))
  const settingsService = createBareSettingsService({
    plugins: { enabled: { 'openpet.agent-awareness': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [pluginRoot]
  })

  service.setNativeExecutionApproved('openpet.agent-awareness', true)
  await service.runCommand('openpet.agent-awareness', 'doctor', {
    port: 65530,
    paths: { dataDir }
  })

  const logText = (settingsService.get().plugins.logs || [])
    .map((entry) => String(entry.message || ''))
    .join('\n')

  assert.equal(logText.includes(dataDir), false)
  assert.equal(logText.includes(pluginRoot), false)
  assert.equal(logText.includes('127.0.0.1:65530'), false)
  assert.equal(logText.includes('/tmp/'), false)
  assert.equal(logText.includes('plugin-data-dir'), true)
})
