const extractorError = (message) => Object.assign(new Error(`Invalid video frame extraction: ${message}`), {
  code: 'video_frame_extraction_invalid'
})

const normalizeInteger = (value, label, { min, max }) => {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) throw extractorError(`${label} is invalid`)
  return normalized
}

const selectFrameIndexes = ({ sourceFrameCount, sourceFps, targetFrameCount, targetFps = sourceFps } = {}) => {
  const total = normalizeInteger(sourceFrameCount, 'sourceFrameCount', { min: 1, max: 100_000 })
  const inputFps = normalizeInteger(sourceFps, 'sourceFps', { min: 1, max: 240 })
  const count = normalizeInteger(targetFrameCount, 'targetFrameCount', { min: 1, max: total })
  const outputFps = normalizeInteger(targetFps, 'targetFps', { min: 1, max: 240 })
  const indexes = []
  const durationMs = ((total - 1) / inputFps) * 1000
  for (let index = 0; index < count; index += 1) {
    const timeMs = count === 1 ? 0 : (index / (count - 1)) * durationMs
    const sourceIndex = Math.min(total - 1, Math.max(0, Math.round((timeMs / 1000) * inputFps)))
    if (indexes[index - 1] !== sourceIndex) indexes.push(sourceIndex)
  }
  return Object.freeze({
    sourceFrameCount: total,
    sourceFps: inputFps,
    targetFrameCount: indexes.length,
    targetFps: outputFps,
    indexes: Object.freeze(indexes),
    durationMs
  })
}

const createFrameTiming = ({ indexes, sourceFps, targetFps } = {}) => {
  const normalizedIndexes = Array.isArray(indexes) ? indexes : []
  const inputFps = normalizeInteger(sourceFps, 'sourceFps', { min: 1, max: 240 })
  const outputFps = normalizeInteger(targetFps, 'targetFps', { min: 1, max: 240 })
  if (!normalizedIndexes.length) throw extractorError('indexes must not be empty')
  if (normalizedIndexes.some((value, index) => !Number.isInteger(value) || value < 0 || (index > 0 && value < normalizedIndexes[index - 1]))) {
    throw extractorError('indexes must be sorted non-negative integers')
  }
  return Object.freeze(normalizedIndexes.map((sourceIndex, index) => Object.freeze({
    frame: index,
    sourceIndex,
    sourceTimeMs: Math.round((sourceIndex / inputFps) * 1000),
    outputTimeMs: Math.round((index / outputFps) * 1000)
  })))
}

const createLoopIndexes = ({ indexes, mode = 'loop' } = {}) => {
  const normalized = Array.isArray(indexes) ? indexes.slice() : []
  if (!normalized.length) throw extractorError('indexes must not be empty')
  if (mode === 'loop') return Object.freeze(normalized)
  if (mode === 'ping-pong') {
    const tail = normalized.length > 2 ? normalized.slice(1, -1).reverse() : []
    return Object.freeze([...normalized, ...tail])
  }
  throw extractorError('loop mode is invalid')
}

module.exports = {
  createFrameTiming,
  createLoopIndexes,
  extractorError,
  selectFrameIndexes
}
