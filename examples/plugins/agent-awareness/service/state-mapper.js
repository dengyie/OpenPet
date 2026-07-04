const STATUS_COPY = {
  idle: 'Agent is idle.',
  thinking: 'Agent is thinking through the next step.',
  working: 'Agent is working on the task.',
  waiting: 'Agent is waiting for your input.',
  blocked: 'Agent is blocked and needs attention.',
  completed: 'Agent finished this turn.',
  failed: 'Agent hit an error.'
}

const DEFAULT_FINGERPRINT_SUPPRESSION_MS = 10 * 60 * 1000
const DEFAULT_MIN_INTERVALS = {
  thinking: 5 * 60 * 1000,
  working: 5 * 60 * 1000,
  waiting: 0,
  blocked: 0,
  completed: 0,
  failed: 0,
  idle: Number.POSITIVE_INFINITY
}

const createAgentStateMapper = ({
  nowMs = () => Date.now(),
  minIntervals = DEFAULT_MIN_INTERVALS,
  fingerprintSuppressionMs = DEFAULT_FINGERPRINT_SUPPRESSION_MS
} = {}) => {
  const lastSpeechByStatusKey = new Map()
  const lastSpeechByFingerprint = new Map()

  const shouldSpeak = ({ event, previousSession }) => {
    if (event.status === 'idle') return false
    const currentNowMs = nowMs()
    const fingerprint = `${event.sessionId}:${event.status}:${event.type}:${event.project || ''}`
    const previousFingerprintAt = lastSpeechByFingerprint.get(fingerprint) || 0
    if (previousFingerprintAt && currentNowMs - previousFingerprintAt < fingerprintSuppressionMs) return false
    if (previousSession?.status !== event.status) return true
    const statusKey = `${event.sessionId}:${event.status}`
    const previousStatusAt = lastSpeechByStatusKey.get(statusKey) || 0
    return currentNowMs - previousStatusAt >= (minIntervals[event.status] ?? DEFAULT_MIN_INTERVALS.working)
  }

  const createSpeechText = (event) => {
    if (event.status === 'thinking' || event.status === 'working') {
      return event.message ? `我在处理：${event.message}` : '我在忙这件事。'
    }
    if (event.status === 'waiting') return event.message ? `这里需要你确认：${event.message}` : '这里需要你确认一下。'
    if (event.status === 'blocked') return event.message ? `我被卡住了：${event.message}` : '我这里卡住了。'
    if (event.status === 'completed') return event.message ? `我刚完成：${event.message}` : '我刚做完。'
    if (event.status === 'failed') return event.message ? `这次出了点问题：${event.message}` : '这次出了点问题。'
    return ''
  }

  const mapEvent = ({ event, previousSession }) => {
    const detail = event.message || STATUS_COPY[event.status] || STATUS_COPY.working
    const petEvent = {
      type: `agent:${event.status}`,
      message: detail,
      ttlMs: event.status === 'completed' ? 8000 : 30000
    }
    if (!shouldSpeak({ event, previousSession })) {
      return { petEvent, speech: null }
    }
    const currentNowMs = nowMs()
    const statusKey = `${event.sessionId}:${event.status}`
    const fingerprint = `${event.sessionId}:${event.status}:${event.type}:${event.project || ''}`
    lastSpeechByStatusKey.set(statusKey, currentNowMs)
    lastSpeechByFingerprint.set(fingerprint, currentNowMs)
    return {
      petEvent,
      speech: {
        text: createSpeechText(event),
        ttlMs: event.status === 'completed' ? 6000 : 9000
      }
    }
  }

  return { mapEvent }
}

module.exports = {
  createAgentStateMapper
}
