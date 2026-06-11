const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')

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
    description: 'Focus helper',
    source: 'local',
    basePath: '/plugins/focus-timer',
    main: 'index.js',
    configSchema: 'config.schema.json',
    permissions: ['pet:say'],
    network: { allowlist: ['api.example.com', 'cdn.example.com:8443'] },
    signature: null,
    commands: [{ id: 'start', title: 'Start focus' }]
  })
})

test('normalizes optional plugin signature metadata', () => {
  assert.deepEqual(normalizePluginManifest({
    id: 'signed-plugin',
    name: 'Signed Plugin',
    version: '1.0.0',
    signature: {
      algorithm: 'ed25519',
      signer: 'ibot-labs',
      value: 'sig-example'
    }
  }).signature, {
    algorithm: 'ed25519',
    signer: 'ibot-labs',
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
