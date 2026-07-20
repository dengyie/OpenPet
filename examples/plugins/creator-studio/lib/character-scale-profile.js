const crypto = require('node:crypto')

const ALPHA_THRESHOLD = 8

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

const percentile = (values, ratio) => {
  if (!values.length) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
}

const componentBounds = (component) => component.pixels.reduce((bounds, pixel) => ({
  minX: Math.min(bounds.minX, pixel.x),
  minY: Math.min(bounds.minY, pixel.y),
  maxX: Math.max(bounds.maxX, pixel.x),
  maxY: Math.max(bounds.maxY, pixel.y)
}), { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: -1, maxY: -1 })

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

const colorDistance = (left = {}, right = {}) => Math.sqrt(
  ((Number(left.r) - Number(right.r)) ** 2) +
  ((Number(left.g) - Number(right.g)) ** 2) +
  ((Number(left.b) - Number(right.b)) ** 2)
)

const findComponents = ({ data, width, height, alphaThreshold = ALPHA_THRESHOLD }) => {
  const visited = new Uint8Array(width * height)
  const components = []
  const isVisible = (x, y) => data[((y * width) + x) * 4 + 3] > alphaThreshold
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x
      if (visited[start] || !isVisible(x, y)) continue
      const queue = [{ x, y }]
      visited[start] = 1
      const pixels = []
      while (queue.length) {
        const current = queue.pop()
        pixels.push(current)
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue
            const nextX = current.x + dx
            const nextY = current.y + dy
            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue
            const nextIndex = nextY * width + nextX
            if (visited[nextIndex] || !isVisible(nextX, nextY)) continue
            visited[nextIndex] = 1
            queue.push({ x: nextX, y: nextY })
          }
        }
      }
      const bounds = componentBounds({ pixels })
      const totals = pixels.reduce((accumulator, pixel) => {
        const index = ((pixel.y * width) + pixel.x) * 4
        accumulator.r += data[index]
        accumulator.g += data[index + 1]
        accumulator.b += data[index + 2]
        accumulator.x += pixel.x
        accumulator.y += pixel.y
        return accumulator
      }, { r: 0, g: 0, b: 0, x: 0, y: 0 })
      components.push({
        area: pixels.length,
        pixels,
        ...bounds,
        width: bounds.maxX - bounds.minX + 1,
        height: bounds.maxY - bounds.minY + 1,
        centroidX: totals.x / pixels.length,
        centroidY: totals.y / pixels.length,
        meanColor: {
          r: totals.r / pixels.length,
          g: totals.g / pixels.length,
          b: totals.b / pixels.length
        }
      })
    }
  }
  return components.sort((left, right) => right.area - left.area)
}

const intersectsExpanded = (component, core, dilation) => !(
  component.minX > core.maxX + dilation ||
  component.maxX < core.minX - dilation ||
  component.minY > core.maxY + dilation ||
  component.maxY < core.minY - dilation
)

const insideExpanded = (component, core, padding) => (
  component.centroidX >= core.minX - padding &&
  component.centroidX <= core.maxX + padding &&
  component.centroidY >= core.minY - padding &&
  component.centroidY <= core.maxY + padding
)

const toDescriptor = (component, width, height) => ({
  area: component.area,
  areaRatio: component.area / (width * height),
  bbox: {
    x: component.minX / width,
    y: component.minY / height,
    width: component.width / width,
    height: component.height / height
  },
  centroid: { x: component.centroidX / width, y: component.centroidY / height },
  meanColor: component.meanColor
})

const descriptorDistance = (left, right) => {
  if (!left || !right) return Number.POSITIVE_INFINITY
  return (Math.abs(Number(left.areaRatio || 0) - Number(right.areaRatio || 0)) * 2) +
    Math.abs(Number(left.bbox?.width || 0) - Number(right.bbox?.width || 0)) +
    Math.abs(Number(left.bbox?.height || 0) - Number(right.bbox?.height || 0)) +
    Math.hypot(
      Number(left.centroid?.x || 0) - Number(right.centroid?.x || 0),
      Number(left.centroid?.y || 0) - Number(right.centroid?.y || 0)
    ) +
    (colorDistance(left.meanColor, right.meanColor) / 441.673)
}

const isMatchingSatellite = ({ component, descriptor, width, height, characterClass }) => {
  const current = toDescriptor(component, width, height)
  const locationTolerance = characterClass === 'grounded-elongated-character' ? 0.28 : 0.2
  const areaRatio = current.areaRatio / Math.max(Number(descriptor?.areaRatio) || 0, Number.EPSILON)
  return areaRatio >= 0.35 && areaRatio <= 2.85 &&
    colorDistance(current.meanColor, descriptor?.meanColor) <= 80 &&
    Math.hypot(current.centroid.x - descriptor.centroid.x, current.centroid.y - descriptor.centroid.y) <= locationTolerance &&
    descriptorDistance(current, descriptor) <= 0.42
}

const distanceTransformP75 = ({ pixels, width, height }) => {
  const mask = new Uint8Array(width * height)
  for (const pixel of pixels) mask[(pixel.y * width) + pixel.x] = 1
  const distances = new Float64Array(width * height)
  distances.fill(Number.POSITIVE_INFINITY)
  for (let index = 0; index < distances.length; index += 1) {
    if (!mask[index]) distances[index] = 0
  }
  for (const pixel of pixels) {
    if (pixel.x === 0 || pixel.y === 0 || pixel.x === width - 1 || pixel.y === height - 1) {
      distances[(pixel.y * width) + pixel.x] = 1
    }
  }
  const diagonal = Math.SQRT2
  const relax = (index, neighbour, weight) => {
    if (neighbour < 0 || neighbour >= distances.length) return
    distances[index] = Math.min(distances[index], distances[neighbour] + weight)
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x
      if (!mask[index]) continue
      if (x > 0) relax(index, index - 1, 1)
      if (y > 0) relax(index, index - width, 1)
      if (x > 0 && y > 0) relax(index, index - width - 1, diagonal)
      if (x < width - 1 && y > 0) relax(index, index - width + 1, diagonal)
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = (y * width) + x
      if (!mask[index]) continue
      if (x < width - 1) relax(index, index + 1, 1)
      if (y < height - 1) relax(index, index + width, 1)
      if (x < width - 1 && y < height - 1) relax(index, index + width + 1, diagonal)
      if (x > 0 && y < height - 1) relax(index, index + width - 1, diagonal)
    }
  }
  return percentile(pixels.map((pixel) => distances[(pixel.y * width) + pixel.x]), 0.75) / height
}

const hashJson = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')

const measureBodyMask = ({ data, width, height, characterClass = 'grounded-compact-character', canonicalProfile = null, alphaThreshold = ALPHA_THRESHOLD } = {}) => {
  if (!Buffer.isBuffer(data) || Number(width) < 1 || Number(height) < 1) throw new Error('Body mask measurement requires RGBA data and dimensions')
  const components = findComponents({ data, width: Number(width), height: Number(height), alphaThreshold })
  if (!components.length) return { empty: true, identityComponents: [], unmatchedComponents: [] }

  const canonicalCore = canonicalProfile?.canonicalCoreDescriptor
  const core = canonicalCore
    ? components.slice().sort((left, right) => descriptorDistance(toDescriptor(left, width, height), canonicalCore) - descriptorDistance(toDescriptor(right, width, height), canonicalCore))[0]
    : components[0]
  const dilation = Math.max(1, Math.round(height * 0.06))
  const padding = Math.max(1, Math.round(height * 0.12))
  const canonicalSatellites = Array.isArray(canonicalProfile?.canonicalSatelliteDescriptors)
    ? canonicalProfile.canonicalSatelliteDescriptors
    : []
  const accepted = components.filter((component) => {
    if (component === core || intersectsExpanded(component, core, dilation)) return true
    if (canonicalSatellites.some((descriptor) => isMatchingSatellite({ component, descriptor, width, height, characterClass }))) return true
    return !canonicalProfile && component.area >= width * height * 0.0025 && insideExpanded(component, core, padding)
  })
  const unmatchedComponents = components.filter((component) => !accepted.includes(component) && component.area > width * height * 0.001)
  const identityPixels = accepted.flatMap((component) => component.pixels)
  const { minX, minY, maxX, maxY } = componentBounds({ pixels: identityPixels })
  const centralPixels = identityPixels.filter((pixel) => pixel.x >= minX + (maxX - minX) * 0.2 && pixel.x <= maxX - (maxX - minX) * 0.2)
  const baselinePixels = centralPixels.length ? centralPixels : identityPixels
  const lowerQuarter = identityPixels.filter((pixel) => pixel.y >= minY + (maxY - minY + 1) * 0.75)
  const elongatedPixels = centralPixels.length ? centralPixels : identityPixels
  const identityComponents = accepted.map((component) => toDescriptor(component, width, height))
  const coreDescriptor = toDescriptor(core, width, height)
  const metrics = {
    empty: false,
    characterClass,
    width,
    height,
    bodyMaskArea: identityPixels.length,
    subjectHeightRatio: (maxY - minY + 1) / height,
    subjectWidthRatio: (maxX - minX + 1) / width,
    alphaAreaRatio: identityPixels.length / (width * height),
    coreThicknessP75Ratio: distanceTransformP75({ pixels: core.pixels, width, height }),
    compactRootX: percentile((lowerQuarter.length ? lowerQuarter : baselinePixels).map((pixel) => pixel.x), 0.5) / width,
    compactBaselineY: percentile(baselinePixels.map((pixel) => pixel.y), 0.95) / height,
    elongatedRoot: {
      x: average(elongatedPixels.map((pixel) => pixel.x)) / width,
      y: average(elongatedPixels.map((pixel) => pixel.y)) / height
    },
    elongatedContactBandY: percentile(identityPixels
      .filter((pixel) => pixel.x >= minX + (maxX - minX) * 0.15 && pixel.x <= maxX - (maxX - minX) * 0.15)
      .map((pixel) => pixel.y), 0.95) / height,
    floatingCore: { x: core.centroidX / width, y: core.centroidY / height },
    identityComponents,
    unmatchedComponents: unmatchedComponents.map((component) => toDescriptor(component, width, height)),
    bodyBounds: { minX, minY, maxX, maxY },
    coreDescriptor,
    bodyMaskSha256: hashJson(identityPixels.map((pixel) => [pixel.x, pixel.y])),
    coreDescriptorSha256: hashJson(coreDescriptor),
    satelliteDescriptorsSha256: hashJson(identityComponents.slice(1))
  }
  if (canonicalProfile?.canonicalSatelliteDescriptorsSha256 || canonicalSatellites.length) metrics.canonicalProfileBound = true
  Object.defineProperty(metrics, 'identityPixels', { value: identityPixels, enumerable: false })
  return metrics
}

const createCharacterScaleProfile = ({ canonicalMetrics, idleMetrics = [], characterClass, anchorPolicy, canonicalMasterSha256, idleCheckpointSha256, processorVersion = 1 } = {}) => {
  if (!canonicalMetrics || canonicalMetrics.empty) throw new Error('Character scale profile requires canonical metrics')
  const idle = Array.isArray(idleMetrics) ? idleMetrics : []
  const base = {
    version: 1,
    measurementVersion: 1,
    processorVersion,
    canonicalMasterSha256: String(canonicalMasterSha256 || ''),
    idleCheckpointSha256: String(idleCheckpointSha256 || ''),
    characterClass: String(characterClass || canonicalMetrics.characterClass || 'grounded-compact-character'),
    anchorPolicy: String(anchorPolicy || 'compact-contact-root-v1'),
    componentPolicy: 'reference-guided-body-v1',
    canonicalBodyMaskSha256: String(canonicalMetrics.bodyMaskSha256 || ''),
    canonicalCoreDescriptorSha256: String(canonicalMetrics.coreDescriptorSha256 || canonicalMetrics.canonicalCoreDescriptorSha256 || ''),
    canonicalSatelliteDescriptorsSha256: String(canonicalMetrics.satelliteDescriptorsSha256 || canonicalMetrics.canonicalSatelliteDescriptorsSha256 || ''),
    canonicalCoreDescriptor: canonicalMetrics.coreDescriptor || null,
    canonicalSatelliteDescriptors: canonicalMetrics.identityComponents?.slice(1) || [],
    runtimeCell: { width: 128, height: 128 },
    rawGridCanvas: { width: 1024, height: 1024 },
    canonicalStandingHeightRatio: Number(canonicalMetrics.subjectHeightRatio) || 0,
    canonicalBodyWidthRatio: Number(canonicalMetrics.subjectWidthRatio) || 0,
    canonicalAlphaAreaRatio: Number(canonicalMetrics.alphaAreaRatio) || 0,
    canonicalCoreThicknessP75Ratio: Number(canonicalMetrics.coreThicknessP75Ratio) || 0,
    runtimeStandingHeightPx: 92,
    targetRootX: 0.5,
    groundedBaselineY: Number(canonicalMetrics.compactBaselineY) || 0.9,
    safeMarginRatio: 0.08,
    maxBodyScaleCv: 0.08,
    maxAnchorYStd: 0.05,
    maxCrossActionScaleDrift: 0.08,
    idleMeasurements: idle.map((entry) => ({
      subjectHeightRatio: entry.subjectHeightRatio,
      coreThicknessP75Ratio: entry.coreThicknessP75Ratio
    }))
  }
  return deepFreeze({ ...base, hash: hashJson(base) })
}

module.exports = {
  ALPHA_THRESHOLD,
  createCharacterScaleProfile,
  findComponents,
  measureBodyMask
}
