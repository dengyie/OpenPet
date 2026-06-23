const fs = require('fs')
const path = require('path')
const { normalizePluginManifest } = require('../plugins/manifest')
const { normalizeConfigSchema } = require('../plugins/config-schema')

const resolveLocalPluginFile = (manifest, fieldName) => {
  const relativePath = manifest[fieldName]
  if (!relativePath) return ''
  const targetPath = path.resolve(manifest.basePath, relativePath)
  const basePath = path.resolve(manifest.basePath)
  if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
    throw new Error(`Plugin ${fieldName} must stay inside the plugin directory`)
  }
  if (fs.existsSync(targetPath)) {
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error(`Plugin ${fieldName} must stay inside the plugin directory`)
    }
  }
  return targetPath
}

const readLocalPluginConfigSchema = (manifest) => {
  const schemaPath = resolveLocalPluginFile(manifest, 'configSchema')
  if (!schemaPath) return null
  if (!fs.existsSync(schemaPath)) throw new Error('Plugin config schema file does not exist')
  return normalizeConfigSchema(JSON.parse(fs.readFileSync(schemaPath, 'utf-8')))
}

const readLocalPluginManifests = (pluginDirs = []) => {
  const plugins = []

  for (const rootDir of pluginDirs) {
    if (!rootDir || !fs.existsSync(rootDir)) continue
    const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const basePath = path.join(rootDir, entry.name)
      const manifestPath = path.join(basePath, 'plugin.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        const normalizedManifest = normalizePluginManifest(manifest, { source: 'local', basePath })
        const mainPath = resolveLocalPluginFile(normalizedManifest, 'main')
        const configSchema = readLocalPluginConfigSchema(normalizedManifest)
        plugins.push({
          manifest: normalizedManifest,
          configSchema,
          mainPath: mainPath && fs.existsSync(mainPath) ? mainPath : '',
          activate: null
        })
      } catch (_) {
        // A broken third-party manifest should not prevent the app from listing other plugins.
      }
    }
  }

  return plugins
}

module.exports = { resolveLocalPluginFile, readLocalPluginManifests }
