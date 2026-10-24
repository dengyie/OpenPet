const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { getSpriteLayout } = require('./action-sheet-layout')
const { OFFICIAL_FULL_PET_ROWS } = require('./full-pet-row-contract')

const ATLAS_COLUMNS = 8
const ATLAS_ROWS = 9
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
// Review boards are sent as a single raster image to the visual evaluator. An
// opaque neutral canvas keeps transparent sprite pixels distinguishable from
// the transport/background and prevents a valid board from looking blank.
const REVIEW_BOARD_BACKGROUND = { r: 236, g: 239, b: 243, alpha: 1 }

const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const assertImage = (filePath, label) => {
  const resolved = path.resolve(String(filePath || ''))
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${label} must be a file`)
  return resolved
}

const renderRegion = async ({ sourcePath, region }) => {
  const input = assertImage(sourcePath, `Review-board ${region.regionId}`)
  const buffer = await sharp(input)
    .ensureAlpha()
    .resize({ width: region.width, height: region.height, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  const metadata = await sharp(buffer).metadata()
  const width = Number(metadata.width) || region.width
  const height = Number(metadata.height) || region.height
  return {
    composite: {
      input: buffer,
      left: region.x + Math.round((region.width - width) / 2),
      top: region.y + Math.round((region.height - height) / 2)
    },
    record: Object.freeze({
      ...region,
      fitMode: 'contain',
      sourceSha256: sha256File(input),
      renderedWidth: width,
      renderedHeight: height
    })
  }
}

const isOfficialAtlas = ({ width, height }) => (
  width >= ATLAS_COLUMNS &&
  height >= ATLAS_ROWS &&
  width % ATLAS_COLUMNS === 0 &&
  height % ATLAS_ROWS === 0 &&
  Math.abs((width / height) - (1536 / 1872)) < 0.02
)

const createTrimmedFrame = async ({ sourcePath, metadata, frameIndex, width, height }) => {
  const cellWidth = Math.floor(metadata.width / ATLAS_COLUMNS)
  const cellHeight = Math.floor(metadata.height / ATLAS_ROWS)
  const row = Math.floor(frameIndex / ATLAS_COLUMNS)
  const column = frameIndex % ATLAS_COLUMNS
  const cell = await sharp(sourcePath)
    .extract({ left: column * cellWidth, top: row * cellHeight, width: cellWidth, height: cellHeight })
    .ensureAlpha()
    .png()
    .toBuffer()
  return sharp(cell)
    .trim({ background: TRANSPARENT, threshold: 1 })
    .resize({ width, height, fit: 'inside', withoutEnlargement: false, background: TRANSPARENT })
    .png()
    .toBuffer()
}

const representativeFrameIndexes = (row) => {
  const indexes = [0, Math.floor((row.frameCount - 1) / 2), row.frameCount - 1]
  return [...new Set(indexes)].map((index) => row.row * ATLAS_COLUMNS + index)
}

const createActionMontage = async ({ sourcePath, width, height, framesPerAction = 3 }) => {
  const metadata = await sharp(sourcePath).metadata()
  const columns = 3
  const rows = 3
  const cardWidth = Math.floor(width / columns)
  const cardHeight = Math.floor(height / rows)
  const gap = Math.max(4, Math.floor(Math.min(cardWidth, cardHeight) * 0.04))
  const slotWidth = Math.max(1, Math.floor((cardWidth - (gap * (framesPerAction + 1))) / framesPerAction))
  const slotHeight = Math.max(1, cardHeight - (gap * 2))
  const composites = []
  for (let actionIndex = 0; actionIndex < OFFICIAL_FULL_PET_ROWS.length; actionIndex += 1) {
    const row = OFFICIAL_FULL_PET_ROWS[actionIndex]
    const frameIndexes = representativeFrameIndexes(row).slice(0, framesPerAction)
    for (let frameIndex = 0; frameIndex < frameIndexes.length; frameIndex += 1) {
      composites.push({
        input: await createTrimmedFrame({ sourcePath, metadata, frameIndex: frameIndexes[frameIndex], width: slotWidth, height: slotHeight }),
        left: (actionIndex % columns) * cardWidth + gap + frameIndex * (slotWidth + gap),
        top: Math.floor(actionIndex / columns) * cardHeight + gap
      })
    }
  }
  return sharp({
    create: { width, height, channels: 4, background: TRANSPARENT }
  }).composite(composites).png().toBuffer()
}

const createFinalAtlasProof = async ({ sourcePath, width, height }) => {
  const overviewWidth = Math.floor(width / 2)
  const detailWidth = width - overviewWidth
  const overview = await sharp(sourcePath)
    .ensureAlpha()
    .resize({ width: overviewWidth, height, fit: 'inside', withoutEnlargement: false, background: TRANSPARENT })
    .png()
    .toBuffer()
  const details = await createActionMontage({ sourcePath, width: detailWidth, height, framesPerAction: 2 })
  const overviewMetadata = await sharp(overview).metadata()
  return sharp({ create: { width, height, channels: 4, background: TRANSPARENT } })
    .composite([
      { input: overview, left: Math.floor((overviewWidth - overviewMetadata.width) / 2), top: Math.floor((height - overviewMetadata.height) / 2) },
      { input: details, left: overviewWidth, top: 0 }
    ])
    .png()
    .toBuffer()
}

const renderFinalVisualRegion = async ({ sourcePath, region, mode }) => {
  const input = assertImage(sourcePath, `Review-board ${region.regionId}`)
  const metadata = await sharp(input).metadata()
  let buffer
  let renderMode = 'contain'
  if (isOfficialAtlas({ width: Number(metadata.width) || 0, height: Number(metadata.height) || 0 })) {
    buffer = mode === 'action-montage'
      ? await createActionMontage({ sourcePath: input, width: region.width, height: region.height })
      : await createFinalAtlasProof({ sourcePath: input, width: region.width, height: region.height })
    renderMode = mode === 'action-montage'
      ? 'readable-action-montage'
      : 'atlas-overview+readable-action-montage'
  } else {
    buffer = await sharp(input)
      .ensureAlpha()
      .resize({ width: region.width, height: region.height, fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer()
  }
  const renderedMetadata = await sharp(buffer).metadata()
  const renderedWidth = Number(renderedMetadata.width) || region.width
  const renderedHeight = Number(renderedMetadata.height) || region.height
  return {
    composite: {
      input: buffer,
      left: region.x + Math.round((region.width - renderedWidth) / 2),
      top: region.y + Math.round((region.height - renderedHeight) / 2)
    },
    record: Object.freeze({
      ...region,
      fitMode: renderMode,
      sourceSha256: sha256File(input),
      renderedWidth,
      renderedHeight
    })
  }
}

const writeBoard = async ({ width, height, outputPath, rendered }) => {
  const resolvedOutputPath = path.resolve(outputPath)
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true })
  const temporaryPath = `${resolvedOutputPath}.tmp-${process.pid}-${Date.now()}.png`
  await sharp({ create: { width, height, channels: 4, background: REVIEW_BOARD_BACKGROUND } })
    .composite(rendered.map((entry) => entry.composite))
    .png()
    .toFile(temporaryPath)
  fs.renameSync(temporaryPath, resolvedOutputPath)
  const regions = rendered.map((entry) => entry.record)
  const metadataPath = resolvedOutputPath.replace(/\.png$/i, '.json')
  const metadata = { version: 1, width, height, sha256: sha256File(resolvedOutputPath), regions }
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  return {
    path: resolvedOutputPath,
    metadataPath,
    sha256: metadata.sha256,
    width,
    height,
    regions
  }
}

const createCanonicalEvaluatorBoard = async ({ sourcePath, candidates = [], outputPath }) => {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 4) {
    throw new Error('Canonical evaluator board requires one to four candidates')
  }
  const cells = [
    { x: 0, y: 0 },
    { x: 1024, y: 0 },
    { x: 2048, y: 0 },
    { x: 0, y: 1024 },
    { x: 1024, y: 1024 }
  ]
  const definitions = [{
    sourcePath,
    region: { regionId: 'source', role: 'source-identity', ...cells[0], width: 1024, height: 1024 }
  }]
  candidates.forEach((candidate, index) => {
    definitions.push({
      sourcePath: candidate.path,
      region: {
        regionId: String(candidate.candidateId),
        role: 'canonical-candidate',
        ...cells[index + 1],
        width: 1024,
        height: 1024
      }
    })
  })
  const rendered = await Promise.all(definitions.map(renderRegion))
  return writeBoard({ width: 3072, height: 2048, outputPath, rendered })
}

const createActionEvaluatorBoard = async ({ sourcePath, canonicalPath, adjacentPath = '', candidateFrames = [], outputPath }) => {
  const layout = getSpriteLayout(candidateFrames.length)
  const definitions = [
    { sourcePath, region: { regionId: 'source', role: 'source-identity', x: 0, y: 0, width: 512, height: 512 } },
    { sourcePath: canonicalPath, region: { regionId: 'canonical', role: 'canonical-identity', x: 512, y: 0, width: 512, height: 512 } }
  ]
  if (adjacentPath) {
    definitions.push({ sourcePath: adjacentPath, region: { regionId: 'adjacent-action', role: 'adjacent-action', x: 1024, y: 0, width: 1024, height: 512 } })
  }
  const horizontalOffset = Math.round((2048 - (layout.columns * 512)) / 2)
  candidateFrames.forEach((frame, index) => {
    const column = index % layout.columns
    const row = Math.floor(index / layout.columns)
    definitions.push({
      sourcePath: frame.path,
      region: {
        regionId: `frame-${index + 1}`,
        role: 'candidate-frame',
        frameIndex: index,
        x: horizontalOffset + (column * 512),
        y: 512 + (row * 512),
        width: 512,
        height: 512
      }
    })
  })
  const rendered = await Promise.all(definitions.map(renderRegion))
  return writeBoard({ width: 2048, height: 1536, outputPath, rendered })
}

const createFinalPackageEvaluatorBoard = async ({ sourcePath, canonicalPath, actionReviewPath, atlasPath, outputPath }) => {
  const definitions = [
    { sourcePath, region: { regionId: 'source', role: 'source-identity', x: 0, y: 0, width: 512, height: 512 } },
    { sourcePath: canonicalPath, region: { regionId: 'canonical', role: 'canonical-identity', x: 512, y: 0, width: 512, height: 512 } },
    { sourcePath: actionReviewPath, region: { regionId: 'action-review', role: 'action-contact-sheet', x: 1024, y: 0, width: 1024, height: 512 } },
    { sourcePath: atlasPath, region: { regionId: 'atlas', role: 'final-atlas', x: 0, y: 512, width: 2048, height: 1024 } }
  ]
  const rendered = await Promise.all([
    renderRegion(definitions[0]),
    renderRegion(definitions[1]),
    renderFinalVisualRegion({ ...definitions[2], mode: 'action-montage' }),
    renderFinalVisualRegion({ ...definitions[3], mode: 'atlas-proof' })
  ])
  return writeBoard({ width: 2048, height: 1536, outputPath, rendered })
}

const validateEvaluationRegions = ({ evaluation = {}, regions = [] } = {}) => {
  const allowed = new Set(regions.map((region) => String(region.regionId || '')).filter(Boolean))
  const defects = Array.isArray(evaluation.defects) ? evaluation.defects : []
  for (const defect of defects) {
    const regionId = String(defect?.regionId || '')
    if (!regionId || !allowed.has(regionId)) {
      throw new Error(`Evaluation references unknown review-board region: ${regionId || '(missing)'}`)
    }
  }
  return Object.freeze({ ...evaluation, defects: defects.map((defect) => Object.freeze({ ...defect })) })
}

module.exports = {
  createActionEvaluatorBoard,
  createCanonicalEvaluatorBoard,
  createFinalPackageEvaluatorBoard,
  validateEvaluationRegions
}
