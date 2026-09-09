const MAX_UTTERANCE_TEXT_CHARS = 1000
const MAX_SOURCE_CHARS = 120

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ')

const sanitizeSource = (value) => normalizeText(value).slice(0, MAX_SOURCE_CHARS)

const createPetUtteranceLogService = ({ aiTalkStore, appLogService } = {}) => {
  if (!aiTalkStore) throw new Error('aiTalkStore is required')

  const recordLog = (entry) => {
    try {
      appLogService?.record?.({
        actor: 'system',
        scope: 'pet-utterance',
        ...entry
      })
    } catch (_) {
      // Pet speech should never fail because diagnostics failed.
    }
  }

  const record = ({ petPackId, text, source = '', ttlMs = 0 } = {}) => {
    const packId = normalizeText(petPackId)
    const normalizedText = normalizeText(text).slice(0, MAX_UTTERANCE_TEXT_CHARS)
    if (!packId || !normalizedText) return null
    const entry = aiTalkStore.recordPetUtterance({
      petPackId: packId,
      text: normalizedText,
      source: sanitizeSource(source),
      ttlMs
    })
    recordLog({
      level: 'info',
      event: 'pet-utterance.recorded',
      message: 'Pet utterance recorded',
      details: {
        petPackId: packId,
        source: entry.source,
        textChars: entry.text.length,
        ttlMs: entry.ttlMs
      }
    })
    return entry
  }

  const listRecent = ({ petPackId, limit, maxChars } = {}) => (
    typeof aiTalkStore.listRecentPetUtterances === 'function'
      ? aiTalkStore.listRecentPetUtterances({ petPackId, limit, maxChars })
      : []
  )

  const clearPetPack = (petPackId) => (
    typeof aiTalkStore.clearPetUtterances === 'function'
      ? aiTalkStore.clearPetUtterances(petPackId)
      : { petPackId, deletedCount: 0 }
  )

  return {
    clearPetPack,
    listRecent,
    record
  }
}

module.exports = {
  createPetUtteranceLogService
}
