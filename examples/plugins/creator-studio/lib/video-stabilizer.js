const stabilizerError = (message) => Object.assign(new Error(`Invalid video stabilization data: ${message}`), {
  code: 'video_stabilization_invalid'
})

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const standardDeviation = (values) => {
  if (!values.length) return 0
  const mean = average(values)
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)))
}
const coefficientOfVariation = (values) => {
  const mean = average(values)
  return mean > 0 ? standardDeviation(values) / mean : 0
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const normalizeBox = (box, index) => {
  if (!box || !Number.isFinite(Number(box.left)) || !Number.isFinite(Number(box.top)) || !Number.isFinite(Number(box.width)) || !Number.isFinite(Number(box.height))) {
    throw stabilizerError(`frame ${index} bbox is invalid`)
  }
  const width = Number(box.width)
  const height = Number(box.height)
  if (width <= 0 || height <= 0) throw stabilizerError(`frame ${index} bbox is empty`)
  return {
    left: Number(box.left),
    top: Number(box.top),
    width,
    height,
    right: Number(box.left) + width,
    bottom: Number(box.top) + height
  }
}

const computeGlobalBounds = (frames = []) => {
  if (!Array.isArray(frames) || !frames.length) throw stabilizerError('frames must not be empty')
  const boxes = frames.map((frame, index) => normalizeBox(frame?.bbox, index))
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top })
}

const createStablePlacements = ({ frames = [], canvasWidth, canvasHeight, padding = 0.1, baseline = null, anchorPolicy, targetStandingHeightRatio = null } = {}) => {
  const width = Number(canvasWidth)
  const height = Number(canvasHeight)
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) throw stabilizerError('canvas is invalid')
  if (!Array.isArray(frames) || !frames.length) throw stabilizerError('frames must not be empty')
  const boxes = frames.map((frame, index) => normalizeBox(frame?.bbox, index))
  const global = computeGlobalBounds(frames)
  const numericPadding = Number(padding)
  if (!Number.isFinite(numericPadding)) throw stabilizerError('padding is invalid')
  const safePadding = clamp(numericPadding, 0, 0.4)
  const maxWidth = Math.max(...boxes.map((box) => box.width))
  const maxHeight = Math.max(...boxes.map((box) => box.height))
  const fitScale = Math.min(
    (width * (1 - safePadding * 2)) / maxWidth,
    (height * (1 - safePadding * 2)) / maxHeight
  )
  const targetRatio = targetStandingHeightRatio === null ? null : Number(targetStandingHeightRatio)
  if (targetRatio !== null && (!Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio >= 1)) throw stabilizerError('standing height ratio is invalid')
  // Keep one scale for the sequence and the same runtime standing height as
  // other actions. Reject overflow rather than shrinking an action silently.
  const scale = targetRatio === null ? fitScale : height * targetRatio / median(boxes.map((box) => box.height))
  const relativeRoot = anchorPolicy === 'action-relative-root-v1'
  const sourceRoots = relativeRoot ? frames.map((frame) => {
    const sourceHeight = Number(frame.canvas?.height)
    const rootY = Number(frame.root?.y)
    if (!Number.isFinite(rootY) || !Number.isFinite(sourceHeight) || sourceHeight <= 0) throw stabilizerError('relative root needs source canvas and root')
    return rootY / sourceHeight
  }) : []
  const groundedSourceRoot = relativeRoot ? Math.max(...sourceRoots) : 0
  const targetBaseline = baseline !== null && baseline !== undefined && Number.isFinite(Number(baseline))
    ? Number(baseline)
    : height * (1 - safePadding)
  // Body size and airborne travel share a finite runtime canvas. Retarget the
  // entire root trajectory with one factor when it would otherwise overflow;
  // never shrink the body or clamp individual peaks. Reserve the Lanczos3
  // resampling support at 128px, so its alpha halo cannot reach the cell edge.
  const topClearance = Math.max(1, 3 * height / 128)
  const trajectoryScale = relativeRoot ? Math.max(0, Math.min(1, ...boxes.map((box, index) => {
    const travel = (groundedSourceRoot - sourceRoots[index]) * height
    return travel > 0 ? (targetBaseline - box.height * scale - topClearance) / travel : 1
  }))) : 1
  const placements = boxes.map((box, index) => {
    const scaledWidth = box.width * scale
    const scaledHeight = box.height * scale
    const sourceBaseline = box.bottom
    const left = (width - scaledWidth) / 2
    // Preserve the source excursion in canvas ratios; scaling the displacement
    // by body scale would magnify jumps when a small source pet is enlarged.
    const rootOffset = relativeRoot ? (sourceRoots[index] - groundedSourceRoot) * height * trajectoryScale : 0
    const outputBaseline = targetBaseline + rootOffset
    const top = outputBaseline - (sourceBaseline - box.top) * scale
    return Object.freeze({
      frame: index,
      scale,
      left,
      top,
      width: scaledWidth,
      height: scaledHeight,
      baseline: outputBaseline,
      source: Object.freeze({ ...box })
    })
  })
  return Object.freeze({
    canvas: { width, height },
    globalBounds: global,
    scale,
    trajectoryScale,
    baseline: targetBaseline,
    placements: Object.freeze(placements)
  })
}

const analyzeTemporalQuality = ({ frames = [], loop = false, maxLoopSeamRatio = 0.2 } = {}) => {
  if (!Array.isArray(frames) || !frames.length) throw stabilizerError('frames must not be empty')
  const normalized = frames.map((frame, index) => {
    const bbox = normalizeBox(frame?.bbox, index)
    const root = frame?.root || {}
    return {
      bbox,
      rootX: Number(root.x),
      rootY: Number(root.y),
      alphaCoverage: Number(frame.alphaCoverage),
      maskCoverage: Number(frame.maskCoverage),
      hash: String(frame.bodyMaskSha256 || frame.hash || ''),
      edgeTouch: frame.edgeTouch === true,
      unmatchedComponentCount: Math.max(0, Number(frame.unmatchedComponentCount) || 0)
    }
  })
  const rootX = normalized.map((frame) => frame.rootX).filter(Number.isFinite)
  const rootY = normalized.map((frame) => frame.rootY).filter(Number.isFinite)
  const scales = normalized.map((frame) => frame.bbox.height).filter(Number.isFinite)
  const alpha = normalized.map((frame) => frame.alphaCoverage).filter(Number.isFinite)
  const mask = normalized.map((frame) => frame.maskCoverage).filter(Number.isFinite)
  const alphaFlicker = alpha.length > 1
    ? average(alpha.slice(1).map((value, index) => Math.abs(value - alpha[index])))
    : 0
  const maskDropoutRate = mask.length ? mask.filter((value) => value <= 0).length / mask.length : 0
  const uniqueMotionFrameCount = new Set(normalized.map((frame) => frame.hash).filter(Boolean)).size
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  const loopSeamDistance = loop
    ? Math.hypot(
        (first.rootX || 0) - (last.rootX || 0),
        (first.rootY || 0) - (last.rootY || 0),
        first.bbox.width - last.bbox.width,
        first.bbox.height - last.bbox.height
      )
    : 0
  const loopSeamScale = Math.max(
    first.bbox.width,
    first.bbox.height,
    last.bbox.width,
    last.bbox.height,
    Number.EPSILON
  )
  const loopSeamDistanceRatio = loop ? loopSeamDistance / loopSeamScale : 0
  const failures = []
  if (maskDropoutRate > 0) failures.push('mask-dropout')
  if (normalized.some((frame) => !Number.isFinite(frame.maskCoverage))) failures.push('mask-coverage-missing')
  if (normalized.some((frame) => !Number.isFinite(frame.alphaCoverage))) failures.push('alpha-coverage-missing')
  if (uniqueMotionFrameCount < Math.min(2, normalized.length)) failures.push('motion-is-static')
  if (rootX.length !== normalized.length || rootY.length !== normalized.length) failures.push('root-anchor-missing')
  if (normalized.some((frame) => frame.edgeTouch === true)) failures.push('frame-edge-contact')
  if (normalized.some((frame) => Number(frame.unmatchedComponentCount) > 0)) failures.push('detached-effect-contamination')
  if (loop && (!Number.isFinite(Number(maxLoopSeamRatio)) || Number(maxLoopSeamRatio) < 0 || loopSeamDistanceRatio > Number(maxLoopSeamRatio))) {
    failures.push('loop-seam-too-large')
  }
  return Object.freeze({
    version: 1,
    ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]),
    metrics: Object.freeze({
      rootAnchorStdX: standardDeviation(rootX),
      rootAnchorStdY: standardDeviation(rootY),
      bodyScaleCv: coefficientOfVariation(scales),
      alphaFlicker,
      maskDropoutRate,
      uniqueMotionFrameCount,
      loopSeamDistance,
      loopSeamDistanceRatio,
      frameCount: normalized.length
    })
  })
}

module.exports = {
  analyzeTemporalQuality,
  computeGlobalBounds,
  createStablePlacements,
  stabilizerError
}
