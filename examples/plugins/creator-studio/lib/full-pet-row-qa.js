const crypto = require('crypto')
const sharp = require('sharp')
const {
  FULL_PET_ROW_QUALITY,
  getOfficialFullPetRow
} = require('./full-pet-row-contract')

const DEFAULT_LIMITS = Object.freeze({
  centroidDrift: 40,
  baselineDrift: 30,
  sizeDrift: 0.35
})

const getFramePath = (frame) => frame.path || frame

const measureFrame = async (frame) => {
  const framePath = getFramePath(frame)
  const { data, info } = await sharp(framePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let visiblePixels = 0
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  let sumX = 0
  let sumY = 0

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3]
      if (alpha <= 0) continue
      visiblePixels += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      sumX += x
      sumY += y
    }
  }

  const hash = crypto.createHash('sha256').update(data).digest('hex')
  if (visiblePixels === 0) {
    return {
      framePath,
      width: info.width,
      height: info.height,
      visiblePixels,
      hash,
      bbox: null,
      centroid: null,
      baseline: null
    }
  }

  return {
    framePath,
    width: info.width,
    height: info.height,
    visiblePixels,
    hash,
    bbox: {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    },
    centroid: {
      x: sumX / visiblePixels,
      y: sumY / visiblePixels
    },
    baseline: maxY
  }
}

const range = (values) => {
  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
}

const ratioRange = (values) => {
  if (values.length === 0) return 0
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max <= 0) return 0
  return (max - min) / max
}

const maxCentroidDistance = (frames) => {
  const centroids = frames.map((frame) => frame.centroid).filter(Boolean)
  if (centroids.length === 0) return 0
  const average = centroids.reduce((acc, centroid) => ({
    x: acc.x + centroid.x,
    y: acc.y + centroid.y
  }), { x: 0, y: 0 })
  average.x /= centroids.length
  average.y /= centroids.length
  return Math.max(...centroids.map((centroid) => Math.hypot(centroid.x - average.x, centroid.y - average.y)))
}

const isTransformLike = (measures) => {
  const visible = measures.filter((measure) => measure.visiblePixels > 0 && measure.bbox)
  if (visible.length < 2) return false
  const bboxWidthRange = range(visible.map((measure) => measure.bbox.width))
  const bboxHeightRange = range(visible.map((measure) => measure.bbox.height))
  const visiblePixelRatio = ratioRange(visible.map((measure) => measure.visiblePixels))
  const centroidXRange = range(visible.map((measure) => measure.centroid.x))
  const centroidYRange = range(visible.map((measure) => measure.centroid.y))
  return (
    bboxWidthRange <= 2 &&
    bboxHeightRange <= 2 &&
    visiblePixelRatio <= 0.03 &&
    (centroidXRange > 0 || centroidYRange > 0)
  )
}

const analyzeRowFrames = async ({ actionId, frames, sourceKind }) => {
  const row = getOfficialFullPetRow(actionId)
  if (!row) {
    throw new Error(`Unknown official full-pet row: ${String(actionId || '').trim() || '(missing)'}`)
  }
  const normalizedFrames = Array.isArray(frames) ? frames : []
  const measures = []
  for (const frame of normalizedFrames) {
    measures.push(await measureFrame(frame))
  }

  const errors = []
  const warnings = []
  const uniqueFrameCount = new Set(measures.map((measure) => measure.hash)).size
  const visibleMeasures = measures.filter((measure) => measure.visiblePixels > 0 && measure.bbox)
  const centroidDrift = maxCentroidDistance(visibleMeasures)
  const baselineDrift = range(visibleMeasures.map((measure) => measure.baseline))
  const sizeDrift = Math.max(
    ratioRange(visibleMeasures.map((measure) => measure.bbox.width)),
    ratioRange(visibleMeasures.map((measure) => measure.bbox.height))
  )

  if (normalizedFrames.length !== row.frameCount) {
    errors.push('row_frame_count_mismatch')
  }
  if (visibleMeasures.length !== measures.length) {
    errors.push('row_empty_frame')
  }
  if (uniqueFrameCount <= 1) {
    errors.push('row_repeated_static')
  }
  if (uniqueFrameCount > 1 && isTransformLike(measures)) {
    errors.push('row_transform_like')
  }
  if (centroidDrift > DEFAULT_LIMITS.centroidDrift) {
    errors.push('row_centroid_drift')
  }
  if (baselineDrift > DEFAULT_LIMITS.baselineDrift) {
    errors.push('row_baseline_drift')
  }
  if (sizeDrift > DEFAULT_LIMITS.sizeDrift) {
    errors.push('row_size_drift')
  }

  const approvedMirror = sourceKind === 'approved-mirror'
  const quality = errors.length > 0
    ? FULL_PET_ROW_QUALITY.FAILED
    : approvedMirror
      ? FULL_PET_ROW_QUALITY.APPROVED_MIRROR
      : FULL_PET_ROW_QUALITY.ROW_REAL

  return {
    actionId: row.id,
    quality,
    frameCount: normalizedFrames.length,
    expectedFrameCount: row.frameCount,
    uniqueFrameCount,
    centroidDrift,
    baselineDrift,
    sizeDrift,
    errors,
    warnings,
    frames: measures.map((measure, index) => ({
      index,
      path: measure.framePath,
      visiblePixels: measure.visiblePixels,
      bbox: measure.bbox,
      centroid: measure.centroid,
      baseline: measure.baseline
    }))
  }
}

module.exports = {
  analyzeRowFrames
}
