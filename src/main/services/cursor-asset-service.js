const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const sharp = require('sharp')

const SUPPORTED_CURSOR_EXTENSIONS = new Set(['.png', '.webp', '.cur'])
const BROWSER_SAFE_CURSOR_SIZE = 64
const BACKGROUND_DIFF_THRESHOLD = 45

const createDefaultCursorSettings = () => createDefaultRuntimeCursor()

const normalizeCustomCursor = (cursor) => normalizeRuntimeCursor(cursor)

const isBitmapCursor = (filePath) => ['.png', '.webp'].includes(path.extname(filePath || '').toLowerCase())

const isHotspotWithinBounds = (cursor, dimensions) => {
  const hotspotX = Number(cursor?.hotspotX)
  const hotspotY = Number(cursor?.hotspotY)
  const width = Number(dimensions?.width)
  const height = Number(dimensions?.height)
  return Number.isFinite(hotspotX) &&
    Number.isFinite(hotspotY) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    hotspotX >= 0 &&
    hotspotY >= 0 &&
    hotspotX < width &&
    hotspotY < height
}

const shouldReestimateHotspot = (cursor, dimensions) => (
  (Number(cursor?.hotspotX) === 0 && Number(cursor?.hotspotY) === 0) ||
  !isHotspotWithinBounds(cursor, dimensions)
)

const createCursorAssetService = ({ cursorDir }) => {
  if (!cursorDir) throw new Error('cursorDir is required')
  const managedRoot = path.resolve(cursorDir)

  const isManagedAssetPath = (assetPath) => {
    if (typeof assetPath !== 'string' || !assetPath) return false
    const resolvedPath = path.resolve(assetPath)
    const relativePath = path.relative(managedRoot, resolvedPath)
    return relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  }

  const writeBrowserSafeBitmap = async ({ sourceBuffer, hash, originalFileName }) => {
    fs.mkdirSync(cursorDir, { recursive: true })
    const assetPath = path.join(cursorDir, `${hash}.png`)
    await sharp(sourceBuffer)
      .resize(BROWSER_SAFE_CURSOR_SIZE, BROWSER_SAFE_CURSOR_SIZE, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toFile(assetPath)
    return {
      enabled: true,
      assetPath,
      assetUrl: pathToFileURL(assetPath).href,
      fileName: originalFileName
    }
  }

  const importCursor = async (sourcePath) => {
    const ext = path.extname(sourcePath || '').toLowerCase()
    if (!SUPPORTED_CURSOR_EXTENSIONS.has(ext)) {
      throw new Error('Cursor image must be a .png or .webp file')
    }
    const stat = fs.statSync(sourcePath)
    if (!stat.isFile()) throw new Error('Cursor source must be a file')
    if (stat.size > CUSTOM_CURSOR_MAX_BYTES) throw new Error('Cursor image must be 500KB or smaller')

    const sourceBuffer = fs.readFileSync(sourcePath)
    const hash = crypto.createHash('sha256').update(sourceBuffer).digest('hex').slice(0, 16)
    if (ext === '.cur') {
      fs.mkdirSync(cursorDir, { recursive: true })
      const assetPath = path.join(cursorDir, `${hash}${ext}`)
      fs.copyFileSync(sourcePath, assetPath)
      return {
        enabled: true,
        assetPath,
        assetUrl: pathToFileURL(assetPath).href,
        fileName: path.basename(sourcePath)
      }
    }
    return writeBrowserSafeBitmap({
      sourceBuffer,
      hash,
      originalFileName: path.basename(sourcePath)
    })
  }

  const repairCursor = async (cursor) => {
    const normalized = normalizeCustomCursor(cursor)
    if (!normalized.enabled || !isBitmapCursor(normalized.assetPath) || !fs.existsSync(normalized.assetPath)) return normalized
    const metadata = await sharp(normalized.assetPath).metadata()
    const metadataPatch = {
      width: Number(metadata.width || normalized.width || 0),
      height: Number(metadata.height || normalized.height || 0)
    }
    const hotspotPatch = shouldReestimateHotspot(normalized, metadataPatch)
      ? await estimateHotspot(normalized.assetPath)
      : { hotspotX: normalized.hotspotX, hotspotY: normalized.hotspotY }
    if ((metadata.width || 0) <= BROWSER_SAFE_CURSOR_SIZE && (metadata.height || 0) <= BROWSER_SAFE_CURSOR_SIZE) {
      return { ...normalized, ...metadataPatch, ...hotspotPatch }
    }
    const sourceBuffer = fs.readFileSync(normalized.assetPath)
    const hash = crypto.createHash('sha256').update(sourceBuffer).digest('hex').slice(0, 16)
    const repaired = await writeBrowserSafeBitmap({
      sourceBuffer,
      hash: `${hash}-cursor64`,
      originalFileName: normalized.fileName || path.basename(normalized.assetPath)
    })
    const repairedMetadata = await sharp(repaired.assetPath).metadata()
    const repairedHotspot = await estimateHotspot(repaired.assetPath)
    return {
      ...repaired,
      enabled: normalized.enabled
    }
  }

  return { importCursor, repairCursor }
}

module.exports = {
  BROWSER_SAFE_CURSOR_SIZE,
  SUPPORTED_CURSOR_EXTENSIONS,
  createCursorAssetService,
  createDefaultCursorSettings,
  normalizeCustomCursor
}
