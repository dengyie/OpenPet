const createRow = (value) => Object.freeze({
  ...value,
  frameCount: value.durations.length,
  durations: Object.freeze(value.durations.slice())
})

const OFFICIAL_FULL_PET_ROWS = Object.freeze([
  createRow({ id: 'idle', row: 0, durations: [280, 110, 110, 140, 140, 320] }),
  createRow({ id: 'running-right', row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] }),
  createRow({ id: 'running-left', row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] }),
  createRow({ id: 'waving', row: 3, durations: [140, 140, 140, 280] }),
  createRow({ id: 'jumping', row: 4, durations: [140, 140, 140, 140, 280] }),
  createRow({ id: 'failed', row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] }),
  createRow({ id: 'waiting', row: 6, durations: [150, 150, 150, 150, 150, 260] }),
  createRow({ id: 'running', row: 7, durations: [120, 120, 120, 120, 120, 220] }),
  createRow({ id: 'review', row: 8, durations: [150, 150, 150, 150, 150, 280] })
])

const OFFICIAL_FULL_PET_ACTION_IDS = Object.freeze(
  OFFICIAL_FULL_PET_ROWS.map((row) => row.id)
)

const FULL_PET_ROW_QUALITY = Object.freeze({
  ROW_REAL: 'row-real',
  APPROVED_MIRROR: 'approved-mirror',
  PREVIEW_FALLBACK: 'preview-fallback',
  PENDING: 'pending',
  FAILED: 'failed'
})

const OFFICIAL_FULL_PET_ROW_BY_ID = new Map(
  OFFICIAL_FULL_PET_ROWS.map((row) => [row.id, row])
)

const getOfficialFullPetRow = (actionId) => (
  OFFICIAL_FULL_PET_ROW_BY_ID.get(String(actionId || '').trim()) || null
)

module.exports = {
  FULL_PET_ROW_QUALITY,
  OFFICIAL_FULL_PET_ACTION_IDS,
  OFFICIAL_FULL_PET_ROWS,
  getOfficialFullPetRow
}
