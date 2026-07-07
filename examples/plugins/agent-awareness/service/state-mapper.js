const DEFAULT_FINGERPRINT_SUPPRESSION_MS = 10 * 60 * 1000
const DEFAULT_MIN_INTERVALS = {
  thinking: 5 * 60 * 1000,
  working: 5 * 60 * 1000,
  waiting: 2 * 60 * 1000,
  blocked: 2 * 60 * 1000,
  completed: 2 * 60 * 1000,
  failed: 2 * 60 * 1000,
  idle: Number.POSITIVE_INFINITY
}

const STATUS_PRIORITY = {
  idle: 'silent',
  thinking: 'normal',
  working: 'normal',
  waiting: 'urgent',
  blocked: 'urgent',
  completed: 'summary',
  failed: 'urgent'
}

const ROUTINE_VISUAL_ONLY_STATUSES = new Set(['thinking', 'working'])

const createAgentStateMapper = ({
  nowMs = () => Date.now(),
  minIntervals = DEFAULT_MIN_INTERVALS,
  fingerprintSuppressionMs = DEFAULT_FINGERPRINT_SUPPRESSION_MS
} = {}) => {
  const lastSpeechByStatusKey = new Map()
  const lastSpeechByFingerprint = new Map()

  const getCooldownMs = (status) => (
    minIntervals[status] ?? DEFAULT_MIN_INTERVALS[status] ?? DEFAULT_MIN_INTERVALS.working
  )

  const toNotificationDecision = ({ event, reason, shouldSpeak, cooldownMs }) => ({
    status: event.status,
    priority: STATUS_PRIORITY[event.status] || STATUS_PRIORITY.working,
    reason,
    shouldSpeak,
    cooldownMs: Number.isFinite(cooldownMs) ? cooldownMs : null
  })

  const evaluateSpeech = ({ event, previousSession }) => {
    const cooldownMs = getCooldownMs(event.status)
    if (event.status === 'idle') {
      return {
        nowMs: nowMs(),
        notification: toNotificationDecision({ event, reason: 'idle', shouldSpeak: false, cooldownMs })
      }
    }
    if (ROUTINE_VISUAL_ONLY_STATUSES.has(event.status)) {
      return {
        nowMs: nowMs(),
        notification: toNotificationDecision({ event, reason: 'routine-status', shouldSpeak: false, cooldownMs })
      }
    }
    const currentNowMs = nowMs()
    if (previousSession?.status !== event.status) {
      return {
        nowMs: currentNowMs,
        notification: toNotificationDecision({ event, reason: 'status-changed', shouldSpeak: true, cooldownMs })
      }
    }
    const fingerprint = `${event.sessionId}:${event.status}:${event.type}:${event.project || ''}`
    const previousFingerprintAt = lastSpeechByFingerprint.get(fingerprint) || 0
    if (previousFingerprintAt && currentNowMs - previousFingerprintAt < fingerprintSuppressionMs) {
      return {
        nowMs: currentNowMs,
        notification: toNotificationDecision({ event, reason: 'fingerprint-cooldown', shouldSpeak: false, cooldownMs })
      }
    }
    const statusKey = `${event.sessionId}:${event.status}`
    const previousStatusAt = lastSpeechByStatusKey.get(statusKey) || 0
    if (previousStatusAt && currentNowMs - previousStatusAt < cooldownMs) {
      return {
        nowMs: currentNowMs,
        notification: toNotificationDecision({ event, reason: 'status-cooldown', shouldSpeak: false, cooldownMs })
      }
    }
    return {
      nowMs: currentNowMs,
      notification: toNotificationDecision({ event, reason: 'cooldown-elapsed', shouldSpeak: true, cooldownMs })
    }
  }

  const createSpeechText = (event) => {
    if (event.status === 'waiting') return event.message ? `这里需要你确认：${event.message}` : '这里需要你确认一下。'
    if (event.status === 'blocked') return event.message ? `我被卡住了：${event.message}` : '我这里卡住了。'
    if (event.status === 'completed') return event.message ? `我刚完成：${event.message}` : '我刚做完。'
    if (event.status === 'failed') return event.message ? `这次出了点问题：${event.message}` : '这次出了点问题。'
    return ''
  }

  const mapEvent = ({ event, previousSession }) => {
    const petEvent = {
      type: `agent:${event.status}`,
      // Agent events are state signals. Visible desktop copy is emitted only
      // through pet:say so urgent statuses do not create duplicate bubbles.
      message: '',
      ttlMs: event.status === 'completed' ? 8000 : 30000
    }
    const decision = evaluateSpeech({ event, previousSession })
    if (!decision.notification.shouldSpeak) {
      return { petEvent, speech: null, notification: decision.notification }
    }
    const statusKey = `${event.sessionId}:${event.status}`
    const fingerprint = `${event.sessionId}:${event.status}:${event.type}:${event.project || ''}`
    lastSpeechByStatusKey.set(statusKey, decision.nowMs)
    lastSpeechByFingerprint.set(fingerprint, decision.nowMs)
    return {
      petEvent,
      notification: decision.notification,
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
