const KNOWN_PLUGIN_PERMISSIONS = new Set([
  'pet:say',
  'pet:action',
  'pet:event',
  'ai:chat',
  'storage',
  'network',
  'commands'
])

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

const normalizePluginManifest = (manifest, { source = 'local', basePath = '' } = {}) => {
  if (!manifest?.id) throw new Error('Plugin id is required')
  assertSafeId(manifest.id, 'id')
  if (!manifest.name) throw new Error('Plugin name is required')
  if (!manifest.version) throw new Error('Plugin version is required')

  const permissions = manifest.permissions || []
  for (const permission of permissions) {
    if (!KNOWN_PLUGIN_PERMISSIONS.has(permission)) {
      throw new Error(`Unknown plugin permission: ${permission}`)
    }
  }

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description || '',
    source,
    basePath,
    main: normalizeRelativeFilePath(manifest.main, 'main', '.js'),
    configSchema: normalizeRelativeFilePath(manifest.configSchema, 'configSchema', '.json'),
    permissions: [...permissions],
    network: normalizeNetwork(manifest.network),
    signature: normalizeSignature(manifest.signature),
    commands: normalizeCommands(manifest.commands)
  }
}

module.exports = { KNOWN_PLUGIN_PERMISSIONS, normalizePluginManifest, normalizeSignature }
