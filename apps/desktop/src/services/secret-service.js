const fs = require('fs')
const path = require('path')
const { CAPABILITY_SECRET_REFS } = require('./provider-owner-policy')
const { DEFAULT_HATCH_PET_AGENT_CONFIG } = require('./hatch-pet-agent-contracts')

const PLAINTEXT_STORAGE_WARNING = 'safeStorage 不可用，Provider 密钥正以 0600 权限的明文文件保存。'
const PROVIDER_SECRET_REFS = new Set([
  ...Object.values(CAPABILITY_SECRET_REFS),
  DEFAULT_HATCH_PET_AGENT_CONFIG.apiKeyRef
])

const getDefaultStorePaths = () => {
  const { app } = require('electron')
  const userDataPath = app.getPath('userData')
  return {
    storePath: path.join(userDataPath, 'backend', 'secrets', 'providers.enc'),
    legacyStorePath: path.join(userDataPath, 'secrets.json')
  }
}

// Lazily resolve Electron safeStorage. Production passes it via the factory
// option; when absent (tests, non-Electron) we fall back to plaintext so the
// service still works, just without at-rest encryption.
const resolveSafeStorage = (safeStorage) => {
  if (safeStorage && typeof safeStorage.encryptString === 'function' && typeof safeStorage.decryptString === 'function') {
    return safeStorage
  }
  try {
    const { safeStorage: electronSafeStorage } = require('electron')
    if (electronSafeStorage && typeof electronSafeStorage.encryptString === 'function') {
      return electronSafeStorage
    }
  } catch (_) {}
  return null
}

const isSafeStorageAvailable = (safeStorage) => Boolean(safeStorage?.isEncryptionAvailable?.())

const ensurePrivateFileMode = (filePath) => {
  if (process.platform === 'win32' || !filePath || !fs.existsSync(filePath)) return
  fs.chmodSync(filePath, 0o600)
}

const encryptValue = (safeStorage, value) => {
  const plaintext = String(value || '')
  if (!plaintext || !safeStorage || !isSafeStorageAvailable(safeStorage)) {
    return { encrypted: false, value: plaintext }
  }
  return { encrypted: true, value: safeStorage.encryptString(plaintext).toString('base64') }
}

const decryptEntry = (safeStorage, entry) => {
  if (!entry || typeof entry !== 'object') return ''
  if (entry.encrypted === true) {
    if (!safeStorage || !isSafeStorageAvailable(safeStorage)) {
      throw new Error('Encrypted secrets are unavailable because safe storage is not available')
    }
    return safeStorage.decryptString(Buffer.from(entry.value, 'base64'))
  }
  // Legacy plaintext entry — return as-is and convert it on the next successful write.
  return String(entry.value || '')
}

const readStore = (storePath, safeStorage) => {
  if (!fs.existsSync(storePath)) return { secrets: {} }
  ensurePrivateFileMode(storePath)
  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
  const rawSecrets = parsed.secrets || {}
  const secrets = {}
  for (const [id, entry] of Object.entries(rawSecrets)) {
    secrets[id] = {
      label: entry?.label || id,
      value: decryptEntry(safeStorage, entry),
      updatedAt: entry?.updatedAt || '',
      ...(entry?.kind === 'provider' ? { kind: 'provider' } : {})
    }
  }
  return { secrets }
}

const createDiskStore = (store, safeStorage) => {
  const secrets = {}
  for (const [id, secret] of Object.entries(store.secrets)) {
    const persistedValue = encryptValue(safeStorage, secret.value)
    secrets[id] = {
      label: secret.label || id,
      encrypted: persistedValue.encrypted,
      value: persistedValue.value,
      updatedAt: secret.updatedAt || '',
      ...(secret.kind === 'provider' ? { kind: 'provider' } : {})
    }
  }
  return { secrets }
}

const writeStore = (storePath, store, safeStorage) => {
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(createDiskStore(store, safeStorage), null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
      flush: true
    })
    if (process.platform !== 'win32') fs.chmodSync(temporaryPath, 0o600)
    fs.renameSync(temporaryPath, storePath)
    ensurePrivateFileMode(storePath)
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch (_) {}
    throw error
  }
}

const resolveStorePaths = ({ storePath, legacyStorePath } = {}) => {
  if (storePath) return { storePath, legacyStorePath }
  const defaults = getDefaultStorePaths()
  return {
    storePath: defaults.storePath,
    legacyStorePath: legacyStorePath ?? defaults.legacyStorePath
  }
}

const createSecretService = (options = {}) => {
  const { storePath, legacyStorePath } = resolveStorePaths(options)
  const { safeStorage } = options
  const resolvedSafeStorage = resolveSafeStorage(safeStorage)
  const migrationSource = !fs.existsSync(storePath) && legacyStorePath && fs.existsSync(legacyStorePath)
    ? legacyStorePath
    : storePath
  let store = readStore(migrationSource, resolvedSafeStorage)

  // Keep the legacy file as a rollback/migration source, but make the
  // architecture-owned path authoritative from this startup onward.
  if (migrationSource !== storePath) writeStore(storePath, store, resolvedSafeStorage)

  const persist = (nextStore) => writeStore(storePath, nextStore, resolvedSafeStorage)

  const setSecret = ({ id, value, label = id, kind }) => {
    if (!id) throw new Error('Secret id is required')
    const providerSecret = kind === 'provider' || store.secrets[id]?.kind === 'provider' || PROVIDER_SECRET_REFS.has(id)
    const nextStore = {
      secrets: {
        ...store.secrets,
        [id]: {
          label,
          value: String(value || ''),
          updatedAt: new Date().toISOString(),
          ...(providerSecret ? { kind: 'provider' } : {})
        }
      }
    }
    persist(nextStore)
    store = nextStore
    return { id, label, hasValue: Boolean(value) }
  }

  const getSecretValue = (id) => store.secrets[id]?.value || ''

  const deleteSecret = (id) => {
    const secrets = { ...store.secrets }
    delete secrets[id]
    const nextStore = { secrets }
    persist(nextStore)
    store = nextStore
  }

  const listSecretRefs = () => Object.entries(store.secrets)
    .map(([id, secret]) => ({
      id,
      label: secret.label || id,
      hasValue: Boolean(secret.value)
    }))

  const listProviderKeys = () => Object.fromEntries(
    Object.entries(store.secrets)
      .filter(([id, secret]) => Boolean(secret.value) && (secret.kind === 'provider' || PROVIDER_SECRET_REFS.has(id)))
      .map(([id, secret]) => [id, secret.value])
  )

  const getSecurityState = () => isSafeStorageAvailable(resolvedSafeStorage)
    ? { encryptionAvailable: true, storage: 'safeStorage', warning: '' }
    : { encryptionAvailable: false, storage: 'plaintext-0600', warning: PLAINTEXT_STORAGE_WARNING }

  return { setSecret, getSecretValue, deleteSecret, listSecretRefs, listProviderKeys, getSecurityState }
}

module.exports = { createSecretService }
