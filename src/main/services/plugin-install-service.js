const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { normalizePluginManifest, normalizeSignature } = require('../plugins/manifest')

const PLUGIN_SELECTION_TTL_MS = 10 * 60 * 1000
const SAFE_ZIP_ENTRY_PATTERN = /^[^/\\\0][^\\\0]*$/

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const createSelectionId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const assertSafeZipEntry = (entryName) => {
  if (
    !SAFE_ZIP_ENTRY_PATTERN.test(entryName) ||
    path.isAbsolute(entryName) ||
    /^[a-zA-Z]:[\\/]/.test(entryName) ||
    entryName.split('/').includes('..')
  ) {
    throw new Error('Plugin package contains unsafe paths')
  }
}

const assertNoSymlinks = (rootPath) => {
  if (fs.lstatSync(rootPath).isSymbolicLink()) {
    throw new Error('Plugin folders must not contain symlinks')
  }

  const walk = (currentPath) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      const stats = fs.lstatSync(entryPath)
      if (stats.isSymbolicLink()) throw new Error('Plugin folders must not contain symlinks')
      if (stats.isDirectory()) walk(entryPath)
    }
  }
  walk(rootPath)
}

const assertInsideDirectory = (rootPath, targetPath, fieldName) => {
  const rootRealPath = fs.realpathSync(rootPath)
  const targetRealPath = fs.realpathSync(targetPath)
  if (targetRealPath !== rootRealPath && !targetRealPath.startsWith(`${rootRealPath}${path.sep}`)) {
    throw new Error(`Plugin ${fieldName} must stay inside the plugin directory`)
  }
}

const copyDirectory = (sourceDir, targetDir) => {
  fs.rmSync(targetDir, { recursive: true, force: true })
  ensureDirectory(path.dirname(targetDir))
  fs.cpSync(sourceDir, targetDir, { recursive: true })
}

const readJsonFile = (filePath, label) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (error) {
    throw new Error(`${label} must be valid JSON`)
  }
}

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const getFileHash = (filePath) => hashBuffer(fs.readFileSync(filePath))

const listFiles = (rootPath) => {
  const files = []
  const walk = (currentPath, relativeRoot = '') => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath, relativePath)
      } else if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }
  walk(rootPath)
  return files.sort()
}

const getFileHashes = (rootPath) => Object.fromEntries(
  listFiles(rootPath).map((relativePath) => [relativePath, getFileHash(path.join(rootPath, relativePath))])
)

const getPackageHash = (fileHashes) => {
  const digestInput = Object.entries(fileHashes)
    .map(([relativePath, hash]) => `${relativePath}:${hash}`)
    .join('\n')
  return hashBuffer(Buffer.from(digestInput, 'utf-8'))
}

const diffList = (current = [], next = []) => {
  const currentSet = new Set(current)
  const nextSet = new Set(next)
  return {
    added: next.filter((value) => !currentSet.has(value)),
    removed: current.filter((value) => !nextSet.has(value)),
    unchanged: next.filter((value) => currentSet.has(value))
  }
}

const diffPluginPermissions = (currentManifest, nextManifest) => ({
  permissions: diffList(currentManifest?.permissions || [], nextManifest.permissions || []),
  networkAllowlist: diffList(currentManifest?.network?.allowlist || [], nextManifest.network?.allowlist || [])
})

const hasRiskyDiff = (diff) => Boolean(diff.permissions.added.length || diff.networkAllowlist.added.length)

const readInstalledManifest = (pluginDir, pluginId) => {
  const manifestPath = path.join(pluginDir, pluginId, 'plugin.json')
  if (!fs.existsSync(manifestPath)) return null
  const basePath = path.dirname(manifestPath)
  return normalizePluginManifest(readJsonFile(manifestPath, 'Plugin manifest'), { source: 'local', basePath })
}

const resolvePluginFile = (manifest, fieldName) => {
  const relativePath = manifest[fieldName]
  if (!relativePath) return ''
  const targetPath = path.resolve(manifest.basePath, relativePath)
  const basePath = path.resolve(manifest.basePath)
  if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
    throw new Error(`Plugin ${fieldName} must stay inside the plugin directory`)
  }
  if (!fs.existsSync(targetPath)) throw new Error(`Plugin ${fieldName} file does not exist`)
  assertInsideDirectory(basePath, targetPath, fieldName)
  return targetPath
}

const getSignatureReview = (rootPath, manifest, fileHashes) => {
  const signaturePath = path.join(rootPath, 'signature.json')
  const rawSignature = fs.existsSync(signaturePath)
    ? readJsonFile(signaturePath, 'Plugin signature')
    : manifest.signature

  if (!rawSignature) {
    return { status: 'unsigned', label: 'Unsigned plugin', signer: '', algorithm: '', verified: false, errors: [] }
  }

  const signature = normalizeSignature(rawSignature)
  const errors = []
  const declaredFiles = rawSignature.files && typeof rawSignature.files === 'object' ? rawSignature.files : null
  const manifestSha256 = rawSignature.manifestSha256 || rawSignature.manifestHash

  if (manifestSha256 && manifestSha256 !== fileHashes['plugin.json']) {
    errors.push('plugin.json hash does not match signature metadata')
  }
  if (declaredFiles) {
    for (const [relativePath, expectedHash] of Object.entries(declaredFiles)) {
      assertSafeZipEntry(relativePath)
      if (fileHashes[relativePath] !== expectedHash) {
        errors.push(`${relativePath} hash does not match signature metadata`)
      }
    }
  }

  const signedFiles = declaredFiles ? new Set(Object.keys(declaredFiles)) : new Set()
  const unsignedFiles = Object.keys(fileHashes).filter((relativePath) => relativePath !== 'signature.json' && !signedFiles.has(relativePath))
  if (declaredFiles && unsignedFiles.length) {
    errors.push(`Signature metadata does not cover files: ${unsignedFiles.join(', ')}`)
  }

  const verified = Boolean(declaredFiles && errors.length === 0)
  return {
    status: verified ? 'hash-verified' : 'present-unverified',
    label: verified ? 'Signature hash metadata verified' : 'Signature metadata present, not verified',
    signer: signature.signer,
    algorithm: signature.algorithm,
    value: signature.value,
    verified,
    errors
  }
}

const extractZipToTemp = (zipPath) => {
  if (!fs.existsSync(zipPath)) throw new Error('Plugin package does not exist')
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8' })
    .split(/\r?\n/)
    .filter(Boolean)
  entries.forEach(assertSafeZipEntry)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-plugin-package-'))
  execFileSync('unzip', ['-qq', zipPath, '-d', tempRoot])
  return tempRoot
}

const normalizeSourceRoot = (sourcePath) => {
  if (!sourcePath || typeof sourcePath !== 'string') throw new Error('Plugin source path is required')
  const stats = fs.statSync(sourcePath)
  if (stats.isDirectory()) return { rootPath: sourcePath, sourceType: 'directory', cleanupPath: '' }
  if (stats.isFile() && /\.ibot-plugin\.zip$|\.zip$/i.test(sourcePath)) {
    const rootPath = extractZipToTemp(sourcePath)
    return { rootPath, sourceType: 'zip', cleanupPath: rootPath }
  }
  throw new Error('Plugin source must be a directory or .ibot-plugin.zip file')
}

const createPluginInstallService = ({ settingsService, pluginDir }) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!pluginDir) throw new Error('pluginDir is required')

  const pendingSelections = new Map()

  const cleanupSelection = (selection) => {
    if (selection?.cleanupPath) fs.rmSync(selection.cleanupPath, { recursive: true, force: true })
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

  const getSelection = (selectionId) => {
    pruneSelections()
    const selection = pendingSelections.get(selectionId)
    if (!selection) throw new Error('Selected plugin package is no longer available')
    return selection
  }

  const buildReview = ({ rootPath, sourceType, cleanupPath = '' }) => {
    assertNoSymlinks(rootPath)
    const manifestPath = path.join(rootPath, 'plugin.json')
    if (!fs.existsSync(manifestPath)) throw new Error('Plugin package must contain plugin.json')
    const manifest = normalizePluginManifest(readJsonFile(manifestPath, 'Plugin manifest'), { source: 'local', basePath: rootPath })
    if (!manifest.main) throw new Error('Plugin package must declare a main JavaScript file')
    resolvePluginFile(manifest, 'main')
    resolvePluginFile(manifest, 'configSchema')

    const fileHashes = getFileHashes(rootPath)
    const fileEntries = Object.keys(fileHashes)
    const packageHash = getPackageHash(fileHashes)
    const signature = getSignatureReview(rootPath, manifest, fileHashes)
    const currentManifest = readInstalledManifest(pluginDir, manifest.id)
    const permissionDiff = diffPluginPermissions(currentManifest, manifest)
    const installMode = currentManifest ? 'update' : 'install'
    const selectionId = createSelectionId()
    const review = {
      selectionId,
      sourceType,
      installMode,
      existingVersion: currentManifest?.version || '',
      plugin: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        permissions: manifest.permissions,
        network: manifest.network,
        commands: manifest.commands,
        main: manifest.main,
        configSchema: manifest.configSchema
      },
      signature,
      permissionDiff,
      packageHash,
      fileCount: fileEntries.length,
      byteSize: fileEntries.reduce((total, relativePath) => total + fs.statSync(path.join(rootPath, relativePath)).size, 0),
      requiresReview: installMode === 'update' && hasRiskyDiff(permissionDiff),
      riskLevel: signature.status === 'unsigned' || signature.errors.length || hasRiskyDiff(permissionDiff) ? 'review' : 'normal'
    }
    pendingSelections.set(selectionId, {
      ...review,
      rootPath,
      cleanupPath,
      expiresAt: Date.now() + PLUGIN_SELECTION_TTL_MS
    })
    return review
  }

  const inspectPluginPackage = (sourcePath) => {
    pruneSelections()
    const normalized = normalizeSourceRoot(sourcePath)
    try {
      return buildReview(normalized)
    } catch (error) {
      if (normalized.cleanupPath) fs.rmSync(normalized.cleanupPath, { recursive: true, force: true })
      throw error
    }
  }

  const savePluginSettings = ({ pluginId, packageHash, signature, disable = true, removeStorage = false }) => {
    const settings = settingsService.get()
    const plugins = settings.plugins || {}
    const enabled = { ...(plugins.enabled || {}), [pluginId]: disable ? false : Boolean(plugins.enabled?.[pluginId]) }
    const config = { ...(plugins.config || {}) }
    const storage = { ...(plugins.storage || {}) }
    if (removeStorage) delete storage[pluginId]
    settingsService.save({
      ...settings,
      plugins: {
        ...plugins,
        enabled,
        config,
        storage,
        installed: {
          ...(plugins.installed || {}),
          [pluginId]: {
            packageHash,
            signatureStatus: signature.status,
            signer: signature.signer,
            updatedAt: new Date().toISOString()
          }
        }
      }
    })
  }

  const installSelection = (selectionId, { update = false } = {}) => {
    const selection = getSelection(selectionId)
    if (update && selection.installMode !== 'update') throw new Error('Plugin is not installed yet')
    if (!update && selection.installMode === 'update') throw new Error('Plugin is already installed; use update')
    const targetDir = path.join(pluginDir, selection.plugin.id)
    if (selection.signature.errors.length) throw new Error('Plugin signature hash verification failed')
    if (fs.existsSync(targetDir)) {
      const sourceRealPath = fs.realpathSync(selection.rootPath)
      const targetRealPath = fs.realpathSync(targetDir)
      if (sourceRealPath === targetRealPath) {
        throw new Error('Plugin source cannot be the installed plugin directory')
      }
    }
    ensureDirectory(pluginDir)
    copyDirectory(selection.rootPath, targetDir)
    savePluginSettings({
      pluginId: selection.plugin.id,
      packageHash: selection.packageHash,
      signature: selection.signature,
      disable: true
    })
    pendingSelections.delete(selectionId)
    cleanupSelection(selection)
    return {
      ok: true,
      pluginId: selection.plugin.id,
      installMode: selection.installMode,
      disabled: true
    }
  }

  const installPlugin = (selectionId) => installSelection(selectionId, { update: false })

  const updatePlugin = (selectionId) => installSelection(selectionId, { update: true })

  const uninstallPlugin = (pluginId, { removeStorage = false } = {}) => {
    const targetDir = path.join(pluginDir, pluginId)
    if (!fs.existsSync(targetDir)) throw new Error(`Installed plugin not found: ${pluginId}`)
    assertInsideDirectory(pluginDir, targetDir, 'install path')
    fs.rmSync(targetDir, { recursive: true, force: true })
    const settings = settingsService.get()
    const plugins = settings.plugins || {}
    const enabled = { ...(plugins.enabled || {}) }
    const config = { ...(plugins.config || {}) }
    const storage = { ...(plugins.storage || {}) }
    const installed = { ...(plugins.installed || {}) }
    delete enabled[pluginId]
    delete config[pluginId]
    delete installed[pluginId]
    if (removeStorage) delete storage[pluginId]
    settingsService.save({
      ...settings,
      plugins: {
        ...plugins,
        enabled,
        config,
        storage,
        installed
      }
    })
    return { ok: true, pluginId, storageRemoved: Boolean(removeStorage) }
  }

  const clearPendingSelection = (selectionId) => {
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

  return { inspectPluginPackage, installPlugin, updatePlugin, uninstallPlugin, clearPendingSelection }
}

module.exports = { createPluginInstallService, diffPluginPermissions, assertNoSymlinks }
