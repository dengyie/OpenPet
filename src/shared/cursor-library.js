const CUSTOM_CURSOR_MAX_BYTES = 500 * 1024
const SYSTEM_CURSOR_ID = 'system'
const LEGACY_CUSTOM_CURSOR_ID = 'legacy-custom-cursor'

const svgDataUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`

const stripFileExtension = (value) => String(value || '').replace(/\.[^./\\]+$/, '')

const createBuiltinCursor = ({ id, name, svg, hotspotX = 0, hotspotY = 0, width = 48, height = 48 }) => ({
  id,
  type: 'builtin',
  name,
  assetPath: `builtin://${id}`,
  assetUrl: svgDataUrl(svg),
  fileName: `${id}.svg`,
  width,
  height,
  byteSize: 0,
  hotspotX,
  hotspotY,
  createdAt: 'builtin'
})

const SYSTEM_CURSOR_PREVIEW_URL = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M9 5l22 21H20l7 16-5 2-7-16-7 7z" fill="#111827"/>
  <path d="M9 5l22 21H20l7 16-5 2-7-16-7 7z" fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
</svg>
`)

const BUILTIN_CURSORS = Object.freeze([
  createBuiltinCursor({
    id: 'builtin-claw-purple',
    name: '爪爪紫',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <path d="M10 6l20 18H20l7 15-5 3-7-15-6 6z" fill="#6d4cff"/>
        <path d="M10 6l20 18H20l7 15-5 3-7-15-6 6z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="31.5" cy="12.5" r="3" fill="#d9ccff"/>
      </svg>
    `,
    hotspotX: 2,
    hotspotY: 2
  }),
  createBuiltinCursor({
    id: 'builtin-paw-pink',
    name: '粉色肉垫',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <path d="M16 29c0-5 4.3-8.5 8-8.5s8 3.5 8 8.5c0 4.8-3.7 8-8 8s-8-3.2-8-8Z" fill="#ffb6c8" stroke="#c65d6d" stroke-width="2"/>
        <ellipse cx="17" cy="18" rx="3.2" ry="4.2" fill="#ffd5df" stroke="#c65d6d" stroke-width="2"/>
        <ellipse cx="23" cy="14.5" rx="3.2" ry="4.2" fill="#ffd5df" stroke="#c65d6d" stroke-width="2"/>
        <ellipse cx="29" cy="14.5" rx="3.2" ry="4.2" fill="#ffd5df" stroke="#c65d6d" stroke-width="2"/>
        <ellipse cx="35" cy="18" rx="3.2" ry="4.2" fill="#ffd5df" stroke="#c65d6d" stroke-width="2"/>
      </svg>
    `,
    hotspotX: 6,
    hotspotY: 6
  }),
  createBuiltinCursor({
    id: 'builtin-fish-blue',
    name: '小鱼游游',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <path d="M11 24c6-8 14-11 24-9-2 3-2 5 0 8-2 3-2 5 0 8-10 2-18-1-24-7Z" fill="#9fd2ff" stroke="#2b6cb0" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M32 15l8-5-2 9" fill="#9fd2ff" stroke="#2b6cb0" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="20.5" cy="22.5" r="1.7" fill="#2b6cb0"/>
      </svg>
    `,
    hotspotX: 4,
    hotspotY: 4
  }),
  createBuiltinCursor({
    id: 'builtin-carrot',
    name: '胡萝卜',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <path d="M19 14c1-4 4-6 8-6-1 3 0 5 2 7-3 0-6 0-10-1Z" fill="#39a845"/>
        <path d="M13 31c0-10 7-17 20-20 3 14-2 23-14 27-4 1-6-2-6-7Z" fill="#ffa33b" stroke="#d96a10" stroke-width="2"/>
        <path d="M19 20h11M17 25h11M15 30h10" stroke="#d96a10" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    hotspotX: 4,
    hotspotY: 4
  }),
  createBuiltinCursor({
    id: 'builtin-magic-wand',
    name: '魔法棒',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <path d="M14 35 31 18" stroke="#8b5cf6" stroke-width="4" stroke-linecap="round"/>
        <path d="m32 8 2.8 5.7 6.2.9-4.5 4.4 1.1 6.1-5.6-3-5.6 3 1.1-6.1-4.5-4.4 6.2-.9L32 8Z" fill="#ffd86b" stroke="#f59e0b" stroke-width="2"/>
      </svg>
    `,
    hotspotX: 6,
    hotspotY: 6
  }),
  createBuiltinCursor({
    id: 'builtin-kitty',
    name: '小猫咪',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <path d="M12 20 14 10l8 5 3-1 3 1 8-5 2 10c2 2 3 5 3 8 0 8-7 13-17 13S7 36 7 28c0-3 1-6 5-8Z" fill="#fff6ef" stroke="#4b5563" stroke-width="2"/>
        <circle cx="19" cy="26" r="2" fill="#1f2937"/>
        <circle cx="29" cy="26" r="2" fill="#1f2937"/>
        <path d="M21 32c2 1 4 1 6 0" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
        <path d="M14 28h-5M14 31H8M34 28h5M34 31h6" stroke="#9ca3af" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `,
    hotspotX: 5,
    hotspotY: 5
  })
])

const createDefaultRuntimeCursor = () => ({
  enabled: false,
  assetPath: '',
  assetUrl: '',
  fileName: '',
  hotspotX: 0,
  hotspotY: 0
})

const normalizeNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const normalizeRuntimeCursor = (cursor) => {
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return createDefaultRuntimeCursor()
  const assetPath = typeof cursor.assetPath === 'string' ? cursor.assetPath : ''
  const assetUrl = typeof cursor.assetUrl === 'string' ? cursor.assetUrl : ''
  const fileName = typeof cursor.fileName === 'string' ? cursor.fileName : ''
  return {
    enabled: Boolean(cursor.enabled && assetUrl && fileName),
    assetPath,
    assetUrl,
    fileName,
    hotspotX: normalizeNumber(cursor.hotspotX, 0),
    hotspotY: normalizeNumber(cursor.hotspotY, 0)
  }
}

const normalizeCustomCursorRecord = (cursor) => {
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return null
  const id = typeof cursor.id === 'string' ? cursor.id.trim() : ''
  const assetUrl = typeof cursor.assetUrl === 'string' ? cursor.assetUrl : ''
  const fileName = typeof cursor.fileName === 'string' ? cursor.fileName : ''
  if (!id || !assetUrl || !fileName) return null
  const name = typeof cursor.name === 'string' && cursor.name.trim()
    ? cursor.name.trim()
    : stripFileExtension(fileName) || '未命名指针'
  return {
    id,
    type: 'custom',
    name,
    assetPath: typeof cursor.assetPath === 'string' ? cursor.assetPath : '',
    assetUrl,
    fileName,
    width: Math.max(0, normalizeNumber(cursor.width, 0)),
    height: Math.max(0, normalizeNumber(cursor.height, 0)),
    byteSize: Math.max(0, normalizeNumber(cursor.byteSize, 0)),
    hotspotX: normalizeNumber(cursor.hotspotX, 0),
    hotspotY: normalizeNumber(cursor.hotspotY, 0),
    createdAt: typeof cursor.createdAt === 'string' && cursor.createdAt ? cursor.createdAt : new Date(0).toISOString()
  }
}

const normalizeCustomCursorCollection = (cursors) => (
  (Array.isArray(cursors) ? cursors : [])
    .map((cursor) => normalizeCustomCursorRecord(cursor))
    .filter(Boolean)
)

const migrateLegacyCustomCursorRecord = (cursor) => {
  const runtimeCursor = normalizeRuntimeCursor(cursor)
  if (!runtimeCursor.assetUrl || !runtimeCursor.fileName) return null
  return normalizeCustomCursorRecord({
    id: LEGACY_CUSTOM_CURSOR_ID,
    name: stripFileExtension(runtimeCursor.fileName) || 'legacy',
    assetPath: runtimeCursor.assetPath,
    assetUrl: runtimeCursor.assetUrl,
    fileName: runtimeCursor.fileName,
    width: 0,
    height: 0,
    byteSize: 0,
    hotspotX: runtimeCursor.hotspotX,
    hotspotY: runtimeCursor.hotspotY,
    createdAt: new Date(0).toISOString()
  })
}

const getBuiltinCursorById = (cursorId) => BUILTIN_CURSORS.find((cursor) => cursor.id === cursorId) || null

const toRuntimeCursor = (cursor) => normalizeRuntimeCursor({
  enabled: true,
  assetPath: cursor?.assetPath,
  assetUrl: cursor?.assetUrl,
  fileName: cursor?.fileName,
  hotspotX: cursor?.hotspotX,
  hotspotY: cursor?.hotspotY
})

const resolveSelectedCursor = ({ selectedCursorId, customCursors }) => {
  if (!selectedCursorId || selectedCursorId === SYSTEM_CURSOR_ID) return createDefaultRuntimeCursor()
  const builtIn = getBuiltinCursorById(selectedCursorId)
  if (builtIn) return toRuntimeCursor(builtIn)
  const customCursor = normalizeCustomCursorCollection(customCursors).find((cursor) => cursor.id === selectedCursorId)
  return customCursor ? toRuntimeCursor(customCursor) : createDefaultRuntimeCursor()
}

const normalizeCursorSettingsState = (settings = {}) => {
  const legacyCustomCursor = normalizeRuntimeCursor(settings.customCursor)
  const customCursors = normalizeCustomCursorCollection(settings.customCursors)
  const migratedLegacyCursor = migrateLegacyCustomCursorRecord(settings.customCursor)
  const nextCustomCursors = migratedLegacyCursor && customCursors.length === 0
    ? [migratedLegacyCursor, ...customCursors]
    : customCursors

  let selectedCursorId = typeof settings.selectedCursorId === 'string' ? settings.selectedCursorId.trim() : ''
  if (!selectedCursorId) {
    selectedCursorId = legacyCustomCursor.enabled && migratedLegacyCursor
      ? migratedLegacyCursor.id
      : SYSTEM_CURSOR_ID
  }

  const cursorExists = selectedCursorId === SYSTEM_CURSOR_ID
    || Boolean(getBuiltinCursorById(selectedCursorId))
    || nextCustomCursors.some((cursor) => cursor.id === selectedCursorId)

  if (!cursorExists) selectedCursorId = SYSTEM_CURSOR_ID

  return {
    selectedCursorId,
    customCursors: nextCustomCursors,
    customCursor: resolveSelectedCursor({
      selectedCursorId,
      customCursors: nextCustomCursors
    })
  }
}

const listCursorOptions = (customCursors = []) => ([
  {
    id: SYSTEM_CURSOR_ID,
    type: 'system',
    name: '系统默认',
    assetPath: '',
    assetUrl: SYSTEM_CURSOR_PREVIEW_URL,
    fileName: 'system-default.svg',
    width: 48,
    height: 48,
    byteSize: 0,
    hotspotX: 0,
    hotspotY: 0,
    createdAt: 'builtin'
  },
  ...BUILTIN_CURSORS,
  ...normalizeCustomCursorCollection(customCursors)
])

module.exports = {
  BUILTIN_CURSORS,
  CUSTOM_CURSOR_MAX_BYTES,
  LEGACY_CUSTOM_CURSOR_ID,
  SYSTEM_CURSOR_ID,
  createDefaultRuntimeCursor,
  getBuiltinCursorById,
  listCursorOptions,
  normalizeCursorSettingsState,
  normalizeCustomCursorCollection,
  normalizeCustomCursorRecord,
  normalizeRuntimeCursor,
  resolveSelectedCursor,
  stripFileExtension
}
