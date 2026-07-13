const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { OFFICIAL_FULL_PET_ROWS } = require('./full-pet-row-contract')

const CELL_WIDTH = 192
const CELL_HEIGHT = 208
const ATLAS_COLUMNS = 8
const ATLAS_ROWS = 9
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const getFramePath = (frame) => String(frame?.path || frame || '').trim()

const getNearestExistingPath = (targetPath) => {
  let currentPath = targetPath
  while (!fs.existsSync(currentPath)) {
    const parent = path.dirname(currentPath)
    if (parent === currentPath) break
    currentPath = parent
  }
  return currentPath
}

const resolveInsideDataDir = ({ dataDir, targetPath, message, mustExist = true }) => {
  const root = path.resolve(dataDir)
  const resolved = path.resolve(targetPath)
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
  const realRoot = fs.realpathSync.native(root)
  if (mustExist) {
    if (!fs.existsSync(resolved)) throw new Error(message)
    const realTarget = fs.realpathSync.native(resolved)
    const realRelative = path.relative(realRoot, realTarget)
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw new Error(message)
    }
    return realTarget
  }
  const relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(message)
  }
  const realTarget = fs.realpathSync.native(getNearestExistingPath(resolved))
  const realRelative = path.relative(realRoot, realTarget)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(message)
  }
  return resolved
}

const toDataRelativePath = ({ dataDir, targetPath }) => (
  path.relative(path.resolve(dataDir), path.resolve(targetPath)).replace(/\\/g, '/')
)

const getFramesForRow = ({ rowFramesByActionId, row, optional = false }) => {
  const frames = rowFramesByActionId instanceof Map
    ? rowFramesByActionId.get(row.id)
    : rowFramesByActionId?.[row.id]
  if (optional && frames == null) return null
  if (!Array.isArray(frames) || frames.length !== row.frameCount) {
    throw new Error(`Official full-pet row ${row.id} requires ${row.frameCount} preview frames`)
  }
  return frames
}

const normalizeFramePath = ({ dataDir, frame }) => (
  resolveInsideDataDir({
    dataDir,
    targetPath: getFramePath(frame),
    message: 'Official row preview frame path escaped the Creator Studio data directory'
  })
)

const createCellBuffer = async (framePath) => (
  sharp(framePath)
    .ensureAlpha()
    .resize({
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
      fit: 'fill',
      background: TRANSPARENT
    })
    .png()
    .toBuffer()
)

const writeContactSheet = async ({ dataDir, rowFramesByActionId, outputPath }) => {
  const composites = []
  for (const row of OFFICIAL_FULL_PET_ROWS) {
    const frames = getFramesForRow({ rowFramesByActionId, row, optional: true })
    if (!frames) continue
    for (let index = 0; index < row.frameCount; index += 1) {
      composites.push({
        input: await createCellBuffer(normalizeFramePath({ dataDir, frame: frames[index] })),
        left: index * CELL_WIDTH,
        top: row.row * CELL_HEIGHT
      })
    }
  }

  await sharp({
    create: {
      width: ATLAS_COLUMNS * CELL_WIDTH,
      height: ATLAS_ROWS * CELL_HEIGHT,
      channels: 4,
      background: TRANSPARENT
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)
}

const writeRowGif = async ({ dataDir, row, frames, outputPath }) => {
  const inputs = []
  for (let index = 0; index < row.frameCount; index += 1) {
    inputs.push(await createCellBuffer(normalizeFramePath({ dataDir, frame: frames[index] })))
  }
  await sharp(inputs, { join: { animated: true } })
    .gif({
      delay: row.durations,
      loop: 0,
      keepDuplicateFrames: true
    })
    .toFile(outputPath)
}

const createOfficialRowPreviewArtifacts = async ({ dataDir, rowFramesByActionId, outputDir }) => {
  const safeOutputDir = resolveInsideDataDir({
    dataDir,
    targetPath: outputDir,
    message: 'Official row preview artifact output path escaped the Creator Studio data directory',
    mustExist: false
  })
  fs.mkdirSync(safeOutputDir, { recursive: true })
  const previewDir = resolveInsideDataDir({
    dataDir,
    targetPath: path.join(safeOutputDir, 'previews'),
    message: 'Official row preview artifact output path escaped the Creator Studio data directory',
    mustExist: false
  })
  fs.mkdirSync(previewDir, { recursive: true })

  const contactSheetPath = resolveInsideDataDir({
    dataDir,
    targetPath: path.join(safeOutputDir, 'full-pet-contact-sheet.png'),
    message: 'Official row preview artifact output path escaped the Creator Studio data directory',
    mustExist: false
  })
  await writeContactSheet({
    dataDir,
    rowFramesByActionId,
    outputPath: contactSheetPath
  })

  const previews = []
  for (const row of OFFICIAL_FULL_PET_ROWS) {
    const frames = getFramesForRow({ rowFramesByActionId, row, optional: true })
    if (!frames) continue
    const previewPath = resolveInsideDataDir({
      dataDir,
      targetPath: path.join(previewDir, `${row.id}.gif`),
      message: 'Official row preview artifact output path escaped the Creator Studio data directory',
      mustExist: false
    })
    await writeRowGif({
      dataDir,
      row,
      frames,
      outputPath: previewPath
    })
    previews.push({
      actionId: row.id,
      path: previewPath,
      relativePath: toDataRelativePath({ dataDir, targetPath: previewPath }),
      frameCount: row.frameCount,
      durations: row.durations.slice()
    })
  }

  return {
    contactSheetPath,
    contactSheetRelativePath: toDataRelativePath({ dataDir, targetPath: contactSheetPath }),
    previews
  }
}

module.exports = {
  createOfficialRowPreviewArtifacts
}
