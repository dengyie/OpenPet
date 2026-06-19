const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { normalizePetPackManifest } = require('./schema')

const CODEX_ATLAS = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  width: 1536,
  height: 1872
}

const CODEX_ROWS = [
  { id: 'idle', label: 'Idle', kind: 'idle', row: 0, durations: [280, 110, 110, 140, 140, 320], loop: true },
  { id: 'running-right', label: 'Running Right', kind: 'working', row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
  { id: 'running-left', label: 'Running Left', kind: 'working', row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
  { id: 'waving', label: 'Waving', kind: 'greeting', row: 3, durations: [140, 140, 140, 280], loop: false },
  { id: 'jumping', label: 'Jumping', kind: 'custom', row: 4, durations: [140, 140, 140, 140, 280], loop: false },
  { id: 'failed', label: 'Failed', kind: 'failure', row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240], loop: false },
  { id: 'waiting', label: 'Waiting', kind: 'waiting', row: 6, durations: [150, 150, 150, 150, 150, 260], loop: true },
  { id: 'running', label: 'Running', kind: 'working', row: 7, durations: [120, 120, 120, 120, 120, 220], loop: true },
  { id: 'review', label: 'Review', kind: 'thinking', row: 8, durations: [150, 150, 150, 150, 150, 280], loop: true }
]

const KNOWN_TRANSPARENT_ATLAS_SHA256 = new Set([
  '04eca96f23541d3b4745bf75f65dbc6b044d6f8c43a05f335303425df8467fde'
])

const assertSafeRelativePath = (value, fieldName) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Codex pet ${fieldName} must be a non-empty string`)
  }
  const normalized = value.replace(/\\/g, '/')
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Codex pet ${fieldName} must be a safe relative path`)
  }
  return normalized
}

const readWebpDimensions = (filePath) => {
  const header = fs.readFileSync(filePath)
  if (header.length < 30 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Codex pet atlas must be a WebP file')
  }

  let offset = 12
  let dimensions = null
  let hasImageData = false
  while (offset + 8 <= header.length) {
    const chunkType = header.toString('ascii', offset, offset + 4)
    const chunkSize = header.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    const chunkComplete = chunkEnd <= header.length

    if (chunkType === 'VP8X' && chunkStart + 10 <= header.length) {
      dimensions = {
        width: header.readUIntLE(chunkStart + 4, 3) + 1,
        height: header.readUIntLE(chunkStart + 7, 3) + 1
      }
    }

    if (chunkType === 'VP8 ' && chunkStart + 10 <= header.length && chunkComplete) {
      const hasVp8StartCode = header[chunkStart + 3] === 0x9d && header[chunkStart + 4] === 0x01 && header[chunkStart + 5] === 0x2a
      if (!hasVp8StartCode) throw new Error('Codex pet atlas WebP image data could not be read')
      hasImageData = true
      dimensions = {
        width: header.readUInt16LE(chunkStart + 6) & 0x3fff,
        height: header.readUInt16LE(chunkStart + 8) & 0x3fff
      }
    }

    if (chunkType === 'VP8L' && chunkStart + 5 <= header.length && chunkComplete) {
      if (header[chunkStart] !== 0x2f) throw new Error('Codex pet atlas WebP image data could not be read')
      hasImageData = true
      const b0 = header[chunkStart + 1]
      const b1 = header[chunkStart + 2]
      const b2 = header[chunkStart + 3]
      const b3 = header[chunkStart + 4]
      dimensions = {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
      }
    }

    offset = chunkStart + chunkSize + (chunkSize % 2)
  }

  if (!dimensions) throw new Error('Codex pet atlas WebP dimensions could not be read')
  if (!hasImageData) throw new Error('Codex pet atlas WebP image data could not be read')
  return dimensions
}

const assertCodexAtlasDimensions = (spritesheetPath) => {
  const dimensions = readWebpDimensions(spritesheetPath)
  if (dimensions.width !== CODEX_ATLAS.width || dimensions.height !== CODEX_ATLAS.height) {
    throw new Error(`Codex pet atlas must be ${CODEX_ATLAS.width}x${CODEX_ATLAS.height}`)
  }
}

const assertCodexAtlasHasRenderableContent = (spritesheetPath) => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(spritesheetPath)).digest('hex')
  if (!KNOWN_TRANSPARENT_ATLAS_SHA256.has(digest)) return
  throw new Error('Codex pet atlas must contain visible pixels')
}

const isCodexPetManifest = (manifest) => {
  return Boolean(manifest && typeof manifest === 'object' && typeof manifest.spritesheetPath === 'string')
}

const normalizeCodexPetManifest = (manifest, { rootPath }) => {
  const spritesheetPath = assertSafeRelativePath(manifest.spritesheetPath, 'spritesheetPath')
  const absoluteSpritesheetPath = path.join(rootPath, spritesheetPath)
  if (!fs.existsSync(absoluteSpritesheetPath)) {
    throw new Error(`Codex pet spritesheet does not exist: ${spritesheetPath}`)
  }
  assertCodexAtlasDimensions(absoluteSpritesheetPath)
  assertCodexAtlasHasRenderableContent(absoluteSpritesheetPath)

  return normalizePetPackManifest({
    schemaVersion: 1,
    id: manifest.id,
    displayName: manifest.displayName || manifest.id,
    version: manifest.version || '1.0.0',
    sourceUrl: manifest.sourceUrl,
    assetAuthor: manifest.assetAuthor,
    license: manifest.license,
    licenseUrl: manifest.licenseUrl,
    defaultAction: 'idle',
    clickAction: 'waving',
    actions: CODEX_ROWS.map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      loop: row.loop,
      frameCount: row.durations.length,
      frameMs: row.durations[0],
      frameWidth: CODEX_ATLAS.cellWidth,
      frameHeight: CODEX_ATLAS.cellHeight,
      frameRow: row.row,
      frameColumn: 0,
      frameDurations: row.durations,
      atlas: {
        columns: CODEX_ATLAS.columns,
        rows: CODEX_ATLAS.rows,
        width: CODEX_ATLAS.width,
        height: CODEX_ATLAS.height
      },
      sprite: spritesheetPath
    }))
  })
}

module.exports = {
  CODEX_ATLAS,
  CODEX_ROWS,
  assertCodexAtlasHasRenderableContent,
  isCodexPetManifest,
  normalizeCodexPetManifest,
  readWebpDimensions
}
