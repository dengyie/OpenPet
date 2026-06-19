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

const createDefaultCursorSettings = () => createDefaultRuntimeCursor()

const normalizeCustomCursor = (cursor) => normalizeRuntimeCursor(cursor)

const createCursorAssetService = ({ cursorDir }) => {
  if (!cursorDir) throw new Error('cursorDir is required')
  const managedRoot = path.resolve(cursorDir)

  const isManagedAssetPath = (assetPath) => {
    if (typeof assetPath !== 'string' || !assetPath) return false
    const resolvedPath = path.resolve(assetPath)
    const relativePath = path.relative(managedRoot, resolvedPath)
    return relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  }

  const importCursor = async (sourcePath) => {
    const ext = path.extname(sourcePath || '').toLowerCase()
    if (!SUPPORTED_CURSOR_EXTENSIONS.has(ext)) {
      throw new Error('Cursor image must be a .png or .webp file')
    }
    const stat = fs.statSync(sourcePath)
    if (!stat.isFile()) throw new Error('Cursor source must be a file')
    if (stat.size > CUSTOM_CURSOR_MAX_BYTES) throw new Error('Cursor image must be 500KB or smaller')

    const hash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex').slice(0, 16)
    fs.mkdirSync(cursorDir, { recursive: true })
    const assetPath = path.join(cursorDir, `${hash}${ext}`)
    fs.copyFileSync(sourcePath, assetPath)

    let width = 0
    let height = 0
    if (ext === '.png' || ext === '.webp') {
      const metadata = await sharp(sourcePath).metadata()
      width = Number(metadata.width || 0)
      height = Number(metadata.height || 0)
    }

    return {
      id: `cursor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'custom',
      name: stripFileExtension(path.basename(sourcePath)) || '未命名指针',
      assetPath,
      assetUrl: pathToFileURL(assetPath).href,
      fileName: path.basename(sourcePath),
      width,
      height,
      byteSize: stat.size,
      hotspotX: 0,
      hotspotY: 0,
      createdAt: new Date().toISOString()
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

  return { importCursor, deleteAssets }
}

module.exports = {
  SUPPORTED_CURSOR_EXTENSIONS,
  createCursorAssetService,
  createDefaultCursorSettings,
  normalizeCustomCursor
}
