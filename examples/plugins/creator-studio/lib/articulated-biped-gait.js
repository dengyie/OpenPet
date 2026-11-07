const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const CANVAS = 512
// Contact, weight absorption, passing, flight; then exchange the legs.
const STANCE = [
  { x: 40, y: 41, angle: -8 }, { x: 10, y: 33, angle: 0 },
  { x: -16, y: 46, angle: 8 }, { x: -45, y: 45, angle: 28 }
]
const SWING = [
  { x: -40, y: 10, angle: 45 }, { x: -22, y: -12, angle: 55 },
  { x: 17, y: 0, angle: 5 }, { x: 43, y: 25, angle: -20 }
]

const distanceFromSeeds = (seed, width, height) => {
  const distances = new Uint16Array(width * height)
  distances.fill(32000)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x
    distances[pixel] = seed[pixel] ? 0 : Math.min(distances[pixel], x ? distances[pixel - 1] + 1 : 32000, y ? distances[pixel - width] + 1 : 32000)
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const pixel = y * width + x
    distances[pixel] = Math.min(distances[pixel], x < width - 1 ? distances[pixel + 1] + 1 : 32000, y < height - 1 ? distances[pixel + width] + 1 : 32000)
  }
  return distances
}

// Deliberately limited to flat warm-body bipeds with contrasting orange feet.
// Callers validate source paths, hashes, dimensions and composition first;
// all rendered output must still pass the existing technical and visual gates.
const renderArticulatedBipedGait = async ({ sourcePath, outputDir, motionScale = 1, signal }) => {
  signal?.throwIfAborted()
  const { data, info } = await sharp(sourcePath, { limitInputPixels: 2048 * 2048 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const pixelCount = width * height
  const seeds = [new Uint8Array(pixelCount), new Uint8Array(pixelCount), new Uint8Array(pixelCount)]
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x, offset = pixel * 4
    const r = data[offset], g = data[offset + 1]
    if (data[offset + 3] < 128) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    if (r > 150 && g > 120 && r - g < 90) seeds[2][pixel] = 1
  }
  const bodyWidth = maxX - minX + 1, bodyHeight = maxY - minY + 1
  const middle = minX + bodyWidth * 0.48
  for (let y = Math.round(minY + bodyHeight * 0.77); y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x, offset = pixel * 4
    if (data[offset + 3] > 128 && data[offset] > 210 && data[offset] - data[offset + 1] > 90 && data[offset + 1] - data[offset + 2] > 30) seeds[x < middle ? 0 : 1][pixel] = 1
  }
  if (seeds.some(seed => seed.reduce((count, value) => count + value, 0) < 12)) {
    throw Object.assign(new Error('Side pose has no separable warm body and paired orange feet'), { code: 'canonical_rig_unsupported' })
  }
  const distances = seeds.map(seed => distanceFromSeeds(seed, width, height))
  const body = Buffer.from(data), feet = [Buffer.alloc(data.length), Buffer.alloc(data.length)]
  for (let pixel = 0; pixel < pixelCount; pixel++) for (let side = 0; side < 2; side++) {
    const offset = pixel * 4, distance = distances[side][pixel]
    if (seeds[side][pixel] || (distance <= Math.ceil(bodyHeight * 0.060) && distance < distances[2][pixel])) {
      data.copy(feet[side], offset, offset, offset + 4)
      body.fill(0, offset, offset + 4)
    }
  }
  fs.mkdirSync(outputDir, { recursive: true })
  const raw = { width, height, channels: 4 }
  const torsoPng = await sharp(body, { raw }).trim({ background: TRANSPARENT, threshold: 1 }).png().toBuffer()
  const sourceTorso = await sharp(torsoPng).metadata()
  const torsoHeight = 315, torsoWidth = Math.round(sourceTorso.width * torsoHeight / sourceTorso.height)
  const torso = await sharp(torsoPng).resize(torsoWidth, torsoHeight).rotate(7, { background: TRANSPARENT }).png().toBuffer()
  const torsoMeta = await sharp(torso).metadata()
  const footPngs = await Promise.all(feet.map(foot => sharp(foot, { raw }).trim({ background: TRANSPARENT, threshold: 1 }).resize({ width: 65, height: 48, fit: 'inside' }).png().toBuffer()))
  const transforms = [], framePaths = []
  for (let index = 0; index < 8; index++) {
    signal?.throwIfAborted()
    const phase = index % 4, bob = [0, 13, 0, -14][phase] * motionScale
    const hip = { x: 256, y: 389 + bob }
    // The last flight has a clearer folded rear foot than a symmetric copy.
    const legs = index === 7 ? [{ x: 43, y: 38, angle: -8 }, { x: -45, y: 8, angle: 65 }]
      : index < 4 ? [STANCE[phase], SWING[phase]] : [SWING[phase], STANCE[phase]]
    const footLayers = [], connectors = [], posedLegs = []
    for (let side = 0; side < 2; side++) {
      const original = legs[side]
      const pose = { x: original.x * motionScale, y: original.y, angle: original.angle * motionScale }
      posedLegs.push(pose)
      const rootX = hip.x + (side ? 7 : -7), footX = hip.x + pose.x, footY = hip.y + pose.y
      const dx = footX - rootX, dy = footY - hip.y, length = Math.hypot(dx, dy)
      const bend = Math.sqrt(Math.max(0, 34 * 34 - length * length / 4))
      const kneeX = (rootX + footX) / 2 - dy / length * bend
      const kneeY = (hip.y + footY) / 2 + dx / length * bend
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><path d="M${rootX} ${hip.y - 8} L${kneeX} ${kneeY} L${footX} ${footY}" fill="none" stroke="#42250d" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M${rootX} ${hip.y - 8} L${kneeX} ${kneeY} L${footX} ${footY}" fill="none" stroke="#ff9447" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`)
      const foot = await sharp(footPngs[side]).rotate(pose.angle, { background: TRANSPARENT }).png().toBuffer()
      const footMeta = await sharp(foot).metadata()
      connectors.push({ input: svg, left: 0, top: 0 })
      footLayers.push({ input: foot, left: Math.round(footX - footMeta.width / 2 + 6), top: Math.round(footY - footMeta.height * 0.42) })
    }
    const layers = [connectors[0], footLayers[0], connectors[1], footLayers[1], { input: torso, left: Math.round((CANVAS - torsoMeta.width) / 2 + 9), top: Math.round(hip.y - torsoMeta.height + 8) }]
    const file = path.join(outputDir, `source-${index + 1}.png`)
    await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: TRANSPARENT } }).composite(layers).png().toFile(file)
    framePaths.push(file)
    transforms.push({ phase: index, hip, legs: posedLegs })
  }
  return {
    framePaths, transforms,
    rig: { type: 'articulated-biped-gait', anatomy: 'warm-body-orange-paired-feet', interpolation: 'source-pixel-parts-and-two-segment-connectors', canvas: { width: CANVAS, height: CANVAS } }
  }
}

module.exports = { renderArticulatedBipedGait }
