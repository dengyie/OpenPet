const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { validatePluginPackage } = require('../../scripts/validate-plugin-package')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/focus-timer')

const createPluginPackage = ({ signature } = {}) => {
  const pluginPath = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-validate-plugin-'))
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'openpet.example.validate',
    name: 'Validate Example',
    version: '1.0.0',
    main: 'index.js',
    permissions: ['pet:say'],
    commands: [{ id: 'hello', title: 'Hello' }]
  }, null, 2))
  fs.writeFileSync(path.join(pluginPath, 'index.js'), 'module.exports = function activate() { return {} }\n')
  if (signature) {
    fs.writeFileSync(path.join(pluginPath, 'signature.json'), JSON.stringify(signature, null, 2))
  }
  return pluginPath
}

test('validate plugin package accepts a tested example plugin with review warnings', () => {
  const result = validatePluginPackage(EXAMPLE_PLUGIN_PATH)

  assert.equal(result.ok, true)
  assert.equal(result.review.plugin.id, 'openpet.example.focus-timer')
  assert.equal(result.review.signature.status, 'unsigned')
  assert.deepEqual(result.review.plugin.permissions, ['pet:say', 'storage'])
  assert.ok(result.review.packageHash)
  assert.match(result.warnings.join('\n'), /unsigned/)
})

test('validate plugin package can require verified signature metadata', () => {
  const result = validatePluginPackage(EXAMPLE_PLUGIN_PATH, { requireSignature: true })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /Signature hash metadata must be verified/)
})

test('validate plugin package reports signature metadata hash errors', () => {
  const pluginPath = createPluginPackage({ signature: {
    algorithm: 'sha256-test',
    signer: 'openpet-labs',
    value: 'local-test-signature',
    files: {
      'plugin.json': 'not-a-real-hash'
    }
  } })

  const result = validatePluginPackage(pluginPath)

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /Signature error: plugin\.json hash does not match/)
  assert.match(result.errors.join('\n'), /Signature error: Signature metadata does not cover files: index\.js/)
})

test('validate plugin package rejects secret-like config fields', () => {
  const pluginPath = createPluginPackage()
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'openpet.example.secret-config',
    name: 'Secret Config',
    version: '1.0.0',
    main: 'index.js',
    configSchema: 'config.schema.json',
    permissions: ['network'],
    network: { allowlist: ['api.example.com'] },
    commands: [{ id: 'refresh', title: 'Refresh' }]
  }, null, 2))
  fs.writeFileSync(path.join(pluginPath, 'config.schema.json'), JSON.stringify({
    title: 'Secret Config Settings',
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        title: 'API Key',
        description: 'Private provider API key'
      }
    }
  }, null, 2))

  assert.throws(
    () => validatePluginPackage(pluginPath),
    /Plugin config apiKey looks like a secret/
  )
})
