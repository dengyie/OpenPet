const REDACTED_SECRET = '[redacted-secret]'
const REDACTED_TOKEN = '[redacted-token]'
const REDACTED_PATH = '[redacted-path]'
const REDACTED_LOCAL_URL = '[redacted-local-url]'
const REDACTED_PROMPT = '[redacted-prompt]'

const SECRET_VALUE_PATTERNS = [
  /\bsk-cpa-[A-Za-z0-9_-]{8,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/gi,
  /\bbearer\s+[A-Za-z0-9._-]{8,}\b/gi
]

const LOCAL_URL_PATTERNS = [
  /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi,
  /file:\/\/[^\s,，。)]+/gi
]

const LOCAL_PATH_PATTERNS = [
  /(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g,
  /[A-Za-z]:\\[^\s,，。)]+/g
]

const EXPLICIT_SECRET_ASSIGNMENT_PATTERNS = [
  [/\b([A-Za-z0-9_-]*token[A-Za-z0-9_-]*)\b\s*[:=]\s*(?:bearer\s+)?[^\s,，。)]+/gi, `${REDACTED_TOKEN}=${REDACTED_SECRET}`],
  [/\b(api[_ -]?key|authorization|password|secret)\b\s*[:=]\s*(?:bearer\s+)?[^\s,，。)]+/gi, '$1=[redacted-secret]']
]

const PROMPT_PATTERNS = [
  [/\bprompt\b\s*[:=]\s*(["'`]).*?\1/gi, `prompt=${REDACTED_PROMPT}`],
  [/\bprompt\s+(["'`]).*?\1/gi, `prompt ${REDACTED_PROMPT}`],
  [/\breply\b\s*[:=]\s*(["'`]).*?\1/gi, 'reply=[redacted-reply]'],
  [/\breply\s+(["'`]).*?\1/gi, 'reply [redacted-reply]']
]

const truncateText = (value, maxChars = 240) => {
  const text = String(value || '')
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...[truncated]`
}

const sanitizeLogText = (value, { maxChars = 240 } = {}) => {
  let text = String(value || '').trim()
  if (!text) return ''

  for (const [pattern, replacement] of EXPLICIT_SECRET_ASSIGNMENT_PATTERNS) {
    text = text.replace(pattern, replacement)
  }
  for (const pattern of SECRET_VALUE_PATTERNS) {
    text = text.replace(pattern, (match) => (
      /^bearer\s+/i.test(match) ? `Bearer ${REDACTED_SECRET}` : REDACTED_SECRET
    ))
  }
  for (const pattern of LOCAL_URL_PATTERNS) {
    text = text.replace(pattern, REDACTED_LOCAL_URL)
  }
  for (const pattern of LOCAL_PATH_PATTERNS) {
    text = text.replace(pattern, REDACTED_PATH)
  }
  for (const [pattern, replacement] of PROMPT_PATTERNS) {
    text = text.replace(pattern, replacement)
  }

  return truncateText(text, maxChars)
}

module.exports = {
  sanitizeLogText,
  truncateText
}
