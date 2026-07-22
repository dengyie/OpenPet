const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const assert = require('node:assert/strict')

const creatorStudioSource = path.resolve(__dirname, '../../examples/plugins/creator-studio')
const projectNodeModules = path.resolve(__dirname, '../../node_modules')

test('installed Creator Studio loads its generation bridge without repository source files', () => {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-installed-'))
  const installedPluginDir = path.join(installRoot, 'openpet.creator-studio')
  fs.cpSync(creatorStudioSource, installedPluginDir, { recursive: true })

  const result = spawnSync(process.execPath, ['-e', "require('./lib/host-model-bridge')"], {
    cwd: installedPluginDir,
    encoding: 'utf-8',
    env: {
      ...process.env,
      NODE_PATH: projectNodeModules
    }
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
})
