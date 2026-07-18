const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginEntryCwdResolver,
  createPluginProcessEnv,
  parsePluginProcessCommand,
  resolvePluginProcessLaunch
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

test('plugin process support preserves Windows backslash paths inside quoted commands', () => {
  assert.deepEqual(
    parsePluginProcessCommand('"C:\\Program Files\\nodejs\\node.exe" "C:\\work\\plugin\\service.js"', { platform: 'win32' }),
    {
      file: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\work\\plugin\\service.js']
    }
  )
})

test('plugin process support preserves literal backslashes when not used for shell escaping', () => {
  assert.deepEqual(
    parsePluginProcessCommand('node "C:\\temp\\run.js" keep\\literal', { platform: 'darwin' }),
    {
      file: 'node',
      args: ['C:\\temp\\run.js', 'keep\\literal']
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
        NODE_PATH: '/custom/node_modules',
        HOME: '/Users/tester',
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows'
      },
      platform: 'darwin',
      modulePaths: ['/repo/node_modules', '/repo/src/node_modules'],
      existsSync: (candidate) => candidate === '/repo/node_modules'
    }),
    {
      PATH: '/usr/bin',
      NODE_PATH: ['/custom/node_modules', '/repo/node_modules'].join(path.delimiter)
    }
  )

  assert.deepEqual(
    createPluginProcessEnv({
      env: {
        PATH: 'C:\\Windows\\System32',
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        TEMP: 'C:\\Temp'
      },
      platform: 'win32',
      modulePaths: ['C:\\repo\\node_modules'],
      existsSync: () => true
    }),
    {
      PATH: 'C:\\Windows\\System32',
      NODE_PATH: 'C:\\repo\\node_modules',
      SystemRoot: 'C:\\Windows',
      WINDIR: 'C:\\Windows'
    }
  )
})

test('plugin process support uses the packaged Electron binary as Node', () => {
  assert.deepEqual(
    resolvePluginProcessLaunch('node ./service/im-gateway-service.js', {
      electronVersion: '42.4.0',
      execPath: '/Applications/OpenPet.app/Contents/MacOS/OpenPet',
      platform: 'darwin'
    }),
    {
      file: '/Applications/OpenPet.app/Contents/MacOS/OpenPet',
      args: ['./service/im-gateway-service.js'],
      runAsNode: true
    }
  )
  assert.deepEqual(
    createPluginProcessEnv({
      env: { PATH: '/usr/bin' },
      modulePaths: [],
      runAsNode: true
    }),
    {
      PATH: '/usr/bin',
      ELECTRON_RUN_AS_NODE: '1'
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
