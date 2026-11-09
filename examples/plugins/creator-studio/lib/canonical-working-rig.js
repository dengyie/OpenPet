const path = require('node:path')
const sharp = require('sharp')

const CANVAS = 512
// The input is an engaged chest-level pose. Include the inner wing tip rather
// than squeezing a resting appendage against the outer body silhouette.
const WORK_REGION = Object.freeze({ top: 0.43, bottom: 0.82, protectedCoreHalfWidth: 0, innerRampWidth: 0.15, outerRampWidth: 0.20 })

// This is a local deformation of the existing lead-side appendage. The map is
// the identity outside that side of the mid-body: the eyes, beak, other side
// and planted feet retain their original pixels. A positive Jacobian prevents
// folded limbs; inverse sampling avoids cutout holes or invented body fills.
const renderWorkingFrames = async ({ source, width, height, outputDir, transforms, leadSide, signal }) => {
  const scale = Math.min(CANVAS * 0.74 / height, CANVAS * 0.70 / width)
  const targetWidth = Math.round(width * scale)
  const targetHeight = Math.round(height * scale)
  const left = Math.round((CANVAS - targetWidth) / 2)
  const top = 450 - targetHeight
  const centerX = CANVAS / 2
  const direction = leadSide === 'viewer-left' ? 1 : -1
  const startY = top + targetHeight * WORK_REGION.top
  const endY = top + targetHeight * WORK_REGION.bottom
  const spanY = endY - startY
  const coreHalfWidth = targetWidth * WORK_REGION.protectedCoreHalfWidth
  const posed = await sharp(source).resize({ width: targetWidth, height: targetHeight, fit: 'fill' }).png().toBuffer()
  const base = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: posed, left, top }]).ensureAlpha().raw().toBuffer()
  const field = (x, y) => {
    const distance = direction * (centerX - x) - coreHalfWidth
    if (y <= startY || y >= endY || distance <= 0) return 0
    const phase = Math.PI * (y - startY) / spanY
    const ramp = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
    const lateral = ramp(distance / (targetWidth * WORK_REGION.innerRampWidth)) * ramp((targetWidth / 2 - distance) / (targetWidth * WORK_REGION.outerRampWidth))
    const vertical = Math.sin(phase) ** 2
    return lateral * vertical
  }
  const vectors = transforms.map(transform => ({ x: direction * transform.inward * targetWidth, y: -transform.lift * targetHeight }))
  // det(I + v*grad(w)) = 1 + v·grad(w). Smoothstep has derivative
  // at most1.5, so the following lower bound covers the continuous field,
  // including between pixels. The vertical extrema reduce to a sinusoid.
  const minimumJacobian = Math.min(1, ...vectors.map(vector => {
    // The two lateral ramps do not overlap, so the narrower ramp bounds dx.
    const horizontal = Math.abs(vector.x) * 1.5 / (targetWidth * Math.min(WORK_REGION.innerRampWidth, WORK_REGION.outerRampWidth))
    const vertical = Math.abs(vector.y) * Math.PI / spanY
    return 1 - horizontal / 2 - Math.hypot(horizontal / 2, vertical)
  }))
  if (!Number.isFinite(minimumJacobian) || minimumJacobian < 0.1) throw Object.assign(new Error('Working rig deformation would fold the source anatomy'), { code: 'canonical_rig_invalid' })
  const frames = []
  for (const [index, vector] of vectors.entries()) {
    signal?.throwIfAborted()
    const output = Buffer.from(base)
    if (vector.x || vector.y) {
      for (let y = Math.floor(startY); y <= Math.ceil(endY); y++) {
        signal?.throwIfAborted()
        for (let x = 0; x < CANVAS; x++) {
          if (!field(x, y)) continue
          // p = q - v*w(p). With a positive Jacobian the scalar root is
          // monotonic on [0,1]; bisection bounds inverse error to <0.003px.
          let low = 0, high = 1
          for (let iteration = 0; iteration < 15; iteration++) {
            const middle = (low + high) / 2
            if (middle < field(x - vector.x * middle, y - vector.y * middle)) low = middle
            else high = middle
          }
          const weight = (low + high) / 2
          const sx = x - vector.x * weight, sy = y - vector.y * weight
          const px = Math.floor(sx), py = Math.floor(sy)
          let alpha = 0
          const rgb = [0, 0, 0]
          for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
            const sampleX = px + ox, sampleY = py + oy
            if (sampleX < 0 || sampleX >= CANVAS || sampleY < 0 || sampleY >= CANVAS) continue
            const sample = (sampleY * CANVAS + sampleX) * 4
            const coverage = (ox ? sx - px : 1 - sx + px) * (oy ? sy - py : 1 - sy + py) * base[sample + 3]
            alpha += coverage
            for (let channel = 0; channel < 3; channel++) rgb[channel] += base[sample + channel] * coverage
          }
          const offset = (y * CANVAS + x) * 4
          output.fill(0, offset, offset + 4)
          if (alpha > 0) {
            for (let channel = 0; channel < 3; channel++) output[offset + channel] = Math.round(rgb[channel] / alpha)
            output[offset + 3] = Math.round(alpha)
          }
        }
      }
    }
    const file = path.join(outputDir, `source-${index + 1}.png`)
    await sharp(output, { raw: { width: CANVAS, height: CANVAS, channels: 4 } }).png().toFile(file)
    frames.push(file)
  }
  return {
    framePaths: frames,
    rig: { type: 'continuous-side-work', leadSide, region: WORK_REGION, interpolation: 'premultiplied-bilinear', inverseIterations: 15, minimumJacobian }
  }
}

module.exports = { renderWorkingFrames }
