import { cloneAiConfig, cloneCatalog, cloneServiceStatus, cloneSettings, defaultAboutInfo, defaultActionsConfig, defaultAiConfig, defaultPetPacks, defaultServiceStatus, defaultSettings, defaultUpdateCheck } from '../lib/defaults.js'

const createDemoInspection = (actionId = 'wave') => ({
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

const createDemoCatalog = () => cloneCatalog({
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

const createDemoPluginReview = (item) => ({
  installMode: item.installed ? 'update' : 'install',
  existingVersion: item.installedVersion || '',
  riskLevel: item.installed ? 'review' : 'info',
  plugin: {
    id: item.id,
    name: item.name,
    version: item.version,
    permissions: item.permissions || [],
    commands: [{ id: 'demo', title: 'Demo command' }]
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

const createDemoPetPackReview = (item) => ({
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

const createDemoServiceStatus = () => cloneServiceStatus({
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

const createDefaultDemoState = () => ({
  settings: cloneSettings(defaultSettings),
  aiConfig: cloneAiConfig(defaultAiConfig),
  serviceStatus: createDemoServiceStatus(),
  catalog: createDemoCatalog()
})

const readDemoState = () => {
  if (typeof window === 'undefined') return createDefaultDemoState()
  try {
    const rawState = window.sessionStorage.getItem(demoStorageKey)
    if (!rawState) return createDefaultDemoState()
    const state = JSON.parse(rawState)
    return {
      settings: cloneSettings(state.settings),
      aiConfig: cloneAiConfig(state.aiConfig),
      serviceStatus: cloneServiceStatus(state.serviceStatus),
      catalog: cloneCatalog(state.catalog || createDemoCatalog())
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
const demoCatalogSelections = new Map()

const findDemoCatalogItem = (kind, itemId) => {
  const collection = kind === 'plugin' ? demoState.catalog.plugins : demoState.catalog.petPacks
  return collection.find((item) => item.id === itemId)
}

const markDemoCatalogItemInstalled = (selection) => {
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

const demoApi = {
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
  saveActionsConfig: async (config) => ({ animations: config }),
  deleteAction: async () => ({ animations: defaultActionsConfig }),
  listPetPacks: async () => defaultPetPacks,
  inspectPetPackDirectory: async () => ({ canceled: true }),
  clearPetPackSelection: async () => ({ ok: true }),
  importPetPack: async () => ({ petPacks: defaultPetPacks }),
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
  chat: async ({ message }) => ({ reply: `Echo: ${message}` }),
  getAiBehavior: async () => cloneAiConfig(demoState.aiConfig).behavior,
  saveAiBehavior: async (config) => {
    demoState.aiConfig = cloneAiConfig({ ...demoState.aiConfig, behavior: config })
    writeDemoState()
    return demoState.aiConfig.behavior
  },
  dryRunAiBehavior: async () => ({ matched: false, reason: 'demo' }),
  getPlugins: async () => [],
  setPluginEnabled: async (pluginId, enabled) => ({ id: pluginId, enabled }),
  savePluginConfig: async (pluginId, config) => ({ id: pluginId, config }),
  runPluginCommand: async () => ({ ok: true }),
  inspectPluginPackage: async () => ({ canceled: true }),
  clearPluginSelection: async () => ({ ok: true }),
  installPlugin: async () => ({ ok: true, plugins: [] }),
  updatePlugin: async () => ({ ok: true, plugins: [] }),
  uninstallPlugin: async () => ({ ok: true, plugins: [] }),
  getPluginLogs: async () => [],
  exportPluginLogs: async () => '[]',
  clearPluginLogs: async () => [],
  clearPluginStorage: async (pluginId) => ({ id: pluginId, storage: { keyCount: 0, byteSize: 2 } }),
  getServiceStatus: async () => cloneServiceStatus(demoState.serviceStatus),
  saveServiceConfig: async (config) => {
    demoState.serviceStatus = cloneServiceStatus({
      config,
      runtime: {
        ...demoState.serviceStatus.runtime,
        host: config.host || '127.0.0.1',
        port: config.port,
        enabled: config.enabled
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
  prepareCatalogInstall: async ({ kind, itemId } = {}) => {
    const item = findDemoCatalogItem(kind, itemId)
    if (!item) throw new Error('Catalog item not found')
    const selectionId = `demo-catalog-selection-${kind}-${itemId}`
    const selection = {
      kind,
      itemId,
      selectionId,
      ...(kind === 'plugin' ? { pluginReview: createDemoPluginReview(item) } : { petPackReview: createDemoPetPackReview(item) })
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
  addCatalogBlocklistEntry: async (entry = {}) => {
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
  removeCatalogBlocklistEntry: async (entry = {}) => {
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

export const controlCenterAPI = window.controlCenterAPI || demoApi
