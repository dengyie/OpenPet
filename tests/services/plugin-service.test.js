const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { EventEmitter } = require('events')
const http = require('http')
const { PassThrough } = require('stream')
const sharp = require('sharp')

const { createPluginService } = require('../../src/main/services/plugin-service')
const { createActionImportService } = require('../../src/main/services/action-import-service')
const { createPetPackService } = require('../../src/main/services/pet-pack-service')
const { createMinimalWebp } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')

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

const createDeclarationOnlyPluginDir = ({
  dashboardUrl = 'http://127.0.0.1:8787',
  commandCommand = 'node ./commands/announce.js',
  commandCwd = '.',
  serviceCommand = 'npm run service:start',
  serviceCwd = '.',
  serviceHealth,
  setupEntries = [],
  profile = 'runtime',
  permissions = []
} = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-declaration-plugin-'))
  const pluginPath = path.join(root, 'weather-declaration')
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'weather-declaration',
    name: 'Weather Declaration',
    version: '1.0.0',
    profile,
    permissions,
    entries: {
      setup: setupEntries,
      commands: [{ id: 'announce', title: 'Announce Weather', command: commandCommand, cwd: commandCwd }],
      services: [{
        id: 'companion',
        title: 'Companion Service',
        command: serviceCommand,
        cwd: serviceCwd,
        ...(serviceHealth ? { health: serviceHealth } : {})
      }],
      dashboards: [{ id: 'main', title: 'Dashboard', url: dashboardUrl }]
    }
  }))
  return root
}

const createFakeServiceProcess = ({ pid = 4321 } = {}) => {
  const child = new EventEmitter()
  child.pid = pid
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killCalls = []
  child.kill = (signal) => {
    child.killCalls.push(signal || 'SIGTERM')
    child.emit('exit', 0, signal || 'SIGTERM')
    return true
  }
  return child
}

const createSlowStoppingServiceProcess = ({ pid = 4321 } = {}) => {
  const child = createFakeServiceProcess({ pid })
  child.kill = (signal) => {
    child.killCalls.push(signal || 'SIGTERM')
    return true
  }
  return child
}

const createRunningServiceProcess = ({ pid = 4321 } = {}) => createSlowStoppingServiceProcess({ pid })

const createStubbornServiceProcess = ({ pid = 4321 } = {}) => {
  const child = createFakeServiceProcess({ pid })
  child.kill = (signal) => {
    child.killCalls.push(signal || 'SIGTERM')
    return true
  }
  return child
}

const createBridgeAwarePetService = () => {
  const calls = []
  return {
    calls,
    getSnapshot: () => ({
      settings: {
        name: 'Bridge Pet',
        ai: {
          behavior: {
            enabled: true
          }
        },
        petPacks: {
          activePackId: 'legacy-cat'
        }
      },
      actions: {
        defaultAction: 'idle',
        clickAction: 'wave',
        actions: [{ id: 'idle', label: 'Idle' }, { id: 'wave', label: 'Wave' }]
      }
    }),
    say: (payload) => {
      calls.push(['say', payload])
      return payload
    },
    playAction: (payload) => {
      calls.push(['action', payload])
      return payload
    },
    setEvent: (payload) => {
      calls.push(['event', payload])
      return payload
    }
  }
}

const waitFor = async (predicate, { timeoutMs = 500, intervalMs = 5 } = {}) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('Timed out waiting for async condition')
}

const requestBridge = (url, { method = 'GET', token, body } = {}) => new Promise((resolve, reject) => {
  const target = new URL(url)
  const request = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: `${target.pathname}${target.search}`,
    method,
    agent: false,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    }
  }, (response) => {
    let responseBody = ''
    response.setEncoding('utf-8')
    response.on('data', (chunk) => {
      responseBody += chunk
    })
    response.on('end', () => {
      try {
        resolve({
          status: response.statusCode,
          body: responseBody ? JSON.parse(responseBody) : {}
        })
      } catch (error) {
        reject(error)
      }
    })
  })
  request.on('error', reject)
  if (body) request.write(JSON.stringify(body))
  request.end()
})

const createMinimalCodexPetOutput = (root, manifest = {}) => {
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: manifest.id || 'creator-studio-cat',
    displayName: manifest.displayName || 'Creator Studio Cat',
    description: manifest.description || 'A generated OpenPet pet.',
    spritesheetPath: 'spritesheet.webp'
  }))
}

const createPluginAssetFrame = async (root, relativePath, fileName) => {
  const folderPath = path.join(root, 'weather-declaration', relativePath)
  fs.mkdirSync(folderPath, { recursive: true })
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 100, b: 255, alpha: 0.9 }
    }
  }).png().toFile(path.join(folderPath, fileName))
  return folderPath
}

const createExternalFrameFolder = async (root, folderName = 'picked-wave') => {
  const folderPath = path.join(root, folderName)
  fs.mkdirSync(folderPath, { recursive: true })
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 120, g: 220, b: 120, alpha: 0.9 }
    }
  }).png().toFile(path.join(folderPath, '01_no_bg.png'))
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 140, g: 240, b: 140, alpha: 0.9 }
    }
  }).png().toFile(path.join(folderPath, '02_no_bg.png'))
  return folderPath
}

const createTestActionImportService = (root) => createActionImportService({
  framesRoot: path.join(root, 'cat_anime', 'flames'),
  spritesDir: path.join(root, 'cat_anime', 'sprites'),
  configPath: path.join(root, 'cat_anime', 'animations.json')
})

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

test('plugin service lists declaration-only extension entries as runnable command entries', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const stdinChunks = []
  child.stdin.on('data', (chunk) => stdinChunks.push(String(chunk)))
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const [plugin] = service.listPlugins()

  assert.equal(plugin.id, 'weather-declaration')
  assert.equal(plugin.profile, 'runtime')
  assert.equal(plugin.enabled, true)
  assert.equal(plugin.runnable, true)
  assert.deepEqual(plugin.commands, [{ id: 'announce', title: 'Announce Weather' }])
  assert.equal(plugin.entries.commands[0].command, 'node ./commands/announce.js')
  assert.equal(plugin.entries.services[0].id, 'companion')
  assert.equal(plugin.entries.dashboards[0].url, 'http://127.0.0.1:8787')

  const commandRun = service.runCommand('weather-declaration', 'announce', { message: 'rain soon' })
  await waitFor(() => child.listenerCount('exit') > 0)
  child.stdout.write('{"ok":true,"petSay":"Bring an umbrella"}\n')
  child.stderr.write('warmup\n')
  child.emit('exit', 0, null)
  const result = await commandRun

  assert.equal(spawned[0].file, 'node')
  assert.deepEqual(spawned[0].args, ['./commands/announce.js'])
  assert.equal(path.basename(spawned[0].options.cwd), 'weather-declaration')
  assert.equal(spawned[0].options.shell, false)
  assert.equal(spawned[0].options.env.PATH, process.env.PATH)
  assert.match(spawned[0].options.env.OPENPET_BRIDGE_URL, /^http:\/\/127\.0\.0\.1:\d+\/plugins\/bridge\//)
  assert.match(spawned[0].options.env.OPENPET_BRIDGE_TOKEN, /^[A-Za-z0-9_-]{20,}$/)
  const stdinPayload = JSON.parse(stdinChunks.join(''))
  assert.equal(stdinPayload.pluginId, 'weather-declaration')
  assert.equal(stdinPayload.commandId, 'announce')
  assert.deepEqual(stdinPayload.payload, { message: 'rain soon' })
  assert.equal(path.basename(stdinPayload.paths.extensionDir), 'weather-declaration')
  assert.equal(result.ok, true)
  assert.equal(result.pluginId, 'weather-declaration')
  assert.equal(result.commandId, 'announce')
  assert.equal(result.exitCode, 0)
  assert.deepEqual(result.result, { ok: true, petSay: 'Bring an umbrella' })
  assert.equal(result.stderr, 'warmup')
  assert.deepEqual(settingsService.get().plugins.logs.map((entry) => entry.message).slice(0, 4), [
    'Command completed',
    'Command stderr: warmup',
    'Command stdout: {"ok":true,"petSay":"Bring an umbrella"}',
    'Command started'
  ])
})

test('declaration-only command entries receive creator-tools host directories in env', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'creator-tools',
      permissions: ['actions:read']
    })],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(typeof spawned[0].options.env.OPENPET_DATA_DIR, 'string')
  assert.equal(typeof spawned[0].options.env.OPENPET_CACHE_DIR, 'string')
  assert.equal(typeof spawned[0].options.env.OPENPET_LOG_DIR, 'string')
})

test('declaration-only creator action bridge exposes action state and validation', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const actionService = {
    getPreviewConfig: () => ({
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [
        { id: 'idle', label: 'Idle', sprite: 'file:///pets/idle.png', previewSprite: 'file:///pets/idle.png' },
        { id: 'wave', label: 'Wave Hello', sprite: 'file:///pets/wave.png', previewSprite: 'file:///pets/wave.png' }
      ]
    }),
    validateCreatorActionMutation: (payload) => ({
      ok: true,
      errors: [],
      warnings: [],
      actions: {
        defaultAction: payload.defaultAction || 'idle',
        clickAction: payload.clickAction || 'wave',
        actions: [
          { id: 'idle', label: 'Idle', sprite: 'file:///pets/idle.png' },
          { id: 'wave', label: 'Wave Hello', sprite: 'file:///pets/wave.png' }
        ]
      }
    }),
    applyCreatorActionMutation: (payload) => ({
      defaultAction: payload.defaultAction || 'idle',
      clickAction: payload.clickAction || 'wave',
      actions: [
        { id: 'idle', label: 'Idle', sprite: 'file:///pets/idle.png' },
        { id: 'wave', label: 'Wave Hello', sprite: 'file:///pets/wave.png' }
      ]
    })
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionService,
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'creator-tools',
      permissions: ['actions:read', 'actions:write']
    })],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const readResponse = await requestBridge(`${baseUrl}/creator/actions`, { token })
  const validateResponse = await requestBridge(`${baseUrl}/creator/actions/validate`, {
    method: 'POST',
    token,
    body: {
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [{ id: 'wave', label: 'Wave Hello', sprite: 'cat_anime/sprites/wave.png', frameCount: 12, frameMs: 90, frameWidth: 191, frameHeight: 453 }]
    }
  })
  const applyResponse = await requestBridge(`${baseUrl}/creator/actions/apply`, {
    method: 'POST',
    token,
    body: {
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [{ id: 'wave', label: 'Wave Hello', sprite: 'cat_anime/sprites/wave.png', frameCount: 12, frameMs: 90, frameWidth: 191, frameHeight: 453 }]
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(readResponse.status, 200)
  assert.equal(readResponse.body.ok, true)
  assert.equal(readResponse.body.actions.defaultAction, 'idle')
  assert.equal(validateResponse.status, 200)
  assert.equal(validateResponse.body.validation.ok, true)
  assert.equal(applyResponse.status, 200)
  assert.equal(applyResponse.body.actions.actions.find((action) => action.id === 'wave').label, 'Wave Hello')
})

test('declaration-only creator action bridge submits trigger proposals into the host inbox', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const submitted = []
  const actionService = {
    submitTriggerProposal: (payload) => {
      submitted.push(payload)
      return {
        proposal: {
          id: 'proposal:click:wave:test',
          actionId: payload.actionId,
          type: payload.type,
          binding: payload.binding,
          sourcePluginId: payload.sourcePluginId,
          sourceRunId: payload.sourceRunId,
          sourceCommandId: payload.sourceCommandId,
          message: payload.message,
          status: 'pending',
          resultCode: '',
          resultMessage: '',
          rejectionReason: '',
          createdAt: '2026-06-22T00:00:00.000Z',
          updatedAt: '2026-06-22T00:00:00.000Z',
          acceptedAt: '',
          rejectedAt: ''
        },
        animations: {
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: []
        }
      }
    }
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionService,
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'creator-tools',
      permissions: ['actions:read', 'actions:write']
    })],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const response = await requestBridge(`${baseUrl}/creator/actions/submit-trigger-proposal`, {
    method: 'POST',
    token,
    body: {
      actionId: 'wave',
      type: 'click',
      binding: 'clickAction',
      message: 'Import this action as the click trigger',
      sourcePluginId: 'openpet.creator-studio',
      sourceRunId: 'run-1',
      sourceCommandId: 'import-approved-action'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(response.status, 200)
  assert.equal(response.body.ok, true)
  assert.equal(response.body.proposal.actionId, 'wave')
  assert.equal(submitted.length, 1)
  assert.equal(submitted[0].sourcePluginId, 'openpet.creator-studio')
  assert.equal(submitted[0].sourceRunId, 'run-1')
  assert.equal(submitted[0].sourceCommandId, 'import-approved-action')
})

test('declaration-only creator action bridge rejects missing permissions', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'creator-tools',
      permissions: []
    })],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const readResponse = await requestBridge(`${baseUrl}/creator/actions`, { token })
  const writeResponse = await requestBridge(`${baseUrl}/creator/actions/apply`, {
    method: 'POST',
    token,
    body: { defaultAction: 'idle' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(readResponse.status, 403)
  assert.equal(writeResponse.status, 403)
})

test('declaration-only creator model bridge exposes settings, health, and host-owned generation', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['model:image-generate']
  })
  const bridgeCalls = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    imageGenerationModelService: {
      getConfig: () => ({
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-image-2',
        apiKeyRef: 'secret:model.image.openai.apiKey',
        timeoutMs: 120000,
        maxConcurrentJobs: 1,
        hasApiKey: true,
        apiKeyPreview: '••••1234',
        apiKeyLabel: 'Image API Key'
      }),
      checkHealth: async (payload) => {
        bridgeCalls.push(['checkHealth', payload])
        return {
          ok: true,
          provider: 'openai-compatible',
          code: 'provider_healthy',
          message: 'Image Provider is reachable'
        }
      },
      generateImage: async (payload) => {
        bridgeCalls.push(['generateImage', payload])
        return {
          ok: true,
          provider: 'openai-compatible',
          model: 'gpt-image-2',
          generatedAt: '2026-06-19T00:00:00.000Z',
          outputs: [{
            dataRelativePath: `${payload.output.dataRelativeDir}/0001.png`,
            mimeType: 'image/png',
            sha256: 'abc123'
          }]
        }
      }
    },
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const settingsResponse = await requestBridge(`${baseUrl}/creator/model-settings`, { token })
  const healthResponse = await requestBridge(`${baseUrl}/creator/model-health-check`, {
    method: 'POST',
    token,
    body: { backend: 'local' }
  })
  const generateResponse = await requestBridge(`${baseUrl}/creator/model-image-generate`, {
    method: 'POST',
    token,
    body: {
      prompt: 'small mint helper cat, transparent background',
      output: {
        dataDir: '/tmp/should-be-ignored',
        dataRelativeDir: 'runs/demo-run/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(settingsResponse.status, 200)
  assert.equal(settingsResponse.body.ok, true)
  assert.equal(settingsResponse.body.config.provider, 'openai-compatible')
  assert.equal(settingsResponse.body.config.apiKeyPreview, '••••1234')

  assert.equal(healthResponse.status, 200)
  assert.equal(healthResponse.body.ok, true)
  assert.equal(healthResponse.body.result.provider, 'openai-compatible')

  assert.equal(generateResponse.status, 200)
  assert.equal(generateResponse.body.ok, true)
  assert.equal(generateResponse.body.result.outputs[0].dataRelativePath, 'runs/demo-run/frames/base/0001.png')

  assert.deepEqual(bridgeCalls[0], ['checkHealth', {}])
  assert.equal(bridgeCalls[1][0], 'generateImage')
  assert.equal(Object.hasOwn(bridgeCalls[1][1], 'backend'), false)
  assert.equal(bridgeCalls[1][1].output.dataRelativeDir, 'runs/demo-run/frames/base')
  assert.match(bridgeCalls[1][1].output.dataDir, /\.openpet\/weather-declaration\/data$/)
})

test('declaration-only creator pack manifest bridge reads validates and applies active pack metadata', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const petPackService = {
    getActiveCreatorPackManifest: () => ({
      id: 'community-weather-cat',
      displayName: 'Community Weather Cat',
      version: '1.0.0',
      source: 'user-installed',
      provenance: {
        sourceUrl: 'https://example.com/original',
        assetAuthor: 'Original Author',
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
      }
    }),
    validateActiveCreatorPackManifestMutation: (payload) => ({
      ok: true,
      errors: [],
      warnings: [],
      manifest: {
        id: 'community-weather-cat',
        displayName: payload.displayName,
        version: payload.version,
        source: 'user-installed',
        provenance: {
          sourceUrl: payload.provenance.sourceUrl,
          assetAuthor: payload.provenance.assetAuthor,
          license: payload.provenance.license,
          licenseUrl: payload.provenance.licenseUrl
        }
      }
    }),
    applyActiveCreatorPackManifestMutation: (payload) => ({
      id: 'community-weather-cat',
      displayName: payload.displayName,
      version: payload.version,
      source: 'user-installed',
      provenance: {
        sourceUrl: payload.provenance.sourceUrl,
        assetAuthor: payload.provenance.assetAuthor,
        license: payload.provenance.license,
        licenseUrl: payload.provenance.licenseUrl
      }
    })
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    petPackService,
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'creator-tools',
      permissions: ['pack-manifest:read', 'pack-manifest:write']
    })],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const payload = {
    displayName: 'Community Weather Cat Deluxe',
    version: '1.1.0',
    provenance: {
      sourceUrl: 'https://example.com/deluxe',
      assetAuthor: 'Updated Author',
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
    }
  }

  const readResponse = await requestBridge(`${baseUrl}/creator/pack-manifest`, { token })
  const validateResponse = await requestBridge(`${baseUrl}/creator/pack-manifest/validate`, {
    method: 'POST',
    token,
    body: payload
  })
  const applyResponse = await requestBridge(`${baseUrl}/creator/pack-manifest/apply`, {
    method: 'POST',
    token,
    body: payload
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(readResponse.status, 200)
  assert.equal(readResponse.body.manifest.id, 'community-weather-cat')
  assert.equal(validateResponse.status, 200)
  assert.equal(validateResponse.body.validation.ok, true)
  assert.equal(applyResponse.status, 200)
  assert.equal(applyResponse.body.manifest.displayName, 'Community Weather Cat Deluxe')
})

test('declaration-only creator pack manifest bridge rejects missing permissions', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    petPackService: {
      getActiveCreatorPackManifest: () => ({
        id: 'ignored',
        displayName: 'Ignored',
        version: '1.0.0',
        source: 'user-installed',
        provenance: {}
      })
    },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'creator-tools',
      permissions: []
    })],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const readResponse = await requestBridge(`${baseUrl}/creator/pack-manifest`, { token })
  const writeResponse = await requestBridge(`${baseUrl}/creator/pack-manifest/apply`, {
    method: 'POST',
    token,
    body: { displayName: 'Nope' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(readResponse.status, 403)
  assert.equal(writeResponse.status, 403)
})

test('declaration-only creator pack manifest bridge rejects non-editable active packs', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    petPackService: {
      getActiveCreatorPackManifest: () => {
        throw new Error('Creator pack manifest workflows require an active installed pet pack')
      },
      validateActiveCreatorPackManifestMutation: () => ({
        ok: false,
        errors: ['Creator pack manifest workflows require an active installed pet pack'],
        warnings: [],
        manifest: null
      }),
      applyActiveCreatorPackManifestMutation: () => {
        throw new Error('Creator pack manifest workflows require an active installed pet pack')
      }
    },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'creator-tools',
      permissions: ['pack-manifest:read', 'pack-manifest:write']
    })],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const readResponse = await requestBridge(`${baseUrl}/creator/pack-manifest`, { token })
  const validateResponse = await requestBridge(`${baseUrl}/creator/pack-manifest/validate`, {
    method: 'POST',
    token,
    body: { displayName: 'Still Nope' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(readResponse.status, 400)
  assert.match(readResponse.body.error, /active installed pet pack/)
  assert.equal(validateResponse.status, 200)
  assert.equal(validateResponse.body.validation.ok, false)
})

test('declaration-only creator asset inspection bridge inspects package-local frame folders', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  await createPluginAssetFrame(root, 'assets/actions/wave', '01_no_bg.png')
  await createPluginAssetFrame(root, 'assets/actions/wave', '02_no_bg.png')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const inspectResponse = await requestBridge(`${baseUrl}/creator/assets/inspect-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/wave',
      actionId: 'wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(inspectResponse.status, 200)
  assert.equal(inspectResponse.body.ok, true)
  assert.equal(inspectResponse.body.result.actionId, 'wave')
  assert.equal(inspectResponse.body.result.folderName, 'wave')
  assert.equal(inspectResponse.body.result.inspection.valid, true)
  assert.equal(inspectResponse.body.result.inspection.frameCount, 2)
})

test('declaration-only pet pack bridge inspects imports and activates approved plugin output', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  let capturedDataDir = ''
  const activatedPacks = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } },
    petPacks: { activePackId: 'legacy-cat', installed: {} }
  })
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir: fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-packs-')),
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })
  const service = createPluginService({
    settingsService,
    petService: createBridgeAwarePetService(),
    petPackService,
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'hybrid',
      permissions: ['pet-pack:import']
    })],
    onPetPackActivated: (event) => activatedPacks.push(event),
    spawnCommandProcess: (file, args, options) => {
      capturedDataDir = options.env.OPENPET_DATA_DIR
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  const outputDir = path.join(capturedDataDir, 'runs', 'approved-cat', 'outputs')
  createMinimalCodexPetOutput(outputDir)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const inspectResponse = await requestBridge(`${baseUrl}/creator/pet-pack/inspect-output`, {
    method: 'POST',
    token,
    body: { dataRelativePath: 'runs/approved-cat/outputs' }
  })
  const importResponse = inspectResponse.body.inspection?.selectionId
    ? await requestBridge(`${baseUrl}/creator/pet-pack/import-output`, {
        method: 'POST',
        token,
        body: { selectionId: inspectResponse.body.inspection.selectionId, activate: true }
      })
    : { status: 0, body: {} }

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(inspectResponse.status, 200)
  assert.equal(inspectResponse.body.ok, true)
  assert.equal(inspectResponse.body.inspection.valid, true)
  assert.equal(inspectResponse.body.inspection.pack.id, 'creator-studio-cat')
  assert.equal(importResponse.status, 200)
  assert.equal(importResponse.body.ok, true)
  assert.equal(importResponse.body.imported.pack.id, 'creator-studio-cat')
  assert.equal(importResponse.body.activated.activePackId, 'creator-studio-cat')
  assert.equal(settingsService.get().petPacks.activePackId, 'creator-studio-cat')
  assert.equal(activatedPacks.length, 1)
  assert.equal(activatedPacks[0].packId, 'creator-studio-cat')
})

test('declaration-only pet pack bridge does not expose arbitrary activation route', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } },
    petPacks: {
      activePackId: 'legacy-cat',
      installed: {
        'legacy-cat': { id: 'legacy-cat', displayName: 'Legacy Cat' },
        'other-installed-cat': { id: 'other-installed-cat', displayName: 'Other Installed Cat' }
      }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: createBridgeAwarePetService(),
    petPackService: createPetPackService({
      settingsService,
      userPacksDir: fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-packs-')),
      projectRoot: '/app/openpet',
      loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] })
    }),
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'hybrid',
      permissions: ['pet-pack:import']
    })],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  const response = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/pet-pack/activate`, {
    method: 'POST',
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { packId: 'other-installed-cat' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(response.status, 404)
  assert.equal(settingsService.get().petPacks.activePackId, 'legacy-cat')
})

test('declaration-only pet pack bridge rejects missing import permission', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  let capturedDataDir = ''
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: createBridgeAwarePetService(),
    petPackService: createPetPackService({
      settingsService,
      userPacksDir: fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-packs-')),
      projectRoot: '/app/openpet',
      loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] })
    }),
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'hybrid',
      permissions: []
    })],
    spawnCommandProcess: (file, args, options) => {
      capturedDataDir = options.env.OPENPET_DATA_DIR
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  createMinimalCodexPetOutput(path.join(capturedDataDir, 'runs', 'approved-cat', 'outputs'))
  const response = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/pet-pack/inspect-output`, {
    method: 'POST',
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { dataRelativePath: 'runs/approved-cat/outputs' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(response.status, 403)
  assert.match(response.body.error, /pet-pack:import/)
})

test('creator studio example imports approved fixture pet through host bridge', async () => {
  const settingsService = createSettingsService({
    plugins: { enabled: { 'openpet.creator-studio': true } },
    petPacks: { activePackId: 'legacy-cat', installed: {} }
  })
  const userPacksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-'))
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir,
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })
  const service = createPluginService({
    settingsService,
    petService: createBridgeAwarePetService(),
    petPackService,
    officialPlugins: [],
    pluginDirs: [path.resolve(__dirname, '../../examples/plugins')]
  })

  const createResult = await service.runCommand('openpet.creator-studio', 'create-run', {
    petName: 'Sprout Cat',
    prompt: 'A small mint helper cat'
  })
  const runId = createResult.result.run.runId
  await service.runCommand('openpet.creator-studio', 'run-step', { runId })
  await service.runCommand('openpet.creator-studio', 'approve-run', { runId })
  const importResult = await service.runCommand('openpet.creator-studio', 'import-approved-pet', { runId, activate: true })

  assert.equal(importResult.ok, true)
  assert.equal(importResult.result.ok, true)
  assert.equal(importResult.result.run.importStatus, 'imported')
  assert.equal(settingsService.get().petPacks.activePackId, 'sprout-cat')
  assert.equal(fs.existsSync(path.join(userPacksDir, 'sprout-cat', 'pet.json')), true)
})

test('creator studio example imports approved host-bridged local pet through host bridge', async () => {
  const settingsService = createSettingsService({
    plugins: { enabled: { 'openpet.creator-studio': true } },
    petPacks: { activePackId: 'legacy-cat', installed: {} }
  })
  const userPacksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-local-import-'))
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir,
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })
  const service = createPluginService({
    settingsService,
    petService: createBridgeAwarePetService(),
    petPackService,
    imageGenerationModelService: {
      getConfig: () => ({
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:7860/v1',
        model: 'local-pet-sprite',
        apiKeyRef: 'secret:model.image.openai.apiKey',
        timeoutMs: 120000,
        maxConcurrentJobs: 1,
        hasApiKey: true,
        apiKeyPreview: '••••test',
        apiKeyLabel: 'Image API Key'
      }),
      checkHealth: async () => ({
        ok: true,
        provider: 'openai-compatible',
        code: 'provider_healthy',
        message: 'Image Provider is reachable'
      }),
      generateImage: async ({ output }) => {
        const targetPath = path.join(output.dataDir, output.dataRelativeDir, '0001.png')
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        await sharp({
          create: {
            width: 96,
            height: 112,
            channels: 4,
            background: { r: 20, g: 170, b: 120, alpha: 1 }
          }
        })
          .png()
          .toFile(targetPath)
        return {
          ok: true,
          provider: 'openai-compatible',
          model: 'local-pet-sprite',
          generatedAt: '2026-06-19T00:00:00.000Z',
          outputs: [{
            dataRelativePath: `${output.dataRelativeDir}/0001.png`,
            mimeType: 'image/png',
            sha256: crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex')
          }]
        }
      }
    },
    officialPlugins: [],
    pluginDirs: [path.resolve(__dirname, '../../examples/plugins')]
  })

  const createResult = await service.runCommand('openpet.creator-studio', 'create-run', {
    petName: 'Local Sprout Cat',
    prompt: 'A small mint helper cat',
    backend: 'local'
  })
  const runId = createResult.result.run.runId
  await service.runCommand('openpet.creator-studio', 'run-step', { runId })
  await service.runCommand('openpet.creator-studio', 'approve-run', { runId })
  const importResult = await service.runCommand('openpet.creator-studio', 'import-approved-pet', { runId, activate: true })

  assert.equal(importResult.ok, true)
  assert.equal(importResult.result.ok, true)
  assert.equal(importResult.result.run.importStatus, 'imported')
  assert.equal(settingsService.get().petPacks.activePackId, 'local-sprout-cat')
  assert.equal(fs.existsSync(path.join(userPacksDir, 'local-sprout-cat', 'pet.json')), true)
  assert.notEqual(
    crypto.createHash('sha256').update(fs.readFileSync(path.join(userPacksDir, 'local-sprout-cat', 'spritesheet.webp'))).digest('hex'),
    crypto.createHash('sha256').update(createMinimalWebp()).digest('hex')
  )
})

test('declaration-only creator asset inspection bridge rejects missing permissions', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: []
  })
  await createPluginAssetFrame(root, 'assets/actions/wave', '01_no_bg.png')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const inspectResponse = await requestBridge(`${baseUrl}/creator/assets/inspect-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/wave',
      actionId: 'wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(inspectResponse.status, 403)
})

test('declaration-only creator asset inspection bridge rejects path traversal and symlink escapes', async (t) => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  const outsideDir = path.join(root, 'outside-wave')
  fs.mkdirSync(outsideDir, { recursive: true })
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 255, g: 100, b: 0, alpha: 0.9 }
    }
  }).png().toFile(path.join(outsideDir, '01_no_bg.png'))
  const pluginDir = path.join(root, 'weather-declaration')
  const symlinkPath = path.join(pluginDir, 'assets', 'escape')
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true })
  try {
    fs.symlinkSync(outsideDir, symlinkPath, 'dir')
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const traversalResponse = await requestBridge(`${baseUrl}/creator/assets/inspect-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: '../outside-wave',
      actionId: 'wave'
    }
  })
  const symlinkResponse = await requestBridge(`${baseUrl}/creator/assets/inspect-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/escape',
      actionId: 'wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(traversalResponse.status, 400)
  assert.equal(symlinkResponse.status, 400)
})

test('declaration-only creator asset inspection bridge rejects symlinked files inside the inspected folder', async (t) => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  const pluginAssetDir = path.join(root, 'weather-declaration', 'assets', 'actions', 'wave')
  fs.mkdirSync(pluginAssetDir, { recursive: true })
  const outsideFile = path.join(root, 'outside-frame.png')
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 180, b: 255, alpha: 0.9 }
    }
  }).png().toFile(outsideFile)
  try {
    fs.symlinkSync(outsideFile, path.join(pluginAssetDir, '01_no_bg.png'))
  } catch (error) {
    t.skip(`File symlinks are unavailable: ${error.message}`)
    return
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const inspectResponse = await requestBridge(`${baseUrl}/creator/assets/inspect-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/wave',
      actionId: 'wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(inspectResponse.status, 400)
  assert.match(inspectResponse.body.error, /must not contain symlinks/)
})

test('declaration-only creator asset import bridge imports package-local frame folders', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  await createPluginAssetFrame(root, 'assets/actions/wave', '01_no_bg.png')
  await createPluginAssetFrame(root, 'assets/actions/wave', '02_no_bg.png')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/wave',
      actionId: 'wave',
      label: 'Wave Hello'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 200)
  assert.equal(importResponse.body.ok, true)
  assert.equal(importResponse.body.importedAction.id, 'wave')
  assert.equal(importResponse.body.importedAction.label, 'Wave Hello')
  assert.equal(importResponse.body.actions.defaultAction, 'wave')
  assert.equal(importResponse.body.actions.actions.find((action) => action.id === 'wave').sprite, 'cat_anime/sprites/wave.png')
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'flames', 'wave', '01_no_bg.png')), true)
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'sprites', 'wave.png')), true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'cat_anime', 'animations.json'), 'utf-8')).actions[0].id, 'wave')
})

test('declaration-only creator asset import bridge imports generated data frame folders', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const dataDir = spawned[0].options.env.OPENPET_DATA_DIR
  const generatedFrames = path.join(dataDir, 'runs/demo/frames/actions/generated-wave')
  fs.mkdirSync(generatedFrames, { recursive: true })
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 100, b: 255, alpha: 0.9 }
    }
  }).png().toFile(path.join(generatedFrames, '01_no_bg.png'))
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 40, g: 120, b: 255, alpha: 0.9 }
    }
  }).png().toFile(path.join(generatedFrames, '02_no_bg.png'))
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      dataRelativePath: 'runs/demo/frames/actions/generated-wave',
      actionId: 'generated-wave',
      label: 'Generated Wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 200)
  assert.equal(importResponse.body.ok, true)
  assert.equal(importResponse.body.importedAction.id, 'generated-wave')
  assert.equal(importResponse.body.importedAction.label, 'Generated Wave')
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'flames', 'generated-wave', '01_no_bg.png')), true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'cat_anime', 'animations.json'), 'utf-8')).actions[0].id, 'generated-wave')
})

test('declaration-only creator asset import bridge rejects missing generation permission', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  await createPluginAssetFrame(root, 'assets/actions/wave', '01_no_bg.png')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/wave',
      actionId: 'wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 403)
})

test('declaration-only creator asset import bridge rejects path traversal and symlink escapes', async (t) => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const outsideDir = path.join(root, 'outside-wave')
  fs.mkdirSync(outsideDir, { recursive: true })
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 255, g: 100, b: 0, alpha: 0.9 }
    }
  }).png().toFile(path.join(outsideDir, '01_no_bg.png'))
  const pluginDir = path.join(root, 'weather-declaration')
  const symlinkPath = path.join(pluginDir, 'assets', 'escape-import')
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true })
  try {
    fs.symlinkSync(outsideDir, symlinkPath, 'dir')
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const traversalResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: '../outside-wave',
      actionId: 'wave'
    }
  })
  const symlinkResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/escape-import',
      actionId: 'wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(traversalResponse.status, 400)
  assert.equal(symlinkResponse.status, 400)
})

test('declaration-only creator asset import bridge rejects symlinked files inside the source folder', async (t) => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const pluginAssetDir = path.join(root, 'weather-declaration', 'assets', 'actions', 'wave')
  fs.mkdirSync(pluginAssetDir, { recursive: true })
  const outsideFile = path.join(root, 'outside-frame.png')
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 255, g: 80, b: 0, alpha: 0.9 }
    }
  }).png().toFile(outsideFile)
  try {
    fs.symlinkSync(outsideFile, path.join(pluginAssetDir, '01_no_bg.png'))
  } catch (error) {
    t.skip(`File symlinks are unavailable: ${error.message}`)
    return
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/wave',
      actionId: 'wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 400)
  assert.match(importResponse.body.error, /must not contain symlinks/)
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'flames', 'wave')), false)
})

test('declaration-only creator asset import bridge rejects duplicate action ids without overwriting', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  await createPluginAssetFrame(root, 'assets/actions/wave', '01_no_bg.png')
  const existingActionDir = path.join(root, 'cat_anime', 'flames', 'wave')
  fs.mkdirSync(existingActionDir, { recursive: true })
  fs.writeFileSync(path.join(existingActionDir, 'keep.txt'), 'keep')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/wave',
      actionId: 'wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 400)
  assert.match(importResponse.body.error, /Action ID already exists: wave/)
  assert.equal(fs.readFileSync(path.join(existingActionDir, 'keep.txt'), 'utf-8'), 'keep')
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'sprites', 'wave.png')), false)
})

test('declaration-only creator asset import bridge rejects oversized inspections before importing', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const pluginAssetDir = path.join(root, 'weather-declaration', 'assets', 'actions', 'huge-wave')
  fs.mkdirSync(pluginAssetDir, { recursive: true })
  let importCalled = false
  const actionImportService = {
    inspectActionFrames: async () => ({
      actionId: 'huge-wave',
      folderName: 'huge-wave',
      inspection: {
        valid: true,
        frameCount: 241,
        maxWidth: 8,
        maxHeight: 8,
        frames: [],
        skippedFiles: [],
        errors: [],
        warnings: []
      }
    }),
    importActionFrames: async () => {
      importCalled = true
      return { defaultAction: 'huge-wave', clickAction: 'huge-wave', actions: [] }
    }
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService,
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/huge-wave',
      actionId: 'huge-wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 400)
  assert.match(importResponse.body.error, /too many frames/)
  assert.equal(importCalled, false)
})

test('declaration-only creator asset import bridge rejects oversized source folders before importing', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const pluginAssetDir = path.join(root, 'weather-declaration', 'assets', 'actions', 'heavy-wave')
  fs.mkdirSync(pluginAssetDir, { recursive: true })
  await createPluginAssetFrame(root, 'assets/actions/heavy-wave', '01_no_bg.png')
  const heavyFilePath = path.join(pluginAssetDir, 'heavy.bin')
  fs.writeFileSync(heavyFilePath, '')
  fs.truncateSync(heavyFilePath, 51 * 1024 * 1024)
  let importCalled = false
  const actionImportService = {
    inspectActionFrames: async () => ({
      actionId: 'heavy-wave',
      folderName: 'heavy-wave',
      inspection: {
        valid: true,
        frameCount: 1,
        maxWidth: 8,
        maxHeight: 8,
        frames: [{ fileName: '01_no_bg.png', width: 8, height: 8, hasAlpha: true }],
        skippedFiles: ['heavy.bin'],
        errors: [],
        warnings: []
      }
    }),
    importActionFrames: async () => {
      importCalled = true
      return { defaultAction: 'heavy-wave', clickAction: 'heavy-wave', actions: [] }
    }
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService,
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/heavy-wave',
      actionId: 'heavy-wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 400)
  assert.match(importResponse.body.error, /too large to import: \d+ bytes/)
  assert.equal(importCalled, false)
})

test('declaration-only creator asset picker inspection opens a host picker without leaking the selected path', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  const externalFrames = await createExternalFrameFolder(root)
  let pickerCalls = 0
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    selectCreatorAssetFrameFolder: async () => {
      pickerCalls += 1
      return { canceled: false, sourceDir: externalFrames }
    },
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const inspectResponse = await requestBridge(`${baseUrl}/creator/assets/pick-frames/inspect`, {
    method: 'POST',
    token,
    body: {
      actionId: 'picked-wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(pickerCalls, 1)
  assert.equal(inspectResponse.status, 200)
  assert.equal(inspectResponse.body.ok, true)
  assert.equal(inspectResponse.body.canceled, false)
  assert.equal(inspectResponse.body.result.actionId, 'picked-wave')
  assert.equal(inspectResponse.body.result.folderName, 'picked-wave')
  assert.equal(inspectResponse.body.result.inspection.valid, true)
  assert.equal(JSON.stringify(inspectResponse.body).includes(externalFrames), false)
})

test('declaration-only creator asset picker inspection returns canceled without inspecting', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  let inspectCalled = false
  const actionImportService = {
    inspectActionFrames: async () => {
      inspectCalled = true
      return {}
    }
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService,
    officialPlugins: [],
    pluginDirs: [root],
    selectCreatorAssetFrameFolder: async () => ({ canceled: true }),
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const inspectResponse = await requestBridge(`${baseUrl}/creator/assets/pick-frames/inspect`, {
    method: 'POST',
    token,
    body: {
      actionId: 'picked-wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(inspectResponse.status, 200)
  assert.deepEqual(inspectResponse.body, { ok: true, canceled: true })
  assert.equal(inspectCalled, false)
})

test('declaration-only creator asset picker import imports a user-approved external frame folder', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const externalFrames = await createExternalFrameFolder(root, 'approved-wave')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    selectCreatorAssetFrameFolder: async () => ({ canceled: false, sourceDir: externalFrames }),
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/pick-frames/import`, {
    method: 'POST',
    token,
    body: {
      actionId: 'approved-wave',
      label: 'Approved Wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 200)
  assert.equal(importResponse.body.ok, true)
  assert.equal(importResponse.body.canceled, false)
  assert.equal(importResponse.body.importedAction.id, 'approved-wave')
  assert.equal(importResponse.body.importedAction.label, 'Approved Wave')
  assert.equal(importResponse.body.actions.actions.find((action) => action.id === 'approved-wave').sprite, 'cat_anime/sprites/approved-wave.png')
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'flames', 'approved-wave', '01_no_bg.png')), true)
  assert.equal(JSON.stringify(importResponse.body).includes(externalFrames), false)
})

test('declaration-only creator asset picker routes reject missing permissions', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: []
  })
  const externalFrames = await createExternalFrameFolder(root)
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    selectCreatorAssetFrameFolder: async () => ({ canceled: false, sourceDir: externalFrames }),
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const inspectResponse = await requestBridge(`${baseUrl}/creator/assets/pick-frames/inspect`, {
    method: 'POST',
    token,
    body: { actionId: 'picked-wave' }
  })
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/pick-frames/import`, {
    method: 'POST',
    token,
    body: { actionId: 'picked-wave' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(inspectResponse.status, 403)
  assert.equal(importResponse.status, 403)
})

test('declaration-only creator asset picker import rejects symlinks inside picked folders before importing', async (t) => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const externalFrames = path.join(root, 'picked-symlink-wave')
  fs.mkdirSync(externalFrames, { recursive: true })
  const outsideFile = path.join(root, 'outside-picked-frame.png')
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 30, g: 60, b: 220, alpha: 0.9 }
    }
  }).png().toFile(outsideFile)
  try {
    fs.symlinkSync(outsideFile, path.join(externalFrames, '01_no_bg.png'))
  } catch (error) {
    t.skip(`File symlinks are unavailable: ${error.message}`)
    return
  }
  let importCalled = false
  const actionImportService = {
    inspectActionFrames: async () => {
      throw new Error('inspection should not run before symlink rejection')
    },
    importActionFrames: async () => {
      importCalled = true
      return {}
    }
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService,
    officialPlugins: [],
    pluginDirs: [root],
    selectCreatorAssetFrameFolder: async () => ({ canceled: false, sourceDir: externalFrames }),
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/pick-frames/import`, {
    method: 'POST',
    token,
    body: {
      actionId: 'picked-symlink-wave'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 400)
  assert.match(importResponse.body.error, /must not contain symlinks/)
  assert.equal(importCalled, false)
})

test('declaration-only creator asset picker import rejects a picked folder that is itself a symlink', async (t) => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const externalFrames = await createExternalFrameFolder(root, 'picked-real-wave')
  const symlinkFolder = path.join(root, 'picked-folder-symlink')
  try {
    fs.symlinkSync(externalFrames, symlinkFolder, 'dir')
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }
  let importCalled = false
  const actionImportService = {
    inspectActionFrames: async () => {
      throw new Error('inspection should not run before symlink rejection')
    },
    importActionFrames: async () => {
      importCalled = true
      return {}
    }
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService,
    officialPlugins: [],
    pluginDirs: [root],
    selectCreatorAssetFrameFolder: async () => ({ canceled: false, sourceDir: symlinkFolder }),
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/pick-frames/import`, {
    method: 'POST',
    token,
    body: {
      actionId: 'picked-folder-symlink'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 400)
  assert.match(importResponse.body.error, /must not be a symlink/)
  assert.equal(importCalled, false)
})

test('plugin service rejects non-zero declaration command exits', async () => {
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: () => child
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.stdout.listenerCount('data') > 0)
  child.stderr.write('boom\n')
  child.emit('exit', 7, null)

  await assert.rejects(commandRun, /Plugin command exited with code 7/)
  assert.deepEqual(service.getLogs().map((entry) => entry.message).slice(0, 3), [
    'Plugin command exited with code 7',
    'Command stderr: boom',
    'Command started'
  ])
})

test('plugin service surfaces structured command errors from declaration stdout', async () => {
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: () => child
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.stdout.listenerCount('data') > 0)
  child.stdout.write('{"ok":false,"error":"runId is required"}\n')
  child.emit('exit', 1, null)

  await assert.rejects(commandRun, /runId is required/)
  assert.deepEqual(service.getLogs().map((entry) => entry.message).slice(0, 3), [
    'runId is required',
    'Command stdout: {"ok":false,"error":"runId is required"}',
    'Command started'
  ])
})

test('declaration-only command entries receive short-lived bridge env vars', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true }
      }
    }),
    petService: createBridgeAwarePetService(),
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.match(spawned[0].options.env.OPENPET_BRIDGE_URL, /^http:\/\/127\.0\.0\.1:\d+\/plugins\/bridge\//)
  assert.match(spawned[0].options.env.OPENPET_BRIDGE_TOKEN, /^[A-Za-z0-9_-]{20,}$/)
})

test('declaration-only command bridge forwards pet mutations through PetService', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const petService = createBridgeAwarePetService()
  const root = createDeclarationOnlyPluginDir()
  const pluginPath = path.join(root, 'weather-declaration', 'plugin.json')
  fs.writeFileSync(path.join(pluginPath), JSON.stringify({
    id: 'weather-declaration',
    name: 'Weather Declaration',
    version: '1.0.0',
    permissions: ['pet:say', 'pet:action', 'pet:event'],
    entries: {
      commands: [{ id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js', cwd: '.' }]
    }
  }))
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true }
      }
    }),
    petService,
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const sayResult = await requestBridge(`${baseUrl}/pet/say`, {
    method: 'POST',
    token,
    body: { text: 'Bridge says hi', ttlMs: 1500 }
  })

  const actionResult = await requestBridge(`${baseUrl}/pet/action`, {
    method: 'POST',
    token,
    body: { actionId: 'wave' }
  })

  const eventResult = await requestBridge(`${baseUrl}/pet/event`, {
    method: 'POST',
    token,
    body: { type: 'weather', message: 'Rain soon', ttlMs: 3000 }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(sayResult.status, 200)
  assert.equal(sayResult.body.ok, true)
  assert.equal(actionResult.status, 200)
  assert.equal(actionResult.body.ok, true)
  assert.equal(eventResult.status, 200)
  assert.equal(eventResult.body.ok, true)
  assert.deepEqual(petService.calls, [
    ['say', { text: 'Bridge says hi', ttlMs: 1500, source: 'plugin:weather-declaration:bridge' }],
    ['action', { actionId: 'wave', source: 'plugin:weather-declaration:bridge' }],
    ['event', { type: 'weather', message: 'Rain soon', ttlMs: 3000, source: 'plugin:weather-declaration:bridge' }]
  ])
})

test('declaration-only command bridge rejects missing permissions, invalid token, and expired runs', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir()
  const pluginPath = path.join(root, 'weather-declaration', 'plugin.json')
  fs.writeFileSync(path.join(pluginPath), JSON.stringify({
    id: 'weather-declaration',
    name: 'Weather Declaration',
    version: '1.0.0',
    permissions: ['pet:say'],
    entries: {
      commands: [{ id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js', cwd: '.' }]
    }
  }))
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true }
      }
    }),
    petService: createBridgeAwarePetService(),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const wrongToken = await requestBridge(`${baseUrl}/pet/say`, {
    method: 'POST',
    token: 'wrong-token',
    body: { text: 'nope' }
  })

  const missingPermission = await requestBridge(`${baseUrl}/pet/event`, {
    method: 'POST',
    token,
    body: { type: 'weather', message: 'nope' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  const expired = await requestBridge(`${baseUrl}/pet/say?expired=1`, {
    method: 'POST',
    token,
    body: { text: 'too late' }
  })

  assert.equal(wrongToken.status, 401)
  assert.equal(missingPermission.status, 403)
  assert.equal(expired.status, 401)
})

test('declaration-only command bridge exposes bounded read-only context', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir()
  const pluginPath = path.join(root, 'weather-declaration', 'plugin.json')
  fs.writeFileSync(path.join(pluginPath), JSON.stringify({
    id: 'weather-declaration',
    name: 'Weather Declaration',
    version: '1.0.0',
    permissions: [],
    entries: {
      commands: [{ id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js', cwd: '.' }]
    }
  }))
  const petService = createBridgeAwarePetService()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true }
      }
    }),
    petService,
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const contextResponse = await requestBridge(`${baseUrl}/context`, {
    token
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.deepEqual(contextResponse.body, {
    ok: true,
    context: {
      petName: 'Bridge Pet',
      selectedPetId: 'legacy-cat',
      currentActionId: 'idle',
      personality: {
        tone: 'friendly',
        tags: ['companion', 'playful']
      }
    }
  })
})

test('plugin service rejects declaration command cwd symlinks escaping the plugin directory', async () => {
  const root = createDeclarationOnlyPluginDir({ commandCwd: 'command-link' })
  const outsidePath = path.join(root, 'outside-command')
  fs.mkdirSync(outsidePath)
  fs.symlinkSync(outsidePath, path.join(root, 'weather-declaration', 'command-link'))
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  await assert.rejects(
    () => service.runCommand('weather-declaration', 'announce'),
    /Plugin command cwd must stay inside the plugin directory/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service rejects declaration command runs for disabled plugins', async () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  await assert.rejects(
    () => service.runCommand('weather-declaration', 'announce'),
    /Plugin is disabled/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service blocks declaration command runs when ecosystem policy denies the plugin', async () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    getPluginBlockStatus: () => ({ blocked: true, reasons: ['blocked for review'] }),
    spawnCommandProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  await assert.rejects(
    () => service.runCommand('weather-declaration', 'announce'),
    /Plugin is blocked: blocked for review/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service rejects unknown declaration command ids before spawning processes', async () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  await assert.rejects(
    () => service.runCommand('weather-declaration', 'missing'),
    /Plugin command entry not found: missing/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service rejects non-json declaration command payloads before spawning processes', async () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })
  const circularPayload = { city: 'Shanghai' }
  circularPayload.self = circularPayload

  await assert.rejects(
    () => service.runCommand('weather-declaration', 'announce', circularPayload),
    /Plugin payload must be JSON serializable/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service rejects duplicate declaration command runs while one is running', async () => {
  const child = createSlowStoppingServiceProcess()
  let started = false
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: () => {
      started = true
      return child
    }
  })

  const firstRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => started)

  await assert.rejects(
    () => service.runCommand('weather-declaration', 'announce'),
    /Plugin command is already running/
  )

  child.emit('exit', 0, null)
  await firstRun
})

test('plugin service times out stalled declaration command processes', async () => {
  const child = createSlowStoppingServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    commandProcessTimeoutMs: 1,
    spawnCommandProcess: () => child
  })

  await assert.rejects(
    () => service.runCommand('weather-declaration', 'announce'),
    /Plugin command timed out after 1ms/
  )
  assert.deepEqual(child.killCalls, ['SIGTERM'])
})

test('plugin service stops running declaration commands when a plugin is disabled', async () => {
  const child = createSlowStoppingServiceProcess()
  let started = false
  const treeSignals = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: () => {
      started = true
      return child
    },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return false
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => started)
  service.setEnabled('weather-declaration', false)

  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(settingsService.get().plugins.logs.some((entry) => entry.message === 'Command stop requested'), true)

  child.emit('exit', 0, 'SIGTERM')

  await assert.rejects(commandRun, /Command stopped/)
  const stopLogs = settingsService.get().plugins.logs.filter((entry) => entry.message === 'Command stopped')
  assert.equal(stopLogs.length, 1)
})

test('plugin service stops running declaration commands during app shutdown cleanup', async () => {
  const child = createSlowStoppingServiceProcess()
  let started = false
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: () => {
      started = true
      return child
    },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return false
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => started)
  const result = service.stopAllServices()

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, ['SIGTERM'])

  child.emit('exit', 0, 'SIGTERM')

  await assert.rejects(commandRun, /Command stopped/)
})

test('plugin service lists setup entries with not-run runtime status', () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{
        id: 'install-deps',
        title: 'Install Dependencies',
        command: 'npm install',
        cwd: '.'
      }]
    })]
  })

  const [plugin] = service.listPlugins()

  assert.deepEqual(plugin.entries.setup, [{
    id: 'install-deps',
    title: 'Install Dependencies',
    command: 'npm install',
    cwd: '.',
    runtime: { status: 'not-run', lastRunAt: '', exitCode: null, error: '' }
  }])
  assert.equal(plugin.commands.some((command) => command.id === 'install-deps'), false)
})

test('plugin service runs enabled setup entries without shell expansion', async () => {
  const spawned = []
  const child = createSlowStoppingServiceProcess()
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{
        id: 'install-deps',
        title: 'Install Dependencies',
        command: 'npm install',
        cwd: '.'
      }]
    })],
    spawnSetupProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const setupRun = service.runSetup('weather-declaration', 'install-deps')

  assert.equal(service.listPlugins()[0].entries.setup[0].runtime.status, 'running')
  assert.equal(spawned[0].file, 'npm')
  assert.deepEqual(spawned[0].args, ['install'])
  assert.equal(path.basename(spawned[0].options.cwd), 'weather-declaration')
  assert.equal(spawned[0].options.shell, false)
  assert.equal(spawned[0].options.detached, false)
  assert.deepEqual(Object.keys(spawned[0].options.env).sort(), ['PATH'].filter((key) => process.env[key]).sort())
  assert.equal(settingsService.get().plugins.logs[0].message, 'Setup started')

  child.stdout.write('ready\n')
  child.stderr.write('warn\n')
  child.emit('exit', 0, '')

  const result = await setupRun

  assert.equal(result.ok, true)
  assert.equal(result.runtime.status, 'succeeded')
  assert.equal(result.runtime.exitCode, 0)
  assert.equal(service.listPlugins()[0].entries.setup[0].runtime.status, 'succeeded')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Setup completed')
  assert.equal(settingsService.get().plugins.logs[1].message, 'Setup stderr: warn')
  assert.equal(settingsService.get().plugins.logs[2].message, 'Setup stdout: ready')
})

test('plugin service marks non-zero setup exits as failed', async () => {
  const child = createSlowStoppingServiceProcess()
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => child
  })

  const setupRun = service.runSetup('weather-declaration', 'install-deps')
  child.emit('exit', 1, '')
  const result = await setupRun

  assert.equal(result.runtime.status, 'failed')
  assert.equal(result.runtime.exitCode, 1)
  const runtime = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtime.status, 'failed')
  assert.equal(runtime.exitCode, 1)
  assert.equal(settingsService.get().plugins.logs[0].level, 'error')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Setup failed')
})

test('plugin service rejects setup runs for disabled plugins', () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  assert.throws(
    () => service.runSetup('weather-declaration', 'install-deps'),
    /Plugin is disabled/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service blocks setup runs when ecosystem policy denies the plugin', () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    getPluginBlockStatus: () => ({ blocked: true, reasons: ['blocked for review'] }),
    spawnSetupProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  assert.throws(
    () => service.runSetup('weather-declaration', 'install-deps'),
    /Plugin is blocked: blocked for review/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service rejects unknown setup ids before spawning processes', () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  assert.throws(
    () => service.runSetup('weather-declaration', 'missing'),
    /Plugin setup entry not found: missing/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service rejects setup cwd symlinks escaping the plugin directory', () => {
  const root = createDeclarationOnlyPluginDir({
    setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: 'setup-link' }]
  })
  const outsidePath = path.join(root, 'outside-setup')
  fs.mkdirSync(outsidePath)
  fs.symlinkSync(outsidePath, path.join(root, 'weather-declaration', 'setup-link'))
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [root],
    spawnSetupProcess: () => createFakeServiceProcess()
  })

  assert.throws(
    () => service.runSetup('weather-declaration', 'install-deps'),
    /Plugin setup cwd must stay inside the plugin directory/
  )
})

test('plugin service rejects duplicate setup runs while one is running', () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => createSlowStoppingServiceProcess()
  })

  service.runSetup('weather-declaration', 'install-deps')

  assert.throws(
    () => service.runSetup('weather-declaration', 'install-deps'),
    /Plugin setup is already running/
  )
})

test('plugin service stops running setup when a plugin is disabled', () => {
  const child = createSlowStoppingServiceProcess()
  const treeSignals = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => child,
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return false
    }
  })

  service.runSetup('weather-declaration', 'install-deps')
  service.setEnabled('weather-declaration', false)

  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, ['SIGTERM'])
  const runtimeBeforeExit = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtimeBeforeExit.status, 'stopping')
  assert.equal(settingsService.get().plugins.logs[1].message, 'Setup stop requested')

  child.emit('exit', 0, 'SIGTERM')

  const runtimeAfterExit = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtimeAfterExit.status, 'failed')
  assert.equal(runtimeAfterExit.error, 'Setup stopped')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Setup stopped')
})

test('plugin service stops running setup during app shutdown cleanup', () => {
  const child = createSlowStoppingServiceProcess()
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => child,
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return false
    }
  })

  service.runSetup('weather-declaration', 'install-deps')
  const result = service.stopAllServices()

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, ['SIGTERM'])
  const runtimeBeforeExit = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtimeBeforeExit.status, 'stopping')

  child.emit('exit', 0, 'SIGTERM')

  const runtimeAfterExit = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtimeAfterExit.status, 'failed')
  assert.equal(runtimeAfterExit.error, 'Setup stopped')
})

test('plugin service marks setup cleanup failure as failed when child kill throws', () => {
  const child = createSlowStoppingServiceProcess()
  child.kill = () => {
    throw new Error('setup stop failed')
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => child,
    signalServiceProcessTree: () => false
  })

  const setupRun = service.runSetup('weather-declaration', 'install-deps')
  service.stopAllServices()

  const runtime = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtime.status, 'failed')
  assert.match(runtime.error, /setup stop failed/)
  return assert.rejects(setupRun, /setup stop failed/)
})

test('plugin service uses tree cleanup for declaration command stop requests before child kill fallback', async () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  let started = false
  const treeSignals = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: () => {
      started = true
      return child
    },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return true
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => started)
  service.setEnabled('weather-declaration', false)

  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, [])

  child.emit('exit', 0, 'SIGTERM')
  await assert.rejects(commandRun, /Command stopped/)
})

test('plugin service falls back to child kill when declaration command tree cleanup fails', async () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  let started = false
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: () => {
      started = true
      return child
    },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      throw new Error('tree cleanup unavailable')
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => started)
  service.stopAllServices()

  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, ['SIGTERM'])

  child.emit('exit', 0, 'SIGTERM')
  await assert.rejects(commandRun, /Command stopped/)
})

test('plugin service uses tree cleanup for setup stop requests before child kill fallback', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => child,
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return true
    }
  })

  service.runSetup('weather-declaration', 'install-deps')
  service.setEnabled('weather-declaration', false)

  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, [])
  assert.equal(service.listPlugins()[0].entries.setup[0].runtime.status, 'stopping')

  child.emit('exit', 0, 'SIGTERM')

  assert.equal(service.listPlugins()[0].entries.setup[0].runtime.status, 'failed')
  assert.equal(service.listPlugins()[0].entries.setup[0].runtime.error, 'Setup stopped')
})

test('plugin service falls back to child kill when setup tree cleanup fails', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => child,
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      throw new Error('tree cleanup unavailable')
    }
  })

  service.runSetup('weather-declaration', 'install-deps')
  service.stopAllServices()

  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, ['SIGTERM'])
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
  const settingsService = createSettingsService()
  const service = createPluginService({
    settingsService,
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
  assert.equal(settingsService.get().plugins.logs[0].message, 'Plugin is disabled')
})

test('plugin service rejects unknown dashboard ids before opening external urls', async () => {
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
    }
  })

  await assert.rejects(
    () => service.openDashboard('weather-declaration', 'missing'),
    /Plugin dashboard not found: missing/
  )
  assert.deepEqual(openedUrls, [])
  assert.equal(settingsService.get().plugins.logs[0].message, 'Plugin dashboard not found: missing')
})

test('plugin service rejects unknown plugins before opening dashboard urls', async () => {
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
    }
  })

  await assert.rejects(
    () => service.openDashboard('missing-plugin', 'main'),
    /Plugin not found: missing-plugin/
  )
  assert.deepEqual(openedUrls, [])
  assert.equal(settingsService.get().plugins.logs[0].message, 'Plugin not found: missing-plugin')
})

test('plugin service rejects non-http dashboard urls before opening external urls', async () => {
  const openedUrls = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
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
  assert.equal(settingsService.get().plugins.logs[0].message, 'Plugin dashboard URL must use HTTP or HTTPS')
})

test('plugin service blocks dashboard opens when ecosystem policy denies the plugin', async () => {
  const openedUrls = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
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
  assert.equal(settingsService.get().plugins.logs[0].message, 'Plugin is blocked: blocked for review')
})

test('plugin service starts and stops enabled declaration service entries', () => {
  const spawned = []
  const children = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: (file, args, options) => {
      const child = createSlowStoppingServiceProcess()
      spawned.push({ file, args, options, child })
      children.push(child)
      return child
    }
  })

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')

  const started = service.startService('weather-declaration', 'companion')

  assert.equal(started.ok, true)
  assert.equal(started.runtime.status, 'running')
  assert.equal(started.runtime.pid, 4321)
  assert.equal(started.runtime.command, 'npm run service:start')
  assert.equal(spawned[0].file, 'npm')
  assert.deepEqual(spawned[0].args, ['run', 'service:start'])
  assert.equal(path.basename(spawned[0].options.cwd), 'weather-declaration')
  assert.equal(spawned[0].options.detached, true)
  assert.equal(spawned[0].options.shell, false)
  assert.deepEqual(Object.keys(spawned[0].options.env).sort(), ['PATH'].filter((key) => process.env[key]).sort())
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'running')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service started')

  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  assert.deepEqual(children[0].killCalls, ['SIGTERM'])
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service stop requested')
  children[0].emit('exit', 0, 'SIGTERM')
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service stopped')
})

test('plugin service stops service process groups before falling back to child kill', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  const killedProcesses = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      killedProcesses.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  assert.deepEqual(killedProcesses, [{ pid: -4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, [])
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
})

test('plugin service falls back to child kill when process group stop fails', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child,
    killServiceProcess: () => {
      throw new Error('process group missing')
    },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, [])
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
})

test('plugin service falls back to child kill when process group and tree cleanup both fail', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child,
    killServiceProcess: () => {
      throw new Error('process group missing')
    },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      throw new Error('tree cleanup unavailable')
    }
  })

  service.startService('weather-declaration', 'companion')
  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
})

test('plugin service rejects service starts for disabled plugins', () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  assert.throws(
    () => service.startService('weather-declaration', 'companion'),
    /Plugin is disabled/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service blocks service starts when ecosystem policy denies the plugin', () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    getPluginBlockStatus: () => ({ blocked: true, reasons: ['blocked for review'] }),
    spawnServiceProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  assert.throws(
    () => service.startService('weather-declaration', 'companion'),
    /Plugin is blocked: blocked for review/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service can stop a running service after ecosystem policy later blocks the plugin', () => {
  let blocked = false
  const child = createSlowStoppingServiceProcess()
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child,
    getPluginBlockStatus: () => blocked ? { blocked: true, reasons: ['blocked for review'] } : { blocked: false, reasons: [] },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  blocked = true

  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
})

test('plugin service rejects unknown service ids before spawning processes', () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  assert.throws(
    () => service.startService('weather-declaration', 'missing'),
    /Plugin service not found: missing/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service rejects duplicate service starts', () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => createFakeServiceProcess()
  })

  service.startService('weather-declaration', 'companion')

  assert.throws(
    () => service.startService('weather-declaration', 'companion'),
    /Plugin service is already running/
  )
})

test('plugin service marks non-zero service exits as failed', () => {
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child
  })

  service.startService('weather-declaration', 'companion')
  child.emit('exit', 1, '')

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'failed')
  assert.equal(service.getLogs()[0].level, 'error')
  assert.equal(service.getLogs()[0].message, 'Service exited')
})

test('plugin service rejects service cwd symlinks escaping the plugin directory', () => {
  const root = createDeclarationOnlyPluginDir({ serviceCwd: 'service-link' })
  const outsidePath = path.join(root, 'outside-service')
  fs.mkdirSync(outsidePath)
  fs.symlinkSync(outsidePath, path.join(root, 'weather-declaration', 'service-link'))
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [root],
    spawnServiceProcess: () => createFakeServiceProcess()
  })

  assert.throws(
    () => service.startService('weather-declaration', 'companion'),
    /Plugin service cwd must stay inside the plugin directory/
  )
})

test('plugin service stops running services when a plugin is disabled', () => {
  const child = createSlowStoppingServiceProcess()
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child
  })

  service.startService('weather-declaration', 'companion')
  service.setEnabled('weather-declaration', false)

  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
  child.emit('exit', 0, 'SIGTERM')
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
})

test('plugin service keeps services in stopping state until the child exits', () => {
  const child = createSlowStoppingServiceProcess()
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child
  })

  service.startService('weather-declaration', 'companion')
  const stopping = service.stopService('weather-declaration', 'companion')

  assert.equal(stopping.runtime.status, 'stopping')
  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service stop requested')
  assert.throws(
    () => service.startService('weather-declaration', 'companion'),
    /Plugin service is already running/
  )

  child.emit('exit', 0, 'SIGTERM')

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service stopped')
})

test('plugin service stop completion is logged after exit confirmation', () => {
  const child = createSlowStoppingServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')

  assert.notEqual(service.getLogs()[0].message, 'Service stopped')
  child.emit('exit', 0, 'SIGTERM')

  assert.equal(service.getLogs()[0].message, 'Service stopped')
})

test('plugin service does not force stop when the child exits before the grace period', async () => {
  const child = createStubbornServiceProcess()
  const forceStops = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 20,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      forceStops.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')
  child.emit('exit', 0, 'SIGTERM')

  await new Promise((resolve) => setTimeout(resolve, 40))

  assert.deepEqual(forceStops, [{ pid: -4321, signal: 'SIGTERM' }])
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
})

test('plugin service force stops stubborn services after the grace period', async () => {
  const child = createStubbornServiceProcess()
  const processSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 10,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      processSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  assert.throws(
    () => service.startService('weather-declaration', 'companion'),
    /Plugin service is already running/
  )
  await waitFor(() => processSignals.length === 2)

  assert.deepEqual(processSignals, [
    { pid: -4321, signal: 'SIGTERM' },
    { pid: -4321, signal: 'SIGKILL' }
  ])
  assert.match(service.getLogs()[0].message, /force stop requested/)
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')

  child.emit('exit', null, 'SIGKILL')

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'failed')
  assert.match(service.listPlugins()[0].entries.services[0].runtime.error, /force kill/i)
})

test('plugin service disable cleanup force stops stubborn services after the grace period', async () => {
  const child = createStubbornServiceProcess()
  const processSignals = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 10,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      processSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  service.setEnabled('weather-declaration', false)

  await waitFor(() => processSignals.length === 2)
  assert.deepEqual(processSignals.map((entry) => entry.signal), ['SIGTERM', 'SIGKILL'])
})

test('plugin service app shutdown cleanup force stops stubborn services after the grace period', async () => {
  const child = createStubbornServiceProcess()
  const processSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 10,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      processSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopAllServices()

  await waitFor(() => processSignals.length === 2)
  assert.deepEqual(processSignals.map((entry) => entry.signal), ['SIGTERM', 'SIGKILL'])
})

test('plugin service force-stop falls back to tree cleanup when process group kill fails', async () => {
  const child = createStubbornServiceProcess({ pid: 4321 })
  const processSignals = []
  const treeSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 10,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      processSignals.push({ pid, signal })
      if (signal === 'SIGKILL') throw new Error('group force kill failed')
      return true
    },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')
  await waitFor(() => processSignals.length === 2)

  assert.deepEqual(processSignals, [
    { pid: -4321, signal: 'SIGTERM' },
    { pid: -4321, signal: 'SIGKILL' }
  ])
  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGKILL' }])
  assert.deepEqual(child.killCalls, [])
})

test('plugin service exposes persisted periodic health policy on service entries', () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true },
        serviceHealthPolicies: {
          'weather-declaration': {
            companion: { enabled: true, intervalMs: 30000 }
          }
        }
      }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })]
  })

  const policy = service.listPlugins()[0].entries.services[0].healthPolicy
  assert.deepEqual(policy, { enabled: true, intervalMs: 30000 })
})

test('plugin service sanitizes malformed persisted periodic health policy', () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true },
        serviceHealthPolicies: {
          'weather-declaration': {
            companion: { enabled: 'false', intervalMs: 'soon' }
          }
        }
      }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })]
  })

  const policy = service.listPlugins()[0].entries.services[0].healthPolicy
  assert.deepEqual(policy, { enabled: false, intervalMs: 30000 })
})

test('plugin service schedules periodic health checks for running services when policy is enabled', async () => {
  const timers = []
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'weather-declaration': true },
      serviceHealthPolicies: {
        'weather-declaration': {
          companion: { enabled: true, intervalMs: 15000 }
        }
      }
    }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    fetchImpl: async () => ({ ok: true, status: 204 }),
    spawnServiceProcess: () => createRunningServiceProcess(),
    setServiceHealthTimer: (callback, delay) => {
      timers.push({ callback, delay })
      return { unref() {} }
    },
    clearServiceHealthTimer: () => {}
  })

  service.startService('weather-declaration', 'companion')

  assert.equal(timers.length, 1)
  assert.equal(timers[0].delay, 15000)

  await timers[0].callback()

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.health.status, 'healthy')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service health healthy')
})

test('plugin service clears periodic health timers when a running service stops', () => {
  const cleared = []
  const timerRef = { unref() {} }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true },
        serviceHealthPolicies: {
          'weather-declaration': {
            companion: { enabled: true, intervalMs: 15000 }
          }
        }
      }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    spawnServiceProcess: () => createSlowStoppingServiceProcess({ pid: 4321 }),
    setServiceHealthTimer: () => timerRef,
    clearServiceHealthTimer: (timer) => {
      cleared.push(timer)
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')

  assert.deepEqual(cleared, [timerRef])
})

test('plugin service saves and clamps periodic health policy in settings', () => {
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })]
  })

  const plugin = service.saveServiceHealthPolicy('weather-declaration', 'companion', {
    enabled: true,
    intervalMs: 5
  })

  assert.deepEqual(settingsService.get().plugins.serviceHealthPolicies['weather-declaration'].companion, {
    enabled: true,
    intervalMs: 15000
  })
  assert.deepEqual(plugin.entries.services[0].healthPolicy, {
    enabled: true,
    intervalMs: 15000
  })
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service health policy saved')
})

test('plugin service reschedules periodic health checks when policy changes while running', () => {
  const timers = []
  const cleared = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    spawnServiceProcess: () => createRunningServiceProcess(),
    setServiceHealthTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} }
      timers.push(timer)
      return timer
    },
    clearServiceHealthTimer: (timer) => {
      cleared.push(timer)
    }
  })

  service.startService('weather-declaration', 'companion')
  assert.equal(timers.length, 0)

  service.saveServiceHealthPolicy('weather-declaration', 'companion', {
    enabled: true,
    intervalMs: 60000
  })

  assert.equal(timers.length, 1)
  assert.equal(timers[0].delay, 60000)

  service.saveServiceHealthPolicy('weather-declaration', 'companion', {
    enabled: false,
    intervalMs: 60000
  })

  assert.deepEqual(cleared, [timers[0]])
})

test('plugin service rejects periodic health policy for services without health declarations', () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()]
  })

  assert.throws(
    () => service.saveServiceHealthPolicy('weather-declaration', 'companion', { enabled: true, intervalMs: 30000 }),
    /Plugin service health check is not configured/
  )
})

test('plugin service checks configured service health endpoints', async () => {
  const fetched = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    fetchImpl: async (url, options) => {
      fetched.push({ url, options })
      return { ok: true, status: 204 }
    }
  })

  const result = await service.checkServiceHealth('weather-declaration', 'companion')

  assert.equal(result.ok, true)
  assert.equal(result.health.status, 'healthy')
  assert.equal(result.health.statusCode, 204)
  assert.equal(result.health.url, 'http://127.0.0.1:8787/health')
  assert.equal(result.runtime.health.status, 'healthy')
  assert.equal(fetched[0].url, 'http://127.0.0.1:8787/health')
  assert.equal(fetched[0].options.method, 'GET')
  assert.ok(fetched[0].options.signal)
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.health.status, 'healthy')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service health healthy')
})

test('plugin service marks non-2xx service health responses unhealthy', async () => {
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    fetchImpl: async () => ({ ok: false, status: 503 })
  })

  const result = await service.checkServiceHealth('weather-declaration', 'companion')

  assert.equal(result.health.status, 'unhealthy')
  assert.equal(result.health.statusCode, 503)
  assert.match(result.health.message, /HTTP 503/)
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.health.status, 'unhealthy')
  assert.equal(settingsService.get().plugins.logs[0].level, 'error')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service health unhealthy')
})

test('plugin service times out slow service health checks', async () => {
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    serviceHealthTimeoutMs: 1,
    fetchImpl: async (_url, options = {}) => new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(new Error('Health check timed out'))
      })
      setTimeout(() => resolve({ ok: true, status: 200 }), 20)
    })
  })

  const result = await service.checkServiceHealth('weather-declaration', 'companion')

  assert.equal(result.health.status, 'unhealthy')
  assert.equal(result.health.statusCode, null)
  assert.match(result.health.message, /timed out/)
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service health unhealthy')
})

test('plugin service times out stalled service health endpoints', async () => {
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    serviceHealthTimeoutMs: 1,
    fetchImpl: async (_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })
  })

  const result = await service.checkServiceHealth('weather-declaration', 'companion')

  assert.equal(result.health.status, 'unhealthy')
  assert.match(result.health.message, /timed out/)
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.health.status, 'unhealthy')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service health unhealthy')
})

test('plugin service rejects service health checks for disabled plugins', async () => {
  const fetched = []
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    fetchImpl: async (...args) => {
      fetched.push(args)
      return { ok: true, status: 200 }
    }
  })

  await assert.rejects(
    () => service.checkServiceHealth('weather-declaration', 'companion'),
    /Plugin is disabled/
  )
  assert.deepEqual(fetched, [])
})

test('plugin service rejects service health checks without health declarations', async () => {
  const fetched = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    fetchImpl: async (...args) => {
      fetched.push(args)
      return { ok: true, status: 200 }
    }
  })

  await assert.rejects(
    () => service.checkServiceHealth('weather-declaration', 'companion'),
    /Plugin service health check is not configured/
  )
  assert.deepEqual(fetched, [])
})

test('plugin service rejects unsafe service health protocols before fetching', async () => {
  const fetched = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'file:///tmp/openpet-health' }
    })],
    fetchImpl: async (...args) => {
      fetched.push(args)
      return { ok: true, status: 200 }
    }
  })

  await assert.rejects(
    () => service.checkServiceHealth('weather-declaration', 'companion'),
    /Plugin service health URL must use HTTP or HTTPS/
  )
  assert.deepEqual(fetched, [])
})

test('plugin service rejects non-loopback service health hosts before fetching', async () => {
  const fetched = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'https://api.example.com/health' }
    })],
    fetchImpl: async (...args) => {
      fetched.push(args)
      return { ok: true, status: 200 }
    }
  })

  await assert.rejects(
    () => service.checkServiceHealth('weather-declaration', 'companion'),
    /Plugin service health URL must use a loopback host/
  )
  assert.deepEqual(fetched, [])
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
