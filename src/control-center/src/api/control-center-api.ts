import { cloneAiConfig, cloneCatalog, cloneServiceStatus, cloneSettings, defaultAboutInfo, defaultActionsConfig, defaultAiConfig, defaultPetPacks, defaultServiceStatus, defaultSettings, defaultUpdateCheck } from '../lib/defaults'
import type {
  ActionFrameInspectRequest,
  ActionFrameInspectionResult,
  ActionFrameImportRequest,
  ActionFrameReinspectRequest,
  AiChatRequest,
  AiConfigViewState,
  CatalogBlocklistEntry,
  CatalogInstallRequest,
  CatalogInstallSelection,
  CatalogPetPackEntry,
  CatalogPluginEntry,
  CatalogState,
  ControlCenterApi,
  ControlCenterSettings,
  JsonObject,
  PluginLogFilters,
  PluginPackageReviewViewState,
  PluginServiceRuntimeViewState,
  PluginViewState,
  ServiceStatusViewState
} from '../../../shared/openpet-contracts'

declare global {
  interface Window {
    controlCenterAPI?: ControlCenterApi
  }
}

interface DemoState {
  settings: ControlCenterSettings
  aiConfig: AiConfigViewState
  serviceStatus: ServiceStatusViewState
  catalog: CatalogState
  plugins: PluginViewState[]
  pluginLogs: Array<{
    id: string
    timestamp: string
    level: string
    pluginId: string
    commandId: string
    message: string
  }>
}

const createDemoInspection = (actionId = 'wave'): ActionFrameInspectionResult => ({
  canceled: false,
  selectionId: 'demo-selection',
  folderName: 'demo-wave',
  actionId,
  inspection: {
    valid: true,
    frameCount: 2,
    maxWidth: 8,
    maxHeight: 8,
    frames: [
      { fileName: '01_no_bg.png', width: 8, height: 8, hasAlpha: true },
      { fileName: '02_no_bg.png', width: 8, height: 8, hasAlpha: true }
    ],
    skippedFiles: [],
    errors: [],
    warnings: []
  }
})

const demoStorageKey = 'openpet.controlCenter.demoState'

const demoCatalogHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const createDemoCatalog = (): CatalogState => cloneCatalog({
  schemaVersion: 1,
  updatedAt: '2026-06-15T00:00:00.000Z',
  feedbackUrl: 'https://github.com/dengyie/OpenPet/issues',
  localBlocklist: {
    pluginIds: [],
    packIds: [],
    sha256: []
  },
  catalogBlocklist: {
    pluginIds: [],
    packIds: [],
    sha256: []
  },
  blocklist: {
    pluginIds: [],
    packIds: [],
    sha256: []
  },
  plugins: [
    {
      id: 'openpet.demo.weather',
      name: 'Demo Weather',
      version: '1.0.0',
      author: 'OpenPet',
      description: 'Shows a tiny weather companion message.',
      openpetApiVersion: '1.0',
      permissions: ['pet:say', 'network'],
      downloadable: true,
      installed: false,
      updateAvailable: false,
      sha256: demoCatalogHash,
      reportUrl: 'https://github.com/dengyie/OpenPet/issues',
      blockStatus: { blocked: false, reasons: [] }
    },
    {
      id: 'openpet.demo.pomodoro',
      name: 'Demo Pomodoro',
      version: '1.1.0',
      installedVersion: '1.0.0',
      author: 'OpenPet',
      description: 'A focus timer plugin with a catalog update available.',
      openpetApiVersion: '1.0',
      permissions: ['pet:say', 'storage'],
      downloadable: true,
      installed: true,
      updateAvailable: true,
      sha256: demoCatalogHash.replace('0', '1'),
      reportUrl: 'https://github.com/dengyie/OpenPet/issues',
      blockStatus: { blocked: false, reasons: [] }
    }
  ],
  petPacks: [
    {
      id: 'openpet.demo.pixel-cat',
      displayName: 'Demo Pixel Cat',
      version: '1.0.0',
      author: 'OpenPet',
      description: 'A small catalog pet pack sample for UI regression.',
      actionCount: 3,
      downloadable: true,
      installed: false,
      updateAvailable: false,
      sha256: demoCatalogHash.replace('1', '2'),
      blockStatus: { blocked: false, reasons: [] }
    }
  ]
})

const createDemoPluginReview = (item: CatalogPluginEntry): PluginPackageReviewViewState => ({
  installMode: item.installed ? 'update' : 'install',
  existingVersion: item.installedVersion || '',
  riskLevel: item.installed ? 'review' : 'info',
  plugin: {
    id: item.id,
    name: item.name,
    version: item.version,
    permissions: item.permissions || [],
    commands: [{ id: 'demo', title: 'Demo command' }],
    entries: {
      commands: [{ id: 'weather-report', title: 'Weather Report', command: 'node ./commands/weather-report.js', cwd: '.' }],
      services: [{ id: 'weather-companion', title: 'Weather Companion', command: 'npm run companion', cwd: '.' }],
      dashboards: [{ id: 'weather-dashboard', title: 'Weather Dashboard', url: 'http://127.0.0.1:8787' }]
    },
    config: 'config.schema.json',
    configSchema: 'config.schema.json',
    manifest: {
      dataLocations: [{ path: 'OPENPET_DATA_DIR', description: 'Demo weather report history.' }]
    },
    assets: ['assets/weather-card.html']
  },
  permissionDiff: {
    permissions: {
      added: item.installed ? ['storage'] : item.permissions || [],
      removed: [],
      unchanged: item.installed ? ['pet:say'] : []
    },
    networkAllowlist: {
      added: item.permissions?.includes('network') ? ['api.weather.example'] : [],
      removed: [],
      unchanged: []
    }
  },
  signature: {
    label: 'Unsigned local demo',
    errors: []
  },
  blockStatus: item.blockStatus || { blocked: false, reasons: [] },
  fileCount: 4,
  byteSize: item.installed ? 18432 : 12288,
  packageHash: item.sha256 || demoCatalogHash
})

const createDemoPetPackReview = (item: CatalogPetPackEntry) => ({
  pack: {
    id: item.id,
    displayName: item.displayName,
    version: item.version,
    actionCount: item.actionCount || 0,
    defaultAction: 'idle',
    clickAction: 'wave',
    packageHash: item.sha256 || demoCatalogHash,
    blockStatus: item.blockStatus || { blocked: false, reasons: [] }
  }
})

const demoManualPluginReview = {
  canceled: false,
  selectionId: 'demo-manual-plugin-selection',
  sourceType: 'zip',
  installMode: 'install',
  existingVersion: '',
  riskLevel: 'review',
  plugin: {
    id: 'openpet.demo.manual-review',
    name: 'Demo Manual Review',
    version: '1.0.0',
    description: 'A local package sample for plugin install review automation.',
    permissions: ['pet:say', 'storage'],
    network: { allowlist: [] },
    commands: [{ id: 'hello', title: 'Say hello' }],
    entries: {
      commands: [{ id: 'hello', title: 'Say hello', command: 'node ./index.js', cwd: '.' }],
      services: [{ id: 'manual-companion', title: 'Manual Companion', command: 'npm run companion', cwd: '.' }],
      dashboards: [{ id: 'manual-dashboard', title: 'Manual Dashboard', url: 'http://127.0.0.1:8787' }]
    },
    main: 'index.js',
    config: 'config.schema.json',
    configSchema: 'config.schema.json',
    manifest: {
      dataLocations: [{ path: 'OPENPET_DATA_DIR', description: 'Demo local data disclosure.' }]
    },
    assets: ['assets/manual-card.html']
  },
  permissionDiff: {
    permissions: {
      added: ['pet:say', 'storage'],
      removed: [],
      unchanged: []
    },
    networkAllowlist: {
      added: [],
      removed: [],
      unchanged: []
    }
  },
  signature: {
    status: 'unsigned',
    label: 'Unsigned plugin',
    signer: '',
    algorithm: '',
    verified: false,
    errors: []
  },
  blockStatus: { blocked: false, reasons: [] },
  packageHash: demoCatalogHash.replace('2', '3'),
  fileCount: 3,
  byteSize: 9216,
  requiresReview: false
} satisfies PluginPackageReviewViewState

const createDemoManualPlugin = (): PluginViewState => ({
  id: demoManualPluginReview.plugin.id,
  name: demoManualPluginReview.plugin.name,
  version: demoManualPluginReview.plugin.version,
  source: 'local',
  enabled: false,
  runnable: true,
  permissions: demoManualPluginReview.plugin.permissions,
  commands: demoManualPluginReview.plugin.commands,
  entries: demoManualPluginReview.plugin.entries,
  configSchema: { properties: [] },
  config: {},
  storage: { keyCount: 0, byteSize: 2, valid: true },
  signatureStatus: { label: demoManualPluginReview.signature.label }
})

const createDemoPluginLog = (pluginId: string, message: string, commandId = '') => ({
  id: `${pluginId}-${message}-${Date.now()}`,
  timestamp: new Date().toISOString(),
  level: 'info',
  pluginId,
  commandId,
  message
})

const createDemoServiceStatus = (): ServiceStatusViewState => cloneServiceStatus({
  ...defaultServiceStatus,
  config: {
    ...defaultServiceStatus.config,
    enabled: true,
    port: 4317,
    token: 'demo-token'
  },
  runtime: {
    ...defaultServiceStatus.runtime,
    enabled: true,
    port: 4317,
    mcp: {
      activeSessions: 2,
      sessionTtlMs: 300000
    }
  }
})

const createDefaultDemoState = (): DemoState => ({
  settings: cloneSettings(defaultSettings),
  aiConfig: cloneAiConfig({
    ...defaultAiConfig,
    behavior: {
      ...defaultAiConfig.behavior,
      decisions: [
        {
          id: 1,
          timestamp: '2026-06-16T00:00:00.000Z',
          matched: true,
          type: 'playAction',
          ruleId: 'demo-rule',
          reason: 'matched rule demo-rule',
          actionId: 'wave',
          intent: 'greeting',
          inputSummary: 'reply:12 chars · intent:greeting',
          replay: { reply: 'hello there', behaviorIntent: { intent: 'greeting', actionId: 'wave', confidence: 0.9 } }
        }
      ]
    }
  }),
  serviceStatus: createDemoServiceStatus(),
  catalog: createDemoCatalog(),
  plugins: [],
  pluginLogs: []
})

const readDemoState = (): DemoState => {
  if (typeof window === 'undefined') return createDefaultDemoState()
  try {
    const rawState = window.sessionStorage.getItem(demoStorageKey)
    if (!rawState) return createDefaultDemoState()
    const state = JSON.parse(rawState)
    return {
      settings: cloneSettings(state.settings),
      aiConfig: cloneAiConfig(state.aiConfig),
      serviceStatus: cloneServiceStatus(state.serviceStatus),
      catalog: cloneCatalog(state.catalog || createDemoCatalog()),
      plugins: Array.isArray(state.plugins) ? state.plugins : [],
      pluginLogs: Array.isArray(state.pluginLogs) ? state.pluginLogs : []
    }
  } catch {
    return createDefaultDemoState()
  }
}

const writeDemoState = () => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(demoStorageKey, JSON.stringify(demoState))
}

const demoState = readDemoState()
const demoCatalogSelections = new Map<string, CatalogInstallSelection>()
let demoManualPluginSelection: string | null = null

const clonePluginEntries = (entries: PluginViewState['entries']): PluginViewState['entries'] => ({
  commands: Array.isArray(entries?.commands) ? entries.commands.map((command) => ({ ...command })) : [],
  services: Array.isArray(entries?.services)
    ? entries.services.map((service) => ({
        ...service,
        platforms: service.platforms
          ? Object.fromEntries(Object.entries(service.platforms).map(([platform, override]) => [platform, { ...override }]))
          : undefined,
        health: service.health ? { ...service.health } : service.health,
        runtime: service.runtime ? { ...service.runtime } : service.runtime
      }))
    : [],
  dashboards: Array.isArray(entries?.dashboards) ? entries.dashboards.map((dashboard) => ({ ...dashboard })) : []
})

const updateDemoPluginServiceRuntime = (pluginId: string, serviceId: string, runtime: PluginServiceRuntimeViewState) => {
  let found = false
  demoState.plugins = demoState.plugins.map((plugin) => {
    if (plugin.id !== pluginId) return plugin
    return {
      ...plugin,
      entries: {
        ...plugin.entries,
        services: (plugin.entries?.services || []).map((service) => (
          service.id === serviceId
            ? (found = true, { ...service, runtime: { ...runtime } })
            : service
        ))
      }
    }
  })
  if (!found) throw new Error(`Plugin service not found: ${serviceId}`)
  return { ...runtime }
}

const cloneDemoPlugins = (): PluginViewState[] => demoState.plugins.map((plugin) => ({
  ...plugin,
  permissions: Array.isArray(plugin.permissions) ? [...plugin.permissions] : [],
  commands: Array.isArray(plugin.commands) ? plugin.commands.map((command) => ({ ...command })) : [],
  entries: clonePluginEntries(plugin.entries),
  configSchema: {
    ...(plugin.configSchema || {}),
    properties: Array.isArray(plugin.configSchema?.properties) ? plugin.configSchema.properties : []
  },
  config: { ...(plugin.config || {}) },
  storage: { ...(plugin.storage || {}) },
  signatureStatus: { ...(plugin.signatureStatus || {}) }
}))

const cloneDemoPluginLogs = (filters: PluginLogFilters = {}) => demoState.pluginLogs.filter((log) => {
  if (filters.pluginId && log.pluginId !== filters.pluginId) return false
  if (filters.level && log.level !== filters.level) return false
  if (filters.query && !`${log.pluginId} ${log.commandId} ${log.message}`.toLowerCase().includes(String(filters.query).toLowerCase())) return false
  return true
}).map((log) => ({ ...log }))

const findDemoCatalogItem = (kind: CatalogInstallRequest['kind'], itemId: string) => {
  const collection = kind === 'plugin' ? demoState.catalog.plugins : demoState.catalog.petPacks
  return collection.find((item) => item.id === itemId)
}

const markDemoCatalogItemInstalled = (selection: CatalogInstallSelection): CatalogState => {
  const collectionKey = selection.kind === 'plugin' ? 'plugins' : 'petPacks'
  demoState.catalog = cloneCatalog({
    ...demoState.catalog,
    [collectionKey]: demoState.catalog[collectionKey].map((item) => (
      item.id === selection.itemId
        ? { ...item, installed: true, installedVersion: item.version, updateAvailable: false }
        : item
    ))
  })
  writeDemoState()
  return cloneCatalog(demoState.catalog)
}

const demoApi: ControlCenterApi = {
  getSettings: async () => cloneSettings(demoState.settings),
  saveSettings: async (settings) => {
    demoState.settings = cloneSettings(settings)
    writeDemoState()
    return cloneSettings(demoState.settings)
  },
  previewScale: () => {},
  getActions: async () => defaultActionsConfig,
  inspectActionFrames: async ({ actionId } = {}) => createDemoInspection(actionId),
  reinspectActionFrames: async ({ selectionId, actionId } = {}) => ({ ...createDemoInspection(actionId), selectionId: selectionId || 'demo-selection' }),
  clearActionFrameSelection: async () => ({ ok: true }),
  importActionFrames: async ({ actionId, label } = {}) => ({ ok: true, result: { importedAction: { id: actionId, label: label || actionId } }, animations: defaultActionsConfig }),
  saveActionsConfig: async (config) => ({ animations: { ...defaultActionsConfig, ...config } }),
  deleteAction: async () => ({ animations: defaultActionsConfig }),
  listPetPacks: async () => defaultPetPacks,
  inspectPetPackDirectory: async () => ({ canceled: true }),
  clearPetPackSelection: async () => ({ ok: true }),
  importPetPack: async () => ({ petPacks: defaultPetPacks }),
  exportPetPack: async (packId) => ({ ok: true, packId, fileName: `${packId}.openpet-pet.zip` }),
  setActivePetPack: async () => ({ petPacks: defaultPetPacks, animations: defaultActionsConfig }),
  removePetPack: async () => ({ petPacks: defaultPetPacks }),
  getAiConfig: async () => cloneAiConfig(demoState.aiConfig),
  saveAiConfig: async (config) => {
    demoState.aiConfig = cloneAiConfig({ ...demoState.aiConfig, ...config })
    writeDemoState()
    return cloneAiConfig(demoState.aiConfig)
  },
  saveAiApiKey: async () => {
    demoState.aiConfig = cloneAiConfig({ ...demoState.aiConfig, apiKeyRef: 'ai.default', hasApiKey: true })
    writeDemoState()
    return { apiKeyRef: 'ai.default', hasApiKey: true }
  },
  testAiConnection: async () => ({ ok: true, reply: 'ok' }),
  getAiConversation: async () => [],
  chat: async ({ message }) => {
    const decisions = Array.isArray(demoState.aiConfig.behavior?.decisions)
      ? demoState.aiConfig.behavior.decisions
      : []
    const nextId = decisions.reduce((max, decision) => Math.max(max, Number(decision.id) || 0), 0) + 1
    demoState.aiConfig = cloneAiConfig({
      ...demoState.aiConfig,
      behavior: {
        ...demoState.aiConfig.behavior,
        decisions: [
          {
            id: nextId,
            timestamp: new Date().toISOString(),
            matched: true,
            type: 'playAction',
            ruleId: 'demo-chat',
            reason: 'matched rule demo-chat',
            actionId: 'wave',
            intent: 'greeting',
            inputSummary: `reply:${String(message || '').length} chars · intent:greeting`,
            replay: { reply: `Echo: ${message}`, behaviorIntent: { intent: 'greeting', actionId: 'wave', confidence: 0.8 } }
          },
          ...decisions
        ].slice(0, 50)
      }
    })
    writeDemoState()
    return { reply: `Echo: ${message}`, behavior: { matched: true, type: 'playAction', actionId: 'wave' }, action: { actionId: 'wave', label: 'Wave' } }
  },
  getAiBehavior: async () => cloneAiConfig(demoState.aiConfig).behavior,
  saveAiBehavior: async (config) => {
    demoState.aiConfig = cloneAiConfig({ ...demoState.aiConfig, behavior: config })
    writeDemoState()
    return demoState.aiConfig.behavior
  },
  dryRunAiBehavior: async ({ reply }) => ({ matched: Boolean(reply), reason: reply ? 'demo dry-run matched' : 'demo dry-run empty', actionId: reply ? 'wave' : '' }),
  replayAiBehaviorDecision: async (decisionId) => ({ replayOf: decisionId, matched: true, reason: 'demo replay matched', actionId: 'wave' }),
  exportAiBehaviorDiagnostics: async () => JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    decisions: cloneAiConfig(demoState.aiConfig).behavior.decisions.map(({ replay: _replay, ...decision }) => ({
      ...decision,
      replayRedacted: true
    }))
  }, null, 2),
  clearAiBehaviorDecisions: async () => {
    demoState.aiConfig = cloneAiConfig({
      ...demoState.aiConfig,
      behavior: {
        ...demoState.aiConfig.behavior,
        decisions: []
      }
    })
    writeDemoState()
    return []
  },
  getPlugins: async () => cloneDemoPlugins(),
  setPluginEnabled: async (pluginId, enabled) => {
    demoState.plugins = demoState.plugins.map((plugin) => (
      plugin.id === pluginId
        ? {
            ...plugin,
            enabled,
            entries: {
              ...plugin.entries,
              services: enabled
                ? plugin.entries.services
                : plugin.entries.services.map((service) => ({
                    ...service,
                    runtime: service.runtime?.status === 'running'
                      ? { ...service.runtime, status: 'stopped', stoppedAt: new Date().toISOString() }
                      : service.runtime
                  }))
            }
          }
        : plugin
    ))
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, enabled ? 'Plugin enabled' : 'Plugin disabled'),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    return { id: pluginId, enabled }
  },
  savePluginConfig: async (pluginId, config) => ({ id: pluginId, config }),
  runPluginCommand: async (pluginId, commandId) => {
    demoState.pluginLogs = [createDemoPluginLog(pluginId, 'Command completed', commandId), ...demoState.pluginLogs]
    writeDemoState()
    return { ok: true }
  },
  openPluginDashboard: async (pluginId, dashboardId) => {
    const plugin = demoState.plugins.find((candidate) => candidate.id === pluginId)
    const dashboard = plugin?.entries?.dashboards?.find((candidate) => candidate.id === dashboardId)
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, 'Dashboard opened', `dashboard:${dashboardId}`),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    return { ok: true, pluginId, dashboardId, url: dashboard?.url || '' }
  },
  startPluginService: async (pluginId, serviceId) => {
    const runtime = updateDemoPluginServiceRuntime(pluginId, serviceId, {
      status: 'running',
      pid: 4321,
      startedAt: new Date().toISOString()
    })
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, 'Service started', `service:${serviceId}`),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    return { ok: true, pluginId, serviceId, runtime }
  },
  stopPluginService: async (pluginId, serviceId) => {
    const runtime = updateDemoPluginServiceRuntime(pluginId, serviceId, {
      status: 'stopped',
      stoppedAt: new Date().toISOString()
    })
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, 'Service stopped', `service:${serviceId}`),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    return { ok: true, pluginId, serviceId, runtime }
  },
  inspectPluginPackage: async () => {
    demoManualPluginSelection = demoManualPluginReview.selectionId
    return {
      ...demoManualPluginReview,
      plugin: {
        ...demoManualPluginReview.plugin,
        commands: demoManualPluginReview.plugin.commands.map((command) => ({ ...command })),
        entries: clonePluginEntries(demoManualPluginReview.plugin.entries)
      },
      permissionDiff: {
        permissions: { ...demoManualPluginReview.permissionDiff.permissions },
        networkAllowlist: { ...demoManualPluginReview.permissionDiff.networkAllowlist }
      },
      signature: { ...demoManualPluginReview.signature },
      blockStatus: { ...demoManualPluginReview.blockStatus }
    }
  },
  clearPluginSelection: async (selectionId) => {
    if (!selectionId || demoManualPluginSelection === selectionId) demoManualPluginSelection = null
    return { ok: true }
  },
  installPlugin: async (selectionId) => {
    if (selectionId !== demoManualPluginSelection) throw new Error('Selected plugin package is no longer available')
    const nextPlugin = createDemoManualPlugin()
    demoState.plugins = [
      nextPlugin,
      ...demoState.plugins.filter((plugin) => plugin.id !== nextPlugin.id)
    ]
    demoState.pluginLogs = [
      createDemoPluginLog(nextPlugin.id, 'Plugin installed'),
      ...demoState.pluginLogs
    ]
    demoManualPluginSelection = null
    writeDemoState()
    return { ok: true, pluginId: nextPlugin.id, installMode: 'install', disabled: true, plugins: cloneDemoPlugins() }
  },
  updatePlugin: async () => ({ ok: true, plugins: [] }),
  uninstallPlugin: async () => ({ ok: true, plugins: [] }),
  getPluginLogs: async (filters) => cloneDemoPluginLogs(filters),
  exportPluginLogs: async (filters) => JSON.stringify(cloneDemoPluginLogs(filters), null, 2),
  clearPluginLogs: async () => {
    demoState.pluginLogs = []
    writeDemoState()
    return []
  },
  clearPluginStorage: async (pluginId) => ({ id: pluginId, storage: { keyCount: 0, byteSize: 2 } }),
  getServiceStatus: async () => cloneServiceStatus(demoState.serviceStatus),
  saveServiceConfig: async (config) => {
    const nextConfig = {
      ...demoState.serviceStatus.config,
      ...config
    }
    demoState.serviceStatus = cloneServiceStatus({
      config: nextConfig,
      runtime: {
        ...demoState.serviceStatus.runtime,
        host: nextConfig.host || '127.0.0.1',
        port: nextConfig.port,
        enabled: nextConfig.enabled
      }
    })
    writeDemoState()
    return cloneServiceStatus(demoState.serviceStatus)
  },
  getServiceLogs: async () => [],
  exportServiceLogs: async () => '[]',
  clearServiceLogs: async () => [],
  rotateServiceToken: async () => {
    demoState.serviceStatus = cloneServiceStatus({
      ...demoState.serviceStatus,
      config: { ...demoState.serviceStatus.config, token: 'demo-token-rotated' },
      runtime: {
        ...demoState.serviceStatus.runtime,
        mcp: { ...demoState.serviceStatus.runtime.mcp, activeSessions: 0 }
      }
    })
    writeDemoState()
    return cloneServiceStatus(demoState.serviceStatus)
  },
  revokeMcpSessions: async () => {
    demoState.serviceStatus = cloneServiceStatus({
      ...demoState.serviceStatus,
      runtime: {
        ...demoState.serviceStatus.runtime,
        mcp: { ...demoState.serviceStatus.runtime.mcp, activeSessions: 0 }
      }
    })
    writeDemoState()
    return cloneServiceStatus(demoState.serviceStatus)
  },
  getAboutInfo: async () => defaultAboutInfo,
  checkForUpdates: async () => ({
    ...defaultUpdateCheck,
    status: 'not-configured',
    message: 'Update feed is not configured.'
  }),
  getCatalog: async () => cloneCatalog(demoState.catalog),
  prepareCatalogInstall: async ({ kind, itemId }) => {
    const item = findDemoCatalogItem(kind, itemId)
    if (!item) throw new Error('Catalog item not found')
    const selectionId = `demo-catalog-selection-${kind}-${itemId}`
    const selection: CatalogInstallSelection = kind === 'plugin' ? {
      kind,
      itemId,
      selectionId,
      sourcePackageHash: item.sha256 || demoCatalogHash,
      pluginReview: createDemoPluginReview(item as CatalogPluginEntry)
    } : {
      kind,
      itemId,
      selectionId,
      sourcePackageHash: item.sha256 || demoCatalogHash,
      petPackReview: createDemoPetPackReview(item as CatalogPetPackEntry)
    }
    demoCatalogSelections.set(selectionId, selection)
    return selection
  },
  installCatalogSelection: async (selectionId) => {
    const selection = demoCatalogSelections.get(selectionId)
    if (!selection) throw new Error('Catalog selection is no longer available')
    demoCatalogSelections.delete(selectionId)
    return { ok: true, catalog: markDemoCatalogItemInstalled(selection) }
  },
  clearCatalogSelection: async (selectionId) => {
    demoCatalogSelections.delete(selectionId)
    return { ok: true }
  },
  addCatalogBlocklistEntry: async (entry) => {
    const blocklistKey = entry.type === 'packId' ? 'packIds' : entry.type === 'sha256' ? 'sha256' : 'pluginIds'
    const value = String(entry.value || '').trim()
    const localBlocklist = {
      ...demoState.catalog.localBlocklist,
      [blocklistKey]: value && !demoState.catalog.localBlocklist[blocklistKey].includes(value)
        ? [...demoState.catalog.localBlocklist[blocklistKey], value]
        : demoState.catalog.localBlocklist[blocklistKey]
    }
    demoState.catalog = cloneCatalog({ ...demoState.catalog, localBlocklist })
    writeDemoState()
    return { catalog: cloneCatalog(demoState.catalog), blocklist: demoState.catalog.localBlocklist }
  },
  removeCatalogBlocklistEntry: async (entry) => {
    const blocklistKey = entry.type === 'packId' ? 'packIds' : entry.type === 'sha256' ? 'sha256' : 'pluginIds'
    const value = String(entry.value || '').trim()
    const localBlocklist = {
      ...demoState.catalog.localBlocklist,
      [blocklistKey]: demoState.catalog.localBlocklist[blocklistKey].filter((candidate) => candidate !== value)
    }
    demoState.catalog = cloneCatalog({ ...demoState.catalog, localBlocklist })
    writeDemoState()
    return { catalog: cloneCatalog(demoState.catalog), blocklist: demoState.catalog.localBlocklist }
  },
  close: () => {}
}

export const controlCenterAPI: ControlCenterApi = window.controlCenterAPI || demoApi
