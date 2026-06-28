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
 * @typedef {import('../shared/openpet-contracts').ActionFrameImportResult} ActionFrameImportResult
 * @typedef {import('../shared/openpet-contracts').ActionsMutationResult} ActionsMutationResult
 * @typedef {import('../shared/openpet-contracts').ActionsConfigViewState} ActionsConfigViewState
 * @typedef {import('../shared/openpet-contracts').AboutInfoViewState} AboutInfoViewState
 * @typedef {import('../shared/openpet-contracts').AboutUpdateInfo} AboutUpdateInfo
 * @typedef {import('../shared/openpet-contracts').PetPackMutationResult} PetPackMutationResult
 * @typedef {import('../shared/openpet-contracts').PetPacksViewState} PetPacksViewState
 * @typedef {import('../shared/openpet-contracts').UpdateCheckViewState} UpdateCheckViewState
 */

const DEFAULT_LOOPBACK_HOST = '127.0.0.1'
const TRIGGER_PROPOSAL_TYPES = new Set(['manual', 'click', 'random', 'state', 'event', 'unbound'])
const TRIGGER_PROPOSAL_STATUSES = new Set(['pending', 'accepted', 'rejected', 'applied', 'pending-host-rule'])
const TRIGGER_PROPOSAL_RESULT_CODES = new Set(['applied', 'no_binding_required', 'pending_host_rule', 'preview_ready', 'rule_saved'])

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

/**
 * @param {Partial<ActionFrameImportResult>} result
 * @param {ActionsConfigViewState | undefined} [animations]
 * @returns {ActionFrameImportResult}
 */
const createActionFrameImportResult = (result, animations) => ({
  ...(result.ok !== undefined ? { ok: Boolean(result.ok) } : {}),
  ...(result.canceled !== undefined ? { canceled: Boolean(result.canceled) } : {}),
  ...(result.result?.importedAction !== undefined ? { result: { importedAction: result.result.importedAction } } : {}),
  ...(animations !== undefined ? { animations } : {}),
  ...(result.inspectionResult !== undefined ? { inspectionResult: result.inspectionResult } : {})
})

/**
 * @param {Partial<import('../shared/openpet-contracts').ActionTriggerProposalAcceptanceResult>} proposal
 * @returns {import('../shared/openpet-contracts').ActionTriggerProposalAcceptanceResult}
 */
const createTriggerProposalAcceptanceResult = (proposal = {}) => ({
  ok: Boolean(proposal.ok),
  applied: Boolean(proposal.applied),
  actionId: typeof proposal.actionId === 'string' ? proposal.actionId : '',
  type: typeof proposal.type === 'string' && TRIGGER_PROPOSAL_TYPES.has(proposal.type) ? proposal.type : 'unbound',
  binding: typeof proposal.binding === 'string' ? proposal.binding : '',
  code: typeof proposal.code === 'string' && TRIGGER_PROPOSAL_RESULT_CODES.has(proposal.code) ? proposal.code : 'pending_host_rule',
  message: typeof proposal.message === 'string' ? proposal.message : '',
  acceptedAt: typeof proposal.acceptedAt === 'string' ? proposal.acceptedAt : '',
  ...(proposal.preview && typeof proposal.preview === 'object'
    ? {
        preview: {
          summary: typeof proposal.preview.summary === 'string' ? proposal.preview.summary : '',
          rule: proposal.preview.rule && typeof proposal.preview.rule === 'object'
            ? {
                id: typeof proposal.preview.rule.id === 'string' ? proposal.preview.rule.id : '',
                type: typeof proposal.preview.rule.type === 'string' ? proposal.preview.rule.type : 'random',
                actionId: typeof proposal.preview.rule.actionId === 'string' ? proposal.preview.rule.actionId : '',
                enabled: proposal.preview.rule.enabled !== false,
                condition: proposal.preview.rule.condition && typeof proposal.preview.rule.condition === 'object'
                  ? { ...proposal.preview.rule.condition }
                  : {}
              }
            : {
                id: '',
                type: 'random',
                actionId: '',
                enabled: true,
                condition: {}
              }
        }
      }
    : {}),
  ...(typeof proposal.sourcePluginId === 'string' ? { sourcePluginId: proposal.sourcePluginId } : {}),
  ...(typeof proposal.sourceRunId === 'string' ? { sourceRunId: proposal.sourceRunId } : {}),
  ...(typeof proposal.sourceCommandId === 'string' ? { sourceCommandId: proposal.sourceCommandId } : {})
})

/**
 * @param {Partial<import('../shared/openpet-contracts').ActionTriggerProposalInboxItem>} proposal
 * @returns {import('../shared/openpet-contracts').ActionTriggerProposalInboxItem}
 */
const createTriggerProposalInboxItem = (proposal = {}) => ({
  id: typeof proposal.id === 'string' ? proposal.id : '',
  actionId: typeof proposal.actionId === 'string' ? proposal.actionId : '',
  type: typeof proposal.type === 'string' && TRIGGER_PROPOSAL_TYPES.has(proposal.type) ? proposal.type : 'unbound',
  binding: typeof proposal.binding === 'string' ? proposal.binding : '',
  ...(proposal.condition && typeof proposal.condition === 'object' ? { condition: { ...proposal.condition } } : {}),
  sourcePluginId: typeof proposal.sourcePluginId === 'string' ? proposal.sourcePluginId : '',
  sourceRunId: typeof proposal.sourceRunId === 'string' ? proposal.sourceRunId : '',
  sourceCommandId: typeof proposal.sourceCommandId === 'string' ? proposal.sourceCommandId : '',
  message: typeof proposal.message === 'string' ? proposal.message : '',
  status: typeof proposal.status === 'string' && TRIGGER_PROPOSAL_STATUSES.has(proposal.status) ? proposal.status : 'pending',
  resultCode: typeof proposal.resultCode === 'string' ? proposal.resultCode : '',
  resultMessage: typeof proposal.resultMessage === 'string' ? proposal.resultMessage : '',
  rejectionReason: typeof proposal.rejectionReason === 'string' ? proposal.rejectionReason : '',
  createdAt: typeof proposal.createdAt === 'string' ? proposal.createdAt : '',
  updatedAt: typeof proposal.updatedAt === 'string' ? proposal.updatedAt : '',
  acceptedAt: typeof proposal.acceptedAt === 'string' ? proposal.acceptedAt : '',
  rejectedAt: typeof proposal.rejectedAt === 'string' ? proposal.rejectedAt : ''
})

/**
 * @param {ActionsConfigViewState} animations
 * @param {Partial<{
 *   proposal: Partial<import('../shared/openpet-contracts').ActionTriggerProposalInboxItem>,
 *   triggerProposal: Partial<import('../shared/openpet-contracts').ActionTriggerProposalAcceptanceResult>
 * }> | undefined} [result]
 * @returns {ActionsMutationResult}
 */
const createActionsMutationResult = (animations, result) => ({
  animations,
  ...(result?.proposal !== undefined ? { proposal: createTriggerProposalInboxItem(result.proposal) } : {}),
  ...(result?.triggerProposal !== undefined ? { triggerProposal: createTriggerProposalAcceptanceResult(result.triggerProposal) } : {})
})

/**
 * @param {Partial<AboutUpdateInfo> | undefined} update
 * @returns {AboutUpdateInfo}
 */
const createAboutUpdateInfo = (update = {}) => ({
  configured: Boolean(update.configured),
  provider: typeof update.provider === 'string' ? update.provider : '',
  ...(typeof update.owner === 'string' ? { owner: update.owner } : {}),
  ...(typeof update.repo === 'string' ? { repo: update.repo } : {}),
  channel: typeof update.channel === 'string' ? update.channel : '',
  url: typeof update.url === 'string' ? update.url : ''
})

/**
 * @param {Partial<AboutInfoViewState> | undefined} info
 * @returns {AboutInfoViewState}
 */
const createAboutInfoView = (info = {}) => ({
  name: typeof info.name === 'string' && info.name ? info.name : 'openpet',
  productName: typeof info.productName === 'string' && info.productName ? info.productName : 'OpenPet',
  version: typeof info.version === 'string' && info.version ? info.version : '0.0.0',
  packaged: Boolean(info.packaged),
  platform: typeof info.platform === 'string' ? info.platform : '',
  arch: typeof info.arch === 'string' ? info.arch : '',
  update: createAboutUpdateInfo(info.update)
})

/**
 * @param {Partial<UpdateCheckViewState> | undefined} result
 * @returns {UpdateCheckViewState}
 */
const createUpdateCheckView = (result = {}) => ({
  status: typeof result.status === 'string' && result.status ? result.status : 'idle',
  configured: Boolean(result.configured),
  currentVersion: typeof result.currentVersion === 'string' ? result.currentVersion : '',
  latestVersion: typeof result.latestVersion === 'string' ? result.latestVersion : '',
  updateAvailable: Boolean(result.updateAvailable),
  prerelease: Boolean(result.prerelease),
  releaseUrl: typeof result.releaseUrl === 'string' ? result.releaseUrl : '',
  assets: Array.isArray(result.assets) ? result.assets : [],
  checkedAt: typeof result.checkedAt === 'string' ? result.checkedAt : '',
  message: typeof result.message === 'string' ? result.message : ''
})

module.exports = {
  createActionFrameImportResult,
  createActionsMutationResult,
  createAboutInfoView,
  createAboutUpdateInfo,
  createCatalogBlocklistResult,
  createLocalHttpConfigView,
  createLocalHttpRuntimeView,
  createPetPackMutationResult,
  createPluginMutationResult,
  createServiceStatusView,
  createUpdateCheckView
}
