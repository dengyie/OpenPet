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
const VISIBLE_ALPHA_THRESHOLD = 8
const SAFE_MARGIN_PX = 4
const MAX_ALPHA_COVERAGE = 0.9
const MIN_WAVING_UPPER_MOTION_RATIO = 0.01
const MIN_LOCOMOTION_LOWER_MOTION_RATIO = 0.01
const MAX_IDENTITY_CORE_AVERAGE_MOTION_RATIO = 0.32
const MAX_IDENTITY_CORE_PAIR_MOTION_RATIO = 0.5

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
  let sumR = 0
  let sumG = 0
  let sumB = 0
  const alphaMask = Buffer.alloc(info.width * info.height)
  const upperAlphaMask = Buffer.alloc(info.width * info.height)
  const lowerAlphaMask = Buffer.alloc(info.width * info.height)
  const identityCoreAlphaMask = Buffer.alloc(info.width * info.height)
  const regionSplitY = Math.floor(info.height * 0.56)
  const identityLeft = Math.floor(info.width * 0.28)
  const identityRight = Math.ceil(info.width * 0.72)
  const identityTop = Math.floor(info.height * 0.16)
  const identityBottom = Math.ceil(info.height * 0.78)
  let opaquePixels = 0

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3]
      if (alpha <= VISIBLE_ALPHA_THRESHOLD) continue
      const maskIndex = (y * info.width) + x
      alphaMask[maskIndex] = 255
      if (y < regionSplitY) upperAlphaMask[maskIndex] = 255
      else lowerAlphaMask[maskIndex] = 255
      if (x >= identityLeft && x < identityRight && y >= identityTop && y < identityBottom) {
        identityCoreAlphaMask[maskIndex] = 255
      }
      if (alpha >= 250) opaquePixels += 1
      visiblePixels += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      sumX += x
      sumY += y
      sumR += data[(y * info.width + x) * info.channels]
      sumG += data[(y * info.width + x) * info.channels + 1]
      sumB += data[(y * info.width + x) * info.channels + 2]
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
      alphaMaskHash: crypto.createHash('sha256').update(alphaMask).digest('hex'),
      upperAlphaMaskHash: crypto.createHash('sha256').update(upperAlphaMask).digest('hex'),
      lowerAlphaMaskHash: crypto.createHash('sha256').update(lowerAlphaMask).digest('hex'),
      identityCoreAlphaMaskHash: crypto.createHash('sha256').update(identityCoreAlphaMask).digest('hex'),
      alphaMask,
      upperAlphaMask,
      lowerAlphaMask,
      identityCoreAlphaMask,
      alphaCoverage: 0,
      opaqueCoverage: 0,
      meanRgb: { r: 0, g: 0, b: 0 },
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
    alphaMaskHash: crypto.createHash('sha256').update(alphaMask).digest('hex'),
    upperAlphaMaskHash: crypto.createHash('sha256').update(upperAlphaMask).digest('hex'),
    lowerAlphaMaskHash: crypto.createHash('sha256').update(lowerAlphaMask).digest('hex'),
    identityCoreAlphaMaskHash: crypto.createHash('sha256').update(identityCoreAlphaMask).digest('hex'),
    alphaMask,
    upperAlphaMask,
    lowerAlphaMask,
    identityCoreAlphaMask,
    alphaCoverage: visiblePixels / (info.width * info.height),
    opaqueCoverage: opaquePixels / (info.width * info.height),
    meanRgb: {
      r: sumR / visiblePixels,
      g: sumG / visiblePixels,
      b: sumB / visiblePixels
    },
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

const rgbDistance = (left = {}, right = {}) => Math.sqrt(
  ((Number(left.r) || 0) - (Number(right.r) || 0)) ** 2 +
  ((Number(left.g) || 0) - (Number(right.g) || 0)) ** 2 +
  ((Number(left.b) || 0) - (Number(right.b) || 0)) ** 2
)

const compareMasks = (left, right) => {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== right.length) {
    return { changedPixels: 0, unionPixels: 0, changedRatio: 0 }
  }
  let changedPixels = 0
  let unionPixels = 0
  for (let index = 0; index < left.length; index += 1) {
    const visibleLeft = left[index] > 0
    const visibleRight = right[index] > 0
    if (!visibleLeft && !visibleRight) continue
    unionPixels += 1
    if (visibleLeft !== visibleRight) changedPixels += 1
  }
  return {
    changedPixels,
    unionPixels,
    changedRatio: unionPixels > 0 ? changedPixels / unionPixels : 0
  }
}

const summarizeMaskMotion = (measures, key) => {
  const pairs = []
  for (let index = 1; index < measures.length; index += 1) {
    pairs.push({
      from: index - 1,
      to: index,
      ...compareMasks(measures[index - 1]?.[key], measures[index]?.[key])
    })
  }
  const ratios = pairs.map((pair) => pair.changedRatio)
  return {
    averageChangedRatio: ratios.length > 0
      ? Number((ratios.reduce((total, value) => total + value, 0) / ratios.length).toFixed(6))
      : 0,
    maxChangedRatio: ratios.length > 0 ? Number(Math.max(...ratios).toFixed(6)) : 0,
    pairs: pairs.map((pair) => ({
      ...pair,
      changedRatio: Number(pair.changedRatio.toFixed(6))
    }))
  }
}

const analyzeRowFrames = async ({ actionId, frames, sourceKind, identityReferenceMeanRgb = null }) => {
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
  const alphaMaskUniqueFrameCount = new Set(measures.map((measure) => measure.alphaMaskHash)).size
  const upperAlphaMaskUniqueFrameCount = new Set(measures.map((measure) => measure.upperAlphaMaskHash)).size
  const lowerAlphaMaskUniqueFrameCount = new Set(measures.map((measure) => measure.lowerAlphaMaskHash)).size
  const identityCoreAlphaMaskUniqueFrameCount = new Set(measures.map((measure) => measure.identityCoreAlphaMaskHash)).size
  const visibleMeasures = measures.filter((measure) => measure.visiblePixels > 0 && measure.bbox)
  const centroidDrift = maxCentroidDistance(visibleMeasures)
  const centroidYRange = range(visibleMeasures.map((measure) => measure.centroid.y))
  const baselineDrift = range(visibleMeasures.map((measure) => measure.baseline))
  const sizeDrift = Math.max(
    ratioRange(visibleMeasures.map((measure) => measure.bbox.width)),
    ratioRange(visibleMeasures.map((measure) => measure.bbox.height))
  )
  const identityMeanRgbDistances = identityReferenceMeanRgb
    ? visibleMeasures.map((measure) => rgbDistance(measure.meanRgb, identityReferenceMeanRgb))
    : []
  const maxIdentityMeanRgbDistance = identityMeanRgbDistances.length > 0
    ? Math.max(...identityMeanRgbDistances)
    : 0
  const edgeTouchFrameCount = visibleMeasures.filter((measure) => (
    measure.bbox.left <= SAFE_MARGIN_PX ||
    measure.bbox.top <= SAFE_MARGIN_PX ||
    measure.bbox.right >= measure.width - 1 - SAFE_MARGIN_PX ||
    measure.bbox.bottom >= measure.height - 1 - SAFE_MARGIN_PX
  )).length
  const maxAlphaCoverage = measures.length > 0 ? Math.max(...measures.map((measure) => measure.alphaCoverage || 0)) : 0
  const maxOpaqueCoverage = measures.length > 0 ? Math.max(...measures.map((measure) => measure.opaqueCoverage || 0)) : 0
  const motion = {
    whole: summarizeMaskMotion(measures, 'alphaMask'),
    upper: summarizeMaskMotion(measures, 'upperAlphaMask'),
    lower: summarizeMaskMotion(measures, 'lowerAlphaMask'),
    identityCore: summarizeMaskMotion(measures, 'identityCoreAlphaMask')
  }
  const startCentroidY = Number(visibleMeasures[0]?.centroid?.y || 0)
  const endCentroidY = Number(visibleMeasures[visibleMeasures.length - 1]?.centroid?.y || 0)
  const minimumCentroidY = visibleMeasures.length > 0
    ? Math.min(...visibleMeasures.map((measure) => measure.centroid.y))
    : 0
  const verticalMotion = {
    excursion: Number(Math.max(0, startCentroidY - minimumCentroidY).toFixed(2)),
    returnDrift: Number(Math.abs(endCentroidY - startCentroidY).toFixed(2))
  }

  if (normalizedFrames.length !== row.frameCount) {
    errors.push('row_frame_count_mismatch')
  }
  if (visibleMeasures.length !== measures.length) {
    errors.push('row_empty_frame')
  }
  if (edgeTouchFrameCount > 0) {
    errors.push('row_frame_touches_edge')
  }
  if (maxAlphaCoverage > MAX_ALPHA_COVERAGE || maxOpaqueCoverage > MAX_ALPHA_COVERAGE) {
    errors.push('row_opaque_coverage')
  }
  if (uniqueFrameCount <= 1) {
    errors.push('row_repeated_static')
  }
  if (uniqueFrameCount > 1 && isTransformLike(measures)) {
    errors.push('row_transform_like')
  }
  const locomotion = /^running(?:-|$)/.test(row.id)
  const verticalAction = row.id === 'jumping'
  if (locomotion && alphaMaskUniqueFrameCount < Math.min(3, row.frameCount)) {
    errors.push('row_locomotion_motion_missing')
  }
  if (locomotion && lowerAlphaMaskUniqueFrameCount < Math.min(3, row.frameCount)) {
    errors.push('row_locomotion_lower_body_motion_missing')
  }
  if (locomotion && motion.lower.averageChangedRatio < MIN_LOCOMOTION_LOWER_MOTION_RATIO) {
    errors.push('row_locomotion_lower_body_motion_missing')
  }
  if (row.id === 'waving' && motion.upper.averageChangedRatio < MIN_WAVING_UPPER_MOTION_RATIO) {
    errors.push('row_waving_motion_missing')
  }
  if (verticalAction && verticalMotion.excursion < 8) {
    errors.push('row_vertical_motion_missing')
  }
  if (verticalAction && verticalMotion.returnDrift > 6) {
    errors.push('row_vertical_return_missing')
  }
  if (
    !verticalAction &&
    (
      motion.identityCore.averageChangedRatio > MAX_IDENTITY_CORE_AVERAGE_MOTION_RATIO ||
      motion.identityCore.maxChangedRatio > MAX_IDENTITY_CORE_PAIR_MOTION_RATIO
    )
  ) {
    errors.push('row_identity_shape_drift')
  }
  if (identityReferenceMeanRgb && maxIdentityMeanRgbDistance > 120) {
    errors.push('row_identity_reference_mismatch')
  }
  if (!verticalAction && centroidDrift > DEFAULT_LIMITS.centroidDrift) {
    errors.push('row_centroid_drift')
  }
  if (!verticalAction && baselineDrift > DEFAULT_LIMITS.baselineDrift) {
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
    alphaMaskUniqueFrameCount,
    upperAlphaMaskUniqueFrameCount,
    lowerAlphaMaskUniqueFrameCount,
    identityCoreAlphaMaskUniqueFrameCount,
    centroidDrift,
    centroidYRange,
    baselineDrift,
    sizeDrift,
    edgeTouchFrameCount,
    maxAlphaCoverage: Number(maxAlphaCoverage.toFixed(6)),
    maxOpaqueCoverage: Number(maxOpaqueCoverage.toFixed(6)),
    motion,
    verticalMotion,
    identityReference: {
      meanRgb: identityReferenceMeanRgb,
      maxMeanRgbDistance: Number(maxIdentityMeanRgbDistance.toFixed(2)),
      distances: identityMeanRgbDistances.map((value) => Number(value.toFixed(2)))
    },
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
