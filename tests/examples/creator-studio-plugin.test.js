const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')
const { normalizeConfigSchema } = require('../../src/main/plugins/config-schema')

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

test('creator studio example config schema normalizes backend controls', () => {
  const schema = normalizeConfigSchema(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'config.schema.json'), 'utf-8'))
  )

  assert.deepEqual(schema.properties.map((field) => field.key), [
    'backend',
    'autoActivateAfterImport',
    'servicePort'
  ])
  assert.deepEqual(schema.properties.find((field) => field.key === 'backend').enum, ['fixture', 'cloud', 'local'])
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

const runCreatorCommand = ({ command, dataDir, payload = {}, env = {} }) => {
  const result = spawnSync(process.execPath, [path.join(pluginRoot, 'commands', `${command}.js`)], {
    input: `${JSON.stringify({
      pluginId: 'openpet.creator-studio',
      commandId: command,
      payload,
      config: { backend: 'fixture', autoActivateAfterImport: true },
      paths: { extensionDir: pluginRoot }
    })}\n`,
    env: {
      ...process.env,
      OPENPET_DATA_DIR: dataDir,
      OPENPET_CACHE_DIR: path.join(dataDir, 'cache'),
      OPENPET_LOG_DIR: path.join(dataDir, 'logs'),
      ...env
    },
    encoding: 'utf-8'
  })
  return {
    ...result,
    json: JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1))
  }
}

test('creator studio commands create run generate output approve and export', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-commands-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Sprout Cat', prompt: 'A small mint helper cat' }
  })
  const generated = runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: created.json.run.runId }
  })
  const approved = runCreatorCommand({
    command: 'approve-run',
    dataDir,
    payload: { runId: created.json.run.runId }
  })
  const exported = runCreatorCommand({
    command: 'export-bundle',
    dataDir,
    payload: { runId: created.json.run.runId }
  })

  assert.equal(created.status, 0)
  assert.equal(generated.status, 0)
  assert.equal(approved.status, 0)
  assert.equal(exported.status, 0)
  assert.equal(created.json.ok, true)
  assert.equal(generated.json.run.status, 'ready_for_review')
  assert.equal(approved.json.run.status, 'approved')
  assert.equal(exported.json.ok, true)
  assert.equal(fs.existsSync(exported.json.bundle.path), true)
})

test('creator studio dashboard asset exists and service script is declared', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const servicePath = path.join(pluginRoot, 'service', 'studio-service.js')
  assert.equal(fs.existsSync(dashboardPath), true)
  assert.equal(fs.existsSync(servicePath), true)
  assert.match(fs.readFileSync(dashboardPath, 'utf-8'), /Creator Studio/)
})
