const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')
const { normalizeConfigSchema } = require('../../src/main/plugins/config-schema')

test('normalizes a plugin manifest with permissions and commands', () => {
  const manifest = normalizePluginManifest({
    id: 'focus-timer',
    name: 'Focus Timer',
    version: '1.0.0',
    description: 'Focus helper',
    main: 'index.js',
    configSchema: 'config.schema.json',
    permissions: ['pet:say'],
    network: { allowlist: ['https://api.example.com', 'cdn.example.com:8443'] },
    commands: [{ id: 'start', title: 'Start focus' }]
  }, { source: 'local', basePath: '/plugins/focus-timer' })

  assert.deepEqual(manifest, {
    id: 'focus-timer',
    name: 'Focus Timer',
    version: '1.0.0',
    profile: 'runtime',
    description: 'Focus helper',
    source: 'local',
    basePath: '/plugins/focus-timer',
    main: 'index.js',
    configSchema: 'config.schema.json',
    permissions: ['pet:say'],
    network: { allowlist: ['api.example.com', 'cdn.example.com:8443'] },
    signature: null,
    commands: [{ id: 'start', title: 'Start focus' }],
    entries: {
      setup: [],
      commands: [],
      services: [],
      dashboards: []
    }
  })
})

test('normalizes extension entries and derives commands when legacy commands are absent', () => {
  const manifest = normalizePluginManifest({
    id: 'weather-morning',
    name: 'Weather Morning',
    version: '1.0.0',
    main: 'index.js',
    entries: {
      commands: [
        { id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js', cwd: '.' }
      ],
      services: [
        {
          id: 'companion',
          title: 'Companion Service',
          command: 'npm run service:start',
          cwd: '.',
          health: { type: 'http', url: 'http://127.0.0.1:8787/health' }
        }
      ],
      dashboards: [
        { id: 'main', title: 'Dashboard', url: 'http://127.0.0.1:8787' }
      ]
    }
  })

  assert.deepEqual(manifest.commands, [{ id: 'announce', title: 'Announce Weather' }])
  assert.deepEqual(manifest.entries.commands, [
    { id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js', cwd: '.' }
  ])
  assert.deepEqual(manifest.entries.services, [
    {
      id: 'companion',
      title: 'Companion Service',
      command: 'npm run service:start',
      cwd: '.',
      platforms: {},
      health: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    }
  ])
  assert.deepEqual(manifest.entries.dashboards, [
    { id: 'main', title: 'Dashboard', url: 'http://127.0.0.1:8787' }
  ])
})

test('rejects unsafe extension entry declarations', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-entry',
    name: 'Bad Entry',
    version: '1.0.0',
    entries: { commands: [{ id: '../run' }] }
  }), /Plugin command entry id must be a safe id/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-entry',
    name: 'Bad Entry',
    version: '1.0.0',
    entries: { services: [{ id: 'svc', command: 'npm run service:start', cwd: '../escape' }] }
  }), /Plugin service entry cwd must be a safe relative path/)
})

test('keeps legacy commands as the executable command list when both command shapes exist', () => {
  const manifest = normalizePluginManifest({
    id: 'mixed-commands',
    name: 'Mixed Commands',
    version: '1.0.0',
    commands: [{ id: 'legacy', title: 'Legacy Command' }],
    entries: {
      commands: [{ id: 'extension', title: 'Extension Command', command: 'node ./command.js' }]
    }
  })

  assert.deepEqual(manifest.commands, [{ id: 'legacy', title: 'Legacy Command' }])
  assert.deepEqual(manifest.entries.commands.map((command) => command.id), ['extension'])
})

test('normalizes extension manifest entries and declaration fields', () => {
  const manifest = normalizePluginManifest({
    id: 'weather-morning-report',
    name: 'Weather Morning Report',
    version: '1.0.0',
    profile: 'creator-tools',
    description: 'Weather reports, dashboard, and pet announcements.',
    permissions: ['actions:read', 'actions:write'],
    config: 'config.schema.json',
    entries: {
      commands: [
        {
          id: 'announce',
          title: 'Announce Weather',
          command: 'node ./commands/announce.js',
          cwd: 'commands'
        }
      ],
      setup: [
        {
          id: 'install-deps',
          title: 'Install Dependencies',
          command: 'npm install',
          cwd: '.'
        }
      ],
      services: [
        {
          id: 'companion',
          name: 'Weather Companion',
          command: 'npm run service:start',
          cwd: '.',
          platforms: {
            darwin: { command: 'npm run service:start' }
          },
          health: {
            type: 'http',
            url: 'http://127.0.0.1:8787/health'
          }
        }
      ],
      dashboards: [
        {
          id: 'main',
          title: 'Weather Dashboard',
          url: 'http://127.0.0.1:8787'
        }
      ]
    },
    manifest: {
      dataLocations: [
        { path: 'OPENPET_DATA_DIR', description: 'Report history.' }
      ]
    },
    assets: ['assets/email-template.html']
  }, { source: 'local', basePath: '/plugins/weather-morning-report' })

  assert.equal(manifest.main, '')
  assert.equal(manifest.profile, 'creator-tools')
  assert.equal(manifest.config, 'config.schema.json')
  assert.equal(manifest.configSchema, 'config.schema.json')
  assert.deepEqual(manifest.permissions, ['actions:read', 'actions:write'])
  assert.deepEqual(manifest.entries.commands, [
    {
      id: 'announce',
      title: 'Announce Weather',
      command: 'node ./commands/announce.js',
      cwd: 'commands'
    }
  ])
  assert.deepEqual(manifest.entries.setup, [
    {
      id: 'install-deps',
      title: 'Install Dependencies',
      command: 'npm install',
      cwd: '.'
    }
  ])
  assert.deepEqual(manifest.entries.services, [
    {
      id: 'companion',
      title: 'Weather Companion',
      command: 'npm run service:start',
      cwd: '.',
      platforms: {
        darwin: { command: 'npm run service:start', cwd: '' }
      },
      health: {
        type: 'http',
        url: 'http://127.0.0.1:8787/health'
      }
    }
  ])
  assert.deepEqual(manifest.entries.dashboards, [
    {
      id: 'main',
      title: 'Weather Dashboard',
      url: 'http://127.0.0.1:8787'
    }
  ])
  assert.deepEqual(manifest.manifest, {
    dataLocations: [
      { path: 'OPENPET_DATA_DIR', description: 'Report history.' }
    ]
  })
  assert.deepEqual(manifest.assets, ['assets/email-template.html'])
})

test('defaults plugin profile to runtime and accepts hybrid profile', () => {
  assert.equal(normalizePluginManifest({
    id: 'default-profile',
    name: 'Default Profile',
    version: '1.0.0'
  }).profile, 'runtime')

  assert.equal(normalizePluginManifest({
    id: 'hybrid-profile',
    name: 'Hybrid Profile',
    version: '1.0.0',
    profile: 'hybrid'
  }).profile, 'hybrid')
})

test('normalizes creator-tools asset inspection permission', () => {
  const manifest = normalizePluginManifest({
    id: 'asset-inspector',
    name: 'Asset Inspector',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['assets:inspect'])
})

test('normalizes creator-tools asset generation permission', () => {
  const manifest = normalizePluginManifest({
    id: 'asset-generator',
    name: 'Asset Generator',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['assets:generate'])
})

test('normalizes creator-tools pack manifest read permission', () => {
  const manifest = normalizePluginManifest({
    id: 'pack-manifest-reader',
    name: 'Pack Manifest Reader',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['pack-manifest:read']
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['pack-manifest:read'])
})

test('normalizes creator-tools pack manifest write permission', () => {
  const manifest = normalizePluginManifest({
    id: 'pack-manifest-writer',
    name: 'Pack Manifest Writer',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['pack-manifest:write']
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['pack-manifest:write'])
})

test('normalizes optional plugin signature metadata', () => {
  assert.deepEqual(normalizePluginManifest({
    id: 'signed-plugin',
    name: 'Signed Plugin',
    version: '1.0.0',
    signature: {
      algorithm: 'ed25519',
      signer: 'openpet-labs',
      value: 'sig-example'
    }
  }).signature, {
    algorithm: 'ed25519',
    signer: 'openpet-labs',
    value: 'sig-example'
  })

  assert.deepEqual(normalizePluginManifest({
    id: 'string-signed-plugin',
    name: 'String Signed Plugin',
    version: '1.0.0',
    signature: 'sig-example'
  }).signature, {
    algorithm: 'unknown',
    signer: '',
    value: 'sig-example'
  })
})

test('rejects unsafe extension declaration paths', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-extension',
    name: 'Bad Extension',
    version: '1.0.0',
    config: '../config.schema.json'
  }), /Plugin config must be a safe relative path/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-extension',
    name: 'Bad Extension',
    version: '1.0.0',
    assets: ['../secrets.env']
  }), /Plugin asset path must be a safe relative path/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-extension',
    name: 'Bad Extension',
    version: '1.0.0',
    entries: {
      commands: [
        {
          id: 'announce',
          title: 'Announce',
          command: 'node announce.js',
          cwd: '../outside'
        }
      ]
    }
  }), /Plugin command entry cwd must be a safe relative path/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-entry',
    name: 'Bad Entry',
    version: '1.0.0',
    entries: { setup: [{ id: '../setup', command: 'npm install' }] }
  }), /Plugin setup entry id must be a safe id/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-entry',
    name: 'Bad Entry',
    version: '1.0.0',
    entries: { setup: [{ id: 'setup', command: 'npm install', cwd: '../escape' }] }
  }), /Plugin setup entry cwd must be a safe relative path/)
})

test('rejects unsafe plugin network allowlist entries', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-network',
    name: 'Bad Network',
    version: '1.0.0',
    network: { allowlist: ['http://api.example.com'] }
  }), /only supports HTTPS hosts/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-network',
    name: 'Bad Network',
    version: '1.0.0',
    network: { allowlist: ['https://api.example.com/path'] }
  }), /must be hosts/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-network',
    name: 'Bad Network',
    version: '1.0.0',
    network: { allowlist: ['localhost'] }
  }), /must use public DNS hosts/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-network',
    name: 'Bad Network',
    version: '1.0.0',
    network: { allowlist: ['10.0.0.5'] }
  }), /must use public DNS hosts/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-network',
    name: 'Bad Network',
    version: '1.0.0',
    network: { allowlist: ['https://[::1]'] }
  }), /must use public DNS hosts/)
})

test('rejects plugin manifests with unknown permissions', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-plugin',
    name: 'Bad Plugin',
    version: '1.0.0',
    permissions: ['fs:read']
  }), /Unknown plugin permission/)
})

test('rejects unknown plugin profiles', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-profile',
    name: 'Bad Profile',
    version: '1.0.0',
    profile: 'desktop-authoring'
  }), /Plugin profile must be runtime, creator-tools, or hybrid/)
})

test('rejects plugin manifests without required identity fields', () => {
  assert.throws(() => normalizePluginManifest({
    name: 'Missing Id',
    version: '1.0.0'
  }), /Plugin id is required/)

  assert.throws(() => normalizePluginManifest({
    id: '../bad',
    name: 'Bad Id',
    version: '1.0.0'
  }), /Plugin id must be a safe id/)
})

test('rejects unsafe plugin command ids', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-command',
    name: 'Bad Command',
    version: '1.0.0',
    commands: [{ id: '../start' }]
  }), /Plugin command id must be a safe id/)
})

test('rejects unsafe plugin main paths', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-main',
    name: 'Bad Main',
    version: '1.0.0',
    main: '../index.js'
  }), /Plugin main must be a safe relative path/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-main',
    name: 'Bad Main',
    version: '1.0.0',
    main: 'index.json'
  }), /Plugin main must point to a JavaScript file/)
})

test('rejects unsafe plugin config schema paths', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-config',
    name: 'Bad Config',
    version: '1.0.0',
    configSchema: '../config.schema.json'
  }), /Plugin configSchema must be a safe relative path/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-config',
    name: 'Bad Config',
    version: '1.0.0',
    configSchema: 'config.js'
  }), /Plugin configSchema must point to a JSON file/)
})

test('rejects plugin config schemas that look like secret storage', () => {
  assert.throws(() => normalizeConfigSchema({
    title: 'Credentials',
    type: 'object',
    properties: {
      accessToken: {
        type: 'string',
        title: 'Access Token'
      }
    }
  }), /Plugin config accessToken looks like a secret/)

  assert.throws(() => normalizeConfigSchema({
    title: 'Credentials',
    type: 'object',
    properties: {
      endpoint: {
        type: 'string',
        title: 'Endpoint',
        format: 'password'
      }
    }
  }), /Plugin config endpoint uses password-style secret metadata/)
})
