const test = require('node:test')
const assert = require('node:assert/strict')

const {
  sanitizePluginCommandResultValue,
  sanitizePluginCommandText
} = require('../../src/main/services/plugin-runtime-safety')

test('plugin runtime safety redacts command log text consistently', () => {
  const message = sanitizePluginCommandText([
    'token=bridge-secret',
    'http://127.0.0.1:8787/plugins/bridge/run-1',
    '/Users/mango/private/proposal.json',
    'sk-testSecret_123'
  ].join(' '))

  assert.equal(message.includes('bridge-secret'), false)
  assert.equal(message.includes('127.0.0.1:8787'), false)
  assert.equal(message.includes('/Users/mango/private/proposal.json'), false)
  assert.equal(message.includes('sk-testSecret_123'), false)
  assert.match(message, /\[redacted-token\]=\[redacted-secret\]/)
  assert.match(message, /\[redacted-local-url\]/)
  assert.match(message, /\[redacted-path\]/)
  assert.match(message, /\[redacted-secret\]/)
})

test('plugin runtime safety can preserve safe token labels while bounding text', () => {
  const label = sanitizePluginCommandText('Usage Tokens token=bridge-secret', {
    redactStandaloneTokenWords: false
  })
  const bounded = sanitizePluginCommandText('0123456789abcdef', { maxLength: 10 })

  assert.equal(label, 'Usage Tokens [redacted-token]=[redacted-secret]')
  assert.equal(label.includes('bridge-secret'), false)
  assert.equal(bounded, '0123456...')
})

test('plugin runtime safety redacts output fields and sensitive result values', () => {
  assert.deepEqual(
    sanitizePluginCommandResultValue({
      ok: true,
      token: 'visible-non-output-value',
      apiKey: 'plain-provider-key',
      stdout: 'token=bridge-secret /tmp/openpet-plugin',
      nested: {
        stderr: 'http://localhost:9000/logs',
        value: '/Users/mango/private/value.txt',
        credentials: ['first-secret', 'second-secret']
      }
    }),
    {
      ok: true,
      '[redacted-key]': '[redacted-secret]',
      '[redacted-key-2]': '[redacted-secret]',
      stdout: '[redacted-token]=[redacted-secret] [redacted-path]',
      nested: {
        stderr: '[redacted-local-url]',
        value: '[redacted-path]',
        credentials: ['[redacted-secret]', '[redacted-secret]']
      }
    }
  )
})

test('plugin runtime safety replaces sensitive subtrees and short bearer values', () => {
  const sanitized = sanitizePluginCommandResultValue({
    clientSecret: { nested: 'raw-client-secret' },
    credential: ['raw-credential'],
    authToken: { raw: 'short' },
    error: 'Authorization: Bearer x password=raw-password',
    safe: { passwordPolicy: 'keep', tokenCount: 2 }
  })
  assert.deepEqual(sanitized, {
    '[redacted-key]': '[redacted-secret]',
    '[redacted-key-2]': '[redacted-secret]',
    '[redacted-key-3]': '[redacted-secret]',
    error: 'Authorization=[redacted-secret] password=[redacted-secret]',
    safe: { passwordPolicy: 'keep', tokenCount: 2 }
  })
})

test('plugin runtime safety redacts bearer secrets embedded in keys without dropping collisions', () => {
  const sanitized = sanitizePluginCommandResultValue({
    'Authorization: Bearer secret': 'first-value',
    Authorization: 'second-value',
    '[redacted-key]': 'safe-value',
    nested: {
      'Authorization: Bearer another-secret': 'nested-value'
    }
  })

  assert.equal(Object.keys(sanitized).length, 4)
  assert.equal(Object.keys(sanitized.nested).length, 1)
  assert.equal(sanitized['[redacted-key]'], 'safe-value')
  assert.equal(sanitized['[redacted-key-2]'], '[redacted-secret]')
  assert.equal(sanitized['[redacted-key-3]'], '[redacted-secret]')
  assert.equal(sanitized.nested['[redacted-key]'], '[redacted-secret]')
  assert.doesNotMatch(JSON.stringify(sanitized), /Authorization: Bearer secret|Authorization: Bearer another-secret|first-value|second-value|nested-value/)
})
