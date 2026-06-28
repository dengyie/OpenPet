const test = require('node:test')
const assert = require('node:assert/strict')

test('cloneUpdateCheck normalizes update assets to the shared update asset shape', async () => {
  const { cloneUpdateCheck } = await import('../../src/control-center/src/lib/defaults.ts')

  assert.deepEqual(cloneUpdateCheck({
    status: 'ok',
    configured: true,
    currentVersion: '1.0.1',
    latestVersion: '1.0.2',
    updateAvailable: true,
    assets: [
      {
        name: 'OpenPet-1.0.2-mac-arm64.dmg',
        url: 'https://example.com/OpenPet-1.0.2-mac-arm64.dmg',
        size: '134799501',
        contentType: 'application/x-apple-diskimage',
        ignored: 'internal'
      },
      'legacy-asset-string'
    ]
  }), {
    status: 'ok',
    configured: true,
    currentVersion: '1.0.1',
    latestVersion: '1.0.2',
    updateAvailable: true,
    prerelease: false,
    releaseUrl: '',
    assets: [
      {
        name: 'OpenPet-1.0.2-mac-arm64.dmg',
        url: 'https://example.com/OpenPet-1.0.2-mac-arm64.dmg',
        size: 134799501,
        contentType: 'application/x-apple-diskimage'
      },
      {
        name: '',
        url: '',
        size: 0,
        contentType: ''
      }
    ],
    checkedAt: '',
    message: ''
  })
})
