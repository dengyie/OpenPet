const SUPPORTED_CONFIG_TYPES = new Set(['string', 'number', 'boolean'])

const SECRET_KEY_PATTERN = /(^|[_.-])(?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|secret|password|passwd|credential|private[_-]?key)([_.-]|$)/i
const SECRET_TEXT_PATTERN = /\b(api key|access token|auth token|bearer token|secret|password|credential|private key)\b/i

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key)

const coerceConfigValue = (value, field) => {
  let normalized = value
  if (normalized == null || normalized === '') {
    if (hasOwn(field, 'default')) return field.default
    if (field.required) throw new Error(`Plugin config ${field.key} is required`)
    if (field.type === 'boolean') return false
    if (field.type === 'string') return ''
    return undefined
  }

  if (field.type === 'string') normalized = String(normalized)
  if (field.type === 'number') {
    normalized = Number(normalized)
    if (!Number.isFinite(normalized)) throw new Error(`Plugin config ${field.key} must be a number`)
  }
  if (field.type === 'boolean') {
    normalized = normalized === true || normalized === 'true' || normalized === 1 || normalized === '1'
  }

  if (field.enum?.length && !field.enum.includes(normalized)) {
    throw new Error(`Plugin config ${field.key} must be one of: ${field.enum.join(', ')}`)
  }

  return normalized
}

const assertNoSecretConfigField = (key, rawField = {}) => {
  const title = String(rawField.title || '')
  const description = String(rawField.description || '')
  const format = String(rawField.format || '')
  const writeOnly = rawField.writeOnly === true

  if (SECRET_KEY_PATTERN.test(key) || SECRET_TEXT_PATTERN.test(title) || SECRET_TEXT_PATTERN.test(description)) {
    throw new Error(`Plugin config ${key} looks like a secret. OpenPet does not support plugin-scoped secrets yet; use public configuration only.`)
  }
  if (format.toLowerCase() === 'password' || writeOnly) {
    throw new Error(`Plugin config ${key} uses password-style secret metadata. OpenPet does not support plugin-scoped secrets yet.`)
  }
}

const normalizeConfigField = (key, rawField = {}, required = false) => {
  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error(`Plugin config key is invalid: ${key}`)
  assertNoSecretConfigField(key, rawField)
  const type = rawField.type || 'string'
  if (!SUPPORTED_CONFIG_TYPES.has(type)) throw new Error(`Unsupported plugin config type: ${type}`)
  const field = {
    key,
    type,
    title: rawField.title || key,
    description: rawField.description || '',
    required: Boolean(required)
  }
  if (Array.isArray(rawField.enum)) field.enum = rawField.enum.map((value) => coerceConfigValue(value, { key, type }))
  if (hasOwn(rawField, 'default')) field.default = coerceConfigValue(rawField.default, field)
  return field
}

const normalizeConfigSchema = (schema = {}) => {
  if (!schema || schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
    throw new Error('Plugin config schema must be an object schema with properties')
  }
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  const properties = Object.entries(schema.properties).map(([key, field]) => normalizeConfigField(key, field, required.has(key)))
  return {
    title: schema.title || 'Plugin Configuration',
    description: schema.description || '',
    properties
  }
}

module.exports = {
  SUPPORTED_CONFIG_TYPES,
  assertNoSecretConfigField,
  coerceConfigValue,
  normalizeConfigField,
  normalizeConfigSchema
}
