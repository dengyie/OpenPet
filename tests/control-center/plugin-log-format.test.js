const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')

let formatPluginLogLevel
let getPluginLogLevelClass

test.before(async () => {
  ;({ formatPluginLogLevel, getPluginLogLevelClass } = await import(pathToFileURL(path.resolve(__dirname, '../../src/control-center/src/lib/format.js')).href))
})

test('plugin log formatting preserves warning severity for display', () => {
  assert.equal(formatPluginLogLevel('warn'), 'Warning')
  assert.equal(getPluginLogLevelClass('warn'), 'warn')
  assert.equal(formatPluginLogLevel('error'), 'Error')
  assert.equal(getPluginLogLevelClass('error'), 'error')
  assert.equal(formatPluginLogLevel('unknown'), 'Info')
  assert.equal(getPluginLogLevelClass('unknown'), 'info')
})
