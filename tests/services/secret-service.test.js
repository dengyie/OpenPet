const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createSecretService } = require('../../src/main/services/secret-service')

const createTempStore = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-secrets-')), 'secrets.json')

test('secret service stores secret values behind refs', () => {
  const storePath = createTempStore()
  const service = createSecretService({ storePath })

  service.setSecret({ id: 'ai.default', value: 'sk-test', label: 'OpenAI key' })

  assert.equal(service.getSecretValue('ai.default'), 'sk-test')
  assert.deepEqual(service.listSecretRefs(), [
    { id: 'ai.default', label: 'OpenAI key', hasValue: true }
  ])
})

test('secret service persists secrets with private file permissions when possible', () => {
  const storePath = createTempStore()
  const service = createSecretService({ storePath })

  service.setSecret({ id: 'ai.default', value: 'sk-test' })
  const reloaded = createSecretService({ storePath })

  assert.equal(reloaded.getSecretValue('ai.default'), 'sk-test')
  if (process.platform !== 'win32') {
    const mode = fs.statSync(storePath).mode & 0o777
    assert.equal(mode, 0o600)
  }
})

test('secret service can delete stored secrets', () => {
  const storePath = createTempStore()
  const service = createSecretService({ storePath })

  service.setSecret({ id: 'model.image.openai.apiKey', value: 'sk-test', label: 'Image API Key' })
  service.deleteSecret('model.image.openai.apiKey')

  assert.equal(service.getSecretValue('model.image.openai.apiKey'), '')
  assert.deepEqual(service.listSecretRefs(), [])
})

const createFakeSafeStorage = () => {
  const key = 'openpet-test-key'
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => {
      const b = Buffer.from(value, 'utf-8')
      for (let i = 0; i < b.length; i += 1) b[i] = b[i] ^ key.charCodeAt(i % key.length)
      return b
    },
    decryptString: (buf) => {
      const b = Buffer.from(buf)
      for (let i = 0; i < b.length; i += 1) b[i] = b[i] ^ key.charCodeAt(i % key.length)
      return b.toString('utf-8')
    }
  }
}

test('secret service encrypts secrets at rest when safeStorage is available', () => {
  const storePath = createTempStore()
  const safeStorage = createFakeSafeStorage()
  const service = createSecretService({ storePath, safeStorage })

  service.setSecret({ id: 'sk', value: 'super-secret-key', label: 'Provider key' })

  assert.equal(service.getSecretValue('sk'), 'super-secret-key')

  const onDisk = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
  assert.equal(onDisk.secrets.sk.encrypted, true)
  assert.notEqual(onDisk.secrets.sk.value, 'super-secret-key')
  assert.ok(!onDisk.secrets.sk.value.includes('super-secret'))

  const reloaded = createSecretService({ storePath, safeStorage })
  assert.equal(reloaded.getSecretValue('sk'), 'super-secret-key')
})

test('secret service preserves decrypted secrets across load and subsequent writes', () => {
  const storePath = createTempStore()
  const safeStorage = createFakeSafeStorage()

  createSecretService({ storePath, safeStorage })
    .setSecret({ id: 'alpha', value: 'alpha-value', label: 'Alpha' })

  const afterFirstRestart = createSecretService({ storePath, safeStorage })
  assert.equal(afterFirstRestart.getSecretValue('alpha'), 'alpha-value')

  afterFirstRestart.setSecret({ id: 'beta', value: 'beta-value', label: 'Beta' })

  const afterSecondRestart = createSecretService({ storePath, safeStorage })
  assert.equal(afterSecondRestart.getSecretValue('alpha'), 'alpha-value')
  assert.equal(afterSecondRestart.getSecretValue('beta'), 'beta-value')
})

test('secret service leaves runtime and disk state unchanged when atomic replacement fails', () => {
  const storePath = createTempStore()
  const safeStorage = createFakeSafeStorage()
  const service = createSecretService({ storePath, safeStorage })
  service.setSecret({ id: 'alpha', value: 'alpha-value', label: 'Alpha' })
  const previousFile = fs.readFileSync(storePath, 'utf-8')
  const originalRenameSync = fs.renameSync

  fs.renameSync = () => {
    throw new Error('simulated rename failure')
  }
  try {
    assert.throws(
      () => service.setSecret({ id: 'beta', value: 'beta-value', label: 'Beta' }),
      /simulated rename failure/
    )
  } finally {
    fs.renameSync = originalRenameSync
  }

  assert.equal(fs.readFileSync(storePath, 'utf-8'), previousFile)
  assert.equal(service.getSecretValue('alpha'), 'alpha-value')
  assert.equal(service.getSecretValue('beta'), '')
  assert.equal(JSON.parse(previousFile).secrets.alpha.encrypted, true)
})

test('secret service migrates legacy plaintext entries on read', () => {
  const storePath = createTempStore()
  fs.writeFileSync(storePath, JSON.stringify({
    secrets: {
      legacy: { label: 'Old', value: 'plaintext-key', updatedAt: '2026-01-01T00:00:00.000Z' }
    }
  }, null, 2))

  const safeStorage = createFakeSafeStorage()
  const service = createSecretService({ storePath, safeStorage })

  assert.equal(service.getSecretValue('legacy'), 'plaintext-key')

  // Re-setting migrates it to encrypted form at rest.
  service.setSecret({ id: 'legacy', value: 'plaintext-key', label: 'Old' })
  const onDisk = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
  assert.equal(onDisk.secrets.legacy.encrypted, true)
  assert.notEqual(onDisk.secrets.legacy.value, 'plaintext-key')
})

test('secret service reports an explicit 0600 plaintext fallback when safeStorage is unavailable', () => {
  const storePath = createTempStore()
  const safeStorage = {
    isEncryptionAvailable: () => false,
    encryptString: () => { throw new Error('must not encrypt') },
    decryptString: () => { throw new Error('must not decrypt') }
  }
  const service = createSecretService({ storePath, safeStorage })

  service.setSecret({ id: 'custom-provider', value: 'fallback-provider-key', label: 'Custom', kind: 'provider' })

  assert.deepEqual(service.listProviderKeys(), { 'custom-provider': 'fallback-provider-key' })
  assert.deepEqual(service.getSecurityState(), {
    encryptionAvailable: false,
    storage: 'plaintext-0600',
    warning: 'safeStorage 不可用，Provider 密钥正以 0600 权限的明文文件保存。'
  })
  const onDisk = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
  assert.equal(onDisk.secrets['custom-provider'].encrypted, false)
  assert.equal(onDisk.secrets['custom-provider'].value, 'fallback-provider-key')
  if (process.platform !== 'win32') assert.equal(fs.statSync(storePath).mode & 0o777, 0o600)
})

test('secret service injects only provider keys and preserves provider metadata', () => {
  const storePath = createTempStore()
  const service = createSecretService({ storePath })

  service.setSecret({ id: 'ai.default', value: 'legacy-chat-provider-key', label: 'Chat' })
  service.setSecret({ id: 'custom-provider', value: 'custom-provider-key', label: 'Custom', kind: 'provider' })
  service.setSecret({ id: 'plugin.private-token', value: 'plugin-only-secret', label: 'Plugin' })

  assert.deepEqual(service.listProviderKeys(), {
    'ai.default': 'legacy-chat-provider-key',
    'custom-provider': 'custom-provider-key'
  })

  const reloaded = createSecretService({ storePath })
  assert.deepEqual(reloaded.listProviderKeys(), {
    'ai.default': 'legacy-chat-provider-key',
    'custom-provider': 'custom-provider-key'
  })
})

test('secret service migrates the legacy store without deleting it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-secrets-migration-'))
  const legacyStorePath = path.join(root, 'secrets.json')
  const storePath = path.join(root, 'backend', 'secrets', 'providers.enc')
  fs.writeFileSync(legacyStorePath, JSON.stringify({
    secrets: {
      'ai.default': { label: 'Chat', value: 'legacy-provider-key', updatedAt: '2026-01-01T00:00:00.000Z' }
    }
  }))

  const service = createSecretService({ storePath, legacyStorePath, safeStorage: createFakeSafeStorage() })

  assert.equal(service.getSecretValue('ai.default'), 'legacy-provider-key')
  assert.equal(fs.existsSync(legacyStorePath), true)
  assert.equal(fs.existsSync(storePath), true)
  assert.notEqual(JSON.parse(fs.readFileSync(storePath, 'utf8')).secrets['ai.default'].value, 'legacy-provider-key')
})

test('secret service repairs existing store permissions on startup', { skip: process.platform === 'win32' }, () => {
  const storePath = createTempStore()
  createSecretService({ storePath }).setSecret({ id: 'ai.default', value: 'provider-key' })
  fs.chmodSync(storePath, 0o644)

  createSecretService({ storePath })

  assert.equal(fs.statSync(storePath).mode & 0o777, 0o600)
})
