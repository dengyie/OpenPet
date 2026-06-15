const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createOpenPetPlugin,
  defaultPluginId,
  parseArgs
} = require('../../scripts/create-openpet-plugin')
const { validatePluginPackage } = require('../../scripts/validate-plugin-package')

test('parseArgs accepts plugin scaffold options', () => {
  const options = parseArgs([
    'weather badge',
    '--template', 'network',
    '--output-dir', 'plugins',
    '--id', 'com.example.weather-badge',
    '--force',
    '--json'
  ])

  assert.equal(options.name, 'weather badge')
  assert.equal(options.template, 'network')
  assert.equal(options.outputDir, 'plugins')
  assert.equal(options.id, 'com.example.weather-badge')
  assert.equal(options.force, true)
  assert.equal(options.json, true)
})

test('parseArgs rejects missing values and unknown templates', () => {
  assert.throws(() => parseArgs(['demo', '--template']), /--template requires a value/)
  assert.throws(() => parseArgs(['demo', '--template', 'secret']), /Unknown plugin template/)
})

test('defaultPluginId creates a safe OpenPet plugin id', () => {
  assert.equal(defaultPluginId('Weather Badge!'), 'openpet.plugin.weather-badge')
  assert.equal(defaultPluginId('___'), 'openpet.plugin.my-plugin')
})

test('createOpenPetPlugin scaffolds minimal, network, and storage templates that validate', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-scaffold-'))

  for (const template of ['minimal', 'network', 'storage']) {
    const result = createOpenPetPlugin({
      name: `${template} demo`,
      template,
      outputDir,
      now: () => new Date('2026-06-16T03:00:00.000Z')
    })

    assert.equal(result.template, template)
    assert.equal(fs.existsSync(path.join(result.pluginDir, 'plugin.json')), true)
    assert.equal(fs.existsSync(path.join(result.pluginDir, 'index.js')), true)
    assert.equal(fs.existsSync(path.join(result.pluginDir, 'README.md')), true)

    const validation = validatePluginPackage(result.pluginDir)
    assert.equal(validation.ok, true)
    assert.equal(validation.review.plugin.id, result.plugin.id)
  }
})

test('createOpenPetPlugin refuses to overwrite existing plugins unless forced', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-scaffold-existing-'))
  createOpenPetPlugin({ name: 'demo', outputDir })

  assert.throws(() => createOpenPetPlugin({ name: 'demo', outputDir }), /already exists/)

  const result = createOpenPetPlugin({ name: 'demo', outputDir, force: true })
  assert.equal(fs.existsSync(path.join(result.pluginDir, 'plugin.json')), true)
})
