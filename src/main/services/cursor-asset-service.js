const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const sharp = require('sharp')
const {
  CUSTOM_CURSOR_MAX_BYTES,
  createDefaultRuntimeCursor,
  normalizeRuntimeCursor,
  stripFileExtension
} = require('../../shared/cursor-library')

const SUPPORTED_CURSOR_EXTENSIONS = new Set(['.png', '.webp'])
const BROWSER_SAFE_CURSOR_SIZE = 64

const createDefaultCursorSettings = () => createDefaultRuntimeCursor()

const normalizeCustomCursor = (cursor) => normalizeRuntimeCursor(cursor)

const createCenteredHotspot = (dimensions) => {
  const width = Number(dimensions?.width)
  const height = Number(dimensions?.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { hotspotX: 0, hotspotY: 0 }
  }
  return {
    hotspotX: Math.max(0, Math.floor(width / 2)),
    hotspotY: Math.max(0, Math.floor(height / 2))
  }
}

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
    const repaired = await writeBrowserSafeBitmap({
      sourceBuffer,
      hash,
      originalFileName: path.basename(sourcePath)
    })
    const metadata = await sharp(repaired.assetPath).metadata()
    const repairedStat = fs.statSync(repaired.assetPath)
    const hotspot = createCenteredHotspot(metadata)

    return {
      id: `cursor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'custom',
      name: stripFileExtension(path.basename(sourcePath)) || '未命名指针',
      assetPath: repaired.assetPath,
      assetUrl: repaired.assetUrl,
      fileName: repaired.fileName,
      width: Number(metadata.width || 0),
      height: Number(metadata.height || 0),
      byteSize: Number(repairedStat.size || 0),
      hotspotX: hotspot.hotspotX,
      hotspotY: hotspot.hotspotY,
      createdAt: new Date().toISOString()
    }
  }

  const repairCursor = async (cursor) => {
    const normalized = normalizeCustomCursor(cursor)
    if (!normalized.enabled || !normalized.assetPath || !fs.existsSync(normalized.assetPath)) return normalized
    const metadata = await sharp(normalized.assetPath).metadata()
    const metadataPatch = {
      width: Number(metadata.width || normalized.width || 0),
      height: Number(metadata.height || normalized.height || 0)
    }
    const hotspotPatch = createCenteredHotspot(metadataPatch)
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
    const repairedHotspot = createCenteredHotspot(repairedMetadata)
    return {
      ...normalized,
      assetPath: repaired.assetPath,
      assetUrl: repaired.assetUrl,
      fileName: repaired.fileName || normalized.fileName,
      width: Number(repairedMetadata.width || metadataPatch.width || 0),
      height: Number(repairedMetadata.height || metadataPatch.height || 0),
      ...repairedHotspot
    }
  }

  const deleteAssets = (assetPaths = []) => {
    for (const assetPath of Array.isArray(assetPaths) ? assetPaths : []) {
      if (!isManagedAssetPath(assetPath) || !fs.existsSync(assetPath)) continue
      try {
        if (fs.statSync(assetPath).isFile()) fs.rmSync(assetPath, { force: true })
      } catch (_) {
        // Cursor cleanup is best-effort and must not block settings saves.
      }
    }
  }

  return { importCursor, repairCursor, deleteAssets }
}

module.exports = {
  BROWSER_SAFE_CURSOR_SIZE,
  SUPPORTED_CURSOR_EXTENSIONS,
  createCursorAssetService,
  createDefaultCursorSettings,
  normalizeCustomCursor
}
