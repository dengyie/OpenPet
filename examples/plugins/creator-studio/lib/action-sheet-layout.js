const normalizeFrameCount = (value, fallback = 6) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(32, Math.max(1, parsed))
}

const getActionSheetLayout = (value, fallback = 6) => {
  const frameCount = normalizeFrameCount(value, fallback)
  if (frameCount === 1) return { columns: 1, rows: 1 }
  if (frameCount === 2) return { columns: 2, rows: 1 }
  if (frameCount <= 4) return { columns: 2, rows: 2 }
  if (frameCount <= 6) return { columns: 3, rows: 2 }
  if (frameCount <= 8) return { columns: 4, rows: 2 }
  const columns = 4
  return {
    columns,
    rows: Math.ceil(frameCount / columns)
  }
}

const QUALITY_FIRST_LAYOUTS = Object.freeze({
  4: Object.freeze({ columns: 2, rows: 2 }),
  5: Object.freeze({ columns: 3, rows: 2 }),
  6: Object.freeze({ columns: 3, rows: 2 }),
  8: Object.freeze({ columns: 4, rows: 2 })
})

const getSpriteLayout = (value) => {
  const frameCount = Number(value)
  const geometry = QUALITY_FIRST_LAYOUTS[frameCount]
  if (!geometry) {
    throw new Error(`Unsupported quality-first sprite frame count: ${String(value)}`)
  }
  const cellCount = geometry.columns * geometry.rows
  return {
    columns: geometry.columns,
    rows: geometry.rows,
    cellCount,
    unusedCells: Array.from({ length: cellCount - frameCount }, (_, index) => frameCount + index),
    canvas: { width: 1024, height: 1024 }
  }
}

module.exports = {
  getActionSheetLayout,
  getSpriteLayout,
  normalizeFrameCount
}
