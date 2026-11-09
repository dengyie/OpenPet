// Spatial color boundaries reveal work inside an opaque silhouette while
// ignoring invisible RGB noise and whole-region color changes.
const createVisibleFeatureMask = ({ data, width, height, channels = 4, visibleAlphaThreshold = 8 }) => {
  const mask = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x
    const offset = index * channels
    if (data[offset + 3] <= visibleAlphaThreshold) continue
    for (const neighbor of [x + 1 < width ? index + 1 : -1, y + 1 < height ? index + width : -1]) {
      if (neighbor < 0 || data[neighbor * channels + 3] <= visibleAlphaThreshold) continue
      let contrast = 0
      for (let channel = 0; channel < 3; channel++) contrast += Math.abs(data[offset + channel] - data[neighbor * channels + channel])
      if (contrast >= 64) mask[index] = 255
    }
  }
  return mask
}

module.exports = { createVisibleFeatureMask }
