const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key)

const cloneJsonValue = (value, fieldName = 'value', { allowUndefined = false } = {}) => {
  if (value === undefined && allowUndefined) return undefined
  const seen = new Set()

  const assertJsonValue = (candidate, pathLabel) => {
    if (candidate === null) return
    const type = typeof candidate
    if (type === 'string' || type === 'boolean') return
    if (type === 'number') {
      if (!Number.isFinite(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      return
    }
    if (Array.isArray(candidate)) {
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      seen.add(candidate)
      candidate.forEach((item, index) => assertJsonValue(item, `${pathLabel}[${index}]`))
      seen.delete(candidate)
      return
    }
    if (type === 'object') {
      const prototype = Object.getPrototypeOf(candidate)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      }
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      seen.add(candidate)
      for (const [key, item] of Object.entries(candidate)) {
        assertJsonValue(item, `${pathLabel}.${key}`)
      }
      seen.delete(candidate)
      return
    }
    throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
  }

  assertJsonValue(value, fieldName)
  return JSON.parse(JSON.stringify(value))
}

const getJsonByteSize = (value) => Buffer.byteLength(JSON.stringify(value), 'utf-8')

module.exports = { hasOwn, cloneJsonValue, getJsonByteSize }
