const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const host = fs.readFileSync(path.join(root, 'services/backend/host.js'), 'utf8')
const nginx = fs.readFileSync(path.join(root, 'deploy/openpet-web-control.nginx.conf'), 'utf8')

test('web-control Nginx owns security headers and hides upstream copies', () => {
  const upstreamHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'content-security-policy'
  ]

  for (const header of upstreamHeaders) {
    assert.ok(host.includes(`"${header}":`), `Host must keep ${header}`)
    assert.match(nginx, new RegExp(`proxy_hide_header\\s+${header}\\s*;`, 'i'), `Nginx must hide the upstream ${header}`)
    assert.match(nginx, new RegExp(`add_header\\s+${header}\\s+`, 'i'), `Nginx must set the edge ${header}`)
  }
})
