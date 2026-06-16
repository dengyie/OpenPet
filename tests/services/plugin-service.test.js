const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPluginService } = require('../../src/main/services/plugin-service')

const createSettingsService = (initialSettings = {}) => {
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

const createOfficialPlugin = () => ({
  manifest: {
    id: 'official.basic-behavior',
    name: 'Basic Behavior',
    version: '1.0.0',
    description: 'Built-in behavior commands',
    permissions: ['pet:say'],
    commands: [{ id: 'greet', title: 'Greet' }]
  },
  activate: (ctx) => ({
    greet: async () => {
      await ctx.pet.say({ text: '你好，我在这里' })
      return { ok: true }
    }
  })
})

const createPluginDir = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugins-'))
  const pluginPath = path.join(root, 'focus-timer')
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'focus-timer',
    name: 'Focus Timer',
    version: '1.0.0',
    permissions: ['pet:say'],
    commands: [{ id: 'start', title: 'Start focus' }]
  }))
  return root
}

const createPluginDirWithInvalidManifest = () => {
  const root = createPluginDir()
  const pluginPath = path.join(root, 'bad-plugin')
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'bad-plugin',
    name: 'Bad Plugin',
    version: '1.0.0',
    permissions: ['fs:read']
  }))
  return root
}

const createPluginDirWithEscapingSymlink = ({ fieldName }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-symlink-'))
  const pluginPath = path.join(root, 'escape-plugin')
  const outsidePath = path.join(root, fieldName === 'main' ? 'outside.js' : 'outside.schema.json')
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(outsidePath, fieldName === 'main'
    ? 'module.exports = function activate() { return {} }'
    : JSON.stringify({ type: 'object', properties: { ok: { type: 'string' } } }))
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'escape-plugin',
    name: 'Escape Plugin',
    version: '1.0.0',
    main: 'index.js',
    configSchema: fieldName === 'configSchema' ? 'config.schema.json' : undefined,
    permissions: [],
    commands: [{ id: 'start', title: 'Start' }]
  }))
  fs.symlinkSync(outsidePath, path.join(pluginPath, fieldName === 'main' ? 'index.js' : 'config.schema.json'))
  return root
}

const createRunnablePluginDir = ({ manifest = {}, source, configSchema }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-runnable-plugin-'))
  const pluginPath = path.join(root, manifest.id || 'local-runner')
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'local-runner',
    name: 'Local Runner',
    version: '1.0.0',
    main: 'index.js',
    permissions: ['pet:say'],
    commands: [{ id: 'start', title: 'Start' }],
    ...manifest
  }))
  fs.writeFileSync(path.join(pluginPath, 'index.js'), source)
  if (configSchema) {
    fs.writeFileSync(path.join(pluginPath, manifest.configSchema || 'config.schema.json'), JSON.stringify(configSchema))
  }
  return root
}

const createDeclarationOnlyPluginDir = ({ dashboardUrl = 'http://127.0.0.1:8787' } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-declaration-plugin-'))
  const pluginPath = path.join(root, 'weather-declaration')
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'weather-declaration',
    name: 'Weather Declaration',
    version: '1.0.0',
    entries: {
      commands: [{ id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js' }],
      services: [{ id: 'companion', title: 'Companion Service', command: 'npm run service:start' }],
      dashboards: [{ id: 'main', title: 'Dashboard', url: dashboardUrl }]
    }
  }))
  return root
}

test('plugin service discovers official plugins and local manifests', () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'official.basic-behavior': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()],
    pluginDirs: [createPluginDir()]
  })

  assert.deepEqual(service.listPlugins().map((plugin) => ({
    id: plugin.id,
    source: plugin.source,
    enabled: plugin.enabled,
    runnable: plugin.runnable
  })), [
    { id: 'official.basic-behavior', source: 'official', enabled: true, runnable: true },
    { id: 'focus-timer', source: 'local', enabled: false, runnable: false }
  ])
})

test('plugin service isolates invalid local manifests', () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createPluginDirWithInvalidManifest()]
  })

  assert.deepEqual(service.listPlugins().map((plugin) => plugin.id), ['focus-timer'])
})

test('plugin service lists declaration-only extension entries without making them runnable', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()]
  })

  const [plugin] = service.listPlugins()

  assert.equal(plugin.id, 'weather-declaration')
  assert.equal(plugin.enabled, true)
  assert.equal(plugin.runnable, false)
  assert.deepEqual(plugin.commands, [{ id: 'announce', title: 'Announce Weather' }])
  assert.equal(plugin.entries.commands[0].command, 'node ./commands/announce.js')
  assert.equal(plugin.entries.services[0].id, 'companion')
  assert.equal(plugin.entries.dashboards[0].url, 'http://127.0.0.1:8787')
  await assert.rejects(
    () => service.runCommand('weather-declaration', 'announce'),
    /Plugin is not runnable/
  )
})

test('plugin service opens enabled declaration dashboard entries through the injected opener', async () => {
  const openedUrls = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    openExternal: async (url) => {
      openedUrls.push(url)
      return true
    }
  })

  const result = await service.openDashboard('weather-declaration', 'main')

  assert.deepEqual(openedUrls, ['http://127.0.0.1:8787/'])
  assert.deepEqual(result, {
    ok: true,
    pluginId: 'weather-declaration',
    dashboardId: 'main',
    url: 'http://127.0.0.1:8787/'
  })
  assert.equal(settingsService.get().plugins.logs[0].message, 'Dashboard opened')
})

test('plugin service blocks dashboard opens for disabled plugins', async () => {
  const openedUrls = []
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    openExternal: async (url) => {
      openedUrls.push(url)
    }
  })

  await assert.rejects(
    () => service.openDashboard('weather-declaration', 'main'),
    /Plugin is disabled/
  )
  assert.deepEqual(openedUrls, [])
})

test('plugin service blocks dashboard opens when ecosystem policy denies the plugin', async () => {
  const openedUrls = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    getPluginBlockStatus: () => ({ blocked: true, reasons: ['blocked for review'] }),
    openExternal: async (url) => {
      openedUrls.push(url)
    }
  })

  await assert.rejects(
    () => service.openDashboard('weather-declaration', 'main'),
    /Plugin is blocked: blocked for review/
  )
  assert.deepEqual(openedUrls, [])
})

test('plugin service rejects unknown dashboard ids before opening external urls', async () => {
  const openedUrls = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    openExternal: async (url) => {
      openedUrls.push(url)
    }
  })

  await assert.rejects(
    () => service.openDashboard('weather-declaration', 'missing'),
    /Plugin dashboard not found: missing/
  )
  assert.deepEqual(openedUrls, [])
})

test('plugin service rejects non-http dashboard urls before opening external urls', async () => {
  const openedUrls = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({ dashboardUrl: 'file:///tmp/openpet-dashboard.html' })],
    openExternal: async (url) => {
      openedUrls.push(url)
    }
  })

  await assert.rejects(
    () => service.openDashboard('weather-declaration', 'main'),
    /Plugin dashboard URL must use HTTP or HTTPS/
  )
  assert.deepEqual(openedUrls, [])
})

test('plugin service rejects local plugin main symlinks escaping the plugin directory', () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createPluginDirWithEscapingSymlink({ fieldName: 'main' })]
  })

  assert.deepEqual(service.listPlugins(), [])
})

test('plugin service rejects local plugin config schema symlinks escaping the plugin directory', () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createPluginDirWithEscapingSymlink({ fieldName: 'configSchema' })]
  })

  assert.deepEqual(service.listPlugins(), [])
})

test('plugin service persists enablement without replacing unrelated settings', () => {
  const settingsService = createSettingsService({
    theme: 'system',
    plugins: { enabled: { existing: true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  const saved = service.setEnabled('official.basic-behavior', true)

  assert.equal(saved.enabled, true)
  assert.equal(settingsService.get().theme, 'system')
  assert.deepEqual(settingsService.get().plugins.enabled, {
    existing: true,
    'official.basic-behavior': true
  })
  assert.equal(settingsService.get().plugins.logs[0].message, 'Plugin enabled')
})

test('plugin service runs enabled official commands through a permissioned pet sdk', async () => {
  const petEvents = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'official.basic-behavior': true } }
    }),
    petService: {
      say: async (payload) => petEvents.push(payload)
    },
    officialPlugins: [createOfficialPlugin()]
  })

  assert.deepEqual(await service.runCommand('official.basic-behavior', 'greet'), { ok: true })
  assert.deepEqual(petEvents, [{
    text: '你好，我在这里',
    source: 'plugin:official.basic-behavior'
  }])
})

test('plugin service blocks enabled plugins from running when ecosystem policy denies them', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'official.basic-behavior': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()],
    getPluginBlockStatus: ({ id }) => id === 'official.basic-behavior'
      ? { blocked: true, reasons: ['pluginId:official.basic-behavior'] }
      : { blocked: false, reasons: [] }
  })

  assert.equal(service.listPlugins()[0].blockStatus.blocked, true)
  assert.throws(() => service.setEnabled('official.basic-behavior', true), /blocked/)
  await assert.rejects(
    () => service.runCommand('official.basic-behavior', 'greet'),
    /blocked/
  )
})

test('plugin service runs extension command entries through the compatibility runner', async () => {
  const petEvents = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'extension-runner': true } }
    }),
    petService: {
      say: async (payload) => petEvents.push(payload)
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        id: 'extension-runner',
        permissions: ['pet:say'],
        commands: undefined,
        entries: {
          commands: [{ id: 'announce', title: 'Announce', command: 'node ./commands/announce.js' }],
          services: [{ id: 'svc', title: 'Service', command: 'npm run service:start' }],
          dashboards: [{ id: 'main', title: 'Dashboard', url: 'http://127.0.0.1:8787' }]
        }
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            announce: async () => {
              await ctx.pet.say('Extension command ran')
              return { ok: true }
            }
          }
        }
      `
    })]
  })

  const [plugin] = service.listPlugins()
  assert.equal(plugin.runnable, true)
  assert.deepEqual(plugin.commands, [{ id: 'announce', title: 'Announce' }])
  assert.equal(plugin.entries.commands[0].id, 'announce')
  assert.equal(plugin.entries.services[0].id, 'svc')
  assert.equal(plugin.entries.dashboards[0].id, 'main')

  assert.deepEqual(await service.runCommand('extension-runner', 'announce'), { ok: true })
  assert.deepEqual(petEvents, [{ text: 'Extension command ran', source: 'plugin:extension-runner' }])
})

test('plugin service runs local plugin commands inside the restricted sdk', async () => {
  const petEvents = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: {
      say: async (payload) => petEvents.push(payload)
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      source: `
        module.exports = function activate(ctx) {
          ctx.commands.register({
            id: 'start',
            handler: async (payload) => {
              await ctx.pet.say(payload.message)
              return {
                ok: true,
                requireType: typeof require,
                processType: typeof process
              }
            }
          })
        }
      `
    })]
  })

  const [plugin] = service.listPlugins()
  assert.equal(plugin.runnable, true)

  const result = await service.runCommand('local-runner', 'start', { message: 'Focus mode started' })

  assert.equal(result.ok, true)
  assert.equal(result.requireType, 'undefined')
  assert.equal(result.processType, 'undefined')
  assert.deepEqual(petEvents, [{
    text: 'Focus mode started',
    source: 'plugin:local-runner'
  }])
})

test('plugin service blocks local plugin process escapes', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => {
              const attempts = []
              for (const attempt of [
                () => typeof process,
                () => typeof require,
                () => this.constructor.constructor('return process')(),
                () => ctx.pet.say.constructor('return process')(),
                () => ctx.pet.say.constructor.constructor('return process')()
              ]) {
                try {
                  attempts.push({ ok: true, value: String(attempt()) })
                } catch (error) {
                  attempts.push({ ok: false, message: error.message })
                }
              }
              return {
                attempts,
                pid: typeof process === 'undefined' ? null : process.pid
              }
            }
          }
        }
      `
    })]
  })

  const result = await service.runCommand('local-runner', 'start')
  assert.equal(result.pid, null)
  assert.deepEqual(result.attempts.map((attempt) => attempt.ok), [true, true, false, false, false])
  assert.equal(result.attempts[0].value, 'undefined')
  assert.equal(result.attempts[1].value, 'undefined')
  assert.match(result.attempts[2].message, /Code generation from strings disallowed/)
  assert.match(result.attempts[3].message, /Code generation from strings disallowed/)
  assert.match(result.attempts[4].message, /Code generation from strings disallowed/)
})

test('plugin service blocks local plugin sdk calls without permission', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: {
      say: async () => {
        throw new Error('pet say should not be reached')
      }
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: []
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async (payload) => ctx.pet.say(payload.message)
          }
        }
      `
    })]
  })

  await assert.rejects(
    () => service.runCommand('local-runner', 'start', { message: 'hello' }),
    /does not have pet:say permission/
  )

  assert.equal(service.getLogs()[0].level, 'error')
})

test('plugin service exposes schema-backed config to local plugins', async () => {
  const petEvents = []
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'local-runner': true },
      config: { 'local-runner': { greeting: 'Deep work', rounds: 3 } }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: {
      say: async (payload) => petEvents.push(payload)
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        configSchema: 'config.schema.json'
      },
      configSchema: {
        type: 'object',
        properties: {
          greeting: { type: 'string', title: 'Greeting', default: 'Focus' },
          rounds: { type: 'number', title: 'Rounds', default: 1 },
          strict: { type: 'boolean', title: 'Strict mode', default: true },
          mood: { type: 'string', enum: ['calm', 'bright'], default: 'calm' }
        },
        required: ['greeting']
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => {
              const config = ctx.config.get()
              await ctx.pet.say(config.greeting + ':' + config.rounds + ':' + config.strict + ':' + config.mood)
              return { config, greeting: ctx.config.get('greeting') }
            }
          }
        }
      `
    })]
  })

  const [plugin] = service.listPlugins()
  assert.equal(plugin.configSchema.properties.length, 4)
  assert.deepEqual(plugin.config, {
    greeting: 'Deep work',
    rounds: 3,
    strict: true,
    mood: 'calm'
  })

  const result = await service.runCommand('local-runner', 'start')

  assert.equal(result.greeting, 'Deep work')
  assert.deepEqual(result.config, plugin.config)
  assert.deepEqual(petEvents, [{
    text: 'Deep work:3:true:calm',
    source: 'plugin:local-runner'
  }])
})

test('plugin service saves schema-backed config without replacing enablement', () => {
  const settingsService = createSettingsService({
    theme: 'system',
    plugins: {
      enabled: { 'local-runner': true },
      config: { existing: { ok: true } }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        configSchema: 'config.schema.json'
      },
      configSchema: {
        type: 'object',
        properties: {
          greeting: { type: 'string', default: 'Focus' },
          rounds: { type: 'number', default: 1 },
          strict: { type: 'boolean', default: false }
        }
      },
      source: 'module.exports = function activate() { return {} }'
    })]
  })

  const updatedPlugin = service.saveConfig('local-runner', {
    greeting: 'Plan',
    rounds: '4',
    strict: true
  })

  assert.deepEqual(updatedPlugin.config, { greeting: 'Plan', rounds: 4, strict: true })
  assert.equal(settingsService.get().theme, 'system')
  assert.deepEqual(settingsService.get().plugins.enabled, { 'local-runner': true })
  assert.deepEqual(settingsService.get().plugins.config, {
    existing: { ok: true },
    'local-runner': { greeting: 'Plan', rounds: 4, strict: true }
  })
  assert.equal(settingsService.get().plugins.logs[0].message, 'Plugin config saved')
})

test('plugin service rejects config values outside schema enum', () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        configSchema: 'config.schema.json'
      },
      configSchema: {
        type: 'object',
        properties: {
          mood: { type: 'string', enum: ['calm', 'bright'] }
        }
      },
      source: 'module.exports = function activate() { return {} }'
    })]
  })

  assert.throws(() => service.saveConfig('local-runner', { mood: 'stormy' }), /must be one of/)
})

test('plugin service preserves numeric config enum values', async () => {
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'local-runner': true }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        configSchema: 'config.schema.json'
      },
      configSchema: {
        type: 'object',
        properties: {
          rounds: { type: 'number', enum: [1, 3, 5], default: 1 }
        }
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => ({ rounds: ctx.config.get('rounds'), type: typeof ctx.config.get('rounds') })
          }
        }
      `
    })]
  })

  const updatedPlugin = service.saveConfig('local-runner', { rounds: 3 })
  const result = await service.runCommand('local-runner', 'start')

  assert.deepEqual(updatedPlugin.config, { rounds: 3 })
  assert.deepEqual(result, { rounds: 3, type: 'number' })
})

test('plugin service exposes private storage to plugins with storage permission', async () => {
  const settingsService = createSettingsService({
    theme: 'system',
    plugins: {
      enabled: { 'local-runner': true },
      config: { 'local-runner': { greeting: 'Focus' } },
      storage: { 'local-runner': { count: 1, stale: true } }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['storage'],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => {
              const count = await ctx.storage.get('count', 0)
              await ctx.storage.set('count', count + 1)
              await ctx.storage.set('meta', { ok: true })
              await ctx.storage.remove('stale')
              return await ctx.storage.get()
            }
          }
        }
      `
    })]
  })

  const result = await service.runCommand('local-runner', 'start')

  assert.deepEqual(result, { count: 2, meta: { ok: true } })
  assert.equal(settingsService.get().theme, 'system')
  assert.deepEqual(settingsService.get().plugins.enabled, { 'local-runner': true })
  assert.deepEqual(settingsService.get().plugins.config, { 'local-runner': { greeting: 'Focus' } })
  assert.deepEqual(settingsService.get().plugins.storage, { 'local-runner': { count: 2, meta: { ok: true } } })
  assert.deepEqual(settingsService.get().plugins.logs.map((entry) => entry.message), ['Command completed', 'Command started'])
})

test('plugin service blocks private storage without permission', async () => {
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'local-runner': true },
      storage: { 'local-runner': { count: 1 } }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: [],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => ctx.storage.set('count', 2)
          }
        }
      `
    })]
  })

  await assert.rejects(
    () => service.runCommand('local-runner', 'start'),
    /does not have storage permission/
  )
  assert.deepEqual(settingsService.get().plugins.storage, { 'local-runner': { count: 1 } })
})

test('plugin service can clear private storage through sdk', async () => {
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'local-runner': true },
      storage: { 'local-runner': { count: 1 } }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['storage'],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => {
              await ctx.storage.clear()
              return await ctx.storage.get()
            }
          }
        }
      `
    })]
  })

  assert.deepEqual(await service.runCommand('local-runner', 'start'), {})
  assert.deepEqual(settingsService.get().plugins.storage, { 'local-runner': {} })
})

test('plugin service rejects oversized private storage values', async () => {
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'local-runner': true },
      storage: { 'local-runner': { count: 1 } }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['storage'],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => ctx.storage.set('blob', 'x'.repeat(17 * 1024))
          }
        }
      `
    })]
  })

  await assert.rejects(
    () => service.runCommand('local-runner', 'start'),
    /Plugin storage value exceeds/
  )
  assert.deepEqual(settingsService.get().plugins.storage, { 'local-runner': { count: 1 } })
})

test('plugin service rejects private storage above plugin quota', async () => {
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'local-runner': true },
      storage: { 'local-runner': { blob: 'x'.repeat(65000) } }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['storage'],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => ctx.storage.set('extra', 'x'.repeat(1024))
          }
        }
      `
    })]
  })

  await assert.rejects(
    () => service.runCommand('local-runner', 'start'),
    /Plugin storage exceeds/
  )
  assert.deepEqual(settingsService.get().plugins.storage, { 'local-runner': { blob: 'x'.repeat(65000) } })
})

test('plugin service rejects invalid private storage keys', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['storage'],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => ctx.storage.set('../bad', true)
          }
        }
      `
    })]
  })

  await assert.rejects(
    () => service.runCommand('local-runner', 'start'),
    /Plugin storage key must be/
  )
})

test('plugin service lets local plugins call ai chat through permissioned sdk', async () => {
  const aiCalls = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: { say: async () => {} },
    aiService: {
      chat: async (payload) => {
        aiCalls.push(payload)
        return { conversationId: payload.conversationId, reply: 'pong' }
      }
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['ai:chat'],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => ctx.ai.chat({ message: 'ping', conversationId: 'thread-a' })
          }
        }
      `
    })]
  })

  const result = await service.runCommand('local-runner', 'start')

  assert.deepEqual(result, { conversationId: 'plugin:local-runner:thread-a', reply: 'pong' })
  assert.deepEqual(aiCalls, [{ message: 'ping', conversationId: 'plugin:local-runner:thread-a' }])
})

test('plugin service blocks ai chat without permission', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: { say: async () => {} },
    aiService: {
      chat: async () => {
        throw new Error('ai should not be reached')
      }
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: [],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return { start: async () => ctx.ai.chat('ping') }
        }
      `
    })]
  })

  await assert.rejects(() => service.runCommand('local-runner', 'start'), /does not have ai:chat permission/)
})

test('plugin service lets local plugins fetch allowlisted https hosts', async () => {
  const fetchCalls = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: { say: async () => {} },
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options })
      return {
        ok: true,
        status: 200,
        url,
        headers: { get: (name) => name === 'content-type' ? 'application/json' : '' },
        text: async () => '{"ok":true}'
      }
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['network'],
        network: { allowlist: ['api.example.com'] },
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            start: async () => ctx.network.fetch('https://api.example.com/v1/status', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{"ping":true}'
            })
          }
        }
      `
    })]
  })

  const result = await service.runCommand('local-runner', 'start')

  assert.deepEqual(result, {
    ok: true,
    status: 200,
    url: 'https://api.example.com/v1/status',
    headers: { 'content-type': 'application/json' },
    text: '{"ok":true}'
  })
  assert.deepEqual(fetchCalls, [{
    url: 'https://api.example.com/v1/status',
    options: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      redirect: 'manual',
      body: '{"ping":true}'
    }
  }])
})

test('plugin service rejects oversized network request and response bodies', async () => {
  const createNetworkService = ({ source, fetchImpl }) => createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: { say: async () => {} },
    fetchImpl,
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['network'],
        network: { allowlist: ['api.example.com'] },
        commands: [{ id: 'start', title: 'Start' }]
      },
      source
    })]
  })

  await assert.rejects(
    () => createNetworkService({
      source: `
        module.exports = function activate(ctx) {
          return { start: async () => ctx.network.fetch('https://api.example.com/data', { method: 'POST', body: 'x'.repeat(65 * 1024) }) }
        }
      `,
      fetchImpl: async () => {
        throw new Error('fetch should not be reached')
      }
    }).runCommand('local-runner', 'start'),
    /request body exceeds/
  )

  await assert.rejects(
    () => createNetworkService({
      source: `
        module.exports = function activate(ctx) {
          return { start: async () => ctx.network.fetch('https://api.example.com/data') }
        }
      `,
      fetchImpl: async (url) => ({
        ok: true,
        status: 200,
        url,
        headers: { get: (name) => name === 'content-length' ? String(129 * 1024) : '' },
        text: async () => 'x'.repeat(129 * 1024)
      })
    }).runCommand('local-runner', 'start'),
    /response exceeds/
  )
})

test('plugin service blocks network calls without permission or allowlist match', async () => {
  const createNetworkService = ({ permissions, allowlist }) => createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: { say: async () => {} },
    fetchImpl: async () => {
      throw new Error('fetch should not be reached')
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions,
        network: { allowlist },
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return { start: async () => ctx.network.fetch('https://blocked.example.com/data') }
        }
      `
    })]
  })

  await assert.rejects(
    () => createNetworkService({ permissions: [], allowlist: ['blocked.example.com'] }).runCommand('local-runner', 'start'),
    /does not have network permission/
  )
  await assert.rejects(
    () => createNetworkService({ permissions: ['network'], allowlist: ['api.example.com'] }).runCommand('local-runner', 'start'),
    /cannot access network host: blocked.example.com/
  )
})

test('plugin service blocks sensitive network headers', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'local-runner': true } }
    }),
    petService: { say: async () => {} },
    fetchImpl: async () => {
      throw new Error('fetch should not be reached')
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['network'],
        network: { allowlist: ['api.example.com'] },
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: `
        module.exports = function activate(ctx) {
          return { start: async () => ctx.network.fetch('https://api.example.com/data', { headers: { Authorization: 'Bearer x' } }) }
        }
      `
    })]
  })

  await assert.rejects(() => service.runCommand('local-runner', 'start'), /header is not allowed/)
})

test('plugin service blocks commands for disabled plugins', async () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  await assert.rejects(
    () => service.runCommand('official.basic-behavior', 'greet'),
    /Plugin is disabled/
  )
})

test('plugin service records command lifecycle logs', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'official.basic-behavior': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  await service.runCommand('official.basic-behavior', 'greet')

  assert.deepEqual(service.getLogs().map((entry) => ({
    level: entry.level,
    pluginId: entry.pluginId,
    commandId: entry.commandId,
    message: entry.message
  })), [
    {
      level: 'info',
      pluginId: 'official.basic-behavior',
      commandId: 'greet',
      message: 'Command completed'
    },
    {
      level: 'info',
      pluginId: 'official.basic-behavior',
      commandId: 'greet',
      message: 'Command started'
    }
  ])
})

test('plugin service records command failures and can clear logs', async () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  await assert.rejects(
    () => service.runCommand('official.basic-behavior', 'greet'),
    /Plugin is disabled/
  )

  const [errorLog] = service.getLogs()
  assert.equal(errorLog.level, 'error')
  assert.equal(errorLog.pluginId, 'official.basic-behavior')
  assert.equal(errorLog.commandId, 'greet')
  assert.equal(errorLog.message, 'Plugin is disabled')
  assert.deepEqual(service.getLogs().map((entry) => entry.message), ['Plugin is disabled'])

  assert.deepEqual(service.clearLogs(), [])
  assert.deepEqual(service.getLogs(), [])
})

test('plugin service records enablement logs', () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  service.setEnabled('official.basic-behavior', true)

  const [log] = service.getLogs()
  assert.equal(log.level, 'info')
  assert.equal(log.pluginId, 'official.basic-behavior')
  assert.equal(log.message, 'Plugin enabled')
})

test('plugin service persists logs through settings', async () => {
  const settingsService = createSettingsService({
    plugins: { enabled: { 'official.basic-behavior': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  await service.runCommand('official.basic-behavior', 'greet')
  const reloadedService = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  assert.deepEqual(reloadedService.getLogs().map((entry) => entry.message), ['Command completed', 'Command started'])
  assert.equal(settingsService.get().plugins.logs.length, 2)
})

test('plugin service filters and exports persisted logs', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'official.basic-behavior': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  await service.runCommand('official.basic-behavior', 'greet')
  await assert.rejects(() => service.runCommand('official.basic-behavior', 'missing'), /Plugin command not found/)

  assert.deepEqual(service.getLogs({ level: 'error' }).map((entry) => entry.message), ['Plugin command not found: missing'])
  assert.deepEqual(service.getLogs({ query: 'completed' }).map((entry) => entry.message), ['Command completed'])

  const exportedJson = JSON.parse(service.exportLogs({ level: 'error', format: 'json' }))
  assert.equal(exportedJson.length, 1)
  assert.equal(exportedJson[0].level, 'error')

  const exportedCsv = service.exportLogs({ query: 'started', format: 'csv' })
  assert.match(exportedCsv, /^timestamp,level,pluginId,commandId,message\n/)
  assert.match(exportedCsv, /Command started/)
})

test('plugin service exposes private storage stats and clears storage from control center', () => {
  const settingsService = createSettingsService({
    plugins: {
      storage: { 'local-runner': { count: 1, meta: { ok: true } } }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['storage'],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: 'module.exports = function activate() { return {} }'
    })]
  })

  const [plugin] = service.listPlugins()
  assert.equal(plugin.storage.keyCount, 2)
  assert.ok(plugin.storage.byteSize > 2)

  const updatedPlugin = service.clearStorage('local-runner')

  assert.deepEqual(updatedPlugin.storage, { keyCount: 0, byteSize: 2, valid: true })
  assert.deepEqual(settingsService.get().plugins.storage, { 'local-runner': {} })
  assert.equal(service.getLogs()[0].message, 'Plugin storage cleared')
})

test('plugin service isolates invalid stored plugin storage from list rendering', () => {
  const cyclicStorage = {}
  cyclicStorage.self = cyclicStorage
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        storage: { 'local-runner': cyclicStorage }
      }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        permissions: ['storage'],
        commands: [{ id: 'start', title: 'Start' }]
      },
      source: 'module.exports = function activate() { return {} }'
    })]
  })

  const [plugin] = service.listPlugins()
  assert.deepEqual(plugin.storage, {
    keyCount: 0,
    byteSize: 0,
    valid: false,
    error: 'Plugin value must be JSON serializable at value.self'
  })
})
