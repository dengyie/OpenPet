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
 * @typedef {import('../shared/openpet-contracts').PluginConfigFieldViewState} PluginConfigFieldViewState
 * @typedef {import('../shared/openpet-contracts').PluginConfigSchemaViewState} PluginConfigSchemaViewState
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
const TRIGGER_PROPOSAL_RESULT_CODES = new Set(['applied', 'no_binding_required', 'pending_host_rule', 'rule_created'])
const TRIGGER_PROPOSAL_PREVIEW_CODES = new Set(['will_apply', 'no_binding_required', 'will_create_rule'])
const TRIGGER_RULE_TYPES = new Set(['random', 'state', 'event'])
const TRIGGER_RULE_STATUSES = new Set(['active', 'disabled'])
const MAX_TRIGGER_RULE_SPEC_TEXT_LENGTH = 240
const PLUGIN_PROFILES = new Set(['runtime', 'creator-tools', 'hybrid'])
const PLUGIN_CONFIG_FIELD_TYPES = new Set(['string', 'number', 'boolean'])

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
const toRecord = (value) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, any>} */ (value)
    : {}
)

/**
 * @param {unknown} value
 * @returns {number}
 */
const toNonNegativeInteger = (value) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : 0
}

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {value is import('../shared/openpet-contracts').JsonValue}
 */
const isJsonValue = (value, depth = 0) => {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (depth > 4 || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1))
  return Object.values(value).every((item) => isJsonValue(item, depth + 1))
}

/**
 * @param {unknown} value
 * @returns {import('../shared/openpet-contracts').JsonValue[]}
 */
const toJsonValueArray = (value) => (
  Array.isArray(value)
    ? value.filter(isJsonValue)
    : []
)

/**
 * @param {unknown} value
 * @returns {'random' | 'state' | 'event' | ''}
 */
const toTriggerRuleType = (value) => (
  typeof value === 'string' && TRIGGER_RULE_TYPES.has(value)
    ? /** @type {'random' | 'state' | 'event'} */ (value)
    : ''
)

/**
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
const sanitizeTriggerRuleSpecText = (value, fallback = '') => String(typeof value === 'string' ? value : fallback)
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-secret]')
  .replace(/\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/gi, '[redacted-token]')
  .replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  .replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g, '[redacted-path]')
  .slice(0, MAX_TRIGGER_RULE_SPEC_TEXT_LENGTH)

/**
 * @param {'random' | 'state' | 'event'} type
 * @param {string} actionId
 * @param {{ message?: string, preview?: string } & Record<string, any>} [rule]
 * @returns {import('../shared/openpet-contracts').ActionTriggerRuleSpec}
 */
const createTriggerRuleSpec = (type, actionId, rule = {}) => {
  const ruleSpec = rule.ruleSpec && typeof rule.ruleSpec === 'object' && !Array.isArray(rule.ruleSpec) ? rule.ruleSpec : {}
  const rawSummary = typeof ruleSpec.summary === 'string' && ruleSpec.summary
    ? ruleSpec.summary
    : typeof rule.message === 'string' && rule.message
    ? rule.message
    : (typeof rule.preview === 'string' && rule.preview ? rule.preview : `Trigger rule can play ${actionId}.`)
  const summary = sanitizeTriggerRuleSpecText(rawSummary)
  if (type === 'random') {
    const schedule = ruleSpec.schedule && typeof ruleSpec.schedule === 'object' && !Array.isArray(ruleSpec.schedule) ? ruleSpec.schedule : {}
    const mode = schedule.mode === 'interval' ? 'interval' : 'opportunistic'
    const intervalMs = Number(schedule.intervalMs)
    return {
      schemaVersion: 1,
      type,
      summary,
      schedule: {
        mode,
        ...(mode === 'interval' && Number.isFinite(intervalMs) && intervalMs > 0
          ? { intervalMs: Math.min(Math.round(intervalMs), 24 * 60 * 60 * 1000) }
          : {})
      }
    }
  }
  if (type === 'state') {
    const state = ruleSpec.state && typeof ruleSpec.state === 'object' && !Array.isArray(ruleSpec.state) ? ruleSpec.state : {}
    return {
      schemaVersion: 1,
      type,
      summary,
      state: {
        predicate: sanitizeTriggerRuleSpecText(state.predicate, 'host.state.available'),
        source: sanitizeTriggerRuleSpecText(state.source, 'host')
      }
    }
  }
  const event = ruleSpec.event && typeof ruleSpec.event === 'object' && !Array.isArray(ruleSpec.event) ? ruleSpec.event : {}
  return {
    schemaVersion: 1,
    type,
    summary,
    event: {
      name: sanitizeTriggerRuleSpecText(event.name, 'openpet.event'),
      source: sanitizeTriggerRuleSpecText(event.source, 'host')
    }
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
const toPort = (value) => {
  const port = Number(value ?? 0)
  return Number.isFinite(port) ? port : 0
}

/**
 * @param {Partial<ServiceLogEntry> | undefined} entry
 * @returns {ServiceLogEntry}
 */
const createServiceLogEntryView = (entry = {}) => {
  const statusCode = Number(entry.statusCode)
  const rawStatusCode = entry.statusCode
  const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : ''
  const method = typeof entry.method === 'string' ? entry.method : ''
  const path = typeof entry.path === 'string' ? entry.path : ''
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : `${timestamp}-${method}-${path}-${rawStatusCode ?? ''}`,
    timestamp,
    method,
    path,
    statusCode: Number.isFinite(statusCode) ? Math.max(0, Math.round(statusCode)) : 0,
    authorized: Boolean(entry.authorized),
    remoteAddress: typeof entry.remoteAddress === 'string' ? entry.remoteAddress : '',
    error: typeof entry.error === 'string' ? entry.error : ''
  }
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
  logs: Array.isArray(config.logs)
    ? /** @type {ServiceLogEntry[]} */ (
      config.logs
        .filter((entry) => entry && typeof entry.path === 'string')
        .map((entry) => createServiceLogEntryView(entry || {}))
    )
    : /** @type {ServiceLogEntry[]} */ ([]) 
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
 * @param {unknown} config
 * @returns {import('../shared/openpet-contracts').AiConfigViewState}
 */
const createAiConfigView = (config = {}) => {
  const input = toRecord(config)
  const memory = toRecord(input.memory)
  const behavior = toRecord(input.behavior)
  return {
    enabled: Boolean(input.enabled),
    provider: typeof input.provider === 'string' ? input.provider : '',
    baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl : '',
    model: typeof input.model === 'string' ? input.model : '',
    apiKeyRef: typeof input.apiKeyRef === 'string' ? input.apiKeyRef : '',
    systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt : '',
    memory: {
      enabled: Boolean(memory.enabled)
    },
    behavior: {
      enabled: Boolean(behavior.enabled),
      useTools: Boolean(behavior.useTools),
      cooldownMs: toNonNegativeInteger(behavior.cooldownMs),
      rules: Array.isArray(behavior.rules) ? behavior.rules.filter((item) => item && typeof item === 'object') : [],
      decisions: Array.isArray(behavior.decisions) ? behavior.decisions.filter((item) => item && typeof item === 'object') : []
    },
    hasApiKey: Boolean(input.hasApiKey)
  }
}

/**
 * @param {unknown} blocklist
 * @returns {BlocklistState}
 */
const createBlocklistStateView = (blocklist = {}) => {
  const input = toRecord(blocklist)
  return {
    pluginIds: Array.isArray(input.pluginIds) ? input.pluginIds.filter((item) => typeof item === 'string' && item) : [],
    packIds: Array.isArray(input.packIds) ? input.packIds.filter((item) => typeof item === 'string' && item) : [],
    sha256: Array.isArray(input.sha256) ? input.sha256.filter((item) => typeof item === 'string' && item) : []
  }
}

/**
 * @param {unknown} review
 * @returns {import('../shared/openpet-contracts').CatalogReviewState | undefined}
 */
const createCatalogReviewStateView = (review) => {
  if (!review || typeof review !== 'object' || Array.isArray(review)) return undefined
  const input = toRecord(review)
  return {
    blocked: Boolean(input.blocked),
    reasons: Array.isArray(input.reasons) ? input.reasons.filter((item) => typeof item === 'string' && item) : []
  }
}

/**
 * @param {unknown} plugin
 * @returns {import('../shared/openpet-contracts').CatalogPluginEntry}
 */
const createCatalogPluginEntryView = (plugin = {}) => {
  const input = toRecord(plugin)
  const blockStatus = createCatalogReviewStateView(input.blockStatus)
  return {
    id: typeof input.id === 'string' ? input.id : '',
    name: typeof input.name === 'string' ? input.name : '',
    version: typeof input.version === 'string' ? input.version : '',
    ...(typeof input.author === 'string' ? { author: input.author } : {}),
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(typeof input.openpetApiVersion === 'string' ? { openpetApiVersion: input.openpetApiVersion } : {}),
    ...(Array.isArray(input.permissions)
      ? { permissions: input.permissions.filter((item) => typeof item === 'string' && item) }
      : {}),
    ...(input.downloadable !== undefined ? { downloadable: Boolean(input.downloadable) } : {}),
    ...(input.installed !== undefined ? { installed: Boolean(input.installed) } : {}),
    ...(typeof input.installedVersion === 'string' ? { installedVersion: input.installedVersion } : {}),
    ...(input.updateAvailable !== undefined ? { updateAvailable: Boolean(input.updateAvailable) } : {}),
    ...(typeof input.sha256 === 'string' ? { sha256: input.sha256 } : {}),
    ...(typeof input.reportUrl === 'string' ? { reportUrl: input.reportUrl } : {}),
    ...(blockStatus ? { blockStatus } : {})
  }
}

/**
 * @param {unknown} petPack
 * @returns {import('../shared/openpet-contracts').CatalogPetPackEntry}
 */
const createCatalogPetPackEntryView = (petPack = {}) => {
  const input = toRecord(petPack)
  const blockStatus = createCatalogReviewStateView(input.blockStatus)
  return {
    id: typeof input.id === 'string' ? input.id : '',
    displayName: typeof input.displayName === 'string' ? input.displayName : '',
    version: typeof input.version === 'string' ? input.version : '',
    ...(typeof input.author === 'string' ? { author: input.author } : {}),
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(typeof input.previewImage === 'string' ? { previewImage: input.previewImage } : {}),
    ...(input.actionCount !== undefined ? { actionCount: toNonNegativeInteger(input.actionCount) } : {}),
    ...(input.downloadable !== undefined ? { downloadable: Boolean(input.downloadable) } : {}),
    ...(input.installed !== undefined ? { installed: Boolean(input.installed) } : {}),
    ...(typeof input.installedVersion === 'string' ? { installedVersion: input.installedVersion } : {}),
    ...(input.updateAvailable !== undefined ? { updateAvailable: Boolean(input.updateAvailable) } : {}),
    ...(typeof input.sha256 === 'string' ? { sha256: input.sha256 } : {}),
    ...(typeof input.reportUrl === 'string' ? { reportUrl: input.reportUrl } : {}),
    ...(blockStatus ? { blockStatus } : {})
  }
}

/**
 * @param {unknown} catalog
 * @returns {CatalogState}
 */
const createCatalogView = (catalog = {}) => {
  const input = toRecord(catalog)
  return {
    schemaVersion: toNonNegativeInteger(input.schemaVersion) || 1,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    feedbackUrl: typeof input.feedbackUrl === 'string' ? input.feedbackUrl : '',
    localBlocklist: createBlocklistStateView(input.localBlocklist),
    catalogBlocklist: createBlocklistStateView(input.catalogBlocklist),
    blocklist: createBlocklistStateView(input.blocklist),
    plugins: Array.isArray(input.plugins) ? input.plugins.map((plugin) => createCatalogPluginEntryView(plugin)) : [],
    petPacks: Array.isArray(input.petPacks) ? input.petPacks.map((petPack) => createCatalogPetPackEntryView(petPack)) : []
  }
}

/**
 * @param {CatalogState} catalog
 * @param {BlocklistState} blocklist
 * @returns {CatalogBlocklistResult}
 */
const createCatalogBlocklistResult = (catalog, blocklist) => ({
  catalog: createCatalogView(catalog),
  blocklist: createBlocklistStateView(blocklist)
})

/**
 * @param {unknown} field
 * @returns {PluginConfigFieldViewState | null}
 */
const createPluginConfigFieldView = (field) => {
  const input = toRecord(field)
  if (typeof input.key !== 'string' || !input.key) return null
  return {
    key: input.key,
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(typeof input.type === 'string' && PLUGIN_CONFIG_FIELD_TYPES.has(input.type)
      ? { type: /** @type {'string' | 'number' | 'boolean'} */ (input.type) }
      : {}),
    ...(Array.isArray(input.enum) ? { enum: toJsonValueArray(input.enum) } : {}),
    ...(input.required !== undefined ? { required: Boolean(input.required) } : {})
  }
}

/**
 * @param {PluginConfigFieldViewState | null} field
 * @returns {field is PluginConfigFieldViewState}
 */
const isPluginConfigFieldView = (field) => Boolean(field)

/**
 * @param {unknown} schema
 * @returns {PluginConfigSchemaViewState}
 */
const createPluginConfigSchemaView = (schema = {}) => {
  const input = toRecord(schema)
  return {
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    properties: Array.isArray(input.properties)
      ? input.properties
        .map((field) => createPluginConfigFieldView(field))
        .filter(isPluginConfigFieldView)
      : []
  }
}

/**
 * @param {unknown} storage
 * @returns {import('../shared/openpet-contracts').PluginStorageViewState}
 */
const createPluginStorageView = (storage = {}) => {
  const input = toRecord(storage)
  return {
    keyCount: toNonNegativeInteger(input.keyCount),
    byteSize: toNonNegativeInteger(input.byteSize),
    ...(input.valid !== undefined ? { valid: Boolean(input.valid) } : {})
  }
}

/**
 * @param {unknown} signatureStatus
 * @returns {import('../shared/openpet-contracts').PluginSignatureStatusViewState}
 */
const createPluginSignatureStatusView = (signatureStatus = {}) => {
  const input = toRecord(signatureStatus)
  const label = typeof input.label === 'string' && input.label ? input.label : 'Signature unknown'
  return {
    status: typeof input.status === 'string' ? input.status : '',
    label,
    signer: typeof input.signer === 'string' ? input.signer : '',
    algorithm: typeof input.algorithm === 'string' ? input.algorithm : '',
    verified: Boolean(input.verified),
    errors: Array.isArray(input.errors) ? input.errors.filter((error) => typeof error === 'string' && error) : []
  }
}

/**
 * @param {unknown} blockStatus
 * @returns {import('../shared/openpet-contracts').CatalogReviewState | undefined}
 */
const createPluginBlockStatusView = (blockStatus) => {
  if (!blockStatus || typeof blockStatus !== 'object' || Array.isArray(blockStatus)) return undefined
  const input = /** @type {Record<string, any>} */ (blockStatus)
  return {
    blocked: Boolean(input.blocked),
    reasons: Array.isArray(input.reasons) ? input.reasons.filter((reason) => typeof reason === 'string') : []
  }
}

/**
 * @param {unknown} blockStatus
 * @returns {import('../shared/openpet-contracts').PetPackSummary['blockStatus']}
 */
const createPetPackBlockStatusView = (blockStatus) => {
  if (!blockStatus || typeof blockStatus !== 'object' || Array.isArray(blockStatus)) return undefined
  const input = toRecord(blockStatus)
  return {
    blocked: Boolean(input.blocked),
    reasons: Array.isArray(input.reasons) ? input.reasons.filter((reason) => typeof reason === 'string' && reason) : []
  }
}

/**
 * @param {unknown} atlas
 * @returns {import('../shared/openpet-contracts').SpriteAtlas | undefined}
 */
const createSpriteAtlasView = (atlas) => {
  if (!atlas || typeof atlas !== 'object' || Array.isArray(atlas)) return undefined
  const input = toRecord(atlas)
  return {
    columns: toNonNegativeInteger(input.columns),
    rows: toNonNegativeInteger(input.rows),
    width: toNonNegativeInteger(input.width),
    height: toNonNegativeInteger(input.height)
  }
}

/**
 * @param {unknown} previewAction
 * @returns {import('../shared/openpet-contracts').PetPackPreviewAction | null}
 */
const createPetPackPreviewActionView = (previewAction) => {
  if (!previewAction || typeof previewAction !== 'object' || Array.isArray(previewAction)) return null
  const input = toRecord(previewAction)
  if (typeof input.id !== 'string' || !input.id) return null
  const atlas = createSpriteAtlasView(input.atlas)
  return {
    id: input.id,
    ...(typeof input.label === 'string' ? { label: input.label } : {}),
    ...(input.frameCount !== undefined ? { frameCount: toNonNegativeInteger(input.frameCount) } : {}),
    ...(input.frameWidth !== undefined ? { frameWidth: toNonNegativeInteger(input.frameWidth) } : {}),
    ...(input.frameHeight !== undefined ? { frameHeight: toNonNegativeInteger(input.frameHeight) } : {}),
    ...(input.frameMs !== undefined ? { frameMs: toNonNegativeInteger(input.frameMs) } : {}),
    ...(input.frameRow !== undefined ? { frameRow: toNonNegativeInteger(input.frameRow) } : {}),
    ...(input.frameColumn !== undefined ? { frameColumn: toNonNegativeInteger(input.frameColumn) } : {}),
    ...(atlas ? { atlas } : {}),
    ...(Array.isArray(input.frameDurations)
      ? { frameDurations: input.frameDurations.map((duration) => toNonNegativeInteger(duration)) }
      : {}),
    ...(input.loop !== undefined ? { loop: Boolean(input.loop) } : {})
  }
}

/**
 * @param {unknown} provenance
 * @returns {import('../shared/openpet-contracts').PetPackProvenance | undefined}
 */
const createPetPackProvenanceView = (provenance) => {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return undefined
  const input = toRecord(provenance)
  return {
    ...(typeof input.sourceUrl === 'string' ? { sourceUrl: input.sourceUrl } : {}),
    ...(typeof input.assetAuthor === 'string' ? { assetAuthor: input.assetAuthor } : {}),
    ...(typeof input.license === 'string' ? { license: input.license } : {}),
    ...(typeof input.licenseUrl === 'string' ? { licenseUrl: input.licenseUrl } : {}),
    ...(typeof input.importedAt === 'string' ? { importedAt: input.importedAt } : {}),
    ...(typeof input.originalFormat === 'string' ? { originalFormat: input.originalFormat } : {})
  }
}

/**
 * @param {unknown} conflict
 * @returns {import('../shared/openpet-contracts').PetPackVersionConflict | undefined}
 */
const createPetPackVersionConflictView = (conflict) => {
  if (!conflict || typeof conflict !== 'object' || Array.isArray(conflict)) return undefined
  const input = toRecord(conflict)
  const validDecisions = new Set(['new-install', 'upgrade', 'downgrade', 'same-version'])
  return {
    installed: Boolean(input.installed),
    decision: typeof input.decision === 'string' && validDecisions.has(input.decision)
      ? /** @type {'new-install' | 'upgrade' | 'downgrade' | 'same-version'} */ (input.decision)
      : 'same-version',
    requiresReview: Boolean(input.requiresReview),
    installedVersion: typeof input.installedVersion === 'string' ? input.installedVersion : '',
    incomingVersion: typeof input.incomingVersion === 'string' ? input.incomingVersion : ''
  }
}

/**
 * @param {unknown} pack
 * @returns {import('../shared/openpet-contracts').PetPackSummary}
 */
const createPetPackSummaryView = (pack = {}) => {
  const input = toRecord(pack)
  const previewAction = createPetPackPreviewActionView(input.previewAction)
  const provenance = createPetPackProvenanceView(input.provenance)
  const blockStatus = createPetPackBlockStatusView(input.blockStatus)
  const conflict = createPetPackVersionConflictView(input.conflict)
  return {
    id: typeof input.id === 'string' ? input.id : '',
    displayName: typeof input.displayName === 'string' ? input.displayName : '',
    version: typeof input.version === 'string' ? input.version : '',
    source: typeof input.source === 'string' ? input.source : '',
    rootPath: typeof input.rootPath === 'string' ? input.rootPath : '',
    ...(input.active !== undefined ? { active: Boolean(input.active) } : {}),
    ...(typeof input.installedAt === 'string' ? { installedAt: input.installedAt } : {}),
    ...(typeof input.updatedAt === 'string' ? { updatedAt: input.updatedAt } : {}),
    ...(typeof input.packageHash === 'string' ? { packageHash: input.packageHash } : {}),
    ...(typeof input.sourcePackageHash === 'string' ? { sourcePackageHash: input.sourcePackageHash } : {}),
    ...(provenance ? { provenance } : {}),
    ...(input.actionCount !== undefined ? { actionCount: toNonNegativeInteger(input.actionCount) } : {}),
    ...(typeof input.defaultAction === 'string' ? { defaultAction: input.defaultAction } : {}),
    ...(typeof input.clickAction === 'string' ? { clickAction: input.clickAction } : {}),
    ...(typeof input.previewSprite === 'string' ? { previewSprite: input.previewSprite } : {}),
    ...(previewAction ? { previewAction } : {}),
    ...(input.valid !== undefined ? { valid: Boolean(input.valid) } : {}),
    ...(typeof input.error === 'string' ? { error: input.error } : {}),
    ...(blockStatus ? { blockStatus } : {}),
    ...(conflict ? { conflict } : {})
  }
}

/**
 * @param {unknown} petPacks
 * @returns {PetPacksViewState}
 */
const createPetPacksView = (petPacks = {}) => {
  const input = toRecord(petPacks)
  return {
    activePackId: typeof input.activePackId === 'string' ? input.activePackId : '',
    packs: Array.isArray(input.packs) ? input.packs.map((pack) => createPetPackSummaryView(pack)) : []
  }
}

/**
 * @param {unknown} plugin
 * @returns {PluginViewState}
 */
const createPluginViewState = (plugin = {}) => {
  const input = toRecord(plugin)
  const blockStatus = createPluginBlockStatusView(input.blockStatus)
  return {
    id: typeof input.id === 'string' ? input.id : '',
    name: typeof input.name === 'string' ? input.name : '',
    version: typeof input.version === 'string' ? input.version : '',
    ...(typeof input.profile === 'string' && PLUGIN_PROFILES.has(input.profile)
      ? { profile: /** @type {'runtime' | 'creator-tools' | 'hybrid'} */ (input.profile) }
      : {}),
    source: typeof input.source === 'string' ? input.source : '',
    enabled: Boolean(input.enabled),
    runnable: Boolean(input.runnable),
    permissions: Array.isArray(input.permissions) ? input.permissions.filter((permission) => typeof permission === 'string') : [],
    commands: Array.isArray(input.commands) ? input.commands : [],
    entries: {
      setup: Array.isArray(input.entries?.setup) ? input.entries.setup : [],
      commands: Array.isArray(input.entries?.commands) ? input.entries.commands : [],
      services: Array.isArray(input.entries?.services) ? input.entries.services : [],
      dashboards: Array.isArray(input.entries?.dashboards) ? input.entries.dashboards : []
    },
    configSchema: createPluginConfigSchemaView(input.configSchema),
    config: toRecord(input.config),
    storage: createPluginStorageView(input.storage),
    signatureStatus: createPluginSignatureStatusView(input.signatureStatus),
    ...(blockStatus !== undefined ? { blockStatus } : {})
  }
}

/**
 * @param {Partial<PluginMutationResult>} result
 * @param {unknown[]} plugins
 * @returns {PluginMutationResult}
 */
const createPluginMutationResult = (result, plugins) => ({
  ok: Boolean(result.ok),
  ...(result.pluginId !== undefined ? { pluginId: result.pluginId } : {}),
  ...(result.installMode !== undefined ? { installMode: result.installMode } : {}),
  ...(result.disabled !== undefined ? { disabled: result.disabled } : {}),
  ...(result.storageRemoved !== undefined ? { storageRemoved: result.storageRemoved } : {}),
  plugins: Array.isArray(plugins) ? plugins.map((plugin) => createPluginViewState(plugin)) : []
})

/**
 * @param {Partial<PetPackMutationResult>} result
 * @param {PetPacksViewState} petPacks
 * @param {ActionsConfigViewState | undefined} [animations]
 * @returns {PetPackMutationResult}
 */
const createPetPackMutationResult = (result, petPacks, animations) => ({
  ...(result.pack !== undefined ? { pack: createPetPackSummaryView(result.pack) } : {}),
  ...(result.activePackId !== undefined ? { activePackId: typeof result.activePackId === 'string' ? result.activePackId : '' } : {}),
  petPacks: createPetPacksView(petPacks),
  ...(animations !== undefined ? { animations } : {})
})

/**
 * @param {unknown} frame
 * @returns {import('../shared/openpet-contracts').ActionFrameInfo | null}
 */
const createActionFrameInfoView = (frame) => {
  const input = toRecord(frame)
  if (typeof input.fileName !== 'string' || !input.fileName) return null
  return {
    fileName: input.fileName,
    width: toNonNegativeInteger(input.width),
    height: toNonNegativeInteger(input.height),
    hasAlpha: Boolean(input.hasAlpha)
  }
}

/**
 * @param {import('../shared/openpet-contracts').ActionFrameInfo | null} frame
 * @returns {frame is import('../shared/openpet-contracts').ActionFrameInfo}
 */
const isActionFrameInfoView = (frame) => Boolean(frame)

/**
 * @param {unknown} inspection
 * @returns {import('../shared/openpet-contracts').ActionFrameInspection}
 */
const createActionFrameInspectionView = (inspection = {}) => {
  const input = toRecord(inspection)
  return {
    valid: Boolean(input.valid),
    frameCount: toNonNegativeInteger(input.frameCount),
    maxWidth: toNonNegativeInteger(input.maxWidth),
    maxHeight: toNonNegativeInteger(input.maxHeight),
    frames: Array.isArray(input.frames)
      ? input.frames
        .map((frame) => createActionFrameInfoView(frame))
        .filter(isActionFrameInfoView)
      : [],
    skippedFiles: Array.isArray(input.skippedFiles) ? input.skippedFiles.filter((item) => typeof item === 'string' && item) : [],
    errors: Array.isArray(input.errors) ? input.errors.filter((item) => typeof item === 'string' && item) : [],
    warnings: Array.isArray(input.warnings) ? input.warnings.filter((item) => typeof item === 'string' && item) : []
  }
}

/**
 * @param {unknown} inspectionResult
 * @returns {import('../shared/openpet-contracts').ActionFrameInspectionResult}
 */
const createActionFrameInspectionResultView = (inspectionResult = {}) => {
  const input = toRecord(inspectionResult)
  if (Boolean(input.canceled)) {
    return {
      canceled: true,
      ...(typeof input.selectionId === 'string' && input.selectionId ? { selectionId: input.selectionId } : {})
    }
  }
  return {
    canceled: false,
    selectionId: typeof input.selectionId === 'string' ? input.selectionId : '',
    folderName: typeof input.folderName === 'string' ? input.folderName : '',
    actionId: typeof input.actionId === 'string' ? input.actionId : '',
    inspection: createActionFrameInspectionView(input.inspection)
  }
}

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
  ...(result.inspectionResult !== undefined ? { inspectionResult: createActionFrameInspectionResultView(result.inspectionResult) } : {})
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
  ...(proposal.triggerRule !== undefined ? { triggerRule: createTriggerRuleItem(proposal.triggerRule) } : {}),
  ...(typeof proposal.triggerRuleId === 'string' ? { triggerRuleId: proposal.triggerRuleId } : {}),
  ...(typeof proposal.preview === 'string' ? { preview: proposal.preview } : {}),
  ...(typeof proposal.sourcePluginId === 'string' ? { sourcePluginId: proposal.sourcePluginId } : {}),
  ...(typeof proposal.sourceRunId === 'string' ? { sourceRunId: proposal.sourceRunId } : {}),
  ...(typeof proposal.sourceCommandId === 'string' ? { sourceCommandId: proposal.sourceCommandId } : {})
})

/**
 * @param {Partial<import('../shared/openpet-contracts').ActionTriggerRule>} rule
 * @returns {import('../shared/openpet-contracts').ActionTriggerRule}
 */
const createTriggerRuleItem = (rule = {}) => ({
  id: typeof rule.id === 'string' ? rule.id : '',
  actionId: typeof rule.actionId === 'string' ? rule.actionId : '',
  type: typeof rule.type === 'string' && TRIGGER_RULE_TYPES.has(rule.type) ? rule.type : 'random',
  status: typeof rule.status === 'string' && TRIGGER_RULE_STATUSES.has(rule.status) ? rule.status : 'active',
  sourceProposalId: typeof rule.sourceProposalId === 'string' ? rule.sourceProposalId : '',
  sourcePluginId: typeof rule.sourcePluginId === 'string' ? rule.sourcePluginId : '',
  sourceRunId: typeof rule.sourceRunId === 'string' ? rule.sourceRunId : '',
  sourceCommandId: typeof rule.sourceCommandId === 'string' ? rule.sourceCommandId : '',
  message: typeof rule.message === 'string' ? rule.message : '',
  preview: typeof rule.preview === 'string' ? rule.preview : '',
  ruleSpec: createTriggerRuleSpec(
    toTriggerRuleType(rule.type) || 'random',
    typeof rule.actionId === 'string' ? rule.actionId : '',
    rule
  ),
  createdAt: typeof rule.createdAt === 'string' ? rule.createdAt : '',
  updatedAt: typeof rule.updatedAt === 'string' ? rule.updatedAt : ''
})

/**
 * @param {Partial<import('../shared/openpet-contracts').ActionTriggerProposalInboxItem>} proposal
 * @returns {import('../shared/openpet-contracts').ActionTriggerProposalInboxItem}
 */
const createTriggerProposalInboxItem = (proposal = {}) => {
  const proposalType = typeof proposal.type === 'string' && TRIGGER_PROPOSAL_TYPES.has(proposal.type) ? proposal.type : 'unbound'
  /** @type {'random' | 'state' | 'event' | null} */
  const hostRuleType = proposalType === 'random' || proposalType === 'state' || proposalType === 'event'
    ? proposalType
    : null
  const actionId = typeof proposal.actionId === 'string' ? proposal.actionId : ''
  return {
    id: typeof proposal.id === 'string' ? proposal.id : '',
    actionId,
    type: proposalType,
    binding: typeof proposal.binding === 'string' ? proposal.binding : '',
    sourcePluginId: typeof proposal.sourcePluginId === 'string' ? proposal.sourcePluginId : '',
    sourceRunId: typeof proposal.sourceRunId === 'string' ? proposal.sourceRunId : '',
    sourceCommandId: typeof proposal.sourceCommandId === 'string' ? proposal.sourceCommandId : '',
    message: typeof proposal.message === 'string' ? proposal.message : '',
    status: typeof proposal.status === 'string' && TRIGGER_PROPOSAL_STATUSES.has(proposal.status) ? proposal.status : 'pending',
    triggerRuleId: typeof proposal.triggerRuleId === 'string' ? proposal.triggerRuleId : '',
    preview: typeof proposal.preview === 'string' ? proposal.preview : '',
    ...(hostRuleType
      ? { ruleSpec: createTriggerRuleSpec(hostRuleType, actionId, proposal) }
      : {}),
    resultCode: typeof proposal.resultCode === 'string' ? proposal.resultCode : '',
    resultMessage: typeof proposal.resultMessage === 'string' ? proposal.resultMessage : '',
    rejectionReason: typeof proposal.rejectionReason === 'string' ? proposal.rejectionReason : '',
    createdAt: typeof proposal.createdAt === 'string' ? proposal.createdAt : '',
    updatedAt: typeof proposal.updatedAt === 'string' ? proposal.updatedAt : '',
    acceptedAt: typeof proposal.acceptedAt === 'string' ? proposal.acceptedAt : '',
    rejectedAt: typeof proposal.rejectedAt === 'string' ? proposal.rejectedAt : ''
  }
}

/**
 * @param {Partial<import('../shared/openpet-contracts').ActionTriggerProposalPreviewResult>} proposal
 * @returns {import('../shared/openpet-contracts').ActionTriggerProposalPreviewResult}
 */
const createActionTriggerProposalPreviewResult = (proposal = {}) => ({
  ok: Boolean(proposal.ok),
  applied: Boolean(proposal.applied),
  actionId: typeof proposal.actionId === 'string' ? proposal.actionId : '',
  type: typeof proposal.type === 'string' && TRIGGER_PROPOSAL_TYPES.has(proposal.type) ? proposal.type : 'unbound',
  binding: typeof proposal.binding === 'string' ? proposal.binding : '',
  code: typeof proposal.code === 'string' && TRIGGER_PROPOSAL_PREVIEW_CODES.has(proposal.code) ? proposal.code : 'no_binding_required',
  message: typeof proposal.message === 'string' ? proposal.message : '',
  ...(proposal.triggerRule !== undefined ? { triggerRule: createTriggerRuleItem(proposal.triggerRule) } : {}),
  ...(typeof proposal.triggerRuleId === 'string' ? { triggerRuleId: proposal.triggerRuleId } : {}),
  ...(typeof proposal.preview === 'string' ? { preview: proposal.preview } : {}),
  ...(typeof proposal.sourcePluginId === 'string' ? { sourcePluginId: proposal.sourcePluginId } : {}),
  ...(typeof proposal.sourceRunId === 'string' ? { sourceRunId: proposal.sourceRunId } : {}),
  ...(typeof proposal.sourceCommandId === 'string' ? { sourceCommandId: proposal.sourceCommandId } : {})
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
 * @param {Partial<import('../shared/openpet-contracts').UpdateAssetViewState> | undefined} asset
 * @returns {import('../shared/openpet-contracts').UpdateAssetViewState}
 */
const createUpdateAssetView = (asset = {}) => ({
  name: typeof asset.name === 'string' ? asset.name : '',
  url: typeof asset.url === 'string' ? asset.url : '',
  size: Number.isFinite(Number(asset.size)) ? Math.max(0, Math.round(Number(asset.size))) : 0,
  contentType: typeof asset.contentType === 'string' ? asset.contentType : ''
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
  assets: Array.isArray(result.assets)
    ? /** @type {import('../shared/openpet-contracts').UpdateAssetViewState[]} */ (result.assets.map((asset) => createUpdateAssetView(asset || {})))
    : [],
  checkedAt: typeof result.checkedAt === 'string' ? result.checkedAt : '',
  message: typeof result.message === 'string' ? result.message : ''
})

module.exports = {
  createAiConfigView,
  createActionFrameImportResult,
  createActionTriggerProposalPreviewResult,
  createActionsMutationResult,
  createAboutInfoView,
  createAboutUpdateInfo,
  createCatalogBlocklistResult,
  createCatalogView,
  createLocalHttpConfigView,
  createLocalHttpRuntimeView,
  createPetPackMutationResult,
  createPluginMutationResult,
  createServiceStatusView,
  createUpdateCheckView
}
