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

const selectJumpingFrameIndexes = (frames) => {
  if (!Array.isArray(frames) || frames.length < 5) throw extractorError('jumping needs at least five source frames')
  const roots = frames.map((frame) => Number(frame.root?.y) / Number(frame.canvas?.height))
  if (!roots.every(Number.isFinite)) throw extractorError('jumping roots are invalid')
  const peak = roots.indexOf(Math.min(...roots))
  if (peak < 2 || peak > roots.length - 3) throw extractorError('jumping needs ordered takeoff, peak and landing')
  const closest = (from, to, target) => {
    let best = from
    for (let index = from + 1; index < to; index += 1) {
      if (Math.abs(roots[index] - target) < Math.abs(roots[best] - target)) best = index
    }
    return best
  }
  return Object.freeze([0,
    closest(1, peak, (roots[0] + roots[peak]) / 2),
    peak,
    closest(peak + 1, roots.length - 1, (roots.at(-1) + roots[peak]) / 2),
    roots.length - 1])
}

module.exports = {
  createFrameTiming,
  createLoopIndexes,
  extractorError,
  selectFrameIndexes,
  selectJumpingFrameIndexes
}
