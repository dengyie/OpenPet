const sharp = require('sharp')

const VISIBLE_ALPHA_THRESHOLD = 8
const BACKGROUND_COLOR_DISTANCE_THRESHOLD = 86
const BACKGROUND_LUMA_THRESHOLD = 216
const BACKGROUND_SATURATION_THRESHOLD = 38
const MIN_BACKGROUND_REMOVAL_RATIO = 0.08
const MIN_REMAINING_SUBJECT_RATIO = 0.01

const extractVisibleBounds = ({ data, info }) => {
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  let visiblePixels = 0

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixelIndex = ((y * info.width) + x) * info.channels
      const alpha = data[pixelIndex + 3]
      if (alpha > 0) {
        visiblePixels += 1
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (visiblePixels <= 0) return null
  return {
    left: minX,
    top: minY,
    width: Math.max(1, (maxX - minX) + 1),
    height: Math.max(1, (maxY - minY) + 1)
  }
}

const getPixelIndex = ({ x, y, width, channels }) => ((y * width) + x) * channels

const getPixelColor = ({ data, index }) => ({
  r: data[index],
  g: data[index + 1],
  b: data[index + 2],
  alpha: data[index + 3]
})

const rgbDistance = (a, b) => (
  Math.abs(Number(a.r) - Number(b.r)) +
  Math.abs(Number(a.g) - Number(b.g)) +
  Math.abs(Number(a.b) - Number(b.b))
)

const luminance = ({ r, g, b }) => (0.2126 * Number(r)) + (0.7152 * Number(g)) + (0.0722 * Number(b))

const saturationRange = ({ r, g, b }) => Math.max(Number(r), Number(g), Number(b)) - Math.min(Number(r), Number(g), Number(b))

const resolveEdgeBackgroundColor = ({ data, info }) => {
  const samples = []
  const addSample = (x, y) => {
    const index = getPixelIndex({ x, y, width: info.width, channels: info.channels })
    const color = getPixelColor({ data, index })
    if (color.alpha > VISIBLE_ALPHA_THRESHOLD) samples.push(color)
  }
  const step = Math.max(1, Math.floor(Math.min(info.width, info.height) / 64))
  for (let x = 0; x < info.width; x += step) {
    addSample(x, 0)
    addSample(x, info.height - 1)
  }
  for (let y = 0; y < info.height; y += step) {
    addSample(0, y)
    addSample(info.width - 1, y)
  }
  if (samples.length === 0) return { r: 255, g: 255, b: 255 }
  const totals = samples.reduce((acc, color) => ({
    r: acc.r + color.r,
    g: acc.g + color.g,
    b: acc.b + color.b
  }), { r: 0, g: 0, b: 0 })
  return {
    r: totals.r / samples.length,
    g: totals.g / samples.length,
    b: totals.b / samples.length
  }
}

const isLikelyEdgeBackground = ({ color, backgroundColor }) => {
  if (color.alpha <= VISIBLE_ALPHA_THRESHOLD) return true
  if (rgbDistance(color, backgroundColor) <= BACKGROUND_COLOR_DISTANCE_THRESHOLD) return true
  return luminance(color) >= BACKGROUND_LUMA_THRESHOLD &&
    saturationRange(color) <= BACKGROUND_SATURATION_THRESHOLD
}

const sanitizeNearTransparentPixels = async (sourceInput, { alphaThreshold = VISIBLE_ALPHA_THRESHOLD } = {}) => {
  const decoded = await sharp(sourceInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const output = Buffer.from(decoded.data)
  const threshold = Math.max(0, Math.min(255, Math.round(Number(alphaThreshold) || 0)))
  for (let pixel = 0; pixel < decoded.info.width * decoded.info.height; pixel += 1) {
    const outputIndex = pixel * decoded.info.channels
    if (output[outputIndex + 3] > threshold) continue
    output[outputIndex] = 0
    output[outputIndex + 1] = 0
    output[outputIndex + 2] = 0
    output[outputIndex + 3] = 0
  }
  return sharp(output, {
    raw: {
      width: decoded.info.width,
      height: decoded.info.height,
      channels: decoded.info.channels
    }
  }).png().toBuffer()
}

const removeOpaqueEdgeBackground = async (sourceInput) => {
  const decoded = await sharp(sourceInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const bounds = extractVisibleBounds(decoded)
  const fullFrameVisible = bounds &&
    bounds.left === 0 &&
    bounds.top === 0 &&
    bounds.width === decoded.info.width &&
    bounds.height === decoded.info.height
  if (!fullFrameVisible) {
    return {
      buffer: sourceInput,
      removed: false,
      removedPixelRatio: 0
    }
  }

  const { data, info } = decoded
  const pixelCount = info.width * info.height
  const backgroundColor = resolveEdgeBackgroundColor({ data, info })
  const visited = new Uint8Array(pixelCount)
  const backgroundMask = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  let head = 0
  let tail = 0

  const tryEnqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return
    const pixel = (y * info.width) + x
    if (visited[pixel]) return
    visited[pixel] = 1
    const color = getPixelColor({
      data,
      index: getPixelIndex({ x, y, width: info.width, channels: info.channels })
    })
    if (!isLikelyEdgeBackground({ color, backgroundColor })) return
    backgroundMask[pixel] = 1
    queue[tail] = pixel
    tail += 1
  }

  for (let x = 0; x < info.width; x += 1) {
    tryEnqueue(x, 0)
    tryEnqueue(x, info.height - 1)
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    tryEnqueue(0, y)
    tryEnqueue(info.width - 1, y)
  }

  while (head < tail) {
    const pixel = queue[head]
    head += 1
    const x = pixel % info.width
    const y = Math.floor(pixel / info.width)
    tryEnqueue(x + 1, y)
    tryEnqueue(x - 1, y)
    tryEnqueue(x, y + 1)
    tryEnqueue(x, y - 1)
  }

  const removedPixelCount = tail
  const removedPixelRatio = pixelCount > 0 ? removedPixelCount / pixelCount : 0
  if (removedPixelRatio < MIN_BACKGROUND_REMOVAL_RATIO) {
    return {
      buffer: sourceInput,
      removed: false,
      removedPixelRatio: Number(removedPixelRatio.toFixed(6))
    }
  }

  const output = Buffer.from(data)
  let remainingVisiblePixels = 0
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const outputIndex = pixel * info.channels
    if (backgroundMask[pixel]) {
      output[outputIndex] = 0
      output[outputIndex + 1] = 0
      output[outputIndex + 2] = 0
      output[outputIndex + 3] = 0
    } else if (output[outputIndex + 3] > VISIBLE_ALPHA_THRESHOLD) {
      remainingVisiblePixels += 1
    }
  }

  if (remainingVisiblePixels / pixelCount < MIN_REMAINING_SUBJECT_RATIO) {
    return {
      buffer: sourceInput,
      removed: false,
      removedPixelRatio: 0
    }
  }

  return {
    buffer: await sharp(output, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels
      }
    }).png().toBuffer(),
    removed: true,
    removedPixelRatio: Number(removedPixelRatio.toFixed(6))
  }
}

module.exports = {
  removeOpaqueEdgeBackground,
  sanitizeNearTransparentPixels
}
