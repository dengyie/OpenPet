const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const SUPPORTED_CURSOR_EXTENSIONS = new Set(['.png', '.webp', '.cur'])

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

const createCursorAssetService = ({ cursorDir }) => {
  if (!cursorDir) throw new Error('cursorDir is required')

  const importCursor = async (sourcePath) => {
    const ext = path.extname(sourcePath || '').toLowerCase()
    if (!SUPPORTED_CURSOR_EXTENSIONS.has(ext)) {
      throw new Error('Cursor image must be a .png, .webp, or .cur file')
    }
    const stat = fs.statSync(sourcePath)
    if (!stat.isFile()) throw new Error('Cursor source must be a file')

    const hash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex').slice(0, 16)
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

  return { importCursor }
}

module.exports = {
  SUPPORTED_CURSOR_EXTENSIONS,
  createCursorAssetService,
  createDefaultCursorSettings,
  normalizeCustomCursor
}
