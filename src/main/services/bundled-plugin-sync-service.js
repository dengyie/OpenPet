const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { normalizePluginManifest } = require('../plugins/manifest')

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const readJsonFile = (filePath, label) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (_) {
    throw new Error(`${label} must be valid JSON`)
  }
}

const listFiles = (rootPath) => {
  const files = []
  const walk = (currentPath, relativeRoot = '') => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) walk(entryPath, relativePath)
      else if (entry.isFile()) files.push(relativePath)
    }
  }
  walk(rootPath)
  return files.sort()
}

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const getDirectoryPackageHash = (rootPath) => {
  const digestInput = listFiles(rootPath)
    .map((relativePath) => {
      const fileHash = hashBuffer(fs.readFileSync(path.join(rootPath, relativePath)))
      return `${relativePath}:${fileHash}`
    })
    .join('\n')
  return hashBuffer(Buffer.from(digestInput, 'utf8'))
}

const readPluginManifest = (pluginPath) => {
  const manifestPath = path.join(pluginPath, 'plugin.json')
  if (!fs.existsSync(manifestPath)) throw new Error('Bundled plugin must contain plugin.json')
  return normalizePluginManifest(readJsonFile(manifestPath, 'Bundled plugin manifest'), {
    source: 'local',
    basePath: pluginPath
  })
}

const copyDirectory = (sourceDir, targetDir) => {
  fs.rmSync(targetDir, { recursive: true, force: true })
  ensureDirectory(path.dirname(targetDir))
  fs.cpSync(sourceDir, targetDir, { recursive: true })
}

const removeStaleCopies = ({ pluginDir, pluginId, targetDir }) => {
  if (!fs.existsSync(pluginDir)) return []
  const removed = []
  for (const entry of fs.readdirSync(pluginDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidateDir = path.join(pluginDir, entry.name)
    if (path.resolve(candidateDir) === path.resolve(targetDir)) continue
    const manifestPath = path.join(candidateDir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = readPluginManifest(candidateDir)
      if (manifest.id === pluginId) {
        fs.rmSync(candidateDir, { recursive: true, force: true })
        removed.push(candidateDir)
      }
    } catch (_) {
      // Broken local plugins are ignored by discovery too; sync should not delete unknown folders.
    }
  }
  return removed
}

const saveBundledPluginMetadata = ({ settingsService, manifest, pluginId, packageHash }) => {
  const settings = settingsService.get()
  const plugins = settings.plugins || {}
  const installed = plugins.installed || {}
  const previous = installed[pluginId] || {}
  const enabled = plugins.enabled || {}
  settingsService.save({
    ...settings,
    plugins: {
      ...plugins,
      enabled: {
        ...enabled,
        [pluginId]: Object.prototype.hasOwnProperty.call(enabled, pluginId)
          ? Boolean(enabled[pluginId])
          : true
      },
      config: { ...(plugins.config || {}) },
      storage: { ...(plugins.storage || {}) },
      installed: {
        ...installed,
        [pluginId]: {
          ...previous,
          id: pluginId,
          name: manifest.name,
          version: manifest.version,
          packageHash,
          sourcePackageHash: '',
          signatureStatus: 'bundled',
          signer: 'openpet',
          managedBy: 'bundled',
          updatedAt: new Date().toISOString()
        }
      }
    }
  })
}

const needsBundledMetadataRefresh = ({ settingsService, pluginId, manifest, packageHash }) => {
  const plugins = settingsService.get().plugins || {}
  const enabled = plugins.enabled || {}
  const installed = plugins.installed || {}
  const existing = installed[pluginId] || {}

  if (!Object.prototype.hasOwnProperty.call(enabled, pluginId)) return true
  if (existing.id !== pluginId) return true
  if (existing.name !== manifest.name) return true
  if (existing.version !== manifest.version) return true
  if (existing.packageHash !== packageHash) return true
  if (existing.signatureStatus !== 'bundled') return true
  if (existing.signer !== 'openpet') return true
  if (existing.managedBy !== 'bundled') return true
  return false
}

const syncBundledPlugins = ({ pluginDir, bundledPluginDirs = [], settingsService }) => {
  if (!pluginDir) throw new Error('pluginDir is required')
  if (!settingsService) throw new Error('settingsService is required')
  ensureDirectory(pluginDir)
  const synced = []

  for (const bundledPluginDir of bundledPluginDirs) {
    if (!bundledPluginDir || !fs.existsSync(bundledPluginDir)) continue
    const manifest = readPluginManifest(bundledPluginDir)
    const targetDir = path.join(pluginDir, manifest.id)
    const sourceHash = getDirectoryPackageHash(bundledPluginDir)
    const targetHash = fs.existsSync(targetDir) ? getDirectoryPackageHash(targetDir) : ''
    const removed = removeStaleCopies({ pluginDir, pluginId: manifest.id, targetDir })
    const metadataRefreshNeeded = needsBundledMetadataRefresh({
      settingsService,
      pluginId: manifest.id,
      manifest,
      packageHash: sourceHash
    })

    if (sourceHash !== targetHash || removed.length) {
      copyDirectory(bundledPluginDir, targetDir)
      synced.push({ pluginId: manifest.id, targetDir, packageHash: sourceHash, removed })
    }
    if (sourceHash !== targetHash || removed.length || metadataRefreshNeeded) {
      saveBundledPluginMetadata({ settingsService, manifest, pluginId: manifest.id, packageHash: sourceHash })
    }
  }

  return { synced }
}

module.exports = {
  getDirectoryPackageHash,
  needsBundledMetadataRefresh,
  syncBundledPlugins
}
