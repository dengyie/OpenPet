const KNOWN_PLUGIN_PERMISSIONS = new Set([
  'pet:say',
  'pet:action',
  'pet:event',
  'ai:chat',
  'storage',
  'network',
  'commands',
  'actions:read',
  'actions:write',
  'assets:inspect',
  'assets:generate',
  'model:image-generate',
  'pet-pack:import',
  'pack-manifest:read',
  'pack-manifest:write'
])

const KNOWN_PLUGIN_PROFILES = new Set(['runtime', 'creator-tools', 'hybrid'])

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

const assertSafeId = (value, fieldName) => {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
    throw new Error(`Plugin ${fieldName} must be a safe id`)
  }
}

const normalizeCommands = (commands = []) => commands.map((command) => {
  if (!command?.id) throw new Error('Plugin command id is required')
  assertSafeId(command.id, 'command id')
  return {
    id: command.id,
    title: command.title || command.id
  }
})

const normalizeSignature = (signature) => {
  if (!signature) return null
  if (typeof signature === 'string') {
    return {
      algorithm: 'unknown',
      signer: '',
      value: signature
    }
  }
  if (typeof signature !== 'object' || Array.isArray(signature)) {
    throw new Error('Plugin signature must be a string or object')
  }
  const value = String(signature.value || signature.signature || '').trim()
  if (!value) throw new Error('Plugin signature value is required')
  return {
    algorithm: String(signature.algorithm || 'unknown').trim() || 'unknown',
    signer: String(signature.signer || '').trim(),
    value
  }
}

const normalizeNetworkHost = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Plugin network allowlist host must be a string')
  const raw = value.trim()
  const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
  if (url.protocol !== 'https:') throw new Error('Plugin network allowlist only supports HTTPS hosts')
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Plugin network allowlist entries must be hosts, not full URLs with paths')
  }
  const host = url.host.toLowerCase()
  const hostname = url.hostname.toLowerCase()
  const isIpv4Literal = /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  const isIpv6Literal = hostname.startsWith('[') || hostname.includes(':')
  if (!host || hostname === 'localhost' || isIpv4Literal || isIpv6Literal) {
    throw new Error('Plugin network allowlist must use public DNS hosts')
  }
  return host
}

const normalizeNetwork = (network = {}) => ({
  allowlist: Array.from(new Set((Array.isArray(network.allowlist) ? network.allowlist : []).map(normalizeNetworkHost)))
})

const getExtensionLabel = (extension) => {
  if (extension === '.js') return 'JavaScript'
  if (extension === '.json') return 'JSON'
  return extension
}

const normalizeRelativeFilePath = (value = '', fieldName, extension) => {
  if (!value) return ''
  if (typeof value !== 'string') throw new Error(`Plugin ${fieldName} must be a string`)
  const normalized = value.replace(/\\/g, '/')
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Plugin ${fieldName} must be a safe relative path`)
  }
  if (extension && !normalized.endsWith(extension)) {
    throw new Error(`Plugin ${fieldName} must point to a ${getExtensionLabel(extension)} file`)
  }
  return normalized
}

const normalizeShellCommand = (value, fieldName) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Plugin ${fieldName} command is required`)
  return value.trim()
}

const normalizeCwd = (value = '', fieldName) => normalizeRelativeFilePath(value || '.', fieldName)

const normalizePlatformOverrides = (platforms = {}) => {
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) return {}
  return Object.fromEntries(Object.entries(platforms).map(([platform, override]) => {
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      throw new Error(`Plugin platform override must be an object: ${platform}`)
    }
    return [platform, {
      command: normalizeShellCommand(override.command, `${platform} platform`),
      cwd: override.cwd ? normalizeCwd(override.cwd, `${platform} platform cwd`) : ''
    }]
  }))
}

const normalizeHealth = (health) => {
  if (!health) return null
  if (typeof health !== 'object' || Array.isArray(health)) throw new Error('Plugin service health must be an object')
  return {
    type: String(health.type || '').trim() || 'none',
    url: health.url ? String(health.url).trim() : ''
  }
}

const normalizeEntryCommands = (commands = []) => {
  if (!Array.isArray(commands)) throw new Error('Plugin entries.commands must be an array')
  return commands.map((command) => {
    if (!command?.id) throw new Error('Plugin command entry id is required')
    assertSafeId(command.id, 'command entry id')
    return {
      id: command.id,
      title: command.title || command.id,
      command: normalizeShellCommand(command.command, 'command'),
      cwd: normalizeCwd(command.cwd, 'command entry cwd')
    }
  })
}

const normalizeSetupEntries = (setupEntries = []) => {
  if (!Array.isArray(setupEntries)) throw new Error('Plugin entries.setup must be an array')
  return setupEntries.map((setup) => {
    if (!setup?.id) throw new Error('Plugin setup entry id is required')
    assertSafeId(setup.id, 'setup entry id')
    return {
      id: setup.id,
      title: setup.title || setup.name || setup.id,
      command: normalizeShellCommand(setup.command, 'setup'),
      cwd: normalizeCwd(setup.cwd, 'setup entry cwd')
    }
  })
}

const normalizeServiceEntries = (services = []) => {
  if (!Array.isArray(services)) throw new Error('Plugin entries.services must be an array')
  return services.map((service) => {
    if (!service?.id) throw new Error('Plugin service id is required')
    assertSafeId(service.id, 'service id')
    return {
      id: service.id,
      title: service.title || service.name || service.id,
      command: normalizeShellCommand(service.command, 'service'),
      cwd: normalizeCwd(service.cwd, 'service entry cwd'),
      platforms: normalizePlatformOverrides(service.platforms),
      health: normalizeHealth(service.health)
    }
  })
}

const normalizeDashboardEntries = (dashboards = []) => {
  if (!Array.isArray(dashboards)) throw new Error('Plugin entries.dashboards must be an array')
  return dashboards.map((dashboard) => {
    if (!dashboard?.id) throw new Error('Plugin dashboard id is required')
    assertSafeId(dashboard.id, 'dashboard id')
    if (typeof dashboard.url !== 'string' || !dashboard.url.trim()) throw new Error('Plugin dashboard url is required')
    return {
      id: dashboard.id,
      title: dashboard.title || dashboard.id,
      url: dashboard.url.trim()
    }
  })
}

const normalizeExtensionEntries = (entries) => {
  if (!entries) {
    return {
      setup: [],
      commands: [],
      services: [],
      dashboards: []
    }
  }
  if (typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Plugin entries must be an object')
  return {
    setup: normalizeSetupEntries(entries.setup || []),
    commands: normalizeEntryCommands(entries.commands || []),
    services: normalizeServiceEntries(entries.services || []),
    dashboards: normalizeDashboardEntries(entries.dashboards || [])
  }
}

const normalizeManifestDeclaration = (declaration) => {
  if (!declaration) return null
  if (typeof declaration !== 'object' || Array.isArray(declaration)) throw new Error('Plugin manifest declaration must be an object')
  return JSON.parse(JSON.stringify(declaration))
}

const normalizeAssets = (assets) => {
  if (!assets) return null
  if (!Array.isArray(assets)) throw new Error('Plugin assets must be an array')
  return assets.map((asset) => normalizeRelativeFilePath(asset, 'asset path'))
}

const normalizePluginManifest = (manifest, { source = 'local', basePath = '' } = {}) => {
  if (!manifest?.id) throw new Error('Plugin id is required')
  assertSafeId(manifest.id, 'id')
  if (!manifest.name) throw new Error('Plugin name is required')
  if (!manifest.version) throw new Error('Plugin version is required')
  if (manifest.config && manifest.configSchema && manifest.config !== manifest.configSchema) {
    throw new Error('Plugin config and configSchema must point to the same file')
  }

  const configPath = manifest.config || manifest.configSchema || ''
  const normalizedConfigPath = normalizeRelativeFilePath(configPath, manifest.config ? 'config' : 'configSchema', '.json')

  const profile = manifest.profile == null ? 'runtime' : String(manifest.profile).trim()
  if (!KNOWN_PLUGIN_PROFILES.has(profile)) {
    throw new Error('Plugin profile must be runtime, creator-tools, or hybrid')
  }

  const permissions = manifest.permissions || []
  for (const permission of permissions) {
    if (!KNOWN_PLUGIN_PERMISSIONS.has(permission)) {
      throw new Error(`Unknown plugin permission: ${permission}`)
    }
  }

  const entries = normalizeExtensionEntries(manifest.entries)
  const legacyCommands = normalizeCommands(manifest.commands)
  const commands = legacyCommands.length
    ? legacyCommands
    : entries.commands.map(({ id, title }) => ({ id, title }))

  const normalized = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    profile,
    description: manifest.description || '',
    source,
    basePath,
    main: normalizeRelativeFilePath(manifest.main, 'main', '.js'),
    configSchema: normalizedConfigPath,
    permissions: [...permissions],
    network: normalizeNetwork(manifest.network),
    signature: normalizeSignature(manifest.signature),
    commands,
    entries
  }
  if (manifest.config) normalized.config = normalizedConfigPath
  const declaration = normalizeManifestDeclaration(manifest.manifest)
  if (declaration) normalized.manifest = declaration
  const assets = normalizeAssets(manifest.assets)
  if (assets) normalized.assets = assets
  return normalized
}

module.exports = { KNOWN_PLUGIN_PERMISSIONS, normalizePluginManifest, normalizeSignature }
