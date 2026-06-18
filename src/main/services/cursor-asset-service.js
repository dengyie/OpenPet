const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const sharp = require('sharp')

const SUPPORTED_CURSOR_EXTENSIONS = new Set(['.png', '.webp', '.cur'])
const BROWSER_SAFE_CURSOR_SIZE = 64

const createDefaultCursorSettings = () => ({
  enabled: false,
  assetPath: '',
  assetUrl: '',
  fileName: ''
})

const normalizeCustomCursor = (cursor) => {
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return createDefaultCursorSettings()
  const assetPath = typeof cursor.assetPath === 'string' ? cursor.assetPath : ''
  const assetUrl = typeof cursor.assetUrl === 'string' ? cursor.assetUrl : ''
  const fileName = typeof cursor.fileName === 'string' ? cursor.fileName : ''
  return {
    enabled: Boolean(cursor.enabled && assetPath && assetUrl),
    assetPath,
    assetUrl,
    fileName
  }
}

const isBitmapCursor = (filePath) => ['.png', '.webp'].includes(path.extname(filePath || '').toLowerCase())

const createCursorAssetService = ({ cursorDir }) => {
  if (!cursorDir) throw new Error('cursorDir is required')

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
      throw new Error('Cursor image must be a .png, .webp, or .cur file')
    }
    const stat = fs.statSync(sourcePath)
    if (!stat.isFile()) throw new Error('Cursor source must be a file')

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
    if ((metadata.width || 0) <= BROWSER_SAFE_CURSOR_SIZE && (metadata.height || 0) <= BROWSER_SAFE_CURSOR_SIZE) return normalized
    const sourceBuffer = fs.readFileSync(normalized.assetPath)
    const hash = crypto.createHash('sha256').update(sourceBuffer).digest('hex').slice(0, 16)
    const repaired = await writeBrowserSafeBitmap({
      sourceBuffer,
      hash: `${hash}-cursor64`,
      originalFileName: normalized.fileName || path.basename(normalized.assetPath)
    })
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
