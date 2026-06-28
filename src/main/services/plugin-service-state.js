const getSignatureStatus = (manifest = {}) => {
  if (manifest.source === 'official') {
    return { status: 'official', label: 'Official plugin', signer: 'openpet', algorithm: 'bundled' }
  }
  if (!manifest.signature) {
    return { status: 'unsigned', label: 'Unsigned plugin', signer: '', algorithm: '' }
  }
  return {
    status: 'present-unverified',
    label: 'Signature metadata present, not verified',
    signer: manifest.signature.signer || '',
    algorithm: manifest.signature.algorithm || 'unknown'
  }
}

const getPluginSignatureStatus = (manifest = {}, installed = {}) => {
  if (manifest.source === 'official') return getSignatureStatus(manifest)
  if (installed?.signatureStatus) {
    if (installed.signatureStatus === 'hash-verified') {
      return { status: 'hash-verified', label: 'Signature hash metadata verified', signer: installed.signer || '', algorithm: '' }
    }
    if (installed.signatureStatus === 'unsigned') {
      return { status: 'unsigned', label: 'Unsigned plugin', signer: '', algorithm: '' }
    }
    return {
      status: installed.signatureStatus,
      label: 'Signature metadata present, not verified',
      signer: installed.signer || '',
      algorithm: ''
    }
  }
  return getSignatureStatus(manifest)
}

const normalizeServiceHealthPolicy = (policy = {}, {
  minIntervalMs,
  maxIntervalMs,
  defaultIntervalMs
} = {}) => {
  const intervalMs = Number(policy.intervalMs)
  return {
    enabled: policy.enabled === true,
    intervalMs: Number.isFinite(intervalMs)
      ? Math.min(maxIntervalMs, Math.max(minIntervalMs, intervalMs))
      : defaultIntervalMs
  }
}

const normalizePluginConfig = (schema, config = {}, coerceConfigValue) => {
  if (!schema) return {}
  return Object.fromEntries(schema.properties.map((field) => [field.key, coerceConfigValue(config[field.key], field)]))
}

const getPluginStorageStats = (pluginId, { getPluginStorage, getJsonByteSize }) => {
  try {
    const storage = getPluginStorage(pluginId)
    return {
      keyCount: Object.keys(storage).length,
      byteSize: getJsonByteSize(storage),
      valid: true
    }
  } catch (error) {
    return {
      keyCount: 0,
      byteSize: 0,
      valid: false,
      error: error.message || 'Plugin storage is invalid'
    }
  }
}

const createRuntimeView = (runtime, serviceEntry = {}, createServiceHealthView) => {
  if (!runtime) {
    return {
      status: 'stopped',
      health: createServiceHealthView({}, serviceEntry)
    }
  }
  return {
    status: runtime.status || 'stopped',
    pid: runtime.pid || 0,
    startedAt: runtime.startedAt || '',
    stoppedAt: runtime.stoppedAt || '',
    command: runtime.command || '',
    cwd: runtime.cwd || '',
    exitCode: Number.isFinite(runtime.exitCode) ? runtime.exitCode : null,
    signal: runtime.signal || '',
    error: runtime.error || '',
    health: createServiceHealthView(runtime.health || {}, serviceEntry)
  }
}

const createSetupRuntimeView = (runtime = {}) => ({
  status: runtime.status || 'not-run',
  lastRunAt: runtime.lastRunAt || '',
  exitCode: Number.isFinite(runtime.exitCode) ? runtime.exitCode : null,
  error: runtime.error || ''
})

const decorateEntriesWithRuntime = ({
  manifest,
  setupRuntimes,
  serviceRuntimes,
  createPluginServiceKey,
  createSetupRuntimeView,
  createRuntimeView,
  getPluginServiceHealthPolicy
}) => ({
  ...manifest.entries,
  setup: (manifest.entries?.setup || []).map((setupEntry) => ({
    ...setupEntry,
    runtime: createSetupRuntimeView(setupRuntimes.get(createPluginServiceKey(manifest.id, setupEntry.id)))
  })),
  services: (manifest.entries?.services || []).map((serviceEntry) => ({
    ...serviceEntry,
    healthPolicy: getPluginServiceHealthPolicy(manifest.id, serviceEntry.id),
    runtime: createRuntimeView(serviceRuntimes.get(createPluginServiceKey(manifest.id, serviceEntry.id)), serviceEntry)
  }))
})

const listPlugins = ({
  plugins,
  enabledMap,
  decorateEntriesWithRuntime,
  getPluginSignatureStatus,
  getPluginPolicyStatus,
  getPluginConfig,
  getPluginStorageStats
}) => plugins.map((plugin) => ({
  ...plugin.manifest,
  profile: plugin.manifest.profile || 'runtime',
  entries: decorateEntriesWithRuntime(plugin.manifest),
  enabled: Boolean(enabledMap[plugin.manifest.id]),
  runnable: typeof plugin.activate === 'function' || Boolean(plugin.mainPath) || Boolean(plugin.manifest.entries?.commands?.length),
  signatureStatus: getPluginSignatureStatus(plugin.manifest),
  blockStatus: getPluginPolicyStatus(plugin.manifest),
  configSchema: plugin.configSchema,
  config: getPluginConfig(plugin.manifest.id, plugin.configSchema),
  storage: getPluginStorageStats(plugin.manifest.id)
}))

module.exports = {
  getSignatureStatus,
  getPluginSignatureStatus,
  normalizeServiceHealthPolicy,
  normalizePluginConfig,
  getPluginStorageStats,
  createRuntimeView,
  createSetupRuntimeView,
  decorateEntriesWithRuntime,
  listPlugins
}
