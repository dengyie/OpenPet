const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8')

test('pet interaction layer keeps a transparent paint surface for reliable CSS cursor updates', () => {
  assert.match(indexHtml, /#pet\s*{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.001\)/s)
})

test('pet window includes a DOM cursor overlay for transparent-window cursor rendering', () => {
  assert.match(indexHtml, /#custom-cursor-overlay\s*{[^}]*pointer-events:\s*none/s)
  assert.match(indexHtml, /#custom-cursor-overlay\.visible\s*{[^}]*display:\s*block/s)
  assert.match(indexHtml, /<img[^>]+id="custom-cursor-overlay"[^>]+aria-hidden="true"/s)
})
