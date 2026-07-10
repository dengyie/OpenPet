const crypto = require('crypto')
const sharp = require('sharp')
const { sanitizeNearTransparentPixels } = require('./edge-background-cutout')
const { OFFICIAL_FULL_PET_ROWS } = require('./full-pet-row-contract')

const CODEX_ATLAS = Object.freeze({
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  width: 1536,
  height: 1872
})

const getFramePath = (frame) => frame.path || frame

const countVisiblePixels = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let visiblePixels = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visiblePixels += 1
  }
  return visiblePixels
}

const countUniqueRowFrames = async ({ spritesheetPath, row }) => {
  const hashes = new Set()
  for (let column = 0; column < row.frameCount; column += 1) {
    const { data } = await sharp(spritesheetPath)
      .extract({
        left: column * CODEX_ATLAS.cellWidth,
        top: row.row * CODEX_ATLAS.cellHeight,
        width: CODEX_ATLAS.cellWidth,
        height: CODEX_ATLAS.cellHeight
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    hashes.add(crypto.createHash('sha256').update(data).digest('hex'))
  }
  return hashes.size
}

const composeOfficialFullPetAtlas = async ({ outputPath, rowFramesByActionId }) => {
  const composites = []
  for (const row of OFFICIAL_FULL_PET_ROWS) {
    const frames = rowFramesByActionId instanceof Map
      ? rowFramesByActionId.get(row.id)
      : rowFramesByActionId?.[row.id]
    if (!Array.isArray(frames) || frames.length !== row.frameCount) {
      throw new Error(`Official full-pet row ${row.id} requires ${row.frameCount} frames`)
    }
    for (let column = 0; column < row.frameCount; column += 1) {
      const framePath = getFramePath(frames[column])
      const metadata = await sharp(framePath).metadata()
      if (metadata.width !== CODEX_ATLAS.cellWidth || metadata.height !== CODEX_ATLAS.cellHeight) {
        throw new Error(`Official full-pet row ${row.id} frame ${column + 1} must be exactly ${CODEX_ATLAS.cellWidth}x${CODEX_ATLAS.cellHeight}`)
      }
      composites.push({
        input: await sharp(framePath)
          .ensureAlpha()
          .png()
          .toBuffer(),
        left: column * CODEX_ATLAS.cellWidth,
        top: row.row * CODEX_ATLAS.cellHeight
      })
    }
  }

  const atlasBuffer = await sharp({
    create: {
      width: CODEX_ATLAS.width,
      height: CODEX_ATLAS.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toBuffer()
  await sharp(await sanitizeNearTransparentPixels(atlasBuffer))
    .webp({ lossless: true })
    .toFile(outputPath)

  const frameRows = []
  for (const row of OFFICIAL_FULL_PET_ROWS) {
    frameRows.push({
      id: row.id,
      row: row.row,
      frameCount: row.frameCount,
      uniqueFrameCount: await countUniqueRowFrames({ spritesheetPath: outputPath, row })
    })
  }

  return {
    visiblePixels: await countVisiblePixels(outputPath),
    frameRows
  }
}

module.exports = {
  CODEX_ATLAS,
  composeOfficialFullPetAtlas
}
