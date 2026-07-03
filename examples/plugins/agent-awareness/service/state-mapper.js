const DEFAULT_MIN_SPEECH_INTERVAL_MS = 15000

const STATUS_COPY = {
  idle: 'Agent is idle.',
  thinking: 'Agent is thinking through the next step.',
  working: 'Agent is working on the task.',
  waiting: 'Agent is waiting for your input.',
  blocked: 'Agent is blocked and needs attention.',
  completed: 'Agent finished this turn.',
  failed: 'Agent hit an error.'
}

const shouldSpeak = ({ event, previousSession, nowMs, lastSpeechByKey, minSpeechIntervalMs }) => {
  if (!event.message && !['waiting', 'blocked', 'completed', 'failed'].includes(event.status)) return false
  const key = `${event.sessionId}:${event.status}`
  const lastSpeechAt = lastSpeechByKey.get(key) || 0
  if (previousSession?.status !== event.status) return true
  return nowMs - lastSpeechAt >= minSpeechIntervalMs
}

const createAgentStateMapper = ({
  speechEnabled = true,
  minSpeechIntervalMs = DEFAULT_MIN_SPEECH_INTERVAL_MS,
  nowMs = () => Date.now()
} = {}) => {
  const lastSpeechByKey = new Map()

  const mapEvent = ({ event, previousSession }) => {
    const currentNowMs = nowMs()
    const statusText = STATUS_COPY[event.status] || STATUS_COPY.working
    const detail = event.message || statusText
    const petEvent = {
      type: `agent:${event.status}`,
      message: detail,
      ttlMs: event.status === 'completed' ? 8000 : 30000
    }
    const speak = speechEnabled && shouldSpeak({
      event,
      previousSession,
      nowMs: currentNowMs,
      lastSpeechByKey,
      minSpeechIntervalMs
    })
    if (speak) lastSpeechByKey.set(`${event.sessionId}:${event.status}`, currentNowMs)
    return {
      petEvent,
      speech: speak
        ? {
            text: detail,
            ttlMs: event.status === 'completed' ? 6000 : 9000
          }
        : null
    }
  }

  return { mapEvent }
}

module.exports = { createAgentStateMapper }
