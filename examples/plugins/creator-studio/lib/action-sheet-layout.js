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

module.exports = {
  getActionSheetLayout,
  normalizeFrameCount
}
