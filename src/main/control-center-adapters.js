// @ts-check

/**
 * @typedef {import('../shared/openpet-contracts').BlocklistState} BlocklistState
 * @typedef {import('../shared/openpet-contracts').CatalogBlocklistResult} CatalogBlocklistResult
 * @typedef {import('../shared/openpet-contracts').CatalogState} CatalogState
 * @typedef {import('../shared/openpet-contracts').LocalHttpConfigViewState} LocalHttpConfigViewState
 * @typedef {import('../shared/openpet-contracts').LocalHttpRuntimeViewState} LocalHttpRuntimeViewState
 * @typedef {import('../shared/openpet-contracts').ServiceLogEntry} ServiceLogEntry
 * @typedef {import('../shared/openpet-contracts').ServiceStatusViewState} ServiceStatusViewState
 * @typedef {import('../shared/openpet-contracts').PluginMutationResult} PluginMutationResult
 * @typedef {import('../shared/openpet-contracts').PluginViewState} PluginViewState
 * @typedef {import('../shared/openpet-contracts').ActionsConfigViewState} ActionsConfigViewState
 * @typedef {import('../shared/openpet-contracts').PetPackMutationResult} PetPackMutationResult
 * @typedef {import('../shared/openpet-contracts').PetPacksViewState} PetPacksViewState
 */

const DEFAULT_LOOPBACK_HOST = '127.0.0.1'

/**
 * @param {unknown} value
 * @returns {number}
 */
const toPort = (value) => {
  const port = Number(value ?? 0)
  return Number.isFinite(port) ? port : 0
}

/**
 * @param {Partial<LocalHttpConfigViewState> | undefined} config
 * @returns {LocalHttpConfigViewState}
 */
const createLocalHttpConfigView = (config = {}) => ({
  enabled: Boolean(config.enabled),
  host: typeof config.host === 'string' && config.host ? config.host : DEFAULT_LOOPBACK_HOST,
  port: toPort(config.port),
  token: typeof config.token === 'string' ? config.token : '',
  logs: Array.isArray(config.logs) ? config.logs : /** @type {ServiceLogEntry[]} */ ([])
})

/**
 * @param {Partial<LocalHttpRuntimeViewState> | undefined} runtime
 * @returns {LocalHttpRuntimeViewState}
 */
const createLocalHttpRuntimeView = (runtime = {}) => ({
  enabled: Boolean(runtime.enabled),
  host: typeof runtime.host === 'string' && runtime.host ? runtime.host : DEFAULT_LOOPBACK_HOST,
  port: toPort(runtime.port),
  mcp: {
    activeSessions: toPort(runtime.mcp?.activeSessions),
    sessionTtlMs: toPort(runtime.mcp?.sessionTtlMs)
  }
})

/**
 * @param {Partial<LocalHttpConfigViewState> | undefined} config
 * @param {Partial<LocalHttpRuntimeViewState> | undefined} runtime
 * @returns {ServiceStatusViewState}
 */
const createServiceStatusView = (config, runtime) => ({
  config: createLocalHttpConfigView(config),
  runtime: createLocalHttpRuntimeView(runtime)
})

/**
 * @param {CatalogState} catalog
 * @param {BlocklistState} blocklist
 * @returns {CatalogBlocklistResult}
 */
const createCatalogBlocklistResult = (catalog, blocklist) => ({
  catalog,
  blocklist
})

/**
 * @param {Partial<PluginMutationResult>} result
 * @param {PluginViewState[]} plugins
 * @returns {PluginMutationResult}
 */
const createPluginMutationResult = (result, plugins) => ({
  ok: Boolean(result.ok),
  ...(result.pluginId !== undefined ? { pluginId: result.pluginId } : {}),
  ...(result.installMode !== undefined ? { installMode: result.installMode } : {}),
  ...(result.disabled !== undefined ? { disabled: result.disabled } : {}),
  ...(result.storageRemoved !== undefined ? { storageRemoved: result.storageRemoved } : {}),
  plugins
})

/**
 * @param {Partial<PetPackMutationResult>} result
 * @param {PetPacksViewState} petPacks
 * @param {ActionsConfigViewState | undefined} [animations]
 * @returns {PetPackMutationResult}
 */
const createPetPackMutationResult = (result, petPacks, animations) => ({
  ...(result.pack !== undefined ? { pack: result.pack } : {}),
  ...(result.activePackId !== undefined ? { activePackId: result.activePackId } : {}),
  petPacks,
  ...(animations !== undefined ? { animations } : {})
})

module.exports = {
  createCatalogBlocklistResult,
  createLocalHttpConfigView,
  createLocalHttpRuntimeView,
  createPetPackMutationResult,
  createPluginMutationResult,
  createServiceStatusView
}
