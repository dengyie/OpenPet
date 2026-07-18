const fs = require('node:fs')
const path = require('node:path')

const MAX_CLAIMED_UPDATE_IDS = 2048

const normalizeUpdateId = (value) => {
  if (value == null || String(value).trim() === '') return null
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null
}

const readClaimedUpdateIds = (statePath, fsImpl = fs) => {
  if (!statePath) return []
  try {
    const parsed = JSON.parse(fsImpl.readFileSync(statePath, 'utf8'))
    return Array.isArray(parsed?.claimedUpdateIds)
      ? parsed.claimedUpdateIds.map(normalizeUpdateId).filter((value) => value != null).slice(-MAX_CLAIMED_UPDATE_IDS)
      : []
  } catch (_) {
    return []
  }
}

const createTelegramUpdateState = ({ statePath = '', fsImpl = fs } = {}) => {
  const claimedUpdateIds = readClaimedUpdateIds(statePath, fsImpl)
  const claimedSet = new Set(claimedUpdateIds)

  const persist = () => {
    if (!statePath) return
    fsImpl.mkdirSync(path.dirname(statePath), { recursive: true })
    const tempPath = `${statePath}.${process.pid}.tmp`
    fsImpl.writeFileSync(tempPath, `${JSON.stringify({ claimedUpdateIds })}\n`, { mode: 0o600 })
    fsImpl.renameSync(tempPath, statePath)
  }

  return {
    claim: (value) => {
      const updateId = normalizeUpdateId(value)
      if (updateId == null) return true
      if (claimedSet.has(updateId)) return false
      claimedSet.add(updateId)
      claimedUpdateIds.push(updateId)
      if (claimedUpdateIds.length > MAX_CLAIMED_UPDATE_IDS) {
        const removed = claimedUpdateIds.splice(0, claimedUpdateIds.length - MAX_CLAIMED_UPDATE_IDS)
        for (const oldUpdateId of removed) claimedSet.delete(oldUpdateId)
      }
      persist()
      return true
    }
  }
}

module.exports = {
  createTelegramUpdateState,
  normalizeUpdateId
}
