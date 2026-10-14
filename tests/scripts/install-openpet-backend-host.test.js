const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const installerPath = path.resolve(__dirname, '../../scripts/install-openpet-backend-host.sh')

test('backend host installer rejects environment overrides for privileged filesystem paths', () => {
  for (const [name, value] of [
    ['APP_ROOT', '/etc'],
    ['NODE_ROOT', '/usr/local'],
    ['DATA_ROOT', '/root'],
    ['SERVICE_NAME', 'ssh.service'],
    ['NODE_VERSION', 'v99.0.0'],
    ['NODE_ARCH', 'linux-arm64']
  ]) {
    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: { ...process.env, [name]: value }
    })

    assert.notEqual(result.status, 0, `${name} override must be rejected`)
    assert.match(result.stderr, /deployment paths are fixed/)
  }
})

test('backend host installer prepares and validates the staged release before switching the active app', () => {
  const installer = fs.readFileSync(installerPath, 'utf8')
  const dependencyInstall = installer.indexOf('"$NODE_ROOT/bin/npm" ci')
  const contractBuild = installer.indexOf('"$NODE_ROOT/bin/npm" --workspace @openpet/contracts run build')
  const appSwitch = installer.indexOf('mv "$APP_ROOT" "$previous_app"')

  assert.ok(dependencyInstall >= 0 && contractBuild >= 0 && appSwitch >= 0)
  assert.ok(dependencyInstall < contractBuild, 'dependencies must install before contract build')
  assert.ok(contractBuild < appSwitch, 'the existing app must remain in place until staging validates')
  assert.match(installer, /if ! mv "\$APP_ROOT\.new" "\$APP_ROOT"; then[\s\S]*mv "\$previous_app" "\$APP_ROOT"/)
  assert.match(installer, /if ! systemctl daemon-reload[\s\S]*mv "\$previous_app" "\$APP_ROOT"/)
})
