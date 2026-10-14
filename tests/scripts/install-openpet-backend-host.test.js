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
  const dependencyInstall = installer.indexOf('"$node_candidate/bin/npm" ci')
  const contractBuild = installer.indexOf('"$node_candidate/bin/npm" --workspace @openpet/contracts run build')
  const appSwitch = installer.indexOf('mv "$APP_ROOT" "$previous_app"')

  assert.ok(dependencyInstall >= 0 && contractBuild >= 0 && appSwitch >= 0)
  assert.ok(dependencyInstall < contractBuild, 'dependencies must install before contract build')
  assert.ok(contractBuild < appSwitch, 'the existing app must remain in place until staging validates')
  assert.match(installer, /if ! mv "\$app_stage" "\$APP_ROOT"; then[\s\S]*exit 1/)
  assert.match(installer, /restore_application_and_node\(\)[\s\S]*mv "\$previous_app" "\$APP_ROOT"/)
  assert.match(installer, /rollback_deployment\(\)[\s\S]*restore_application_and_node[\s\S]*restore_service_unit/)
  assert.match(installer, /cleanup_install\(\)[\s\S]*rollback_deployment/)
  assert.match(installer, /trap cleanup_install EXIT/)
  assert.match(installer, /if ! install -m 0644 deploy\/openpet-backend-host\.service[\s\S]*exit 1/)
})

test('backend host installer isolates privileged downloads and restores the service unit on rollback', () => {
  const installer = fs.readFileSync(installerPath, 'utf8')

  assert.match(installer, /mktemp -d \/tmp\/openpet-install\./)
  assert.match(installer, /node_tar="\$work_dir\/node\.tar\.xz"/)
  assert.doesNotMatch(installer, /node_tar=\/tmp\/openpet-node-/)
  assert.match(installer, /if \[\[ -e "\$snapshot_unit" \]\]; then[\s\S]*cp -a "\$snapshot_unit" "\$unit_path"/)
  assert.match(installer, /systemctl disable --now "\$SERVICE_NAME"[\s\S]*rm -f "\$unit_path"/)
  assert.match(installer, /restore_service_unit\(\)[\s\S]*systemctl daemon-reload/)
})
