const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { normalizePluginManifest, normalizeSignature } = require('../plugins/manifest')
const { normalizeConfigSchema } = require('../plugins/config-schema')

const PLUGIN_SELECTION_TTL_MS = 10 * 60 * 1000
const SAFE_ZIP_ENTRY_PATTERN = /^[^/\\\0][^\\\0]*$/
const DEFAULT_ZIP_LIMITS = {
  maxEntries: 1000,
  maxExpandedBytes: 100 * 1024 * 1024,
  maxFileBytes: 25 * 1024 * 1024,
  maxCompressionRatio: 100,
  timeoutMs: 15000
}
const execFileAsync = promisify(execFile)

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

const runRecoverySteps = (originalError, steps) => {
  const rollbackErrors = []
  for (const step of steps) {
    try {
      step()
    } catch (error) {
      rollbackErrors.push(error)
    }
  }
  if (rollbackErrors.length) originalError.rollbackErrors = rollbackErrors
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
  return resolvePluginReference(manifest, relativePath, fieldName)
}

const resolvePluginReference = (manifest, relativePath, fieldName) => {
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

const hasExtensionEntries = (manifest) => Boolean(
  manifest.entries?.commands?.length ||
  manifest.entries?.services?.length ||
  manifest.entries?.dashboards?.length
)

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
    label: verified
      ? 'File integrity checked (not a trusted source)'
      : 'Signature metadata present, integrity not verified',
    signer: signature.signer,
    algorithm: signature.algorithm,
    value: signature.value,
    verified,
    errors
  }
}

const inspectZipArchive = async ({ zipPath, timeoutMs, signal }) => {
  const options = { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, signal }
  const [{ stdout: namesOutput }, { stdout: verboseOutput }] = await Promise.all([
    execFileAsync('unzip', ['-Z1', zipPath], options),
    execFileAsync('unzip', ['-Z', '-v', zipPath], options)
  ])
  const names = namesOutput.split(/\r?\n/).filter(Boolean)
  const blocks = verboseOutput.split(/Central directory entry #\d+:/).slice(1)
  if (blocks.length !== names.length) throw new Error('Plugin package metadata is inconsistent')
  return names.map((name, index) => {
    const block = blocks[index]
    const compressedSize = Number(block.match(/^\s*compressed size:\s+(\d+) bytes/m)?.[1])
    const uncompressedSize = Number(block.match(/^\s*uncompressed size:\s+(\d+) bytes/m)?.[1])
    const unixAttributes = block.match(/^\s*Unix file attributes \([^)]*\):\s*(.+)$/m)?.[1] || ''
    return {
      name,
      compressedSize,
      uncompressedSize,
      isLink: unixAttributes.trim().startsWith('l'),
      encrypted: !/^\s*file security status:\s+not encrypted$/m.test(block)
    }
  })
}

const extractZipArchive = async ({ zipPath, destination, timeoutMs, signal }) => {
  await execFileAsync('unzip', ['-qq', zipPath, '-d', destination], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    signal
  })
}

const assertArchiveLimits = (entries, limits) => {
  if (entries.length > limits.maxEntries) throw new Error('Plugin package exceeds ZIP entry count limit')
  let expandedBytes = 0
  for (const entry of entries) {
    assertSafeZipEntry(entry.name)
    if (entry.isLink) throw new Error('Plugin package must not contain links')
    if (entry.encrypted) throw new Error('Encrypted plugin packages are not supported')
    if (!Number.isFinite(entry.uncompressedSize) || !Number.isFinite(entry.compressedSize)) {
      throw new Error('Plugin package metadata is invalid')
    }
    if (entry.uncompressedSize > limits.maxFileBytes) throw new Error('Plugin package exceeds ZIP single file size limit')
    expandedBytes += entry.uncompressedSize
    if (expandedBytes > limits.maxExpandedBytes) throw new Error('Plugin package exceeds ZIP expanded size limit')
    const ratio = entry.compressedSize > 0 ? entry.uncompressedSize / entry.compressedSize : (entry.uncompressedSize > 0 ? Infinity : 1)
    if (ratio > limits.maxCompressionRatio) throw new Error('Plugin package exceeds ZIP compression ratio limit')
  }
}

const runArchiveOperation = async (operation, timeoutMs) => {
  const controller = new AbortController()
  let timeoutId
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('Plugin package extraction timed out'))
    }, timeoutMs)
    timeoutId.unref?.()
  })
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

const extractZipToTemp = async (zipPath, { limits, inspectArchive, extractArchive }) => {
  if (!fs.existsSync(zipPath)) throw new Error('Plugin package does not exist')
  const entries = await runArchiveOperation(
    (signal) => inspectArchive({ zipPath, timeoutMs: limits.timeoutMs, signal }),
    limits.timeoutMs
  )
  assertArchiveLimits(entries, limits)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-package-'))
  try {
    await runArchiveOperation(
      (signal) => extractArchive({ zipPath, destination: tempRoot, timeoutMs: limits.timeoutMs, signal }),
      limits.timeoutMs
    )
    assertNoSymlinks(tempRoot)
    return tempRoot
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    throw error
  }
}

const normalizeSourceRoot = (sourcePath, options = {}, archiveOptions) => {
  if (!sourcePath || typeof sourcePath !== 'string') throw new Error('Plugin source path is required')
  const stats = fs.statSync(sourcePath)
  if (stats.isDirectory()) {
    return {
      rootPath: sourcePath,
      sourceType: typeof options.sourceType === 'string' && options.sourceType ? options.sourceType : 'directory',
      cleanupPath: typeof options.cleanupPath === 'string' ? options.cleanupPath : ''
    }
  }
  if (stats.isFile() && /\.(?:openpet|ibot)-plugin\.zip$|\.zip$/i.test(sourcePath)) {
    return extractZipToTemp(sourcePath, archiveOptions)
      .then((rootPath) => ({ rootPath, sourceType: 'zip', cleanupPath: rootPath }))
  }
  throw new Error('Plugin source must be a directory or OpenPet plugin package (.openpet-plugin.zip)')
}

const createPluginInstallService = ({
  settingsService,
  pluginDir,
  getPluginBlockStatus = () => ({ blocked: false, reasons: [] }),
  zipLimits = {},
  inspectArchive = inspectZipArchive,
  extractArchive = extractZipArchive
}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!pluginDir) throw new Error('pluginDir is required')

  const pendingSelections = new Map()
  const limits = { ...DEFAULT_ZIP_LIMITS, ...zipLimits }

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
    if (!manifest.main && !hasExtensionEntries(manifest)) {
      throw new Error('Plugin package must declare a main JavaScript file or extension entries')
    }
    if (manifest.main) resolvePluginFile(manifest, 'main')
    const configSchemaPath = resolvePluginFile(manifest, 'configSchema')
    if (configSchemaPath) normalizeConfigSchema(readJsonFile(configSchemaPath, 'Plugin config schema'))
    for (const asset of manifest.assets || []) {
      resolvePluginReference(manifest, asset, 'asset')
    }

    const fileHashes = getFileHashes(rootPath)
    const fileEntries = Object.keys(fileHashes)
    const packageHash = getPackageHash(fileHashes)
    const signature = getSignatureReview(rootPath, manifest, fileHashes)
    const currentManifest = readInstalledManifest(pluginDir, manifest.id)
    const permissionDiff = diffPluginPermissions(currentManifest, manifest)
    const installMode = currentManifest ? 'update' : 'install'
    const selectionId = createSelectionId()
    const blockStatus = getPluginBlockStatus({ id: manifest.id, sha256: packageHash }) || { blocked: false, reasons: [] }
    const review = {
      selectionId,
      sourceType,
      installMode,
      existingVersion: currentManifest?.version || '',
      plugin: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        profile: manifest.profile,
        description: manifest.description,
        permissions: manifest.permissions,
        network: manifest.network,
        commands: manifest.commands,
        main: manifest.main,
        config: manifest.config || '',
        configSchema: manifest.configSchema,
        entries: manifest.entries || { commands: [], services: [], dashboards: [] },
        manifest: manifest.manifest || {},
        assets: manifest.assets || []
      },
      signature,
      permissionDiff,
      blockStatus,
      packageHash,
      fileCount: fileEntries.length,
      byteSize: fileEntries.reduce((total, relativePath) => total + fs.statSync(path.join(rootPath, relativePath)).size, 0),
      requiresReview: installMode === 'update' && hasRiskyDiff(permissionDiff),
      riskLevel: blockStatus.blocked || signature.status === 'unsigned' || signature.errors.length || hasRiskyDiff(permissionDiff) ? 'review' : 'normal'
    }
    pendingSelections.set(selectionId, {
      ...review,
      rootPath,
      cleanupPath,
      expiresAt: Date.now() + PLUGIN_SELECTION_TTL_MS
    })
    return review
  }

  const inspectPluginPackage = async (sourcePath, options = {}) => {
    pruneSelections()
    const source = await normalizeSourceRoot(sourcePath, options, { limits, inspectArchive, extractArchive })
    try {
      return buildReview(source)
    } catch (error) {
      if (source.cleanupPath) fs.rmSync(source.cleanupPath, { recursive: true, force: true })
      throw error
    }
  }

  const inspectPluginPackageSync = (sourcePath, options = {}) => {
    pruneSelections()
    const source = normalizeSourceRoot(sourcePath, options, { limits, inspectArchive, extractArchive })
    if (source && typeof source.then === 'function') {
      throw new Error('ZIP plugin inspection requires the asynchronous API')
    }
    try {
      return buildReview(source)
    } catch (error) {
      if (source.cleanupPath) fs.rmSync(source.cleanupPath, { recursive: true, force: true })
      throw error
    }
  }

  const savePluginSettings = ({ pluginId, packageHash, sourcePackageHash = '', signature, disable = true, removeStorage = false }) => {
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
            sourcePackageHash,
            signatureStatus: signature.status,
            signer: signature.signer,
            updatedAt: new Date().toISOString()
          }
        }
      }
    })
  }

  const installSelection = (selectionId, { update = false, sourcePackageHash = '' } = {}) => {
    const selection = getSelection(selectionId)
    if (update && selection.installMode !== 'update') throw new Error('Plugin is not installed yet')
    if (!update && selection.installMode === 'update') throw new Error('Plugin is already installed; use update')
    const targetDir = path.join(pluginDir, selection.plugin.id)
    if (selection.signature.errors.length) throw new Error('Plugin signature hash verification failed')
    const blockStatus = getPluginBlockStatus({ id: selection.plugin.id, sha256: selection.packageHash, sourceSha256: sourcePackageHash }) || selection.blockStatus
    if (blockStatus?.blocked) throw new Error(`Plugin is blocked: ${blockStatus.reasons.join(', ')}`)
    if (fs.existsSync(targetDir)) {
      const sourceRealPath = fs.realpathSync(selection.rootPath)
      const targetRealPath = fs.realpathSync(targetDir)
      if (sourceRealPath === targetRealPath) {
        throw new Error('Plugin source cannot be the installed plugin directory')
      }
    }
    ensureDirectory(pluginDir)
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const stagingDir = path.join(pluginDir, `.${selection.plugin.id}.staging-${suffix}`)
    const backupDir = path.join(pluginDir, `.${selection.plugin.id}.backup-${suffix}`)
    const previousSettings = structuredClone(settingsService.get())
    let settingsWriteAttempted = false
    let backupCreated = false
    let stagingPromoted = false
    try {
      copyDirectory(selection.rootPath, stagingDir)
      assertNoSymlinks(stagingDir)
      if (getPackageHash(getFileHashes(stagingDir)) !== selection.packageHash) {
        throw new Error('Plugin package changed after inspection')
      }
      if (fs.existsSync(targetDir)) {
        fs.renameSync(targetDir, backupDir)
        backupCreated = true
      }
      fs.renameSync(stagingDir, targetDir)
      stagingPromoted = true
      settingsWriteAttempted = true
      savePluginSettings({
        pluginId: selection.plugin.id,
        packageHash: selection.packageHash,
        sourcePackageHash,
        signature: selection.signature,
        disable: true
      })
      if (backupCreated) fs.rmSync(backupDir, { recursive: true, force: true })
    } catch (error) {
      runRecoverySteps(error, [
        () => fs.rmSync(stagingDir, { recursive: true, force: true }),
        () => {
          if (stagingPromoted && fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
        },
        () => {
          if (backupCreated && fs.existsSync(backupDir)) fs.renameSync(backupDir, targetDir)
        },
        () => {
          if (settingsWriteAttempted) settingsService.save(previousSettings)
        }
      ])
      throw error
    }
    pendingSelections.delete(selectionId)
    cleanupSelection(selection)
    return {
      ok: true,
      pluginId: selection.plugin.id,
      installMode: selection.installMode,
      disabled: true
    }
  }

  const installPlugin = (selectionId, options = {}) => installSelection(selectionId, { ...options, update: false })

  const updatePlugin = (selectionId, options = {}) => installSelection(selectionId, { ...options, update: true })

  const uninstallPlugin = (pluginId, { removeStorage = false } = {}) => {
    const targetDir = path.join(pluginDir, pluginId)
    if (!fs.existsSync(targetDir)) throw new Error(`Installed plugin not found: ${pluginId}`)
    assertInsideDirectory(pluginDir, targetDir, 'install path')
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
    const nextSettings = {
      ...settings,
      plugins: {
        ...plugins,
        enabled,
        config,
        storage,
        installed
      }
    }
    const backupDir = path.join(pluginDir, `.${pluginId}.backup-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    let settingsWriteAttempted = false
    try {
      fs.renameSync(targetDir, backupDir)
      settingsWriteAttempted = true
      settingsService.save(nextSettings)
      fs.rmSync(backupDir, { recursive: true, force: true })
    } catch (error) {
      runRecoverySteps(error, [
        () => {
          if (settingsWriteAttempted) settingsService.save(settings)
        },
        () => {
          if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
        },
        () => {
          if (fs.existsSync(backupDir)) fs.renameSync(backupDir, targetDir)
        }
      ])
      throw error
    }
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

  return { inspectPluginPackage, inspectPluginPackageSync, installPlugin, updatePlugin, uninstallPlugin, clearPendingSelection }
}

module.exports = { createPluginInstallService, diffPluginPermissions, assertNoSymlinks }
