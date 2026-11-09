const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { createVisibleFeatureMask } = require('./visible-feature-mask')

const { createStablePlacements } = require('./video-stabilizer')
const { measureBodyMask } = require('./character-scale-profile')
const { selectJumpingFrameIndexes } = require('./video-frame-extractor')

// Grok's requested chroma background is compressed and varies across the
// frame. A low threshold leaves disconnected green islands that look like
// subject components after edge-connected traversal.
const DEFAULT_BACKGROUND_TOLERANCE = 180

const matteError = (message) => Object.assign(new Error(`Invalid video matte pipeline input: ${message}`), {
  code: 'video_matte_pipeline_invalid'
})

const throwIfAborted = (signal) => {
  if (signal?.aborted) {
    const error = signal.reason instanceof Error ? signal.reason : new Error('Video matte pipeline canceled')
    error.code ||= 'video_matte_pipeline_canceled'
    throw error
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const parseHexColor = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(normalized)) throw matteError('background color must be a six digit hex color')
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  }
}

const normalizeThreshold = (value, label, fallback, max) => {
  const normalized = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > max) throw matteError(`${label} is invalid`)
  return normalized
}

const colorDistance = (r, g, b, background) => (
  Math.abs(r - background.r) + Math.abs(g - background.g) + Math.abs(b - background.b)
)

const isEdge = ({ x, y, width, height }) => x === 0 || y === 0 || x === width - 1 || y === height - 1

const processMatteFrame = async (sourceInput, {
  backgroundColor = '#12ff4d',
  tolerance = DEFAULT_BACKGROUND_TOLERANCE,
  softness = 28,
  despill = true
} = {}) => {
  const background = parseHexColor(backgroundColor)
  const colorTolerance = normalizeThreshold(tolerance, 'tolerance', 86, 765)
  const edgeSoftness = normalizeThreshold(softness, 'softness', 28, 765)
  const decoded = await sharp(sourceInput).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { data, info } = decoded
  const pixelCount = info.width * info.height
  const candidate = new Uint8Array(pixelCount)
  const visited = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  let head = 0
  let tail = 0
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * info.channels
    const distance = colorDistance(data[offset], data[offset + 1], data[offset + 2], background)
    candidate[pixel] = data[offset + 3] > 0 && distance <= colorTolerance + edgeSoftness ? 1 : 0
  }
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return
    const pixel = (y * info.width) + x
    if (visited[pixel] || !candidate[pixel]) return
    visited[pixel] = 1
    queue[tail] = pixel
    tail += 1
  }
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (isEdge({ x, y, width: info.width, height: info.height })) enqueue(x, y)
    }
  }
  while (head < tail) {
    const pixel = queue[head]
    head += 1
    const x = pixel % info.width
    const y = Math.floor(pixel / info.width)
    enqueue(x + 1, y)
    enqueue(x - 1, y)
    enqueue(x, y + 1)
    enqueue(x, y - 1)
  }

  const output = Buffer.from(data)
  let removedPixelCount = 0
  let visiblePixelCount = 0
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * info.channels
    if (!visited[pixel]) {
      if (output[offset + 3] > 0) visiblePixelCount += 1
      continue
    }
    const distance = colorDistance(output[offset], output[offset + 1], output[offset + 2], background)
    const alphaScale = distance <= colorTolerance
      ? 0
      : clamp((distance - colorTolerance) / Math.max(1, edgeSoftness), 0, 1)
    output[offset + 3] = Math.round(output[offset + 3] * alphaScale)
    if (output[offset + 3] === 0) {
      output[offset] = 0
      output[offset + 1] = 0
      output[offset + 2] = 0
      removedPixelCount += 1
    } else {
      visiblePixelCount += 1
      if (despill) {
        const neutral = Math.max(output[offset], output[offset + 2])
        const spill = clamp((output[offset + 1] - neutral) / 255, 0, 1) * (1 - output[offset + 3] / 255)
        output[offset + 1] = Math.round(output[offset + 1] * (1 - spill) + neutral * spill)
      }
    }
  }
  const outputBuffer = await sharp(output, {
    raw: { width: info.width, height: info.height, channels: info.channels }
  }).png().toBuffer()
  return Object.freeze({
    buffer: outputBuffer,
    width: info.width,
    height: info.height,
    removedPixelRatio: Number((removedPixelCount / Math.max(1, pixelCount)).toFixed(6)),
    visiblePixelRatio: Number((visiblePixelCount / Math.max(1, pixelCount)).toFixed(6)),
    sha256: crypto.createHash('sha256').update(outputBuffer).digest('hex')
  })
}

const inspectAlphaBounds = async (input) => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1
  let visible = 0
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[((y * info.width) + x) * info.channels + 3]
      if (alpha <= 0) continue
      visible += 1
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (!visible) return null
  const body = measureBodyMask({ data, width: info.width, height: info.height })
  if (body.empty) return null
  const bounds = body.bodyBounds
  return {
    canvas: { width: info.width, height: info.height },
    bbox: { left: bounds.minX, top: bounds.minY, width: bounds.maxX - bounds.minX + 1, height: bounds.maxY - bounds.minY + 1 },
    root: { x: body.compactRootX * info.width, y: body.compactBaselineY * info.height },
    alphaCoverage: visible / (info.width * info.height),
    maskCoverage: body.bodyMaskArea / (info.width * info.height),
    hash: body.bodyMaskSha256,
    edgeTouch: left <= 0 || top <= 0 || right >= info.width - 1 || bottom >= info.height - 1,
    unmatchedComponentCount: body.unmatchedComponents.length,
    bodyMaskSha256: body.bodyMaskSha256 || '',
    visibleFeatureSha256: crypto.createHash('sha256').update(createVisibleFeatureMask({ data, ...info })).digest('hex')
  }
}

const writeStableFrame = async ({ input, outputPath, placement, canvas }) => {
  const width = Math.max(1, Math.round(placement.width))
  const height = Math.max(1, Math.round(placement.height))
  const left = Math.round(placement.left)
  const top = Math.round(placement.top)
  if (left < 0 || top < 0 || left + width > canvas.width || top + height > canvas.height) {
    throw matteError('stabilized frame exceeds the declared canvas')
  }
  const source = placement.source
  const resized = await sharp(input)
    .extract({ left: source.left, top: source.top, width: source.width, height: source.height })
    .resize({ width, height, fit: 'fill' }).png().toBuffer()
  await sharp({
    create: { width: canvas.width, height: canvas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite([{ input: resized, left, top }]).png().toFile(outputPath)
}

const processFrameSequence = async ({
  framePaths,
  outputDir,
  canvasWidth,
  canvasHeight,
  fps = 12,
  backgroundColor = '#12ff4d',
  backgroundMode = 'color-key',
  padding = 0.1,
  anchorPolicy,
  targetStandingHeightRatio = null,
  selectJumpPhases = false,
  preserveSourceCoordinates = false,
  signal
} = {}) => {
  if (!Array.isArray(framePaths) || framePaths.length < 1 || framePaths.length > 128) throw matteError('framePaths must contain 1 to 128 frames')
  if (!Number.isInteger(Number(canvasWidth)) || !Number.isInteger(Number(canvasHeight))) throw matteError('canvas is invalid')
  if (!Number.isInteger(Number(fps)) || fps < 1 || fps > 60) throw matteError('fps is invalid')
  if (!['color-key', 'source-alpha'].includes(backgroundMode)) throw matteError('background mode is invalid')
  if (typeof preserveSourceCoordinates !== 'boolean') throw matteError('preserveSourceCoordinates must be a boolean')
  const alphaDir = path.join(outputDir, 'alpha')
  const stableDir = path.join(outputDir, 'normalized')
  fs.mkdirSync(alphaDir, { recursive: true })
  fs.mkdirSync(stableDir, { recursive: true })
  let alphaFrames = []
  let frameMetrics = []
  for (let index = 0; index < framePaths.length; index += 1) {
    throwIfAborted(signal)
    const sourcePath = String(framePaths[index] || '')
    if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw matteError(`frame ${index} is missing`)
    const matted = backgroundMode === 'source-alpha'
      ? await sharp(sourcePath).ensureAlpha().png().toBuffer().then((buffer) => ({ buffer, sha256: crypto.createHash('sha256').update(buffer).digest('hex') }))
      : await processMatteFrame(sourcePath, { backgroundColor })
    const alphaPath = path.join(alphaDir, `${String(index + 1).padStart(4, '0')}.png`)
    fs.writeFileSync(alphaPath, matted.buffer)
    const metrics = await inspectAlphaBounds(matted.buffer)
    if (!metrics) throw matteError(`frame ${index} has no visible subject after matting`)
    const box = metrics.bbox
    if (anchorPolicy === 'action-relative-root-v1' && (box.left <= 0 || box.top <= 0 || box.left + box.width >= metrics.canvas.width || box.top + box.height >= metrics.canvas.height)) {
      throw Object.assign(matteError(`frame ${index} subject is clipped in the source video`), { code: 'video_source_clipped' })
    }
    alphaFrames.push({ path: alphaPath, sha256: matted.sha256 })
    frameMetrics.push(metrics)
  }
  const selectedSourceIndexes = selectJumpPhases ? selectJumpingFrameIndexes(frameMetrics) : frameMetrics.map((_, index) => index)
  alphaFrames = selectedSourceIndexes.map((index) => alphaFrames[index])
  frameMetrics = selectedSourceIndexes.map((index) => frameMetrics[index])
  const placements = createStablePlacements({
    frames: frameMetrics,
    canvasWidth: Number(canvasWidth),
    canvasHeight: Number(canvasHeight),
    padding,
    anchorPolicy,
    targetStandingHeightRatio,
    preserveSourceCoordinates
  })
  const normalizedFrames = []
  const normalizedFrameMetrics = []
  for (let index = 0; index < alphaFrames.length; index += 1) {
    throwIfAborted(signal)
    const normalizedPath = path.join(stableDir, `${String(index + 1).padStart(4, '0')}.png`)
    await writeStableFrame({
      input: alphaFrames[index].path,
      outputPath: normalizedPath,
      placement: placements.placements[index],
      canvas: placements.canvas
    })
    const normalizedMetrics = await inspectAlphaBounds(normalizedPath)
    if (!normalizedMetrics) throw matteError(`normalized frame ${index} has no visible subject`)
    normalizedFrameMetrics.push(normalizedMetrics)
    normalizedFrames.push({
      relativePath: path.relative(outputDir, normalizedPath).replace(/\\/g, '/'),
      path: normalizedPath,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(normalizedPath)).digest('hex')
    })
  }
  throwIfAborted(signal)
  const columns = Math.ceil(Math.sqrt(normalizedFrames.length))
  const rows = Math.ceil(normalizedFrames.length / columns)
  const spriteSheetPath = path.join(outputDir, 'spritesheet.png')
  await sharp({
    create: {
      width: columns * placements.canvas.width,
      height: rows * placements.canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(normalizedFrames.map((frame, index) => ({
    input: frame.path,
    left: (index % columns) * placements.canvas.width,
    top: Math.floor(index / columns) * placements.canvas.height
  }))).png().toFile(spriteSheetPath)
  const relativeFrames = normalizedFrames.map(({ relativePath, sha256 }) => ({ relativePath, sha256 }))
  const sidecar = {
    schemaVersion: 1,
    frameCount: normalizedFrames.length,
    fps: Number(fps),
    canvas: placements.canvas,
    layout: { columns, rows, readingOrder: 'left-to-right-top-to-bottom' },
    frames: relativeFrames,
    spriteSheet: {
      relativePath: path.relative(outputDir, spriteSheetPath).replace(/\\/g, '/'),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(spriteSheetPath)).digest('hex')
    },
    metrics: frameMetrics,
    rawMetrics: frameMetrics,
    normalizedMetrics: normalizedFrameMetrics,
    trajectoryScale: placements.trajectoryScale,
    preserveSourceCoordinates,
    selectedSourceIndexes
  }
  const sidecarPath = path.join(outputDir, 'video-sidecar.json')
  fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`)
  return Object.freeze({
    fps: Number(fps),
    canvas: placements.canvas,
    frameCount: normalizedFrames.length,
    alphaFrames: Object.freeze(alphaFrames.map((frame) => Object.freeze({ ...frame }))),
    normalizedFrames: Object.freeze(normalizedFrames.map((frame) => Object.freeze({ ...frame }))),
    frameMetrics: Object.freeze(frameMetrics.map((metric) => Object.freeze(metric))),
    normalizedFrameMetrics: Object.freeze(normalizedFrameMetrics.map((metric) => Object.freeze(metric))),
    placements,
    selectedSourceIndexes,
    spriteSheet: Object.freeze({
      path: spriteSheetPath,
      relativePath: sidecar.spriteSheet.relativePath,
      sha256: sidecar.spriteSheet.sha256,
      columns,
      rows
    }),
    sidecarPath
  })
}

module.exports = {
  DEFAULT_BACKGROUND_TOLERANCE,
  matteError,
  processFrameSequence,
  processMatteFrame
}
