const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')

const pluginRoot = path.resolve(__dirname, '../../examples/plugins/creator-studio')

test('creator studio example manifest declares hybrid creator workflow entries', () => {
  const manifest = normalizePluginManifest(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf-8')),
    { source: 'local', basePath: pluginRoot }
  )

  assert.equal(manifest.id, 'openpet.creator-studio')
  assert.equal(manifest.profile, 'hybrid')
  assert.deepEqual(manifest.permissions, ['pet-pack:import', 'pet:say'])
  assert.deepEqual(manifest.commands.map((command) => command.id), [
    'create-run',
    'run-step',
    'approve-run',
    'import-approved-pet',
    'export-bundle'
  ])
  assert.equal(manifest.entries.services[0].id, 'studio')
  assert.equal(manifest.entries.dashboards[0].id, 'main')
})

test('creator studio run store creates and advances durable run state', () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-test-'))

  const run = createRun({
    dataDir,
    input: {
      petName: 'Sprout Cat',
      prompt: 'A small mint helper cat',
      backend: 'fixture'
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const updated = updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'prepared',
    patch: { currentStep: 'prepare' },
    now: () => '2026-06-19T00:01:00.000Z'
  })

  assert.equal(run.status, 'draft')
  assert.equal(readRun({ dataDir, runId: run.runId }).input.petName, 'Sprout Cat')
  assert.equal(updated.status, 'prepared')
  assert.equal(updated.currentStep, 'prepare')
})

test('creator studio fake hatch pet creates valid codex output and bundle', () => {
  const { createRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { generateFixturePetOutput } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-output-'))
  const run = createRun({
    dataDir,
    input: { petName: 'Sprout Cat', prompt: 'A small mint helper cat', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })

  const output = generateFixturePetOutput({ dataDir, runId: run.runId })
  const manifest = JSON.parse(fs.readFileSync(path.join(output.outputDir, 'pet.json'), 'utf-8'))
  const bundleHash = crypto.createHash('sha256').update(fs.readFileSync(output.bundlePath)).digest('hex')

  assert.equal(manifest.id, run.petId)
  assert.equal(manifest.spritesheetPath, 'spritesheet.webp')
  assert.equal(fs.existsSync(path.join(output.outputDir, 'spritesheet.webp')), true)
  assert.equal(fs.existsSync(output.bundlePath), true)
  assert.equal(output.sha256, bundleHash)
})
