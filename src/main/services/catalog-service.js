const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { compareVersions } = require('./about-service')
const { getBlockStatus, mergeBlocklists, normalizeBlocklist } = require('./ecosystem-policy')
const { readBoundedResponseBuffer } = require('./bounded-response-body')

const CATALOG_SELECTION_TTL_MS = 10 * 60 * 1000
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 15000
const SAFE_PLUGIN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/
const SAFE_PACK_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const createSelectionId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const createAbortController = () => (typeof AbortController === 'undefined' ? null : new AbortController())

const withTimeout = async (promise, { controller, timeoutMs, message }) => {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort?.()
      reject(new Error(message))
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

const normalizeOptionalHttpsUrl = (value) => {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''
  try {
    const parsedUrl = new URL(rawValue)
    return parsedUrl.protocol === 'https:' ? parsedUrl.toString() : ''
  } catch (_) {
    return ''
  }
}

const normalizeStringArray = (values = []) => (Array.isArray(values) ? values : [])
  .map((value) => String(value || '').trim())
  .filter(Boolean)

const normalizeCatalogId = (value, fieldName, pattern) => {
  const normalized = String(value || '').trim()
  if (!pattern.test(normalized)) throw new Error(`Catalog ${fieldName} must be a safe id`)
  return normalized
}

const normalizeDownload = (entry = {}) => {
  const packageUrl = String(entry.packageUrl || '').trim()
  const sha256 = String(entry.sha256 || '').trim().toLowerCase()
  if (!packageUrl && !sha256) return { packageUrl: '', sha256: '' }
  if (!packageUrl || !sha256) throw new Error('Catalog downloadable entries must include packageUrl and sha256')
  const parsedUrl = new URL(packageUrl)
  if (parsedUrl.protocol !== 'https:') throw new Error('Catalog packageUrl must use HTTPS')
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Catalog sha256 must be a 64-character hex digest')
  return { packageUrl: parsedUrl.toString(), sha256 }
}

const normalizePluginEntry = (entry = {}) => {
  if (!entry.id) throw new Error('Catalog plugin id is required')
  const id = normalizeCatalogId(entry.id, 'plugin id', SAFE_PLUGIN_ID_PATTERN)
  const download = normalizeDownload(entry)
  return {
    kind: 'plugin',
    id,
    name: String(entry.name || id),
    version: String(entry.version || '0.0.0'),
    description: String(entry.description || ''),
    author: String(entry.author || ''),
    openpetApiVersion: String(entry.openpetApiVersion || entry.ibotApiVersion || ''),
    permissions: normalizeStringArray(entry.permissions),
    networkAllowlist: normalizeStringArray(entry.networkAllowlist),
    reportUrl: normalizeOptionalHttpsUrl(entry.reportUrl),
    ...download
  }
}

const normalizePetPackEntry = (entry = {}) => {
  if (!entry.id) throw new Error('Catalog pet pack id is required')
  const id = normalizeCatalogId(entry.id, 'pet pack id', SAFE_PACK_ID_PATTERN)
  const download = normalizeDownload(entry)
  return {
    kind: 'pet-pack',
    id,
    displayName: String(entry.displayName || entry.name || id),
    version: String(entry.version || '0.0.0'),
    description: String(entry.description || ''),
    author: String(entry.author || ''),
    petPackSchemaVersion: Number(entry.petPackSchemaVersion || 1),
    actionCount: Number(entry.actionCount || 0),
    previewImage: normalizeOptionalHttpsUrl(entry.previewImage),
    reportUrl: normalizeOptionalHttpsUrl(entry.reportUrl),
    ...download
  }
}

const normalizeCatalog = (raw = {}) => ({
  schemaVersion: Number(raw.schemaVersion || 1),
  updatedAt: String(raw.updatedAt || ''),
  feedbackUrl: String(raw.feedbackUrl || ''),
  blocklist: normalizeBlocklist(raw.blocklist),
  plugins: (Array.isArray(raw.plugins) ? raw.plugins : []).map(normalizePluginEntry),
  petPacks: (Array.isArray(raw.petPacks) ? raw.petPacks : []).map(normalizePetPackEntry)
})

const readCatalogFile = (catalogPath) => {
  try {
    if (!catalogPath || !fs.existsSync(catalogPath)) return normalizeCatalog()
    return normalizeCatalog(JSON.parse(fs.readFileSync(catalogPath, 'utf-8')))
  } catch (error) {
    throw new Error(`Catalog file is invalid: ${error.message}`)
  }
}

const createCatalogService = ({
  settingsService,
  pluginInstallService,
  pluginService,
  petPackService,
  catalogPath,
  fetchImpl = globalThis.fetch,
  tempRoot = os.tmpdir(),
  maxPackageBytes = MAX_PACKAGE_BYTES,
  downloadTimeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS
}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!pluginInstallService) throw new Error('pluginInstallService is required')
  if (!pluginService) throw new Error('pluginService is required')
  if (!petPackService) throw new Error('petPackService is required')

  const pendingSelections = new Map()

  const getLocalBlocklist = () => normalizeBlocklist(settingsService.get().ecosystem?.blocklist)

  const getCatalog = () => readCatalogFile(catalogPath)

  const getCombinedBlocklist = () => mergeBlocklists(getCatalog().blocklist, getLocalBlocklist())

  const getPluginBlockStatus = ({ id, sha256, sourceSha256, packageHash } = {}) => getBlockStatus({ kind: 'plugin', id, sha256, sourceSha256, packageHash }, getCombinedBlocklist())

  const getPetPackBlockStatus = ({ id, sha256, sourceSha256, packageHash } = {}) => getBlockStatus({ kind: 'pet-pack', id, sha256, sourceSha256, packageHash }, getCombinedBlocklist())

  const assertNotBlocked = (candidate) => {
    const status = candidate.kind === 'plugin'
      ? getPluginBlockStatus(candidate)
      : getPetPackBlockStatus(candidate)
    if (status.blocked) throw new Error(`Catalog item is blocked: ${status.reasons.join(', ')}`)
    return status
  }

  const saveLocalBlocklist = (blocklist) => {
    const settings = settingsService.get()
    const normalized = normalizeBlocklist(blocklist)
    settingsService.save({
      ...settings,
      ecosystem: {
        ...(settings.ecosystem || {}),
        blocklist: normalized
      }
    })
    return normalized
  }

  const addBlocklistEntry = ({ type, value } = {}) => {
    const current = getLocalBlocklist()
    const key = type === 'pluginId' ? 'pluginIds' : type === 'packId' ? 'packIds' : type === 'sha256' ? 'sha256' : ''
    if (!key) throw new Error('Blocklist type must be pluginId, packId, or sha256')
    return saveLocalBlocklist({ ...current, [key]: [...current[key], value] })
  }

  const removeBlocklistEntry = ({ type, value } = {}) => {
    const current = getLocalBlocklist()
    const key = type === 'pluginId' ? 'pluginIds' : type === 'packId' ? 'packIds' : type === 'sha256' ? 'sha256' : ''
    if (!key) throw new Error('Blocklist type must be pluginId, packId, or sha256')
    const normalizedValue = String(value || '').trim().toLowerCase()
    return saveLocalBlocklist({
      ...current,
      [key]: current[key].filter((entry) => entry.toLowerCase() !== normalizedValue)
    })
  }

  const annotatePlugin = (entry, installedPlugins) => {
    const installed = installedPlugins.get(entry.id)
    const blockStatus = getPluginBlockStatus({ id: entry.id, sha256: entry.sha256, packageHash: installed?.packageHash, sourceSha256: installed?.sourcePackageHash })
    return {
      ...entry,
      installed: Boolean(installed),
      installedVersion: installed?.version || '',
      updateAvailable: Boolean(installed && compareVersions(entry.version, installed.version) > 0),
      blockStatus,
      downloadable: Boolean(entry.packageUrl && entry.sha256)
    }
  }

  const annotatePetPack = (entry, installedPacks) => {
    const installed = installedPacks.get(entry.id)
    const blockStatus = getPetPackBlockStatus({ id: entry.id, sha256: entry.sha256, packageHash: installed?.packageHash, sourceSha256: installed?.sourcePackageHash })
    return {
      ...entry,
      installed: Boolean(installed),
      installedVersion: installed?.version || '',
      updateAvailable: Boolean(installed && compareVersions(entry.version, installed.version) > 0),
      blockStatus,
      downloadable: Boolean(entry.packageUrl && entry.sha256)
    }
  }

  const listCatalog = () => {
    const catalog = getCatalog()
    const installedPlugins = new Map(pluginService.listPlugins().map((plugin) => [plugin.id, plugin]))
    const installedPacks = new Map(petPackService.listPacks().packs.map((pack) => [pack.id, pack]))
    return {
      schemaVersion: catalog.schemaVersion,
      updatedAt: catalog.updatedAt,
      feedbackUrl: catalog.feedbackUrl,
      localBlocklist: getLocalBlocklist(),
      catalogBlocklist: catalog.blocklist,
      blocklist: getCombinedBlocklist(),
      plugins: catalog.plugins.map((entry) => annotatePlugin(entry, installedPlugins)),
      petPacks: catalog.petPacks.map((entry) => annotatePetPack(entry, installedPacks))
    }
  }

  const getCatalogEntry = (kind, itemId) => {
    const catalog = getCatalog()
    const entries = kind === 'plugin' ? catalog.plugins : catalog.petPacks
    const entry = entries.find((candidate) => candidate.id === itemId)
    if (!entry) throw new Error(`Catalog item not found: ${kind}/${itemId}`)
    if (!entry.downloadable && !(entry.packageUrl && entry.sha256)) throw new Error('Catalog item is not downloadable')
    return entry
  }

  const downloadPackage = async (entry) => {
    if (typeof fetchImpl !== 'function') throw new Error('Catalog download is not available')
    const controller = createAbortController()
    const response = await withTimeout(fetchImpl(entry.packageUrl, {
      method: 'GET',
      headers: { Accept: 'application/octet-stream' },
      signal: controller?.signal
    }), { controller, timeoutMs: downloadTimeoutMs, message: 'Catalog download timed out' })
    if (!response?.ok) throw new Error(`Catalog download failed with HTTP ${response?.status || 'unknown'}`)
    const buffer = await withTimeout(readBoundedResponseBuffer(response, {
      maxBytes: maxPackageBytes,
      sizeErrorMessage: `Catalog package exceeds ${maxPackageBytes} bytes`,
      controller
    }), { controller, timeoutMs: downloadTimeoutMs, message: 'Catalog package read timed out' })
    const digest = hashBuffer(buffer)
    if (digest !== entry.sha256) throw new Error('Catalog package sha256 does not match')
    assertNotBlocked({ kind: entry.kind, id: entry.id, sha256: digest })
    const packagePath = path.join(fs.mkdtempSync(path.join(tempRoot, 'openpet-catalog-package-')), `${entry.id}.zip`)
    fs.writeFileSync(packagePath, buffer)
    return { packagePath, sha256: digest }
  }

  const cleanupSelection = (selection) => {
    if (!selection) return
    if (selection.pluginSelectionId) pluginInstallService.clearPendingSelection(selection.pluginSelectionId)
    if (selection.petPackSelectionId) petPackService.clearPendingSelection(selection.petPackSelectionId)
    if (selection.cleanupPath) fs.rmSync(selection.cleanupPath, { recursive: true, force: true })
    if (selection.packagePath) fs.rmSync(path.dirname(selection.packagePath), { recursive: true, force: true })
  }

  const pruneSelections = () => {
    const now = Date.now()
    for (const [selectionId, selection] of pendingSelections.entries()) {
      if (selection.expiresAt <= now) {
        cleanupSelection(selection)
        pendingSelections.delete(selectionId)
      }
    }
  }

  const preparePluginInstall = async (entry) => {
    const downloaded = await downloadPackage(entry)
    let review
    try {
      review = await pluginInstallService.inspectPluginPackage(downloaded.packagePath)
      if (review.plugin?.id !== entry.id) throw new Error('Catalog plugin id does not match package manifest')
      const blockStatus = getPluginBlockStatus({ id: entry.id, sha256: review.packageHash, sourceSha256: downloaded.sha256 })
      if (blockStatus.blocked) throw new Error(`Catalog item is blocked: ${blockStatus.reasons.join(', ')}`)
      const selectionId = createSelectionId()
      pendingSelections.set(selectionId, {
        kind: 'plugin',
        itemId: entry.id,
        pluginSelectionId: review.selectionId,
        pluginInstallMode: review.installMode,
        sourcePackageHash: downloaded.sha256,
        packagePath: downloaded.packagePath,
        expiresAt: Date.now() + CATALOG_SELECTION_TTL_MS
      })
      return { kind: 'plugin', selectionId, sourcePackageHash: downloaded.sha256, pluginReview: review }
    } catch (error) {
      if (review?.selectionId) pluginInstallService.clearPendingSelection(review.selectionId)
      fs.rmSync(path.dirname(downloaded.packagePath), { recursive: true, force: true })
      throw error
    }
  }

  const preparePetPackInstall = async (entry) => {
    const downloaded = await downloadPackage(entry)
    let petPackSelectionId = ''
    try {
      const inspection = await petPackService.inspectPackSource(downloaded.packagePath)
      petPackSelectionId = inspection.selectionId
      if (!inspection.valid) throw new Error(inspection.errors[0] || 'Pet pack inspection failed')
      if (inspection.pack?.id !== entry.id) throw new Error('Catalog pet pack id does not match package manifest')
      const blockStatus = getPetPackBlockStatus({ id: entry.id, sha256: inspection.pack?.packageHash, sourceSha256: downloaded.sha256 })
      if (blockStatus.blocked) throw new Error(`Catalog item is blocked: ${blockStatus.reasons.join(', ')}`)
      const selectionId = createSelectionId()
      pendingSelections.set(selectionId, {
        kind: 'pet-pack',
        itemId: entry.id,
        petPackSelectionId: inspection.selectionId,
        sourcePackageHash: downloaded.sha256,
        packagePath: downloaded.packagePath,
        expiresAt: Date.now() + CATALOG_SELECTION_TTL_MS
      })
      return { kind: 'pet-pack', selectionId, sourcePackageHash: downloaded.sha256, petPackReview: inspection }
    } catch (error) {
      if (petPackSelectionId) petPackService.clearPendingSelection(petPackSelectionId)
      fs.rmSync(path.dirname(downloaded.packagePath), { recursive: true, force: true })
      throw error
    }
  }

  const prepareInstall = async ({ kind, itemId } = {}) => {
    pruneSelections()
    if (!['plugin', 'pet-pack'].includes(kind)) throw new Error('Catalog kind must be plugin or pet-pack')
    const entry = getCatalogEntry(kind, itemId)
    assertNotBlocked({ kind, id: entry.id, sha256: entry.sha256 })
    return kind === 'plugin' ? preparePluginInstall(entry) : preparePetPackInstall(entry)
  }

  const getPendingSelection = (selectionId) => {
    pruneSelections()
    const selection = pendingSelections.get(selectionId)
    if (!selection) throw new Error('Catalog selection is no longer available')
    return selection
  }

  const installSelection = (selectionId) => {
    const selection = getPendingSelection(selectionId)
    let result
    if (selection.kind === 'plugin') {
      result = selection.pluginInstallMode === 'update'
        ? pluginInstallService.updatePlugin(selection.pluginSelectionId, { sourcePackageHash: selection.sourcePackageHash })
        : pluginInstallService.installPlugin(selection.pluginSelectionId, { sourcePackageHash: selection.sourcePackageHash })
      result = { ...result, plugins: pluginService.listPlugins() }
    } else {
      result = petPackService.importPack(selection.petPackSelectionId, { sourcePackageHash: selection.sourcePackageHash })
      result = { ...result, petPacks: petPackService.listPacks() }
    }
    pendingSelections.delete(selectionId)
    cleanupSelection(selection)
    return { ok: true, kind: selection.kind, itemId: selection.itemId, ...result }
  }

  const clearSelection = (selectionId) => {
    if (!selectionId) {
      for (const selection of pendingSelections.values()) cleanupSelection(selection)
      pendingSelections.clear()
      return { ok: true }
    }
    const selection = pendingSelections.get(selectionId)
    cleanupSelection(selection)
    pendingSelections.delete(selectionId)
    return { ok: true }
  }

  return {
    listCatalog,
    prepareInstall,
    installSelection,
    clearSelection,
    getLocalBlocklist,
    getCombinedBlocklist,
    addBlocklistEntry,
    removeBlocklistEntry,
    getPluginBlockStatus,
    getPetPackBlockStatus
  }
}

module.exports = { createCatalogService, normalizeCatalog }
