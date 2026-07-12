const fs = require('fs')
const path = require('path')

const getDefaultStorePath = () => {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'secrets.json')
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
  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
  const rawSecrets = parsed.secrets || {}
  const secrets = {}
  for (const [id, entry] of Object.entries(rawSecrets)) {
    secrets[id] = {
      label: entry?.label || id,
      value: decryptEntry(safeStorage, entry),
      updatedAt: entry?.updatedAt || ''
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
      updatedAt: secret.updatedAt || ''
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
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch (_) {}
    throw error
  }
}

const createSecretService = ({ storePath = getDefaultStorePath(), safeStorage } = {}) => {
  const resolvedSafeStorage = resolveSafeStorage(safeStorage)
  let store = readStore(storePath, resolvedSafeStorage)

  const persist = (nextStore) => writeStore(storePath, nextStore, resolvedSafeStorage)

  const setSecret = ({ id, value, label = id }) => {
    if (!id) throw new Error('Secret id is required')
    const nextStore = {
      secrets: {
        ...store.secrets,
        [id]: {
          label,
          value: String(value || ''),
          updatedAt: new Date().toISOString()
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

  return { setSecret, getSecretValue, deleteSecret, listSecretRefs }
}

module.exports = { createSecretService }
