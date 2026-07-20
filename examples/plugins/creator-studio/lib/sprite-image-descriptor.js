const fs = require('node:fs')
const sharp = require('sharp')

const round = (value, digits = 6) => Number(Number(value || 0).toFixed(digits))
const luminance = (r, g, b, alpha) => ((0.2126 * r) + (0.7152 * g) + (0.0722 * b)) * (alpha / 255)

const createPerceptualHash = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .resize(9, 8, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let bits = ''
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = ((y * 9) + x) * info.channels
      const right = left + info.channels
      bits += luminance(data[left], data[left + 1], data[left + 2], data[left + 3]) >
        luminance(data[right], data[right + 1], data[right + 2], data[right + 3])
        ? '1'
        : '0'
    }
  }
  return Array.from({ length: 16 }, (_value, index) => parseInt(bits.slice(index * 4, (index + 1) * 4), 2).toString(16)).join('')
}

const createSpriteImageDescriptors = async ({ imagePath, alphaThreshold = 8 } = {}) => {
  if (!imagePath || !fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
    throw new Error('Sprite descriptor image must be an existing file')
  }
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const width = info.width
  const height = info.height
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let visible = 0
  let sumX = 0
  let sumY = 0
  const rgb = { r: 0, g: 0, b: 0 }
  const bands = Array.from({ length: 3 }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * info.channels
      if (data[offset + 3] <= alphaThreshold) continue
      visible += 1
      sumX += x
      sumY += y
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      rgb.r += data[offset]
      rgb.g += data[offset + 1]
      rgb.b += data[offset + 2]
    }
  }
  if (!visible) throw new Error('Sprite descriptor image has no visible pixels')
  const boundsWidth = maxX - minX + 1
  const boundsHeight = maxY - minY + 1
  for (let y = minY; y <= maxY; y += 1) {
    const bandIndex = Math.min(2, Math.floor(((y - minY) / Math.max(1, boundsHeight)) * 3))
    for (let x = minX; x <= maxX; x += 1) {
      const offset = ((y * width) + x) * info.channels
      if (data[offset + 3] <= alphaThreshold) continue
      bands[bandIndex].r += data[offset]
      bands[bandIndex].g += data[offset + 1]
      bands[bandIndex].b += data[offset + 2]
      bands[bandIndex].count += 1
    }
  }
  const alphaMaskDescriptor = []
  for (let cellY = 0; cellY < 8; cellY += 1) {
    for (let cellX = 0; cellX < 8; cellX += 1) {
      let alphaSum = 0
      let count = 0
      const startX = Math.floor((cellX * width) / 8)
      const endX = Math.floor(((cellX + 1) * width) / 8)
      const startY = Math.floor((cellY * height) / 8)
      const endY = Math.floor(((cellY + 1) * height) / 8)
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          alphaSum += data[(((y * width) + x) * info.channels) + 3]
          count += 1
        }
      }
      alphaMaskDescriptor.push(round(alphaSum / Math.max(1, count) / 255))
    }
  }
  const meanColorDescriptor = [rgb.r, rgb.g, rgb.b].map((value) => round(value / visible / 255))
  const identityDescriptor = [
    round(boundsWidth / Math.max(1, boundsHeight) / 4),
    round(visible / (width * height)),
    round((sumX / visible) / width),
    round((sumY / visible) / height),
    ...bands.flatMap((band) => band.count
      ? [round(band.r / band.count / 255), round(band.g / band.count / 255), round(band.b / band.count / 255)]
      : [0, 0, 0])
  ]
  return Object.freeze({
    version: 1,
    perceptualHash: await createPerceptualHash(imagePath),
    identityDescriptor: Object.freeze(identityDescriptor),
    alphaMaskDescriptor: Object.freeze(alphaMaskDescriptor),
    meanColorDescriptor: Object.freeze(meanColorDescriptor)
  })
}

module.exports = {
  createSpriteImageDescriptors
}
