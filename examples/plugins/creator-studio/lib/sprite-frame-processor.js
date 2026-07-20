const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { ALPHA_THRESHOLD, measureBodyMask } = require('./character-scale-profile')

const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const median = (values) => {
  if (!values.length) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const cellBounds = ({ index, columns, rows, width, height }) => {
  const column = index % columns
  const row = Math.floor(index / columns)
  const left = Math.floor(column * width / columns)
  const top = Math.floor(row * height / rows)
  const right = Math.floor((column + 1) * width / columns)
  const bottom = Math.floor((row + 1) * height / rows)
  return { column, row, left, top, width: right - left, height: bottom - top }
}

const makeTransparentBuffer = ({ source, info, identityPixels }) => {
  const clean = Buffer.alloc(info.width * info.height * 4)
  for (const pixel of identityPixels) {
    const sourceOffset = ((pixel.y * info.width) + pixel.x) * 4
    clean[sourceOffset] = source[sourceOffset]
    clean[sourceOffset + 1] = source[sourceOffset + 1]
    clean[sourceOffset + 2] = source[sourceOffset + 2]
    clean[sourceOffset + 3] = source[sourceOffset + 3]
  }
  return clean
}

const hasVisiblePixels = (data, threshold = ALPHA_THRESHOLD) => {
  for (let index = 3; index < data.length; index += 4) if (data[index] > threshold) return true
  return false
}

const createAnimatedGif = async ({ frames, outputPath }) => {
  const inputs = frames.map((frame) => fs.readFileSync(frame.path))
  if (!inputs.length) {
    await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).gif().toFile(outputPath)
    return
  }
  await sharp(inputs, { join: { animated: true } })
    .gif({ delay: Array(inputs.length).fill(100), loop: 0, keepDuplicateFrames: true })
    .toFile(outputPath)
}

const processSpriteSheet = async ({ inputPath, outputDir, layout, profile = {}, actionPolicy = {} } = {}) => {
  if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) throw new Error('Sprite processor input must be a file')
  const columns = Number(layout?.columns)
  const rows = Number(layout?.rows)
  const cellCount = Number(layout?.cellCount || columns * rows)
  const unused = new Set(Array.isArray(layout?.unusedCells) ? layout.unusedCells.map(Number) : [])
  const metadata = await sharp(inputPath).metadata()
  const width = Number(metadata.width)
  const height = Number(metadata.height)
  if (width !== 1024 || height !== 1024 || !Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    throw new Error('Sprite processor requires a 1024x1024 declared grid')
  }
  if (!Number.isInteger(cellCount) || cellCount < 1 || cellCount > columns * rows || [...unused].some((index) => !Number.isInteger(index) || index < 0 || index >= cellCount)) {
    throw new Error('Sprite processor requires a valid declared grid cell set')
  }

  const cells = []
  const unusedCellMetrics = []
  for (let index = 0; index < cellCount; index += 1) {
    const bounds = cellBounds({ index, columns, rows, width, height })
    const { data, info } = await sharp(inputPath)
      .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (unused.has(index)) {
      const visible = hasVisiblePixels(data)
      unusedCellMetrics.push({ index, visible })
      if (visible) throw new Error(`unused-cell-contamination:${index}`)
      continue
    }
    const metrics = measureBodyMask({
      data,
      width: info.width,
      height: info.height,
      characterClass: profile.characterClass || 'grounded-compact-character',
      canonicalProfile: profile
    })
    cells.push({ index, ...bounds, data, info, metrics })
  }
  const bodyHeights = cells.filter((cell) => !cell.metrics.empty).map((cell) => cell.metrics.bodyBounds.maxY - cell.metrics.bodyBounds.minY + 1)
  if (!bodyHeights.length) throw new Error('Sprite processor found no visible frames')
  const targetHeight = Math.max(1, Number(profile.runtimeStandingHeightPx) || 92)
  const appliedScale = targetHeight / median(bodyHeights)
  fs.mkdirSync(outputDir, { recursive: true })
  const frameDir = path.join(outputDir, 'frames')
  fs.mkdirSync(frameDir, { recursive: true })
  const frames = []
  const frameMetrics = []
  const rawAnchors = []

  for (const cell of cells) {
    const outputPath = path.join(frameDir, `${String(cell.index + 1).padStart(2, '0')}.png`)
    if (cell.metrics.empty) {
      await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(outputPath)
      frames.push({ index: cell.index, path: outputPath, sha256: sha256File(outputPath) })
      frameMetrics.push({ index: cell.index, empty: true, appliedScale, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0 })
      continue
    }
    const bounds = cell.metrics.bodyBounds
    const bodyWidth = bounds.maxX - bounds.minX + 1
    const bodyHeight = bounds.maxY - bounds.minY + 1
    const resizedWidth = Math.max(1, Math.round(bodyWidth * appliedScale))
    const resizedHeight = Math.max(1, Math.round(bodyHeight * appliedScale))
    const cleaned = makeTransparentBuffer({ source: cell.data, info: cell.info, identityPixels: cell.metrics.identityPixels })
    const bodyBuffer = await sharp(cleaned, { raw: cell.info })
      .extract({ left: bounds.minX, top: bounds.minY, width: bodyWidth, height: bodyHeight })
      .resize({ width: resizedWidth, height: resizedHeight, fit: 'fill' })
      .png()
      .toBuffer()
    const airborne = actionPolicy.anchorPolicy === 'action-relative-root-v1' || profile.characterClass === 'floating-character'
    const left = Math.round((128 - resizedWidth) / 2)
    const rawAnchorY = actionPolicy.anchorPolicy === 'action-relative-root-v1'
      ? (bounds.minY + bounds.maxY) / 2 / cell.info.height
      : (profile.characterClass === 'grounded-elongated-character' ? cell.metrics.elongatedContactBandY : cell.metrics.compactBaselineY)
    const top = airborne
      ? Math.round((128 - resizedHeight) / 2)
      : Math.round(128 * 0.9) - resizedHeight
    rawAnchors.push(rawAnchorY)
    const pasteClamped = left < 0 || top < 0 || left + resizedWidth > 128 || top + resizedHeight > 128
    const edgeTouch = bounds.minX <= 0 || bounds.minY <= 0 || bounds.maxX >= cell.info.width - 1 || bounds.maxY >= cell.info.height - 1
    if (pasteClamped) {
      await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(outputPath)
      frames.push({ index: cell.index, path: outputPath, sha256: sha256File(outputPath) })
      frameMetrics.push({
        index: cell.index,
        empty: false,
        appliedScale,
        edgeTouch,
        pasteClamped: true,
        outputSuppressed: true,
        unmatchedComponentCount: cell.metrics.unmatchedComponents.length,
        subjectHeightRatio: cell.metrics.subjectHeightRatio,
        subjectWidthRatio: cell.metrics.subjectWidthRatio,
        anchorY: rawAnchorY,
        coreThicknessP75Ratio: cell.metrics.coreThicknessP75Ratio
      })
      continue
    }
    await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: bodyBuffer, left, top }])
      .png()
      .toFile(outputPath)
    frames.push({ index: cell.index, path: outputPath, sha256: sha256File(outputPath) })
    frameMetrics.push({
      index: cell.index,
      empty: false,
      appliedScale,
      edgeTouch,
      pasteClamped,
      outputSuppressed: false,
      unmatchedComponentCount: cell.metrics.unmatchedComponents.length,
      subjectHeightRatio: cell.metrics.subjectHeightRatio,
      subjectWidthRatio: cell.metrics.subjectWidthRatio,
      anchorY: rawAnchorY,
      coreThicknessP75Ratio: cell.metrics.coreThicknessP75Ratio
    })
  }

  const processedSheetPath = path.join(outputDir, 'processed-sheet.png')
  const composites = frames.map((frame) => ({
    input: frame.path,
    left: (frame.index % columns) * 128,
    top: Math.floor(frame.index / columns) * 128
  }))
  await sharp({ create: { width: columns * 128, height: rows * 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toFile(processedSheetPath)
  const contactSheetPath = path.join(outputDir, 'contact-sheet.png')
  fs.copyFileSync(processedSheetPath, contactSheetPath)
  const gifPath = path.join(outputDir, 'animation.gif')
  await createAnimatedGif({ frames, outputPath: gifPath })
  const processorMetadata = {
    version: 1,
    inputSha256: sha256File(inputPath),
    appliedScale,
    layout: { columns, rows, cellCount, unusedCells: [...unused] },
    unusedCellMetrics,
    rawTrajectory: rawAnchors.length ? { minY: Math.min(...rawAnchors), maxY: Math.max(...rawAnchors) } : null,
    frames: frameMetrics
  }
  const metadataPath = path.join(outputDir, 'processor-meta.json')
  fs.writeFileSync(metadataPath, `${JSON.stringify(processorMetadata, null, 2)}\n`)
  const hashes = {
    input: processorMetadata.inputSha256,
    processedSheet: sha256File(processedSheetPath),
    contactSheet: sha256File(contactSheetPath),
    gif: sha256File(gifPath),
    frames: Object.fromEntries(frames.map((frame) => [String(frame.index), frame.sha256]))
  }
  return {
    frames,
    processedSheet: { path: processedSheetPath, sha256: hashes.processedSheet },
    contactSheet: { path: contactSheetPath, sha256: hashes.contactSheet },
    gif: { path: gifPath, sha256: hashes.gif },
    metrics: processorMetadata,
    hashes,
    metadataPath
  }
}

module.exports = {
  processSpriteSheet
}
