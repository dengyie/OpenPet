const test = require('node:test')
const assert = require('node:assert/strict')

test('neutral version utility preserves catalog semver-like comparison', () => {
  const { compareVersions } = require('../../src/main/version-utils')

  assert.equal(compareVersions('v1.2.0', '1.1.9'), 1)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1)
})
