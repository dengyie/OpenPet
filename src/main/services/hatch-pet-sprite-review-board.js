const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { getSpriteLayout } = require('../../../examples/plugins/creator-studio/lib/action-sheet-layout')

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

const writeBoard = async ({ width, height, outputPath, rendered }) => {
  const resolvedOutputPath = path.resolve(outputPath)
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true })
  const temporaryPath = `${resolvedOutputPath}.tmp-${process.pid}-${Date.now()}.png`
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
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
  if (!Array.isArray(candidates) || candidates.length !== 3) {
    throw new Error('Canonical evaluator board requires exactly three candidates')
  }
  const definitions = [
    { sourcePath, region: { regionId: 'source', role: 'source-identity', x: 0, y: 0, width: 1024, height: 1024 } },
    { sourcePath: candidates[0].path, region: { regionId: String(candidates[0].candidateId), role: 'canonical-candidate', x: 1024, y: 0, width: 1024, height: 1024 } },
    { sourcePath: candidates[1].path, region: { regionId: String(candidates[1].candidateId), role: 'canonical-candidate', x: 0, y: 1024, width: 1024, height: 1024 } },
    { sourcePath: candidates[2].path, region: { regionId: String(candidates[2].candidateId), role: 'canonical-candidate', x: 1024, y: 1024, width: 1024, height: 1024 } }
  ]
  const rendered = await Promise.all(definitions.map(renderRegion))
  return writeBoard({ width: 2048, height: 2048, outputPath, rendered })
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
  const rendered = await Promise.all(definitions.map(renderRegion))
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
