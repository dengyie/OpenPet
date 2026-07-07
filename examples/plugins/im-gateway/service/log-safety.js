const crypto = require('node:crypto')

const hashIdentifier = (value) => {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12)
}

const sanitizeReceiptText = (value, maxLength = 160) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text
}

module.exports = {
  hashIdentifier,
  sanitizeReceiptText
}
