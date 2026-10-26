const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { insertReleaseMarker, renameWindowsReleaseAssets } = require('../../scripts/prepare-windows-release-assets')

test('insertReleaseMarker labels Windows artifacts before their final extension', () => {
  assert.equal(insertReleaseMarker('OpenPet-1.0.1-win32-x64.exe'), 'OpenPet-1.0.1-win32-x64-unsigned.exe')
  assert.equal(insertReleaseMarker('OpenPet-1.0.1-win32-x64.zip'), 'OpenPet-1.0.1-win32-x64-unsigned.zip')
  assert.equal(insertReleaseMarker('OpenPet-1.0.1-win32-x64.exe.blockmap'), 'OpenPet-1.0.1-win32-x64.exe-unsigned.blockmap')
  assert.equal(insertReleaseMarker('OpenPet-1.0.1-win32-x64-unsigned.exe'), 'OpenPet-1.0.1-win32-x64-unsigned.exe')
  assert.equal(insertReleaseMarker('OpenPet-1.0.1-win32-x64.exe', 'self-signed'), 'OpenPet-1.0.1-win32-x64-self-signed.exe')
})

test('renameWindowsReleaseAssets renames Windows outputs and updates latest.yml', () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-release-assets-'))
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64.exe'), 'installer')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64.exe.blockmap'), 'blockmap')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64.zip'), 'zip')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-darwin-arm64.zip'), 'mac zip')
  fs.writeFileSync(path.join(releaseDir, 'latest.yml'), [
    'path: OpenPet-1.0.1-win32-x64.exe',
    'files:',
    '  - url: OpenPet-1.0.1-win32-x64.exe',
    '  - url: OpenPet-1.0.1-win32-x64.exe.blockmap',
    '  - url: OpenPet-1.0.1-win32-x64.zip'
  ].join('\n'))

  const result = renameWindowsReleaseAssets({ releaseDir })

  assert.deepEqual(result.renamed, [
    { from: 'OpenPet-1.0.1-win32-x64.exe', to: 'OpenPet-1.0.1-win32-x64-unsigned.exe' },
    { from: 'OpenPet-1.0.1-win32-x64.exe.blockmap', to: 'OpenPet-1.0.1-win32-x64.exe-unsigned.blockmap' },
    { from: 'OpenPet-1.0.1-win32-x64.zip', to: 'OpenPet-1.0.1-win32-x64-unsigned.zip' }
  ])
  assert.equal(result.feedUpdated, true)
  assert.equal(fs.existsSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64.exe')), false)
  assert.equal(fs.existsSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64-unsigned.exe')), true)
  assert.equal(fs.existsSync(path.join(releaseDir, 'OpenPet-1.0.1-darwin-arm64.zip')), true)

  const feed = fs.readFileSync(path.join(releaseDir, 'latest.yml'), 'utf-8')
  assert.match(feed, /OpenPet-1\.0\.1-win32-x64-unsigned\.exe/)
  assert.match(feed, /OpenPet-1\.0\.1-win32-x64\.exe-unsigned\.blockmap/)
  assert.match(feed, /OpenPet-1\.0\.1-win32-x64-unsigned\.zip/)
  assert.doesNotMatch(feed, /url: OpenPet-1\.0\.1-win32-x64\.exe$/m)
})

test('renameWindowsReleaseAssets labels self-signed artifacts and updater metadata accurately', () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-self-signed-'))
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64.exe'), 'installer')
  fs.writeFileSync(path.join(releaseDir, 'latest.yml'), 'path: OpenPet-1.0.1-win32-x64.exe\n')

  const result = renameWindowsReleaseAssets({ releaseDir, marker: 'self-signed' })
  assert.deepEqual(result.renamed, [{ from: 'OpenPet-1.0.1-win32-x64.exe', to: 'OpenPet-1.0.1-win32-x64-self-signed.exe' }])
  assert.match(fs.readFileSync(path.join(releaseDir, 'latest.yml'), 'utf8'), /OpenPet-1\.0\.1-win32-x64-self-signed\.exe/)
  assert.equal(fs.readFileSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64-self-signed.exe'), 'utf8'), 'installer')
})

test('renameWindowsReleaseAssets refuses to overwrite existing release assets', () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-release-assets-conflict-'))
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64.exe'), 'installer')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-win32-x64-unsigned.exe'), 'existing')

  assert.throws(
    () => renameWindowsReleaseAssets({ releaseDir }),
    /already exists/
  )
})
