const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')

let toCommandResultPreview

test.before(async () => {
  ;({ toCommandResultPreview } = await import(pathToFileURL(path.resolve(__dirname, '../../src/control-center/src/lib/plugin-command-result.mjs')).href))
})

test('toCommandResultPreview prefers structured result message and keeps output snippets', () => {
  const preview = toCommandResultPreview({
    ok: true,
    pluginId: 'weather-declaration',
    commandId: 'announce',
    exitCode: 0,
    stdout: '{"ok":true}',
    stderr: 'warmup',
    result: {
      ok: true,
      message: 'Command completed',
      petSay: 'hello'
    }
  })

  assert.deepEqual(preview, {
    pluginId: 'weather-declaration',
    commandId: 'announce',
    exitCode: 0,
    message: 'Command completed',
    stdout: '{"ok":true}',
    stderr: 'warmup',
    resultText: '{"ok":true,"message":"Command completed","petSay":"hello"}'
  })
})
