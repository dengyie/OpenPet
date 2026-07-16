const rgbDistance = (left = {}, right = {}) => Math.sqrt(
  ((Number(left.r) || 0) - (Number(right.r) || 0)) ** 2 +
  ((Number(left.g) || 0) - (Number(right.g) || 0)) ** 2 +
  ((Number(left.b) || 0) - (Number(right.b) || 0)) ** 2
)

const createIdentityDescriptor = ({ data, info, bounds, alphaThreshold = 8 }) => {
  if (!data || !info || !bounds || !bounds.width || !bounds.height) return null
  const regions = Array.from({ length: 3 }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
  const regionHeight = Math.max(1, bounds.height / regions.length)
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      const offset = ((y * info.width) + x) * info.channels
      if (data[offset + 3] <= alphaThreshold) continue
      const index = Math.min(regions.length - 1, Math.floor((y - bounds.top) / regionHeight))
      const region = regions[index]
      region.r += data[offset]
      region.g += data[offset + 1]
      region.b += data[offset + 2]
      region.count += 1
    }
  }
  return {
    aspectRatio: bounds.height > 0 ? bounds.width / bounds.height : 1,
    regions: regions.map((region) => region.count > 0
      ? { r: region.r / region.count, g: region.g / region.count, b: region.b / region.count }
      : { r: 0, g: 0, b: 0 })
  }
}

const identityDescriptorDistance = (left = null, right = null) => {
  if (!left || !right) return 0
  const leftRegions = Array.isArray(left.regions) ? left.regions : []
  const rightRegions = Array.isArray(right.regions) ? right.regions : []
  const count = Math.min(leftRegions.length, rightRegions.length)
  const regionDistance = count > 0
    ? leftRegions.slice(0, count).reduce((total, region, index) => (
        total + rgbDistance(region, rightRegions[index]) / count
      ), 0)
    : 0
  return regionDistance + Math.abs(
    (Number(left.aspectRatio) || 1) - (Number(right.aspectRatio) || 1)
  ) * 120
}

const averageIdentityDescriptors = (descriptors = []) => {
  const values = Array.isArray(descriptors) ? descriptors.filter(Boolean) : []
  if (values.length === 0) return null
  const regionCount = Math.min(...values.map((value) => Array.isArray(value.regions) ? value.regions.length : 0))
  return {
    aspectRatio: values.reduce((total, value) => total + (Number(value.aspectRatio) || 1) / values.length, 0),
    regions: Array.from({ length: regionCount }, (_entry, index) => values.reduce((total, value) => ({
      r: total.r + (Number(value.regions[index]?.r) || 0) / values.length,
      g: total.g + (Number(value.regions[index]?.g) || 0) / values.length,
      b: total.b + (Number(value.regions[index]?.b) || 0) / values.length
    }), { r: 0, g: 0, b: 0 }))
  }
}

module.exports = {
  averageIdentityDescriptors,
  createIdentityDescriptor,
  identityDescriptorDistance,
  rgbDistance
}
