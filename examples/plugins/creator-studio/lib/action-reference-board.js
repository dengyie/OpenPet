const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const resolveInside = ({ dataDir, targetPath, label, requireFile = false }) => {
  const root = path.resolve(dataDir)
  const target = path.resolve(targetPath)
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the Creator Studio data directory`)
  if (requireFile && (!fs.existsSync(target) || !fs.statSync(target).isFile())) throw new Error(`${label} must be a file`)
  return { absolute: target, relative: relative.replace(/\\/g, '/') }
}

const createActionReferenceBoard = async ({ anchorGridPath, sourceDetailPath, outputPath, dataDir, metadata = {} }) => {
  if (!dataDir) throw new Error('Action reference board dataDir is required')
  const output = resolveInside({ dataDir, targetPath: outputPath, label: 'Action reference board output' })
  const anchor = resolveInside({ dataDir, targetPath: anchorGridPath, label: 'Action reference anchor grid', requireFile: true })
  const source = resolveInside({ dataDir, targetPath: sourceDetailPath, label: 'Action reference source detail', requireFile: true })
  const anchorMetadata = await sharp(anchor.absolute).metadata()
  if (Number(anchorMetadata.width) !== 1024 || Number(anchorMetadata.height) !== 1024) {
    throw new Error('Action reference anchor grid must be 1024x1024')
  }
  const sourceBuffer = await sharp(source.absolute)
    .ensureAlpha()
    .resize({ width: 512, height: 1024, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  const sourceMetadata = await sharp(sourceBuffer).metadata()
  const sourceWidth = Number(sourceMetadata.width) || 512
  const sourceHeight = Number(sourceMetadata.height) || 1024
  const sourceLeft = 1024 + Math.round((512 - sourceWidth) / 2)
  const sourceTop = Math.round((1024 - sourceHeight) / 2)
  fs.mkdirSync(path.dirname(output.absolute), { recursive: true })
  const temporaryPath = `${output.absolute}.tmp-${process.pid}-${Date.now()}.png`
  await sharp({ create: { width: 1536, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: anchor.absolute, left: 0, top: 0 },
      { input: sourceBuffer, left: sourceLeft, top: sourceTop }
    ])
    .png()
    .toFile(temporaryPath)
  fs.renameSync(temporaryPath, output.absolute)
  const regions = [
    { regionId: 'anchor-grid', role: 'anchor-grid', x: 0, y: 0, width: 1024, height: 1024, fitMode: 'exact', sourceSha256: sha256File(anchor.absolute) },
    { regionId: 'source-detail', role: 'source-detail', x: 1024, y: 0, width: 512, height: 1024, fitMode: 'contain', sourceSha256: sha256File(source.absolute) }
  ]
  const boardMetadata = {
    version: 1,
    role: 'quality-first-action-reference-board',
    width: 1536,
    height: 1024,
    actionId: String(metadata.actionId || '').slice(0, 80),
    regions
  }
  const metadataPath = output.absolute.replace(/\.png$/i, '.json')
  fs.writeFileSync(metadataPath, `${JSON.stringify(boardMetadata, null, 2)}\n`)
  return {
    role: boardMetadata.role,
    path: output.absolute,
    relativePath: output.relative,
    metadataPath,
    metadataRelativePath: path.relative(path.resolve(dataDir), metadataPath).replace(/\\/g, '/'),
    sha256: sha256File(output.absolute),
    regions
  }
}

module.exports = {
  createActionReferenceBoard
}
