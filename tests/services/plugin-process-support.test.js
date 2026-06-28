const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginEntryCwdResolver,
  createPluginProcessEnv,
  parsePluginProcessCommand
} = require('../../src/main/services/plugin-process-support')

test('plugin process support parses quoted commands and escapes', () => {
  assert.deepEqual(
    parsePluginProcessCommand('node "scripts/run task.js" --name "Open Pet" path\\ with\\ spaces'),
    {
      file: 'node',
      args: ['scripts/run task.js', '--name', 'Open Pet', 'path with spaces']
    }
  )
})

test('plugin process support rejects empty and unterminated commands', () => {
  assert.throws(() => parsePluginProcessCommand('   '), /Plugin service command is required/)
  assert.throws(() => parsePluginProcessCommand('node "unterminated'), /Plugin service command has an unterminated quote/)
})

test('plugin process support creates minimal process env per platform', () => {
  assert.deepEqual(
    createPluginProcessEnv({
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/tester',
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows'
      },
      platform: 'darwin'
    }),
    { PATH: '/usr/bin' }
  )

  assert.deepEqual(
    createPluginProcessEnv({
      env: {
        PATH: 'C:\\Windows\\System32',
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        TEMP: 'C:\\Temp'
      },
      platform: 'win32'
    }),
    {
      PATH: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      WINDIR: 'C:\\Windows'
    }
  )
})

test('plugin process support resolves cwd inside plugin directory and rejects escapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-process-support-'))
  const pluginDir = path.join(root, 'weather-declaration')
  const commandsDir = path.join(pluginDir, 'commands')
  const outsideDir = path.join(root, 'outside')
  fs.mkdirSync(commandsDir, { recursive: true })
  fs.mkdirSync(outsideDir)

  const resolveCwd = createPluginEntryCwdResolver()
  const manifest = { basePath: pluginDir }

  assert.equal(resolveCwd(manifest, 'commands', 'command'), fs.realpathSync(commandsDir))
  assert.throws(() => resolveCwd(manifest, '../outside', 'command'), /Plugin command cwd must stay inside the plugin directory/)

  const linkPath = path.join(pluginDir, 'command-link')
  fs.symlinkSync(outsideDir, linkPath)
  assert.throws(() => resolveCwd(manifest, 'command-link', 'command'), /Plugin command cwd must stay inside the plugin directory/)
})
