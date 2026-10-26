const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const { signAdHoc } = require('../../build/sign-ad-hoc')

test('macOS afterPack applies and verifies an ad-hoc signature', () => {
  const calls = []
  const result = signAdHoc({
    electronPlatformName: 'darwin',
    appOutDir: '/tmp/openpet-release/mac',
    packager: { appInfo: { productFilename: 'OpenPet' } }
  }, {
    execFile: (command, args) => calls.push([command, args])
  })

  assert.deepEqual(result, { signed: true, appPath: '/tmp/openpet-release/mac/OpenPet.app' })
  assert.deepEqual(calls, [
    ['codesign', ['--force', '--deep', '--sign', '-', '/tmp/openpet-release/mac/OpenPet.app']],
    ['codesign', ['--verify', '--deep', '--strict', '/tmp/openpet-release/mac/OpenPet.app']]
  ])
})

test('macOS afterPack does not invoke signing tools for other platforms', () => {
  let called = false
  const result = signAdHoc({ electronPlatformName: 'win32' }, { execFile: () => { called = true } })
  assert.deepEqual(result, { signed: false, reason: 'not-macos' })
  assert.equal(called, false)
})

test('release packaging uses self-managed signing and has no paid certificate or notarization secret dependency', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/release.yml'), 'utf8')

  assert.equal(packageJson.build.afterPack, 'build/sign-ad-hoc.js')
  assert.equal(packageJson.build.mac.hardenedRuntime, false)
  assert.doesNotMatch(workflow, /secrets\.(?:CSC_LINK|CSC_KEY_PASSWORD|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID|WINDOWS_CSC_LINK|WINDOWS_CSC_KEY_PASSWORD)/)
  assert.match(workflow, /New-SelfSignedCertificate/)
  assert.match(workflow, /-Subject 'CN=OpenPet Self-Signed Release'/)
  assert.match(workflow, /prepare-windows-release-assets -- --self-signed/)
  assert.match(workflow, /Build and verify self-signed Windows artifacts/)
  assert.match(workflow, /Get-AuthenticodeSignature/)
  assert.match(workflow, /Import-Certificate[\s\S]*Cert:\\CurrentUser\\Root/)
  assert.match(workflow, /Remove-Item -LiteralPath "Cert:\\CurrentUser\\Root\\\$\(\$certificate\.Thumbprint\)"/)
  assert.equal(workflow.match(/ELECTRON_BUILDER_OFFLINE = 'true'/g)?.length, 2)
  assert.match(workflow, /expected Valid/)
  assert.match(workflow, /status: NotApplicable[\s\S]*notarization is intentionally not used/)
})
