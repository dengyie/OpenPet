const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const ensureInside = ({ dataDir, targetPath, label, requireFile = false }) => {
  const root = path.resolve(dataDir)
  const target = path.resolve(targetPath)
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the Creator Studio data directory`)
  if (requireFile && (!fs.existsSync(target) || !fs.statSync(target).isFile())) throw new Error(`${label} must be a file`)
  return { absolute: target, relative: relative.replace(/\\/g, '/') }
}

const writeAtomicImage = async (pipeline, outputPath) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}.png`
  await pipeline.png().toFile(temporaryPath)
  fs.renameSync(temporaryPath, outputPath)
}

const createCharacterAnchorGrid = async ({ masterPath, layout, outputPath, dataDir, planRevision = 1 }) => {
  if (!dataDir) throw new Error('Character anchor grid dataDir is required')
  const master = ensureInside({ dataDir, targetPath: masterPath, label: 'Character anchor master', requireFile: true })
  const output = ensureInside({ dataDir, targetPath: outputPath, label: 'Character anchor grid output' })
  const columns = Number(layout?.columns)
  const rows = Number(layout?.rows)
  const cellCount = Number(layout?.cellCount || columns * rows)
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns * rows !== cellCount) {
    throw new Error('Character anchor grid layout is invalid')
  }
  const unused = new Set(Array.isArray(layout?.unusedCells) ? layout.unusedCells.map(Number) : [])
  const canvasWidth = Number(layout?.canvas?.width) || 1024
  const canvasHeight = Number(layout?.canvas?.height) || 1024
  if (canvasWidth !== 1024 || canvasHeight !== 1024) throw new Error('Character anchor grid canvas must be 1024x1024')
  const cellWidth = Math.floor(canvasWidth / columns)
  const cellHeight = Math.floor(canvasHeight / rows)
  const targetHeight = Math.max(1, Math.round(cellHeight * 0.72))
  const targetWidth = Math.max(1, Math.round(cellWidth * 0.82))
  const masterBuffer = await sharp(master.absolute)
    .ensureAlpha()
    .resize({ width: targetWidth, height: targetHeight, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  const masterMetadata = await sharp(masterBuffer).metadata()
  const renderedWidth = Number(masterMetadata.width) || targetWidth
  const renderedHeight = Number(masterMetadata.height) || targetHeight
  const composites = []
  const regions = []
  for (let index = 0; index < cellCount; index += 1) {
    if (unused.has(index)) continue
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = column * cellWidth
    const y = row * cellHeight
    const left = x + Math.round((cellWidth - renderedWidth) / 2)
    const baseline = y + Math.round(cellHeight * 0.9)
    const top = Math.max(y, baseline - renderedHeight)
    composites.push({ input: masterBuffer, left, top })
    regions.push({
      regionId: `cell-${index + 1}`,
      role: 'canonical-anchor-cell',
      cellIndex: index,
      x,
      y,
      width: cellWidth,
      height: cellHeight,
      subject: { left, top, width: renderedWidth, height: renderedHeight, baselineY: baseline },
      sourceSha256: sha256File(master.absolute)
    })
  }
  await writeAtomicImage(sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites), output.absolute)
  const metadata = {
    version: 1,
    role: 'character-anchor-grid',
    planRevision: Number(planRevision) || 1,
    width: canvasWidth,
    height: canvasHeight,
    masterRelativePath: master.relative,
    masterSha256: sha256File(master.absolute),
    layout: { columns, rows, cellCount, unusedCells: [...unused].sort((a, b) => a - b) },
    regions
  }
  const metadataPath = output.absolute.replace(/\.png$/i, '.json')
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  return {
    role: metadata.role,
    path: output.absolute,
    relativePath: output.relative,
    metadataPath,
    metadataRelativePath: path.relative(path.resolve(dataDir), metadataPath).replace(/\\/g, '/'),
    sha256: sha256File(output.absolute),
    regions
  }
}

module.exports = {
  createCharacterAnchorGrid
}
