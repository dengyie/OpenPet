const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

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
  assert.match(installer, /PROVIDER_KEYS_FILE=\$PROVIDER_KEYS_DIR\/provider-keys\.json/)
  assert.match(installer, /existing Provider key file must be owned by openpet:openpet with mode 0600/)
  assert.match(installer, /install -o openpet -g openpet -m 0600 \/dev\/null "\$PROVIDER_KEYS_FILE"/)
})

test('backend host installer isolates privileged downloads and restores the service unit on rollback', () => {
  const installer = fs.readFileSync(installerPath, 'utf8')

  assert.match(installer, /mktemp -d \/tmp\/openpet-install\./)
  assert.match(installer, /node_tar="\$work_dir\/node\.tar\.xz"/)
  assert.doesNotMatch(installer, /node_tar=\/tmp\/openpet-node-/)
  assert.match(installer, /copy_tree_without_reflink\(\)[\s\S]*cp --reflink=never -a/)
  assert.match(installer, /snapshot_stage=\$\(mktemp -d \/var\/backups\/openpet\/\.openpet-snapshot\./)
  assert.match(installer, /snapshot_backend_state\(\)/)
  assert.match(installer, /import \{ backup, DatabaseSync \} from "node:sqlite"/)
  assert.match(installer, /new DatabaseSync\(process\.env\.OPENPET_SNAPSHOT_SOURCE_DB, \{ readOnly: true \}\)/)
  assert.match(installer, /await backup\(database, destination\)/)
  assert.doesNotMatch(installer, /better-sqlite3/)
  assert.match(installer, /copy_tree_without_reflink "\$DATA_ROOT\/backend\/settings\.json"/)
  assert.match(installer, /if \[\[ "\$node_upgrade_required" == 1 && -e "\$NODE_ROOT" \]\]/)
  assert.doesNotMatch(installer, /for path in "\$APP_ROOT" "\$NODE_ROOT" "\$DATA_ROOT"/)
  assert.match(installer, /mv -T -- "\$snapshot_stage" "\$snapshot_dir"/)
  assert.match(installer, /if \[\[ -n "\$snapshot_stage" \]\]; then rm -rf -- "\$snapshot_stage"; fi/)
  assert.match(installer, /if \[\[ "\$snapshot_published" == 1 && "\$snapshot_complete" == 0 \]\]; then rm -rf -- "\$snapshot_dir"; fi/)
  assert.ok(installer.indexOf('trap cleanup_install EXIT') < installer.indexOf('\nsnapshot_backend_state\n'), 'snapshot copy must run under the cleanup trap')
  assert.match(installer, /copy_tree_without_reflink "\$snapshot_unit" "\$unit_path"/)
  assert.match(installer, /systemctl disable --now "\$SERVICE_NAME"[\s\S]*rm -f "\$unit_path"/)
  assert.match(installer, /restore_service_unit\(\)[\s\S]*systemctl daemon-reload/)
})

test('backend host installer creates a consistent snapshot with the managed Node SQLite driver', (t) => {
  const installer = fs.readFileSync(installerPath, 'utf8')
  const snapshotProgram = installer.match(/"\$NODE_ROOT\/bin\/node" --input-type=module -e '\n([\s\S]*?)\n      '/)?.[1]
  assert.ok(snapshotProgram, 'installer snapshot program must be extractable')

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installer-snapshot-'))
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  const sourcePath = path.join(tempDir, 'source.db')
  const destinationPath = path.join(tempDir, 'snapshot.db')
  const source = new DatabaseSync(sourcePath)
  source.exec('PRAGMA journal_mode = WAL; CREATE TABLE evidence (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO evidence (value) VALUES (\'committed\');')

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', snapshotProgram], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENPET_SNAPSHOT_SOURCE_DB: sourcePath,
      OPENPET_SNAPSHOT_DESTINATION_DB: destinationPath
    }
  })
  source.close()

  assert.equal(result.status, 0, result.stderr)
  const snapshot = new DatabaseSync(destinationPath, { readOnly: true })
  const rows = snapshot.prepare('SELECT id, value FROM evidence').all()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 1)
  assert.equal(rows[0].value, 'committed')
  snapshot.close()
})

test('resident Backend service exposes the managed Node runtime to bundled plugin commands', () => {
  const unit = fs.readFileSync(path.resolve(__dirname, '../../deploy/openpet-backend-host.service'), 'utf8')
  assert.match(unit, /^Environment=PATH=\/opt\/openpet\/node\/bin:/m)
})
