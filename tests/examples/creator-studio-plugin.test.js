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
  assert.deepEqual(run.backendStatus, {
    backend: 'fixture',
    state: 'idle',
    message: '',
    updatedAt: '2026-06-19T00:00:00.000Z'
  })
  assert.equal(updated.status, 'prepared')
  assert.equal(updated.currentStep, 'prepare')
})

test('creator studio run store keeps same-name same-day runs separate', () => {
  const { createRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-collisions-'))

  const first = createRun({
    dataDir,
    input: {
      petName: 'Sprout Cat',
      prompt: 'First concept',
      backend: 'fixture'
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const second = createRun({
    dataDir,
    input: {
      petName: 'Sprout Cat',
      prompt: 'Second concept',
      backend: 'fixture'
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })

  assert.notEqual(first.runId, second.runId)
  assert.equal(fs.readFileSync(path.join(dataDir, 'runs', first.runId, 'inputs', 'prompt.md'), 'utf-8'), 'First concept\n')
  assert.equal(fs.readFileSync(path.join(dataDir, 'runs', second.runId, 'inputs', 'prompt.md'), 'utf-8'), 'Second concept\n')
})

test('creator studio run store lists runs and persists append-only logs', () => {
  const { appendRunLog, createRun, listRuns, readRunLogs } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-run-list-'))

  const first = createRun({
    dataDir,
    input: { petName: 'First Cat', prompt: 'First prompt', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const second = createRun({
    dataDir,
    input: { petName: 'Second Cat', prompt: 'Second prompt', backend: 'fixture' },
    now: () => '2026-06-19T00:02:00.000Z'
  })
  appendRunLog({
    dataDir,
    runId: second.runId,
    level: 'info',
    event: 'generate.start',
    message: 'Generation started',
    now: () => '2026-06-19T00:03:00.000Z'
  })

  assert.deepEqual(listRuns({ dataDir }).map((run) => run.runId), [second.runId, first.runId])
  assert.deepEqual(readRunLogs({ dataDir, runId: second.runId }), [{
    timestamp: '2026-06-19T00:03:00.000Z',
    level: 'info',
    event: 'generate.start',
    message: 'Generation started',
    data: {}
  }])
})

test('creator studio backend runner generates fixture output through the selected adapter', () => {
  const { createRun, readRunLogs } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { runGenerationStep } = require('../../examples/plugins/creator-studio/lib/backend-runner')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-output-'))
  const run = createRun({
    dataDir,
    input: { petName: 'Sprout Cat', prompt: 'A small mint helper cat', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })

  const output = runGenerationStep({ dataDir, runId: run.runId })
  const manifest = JSON.parse(fs.readFileSync(path.join(output.outputDir, 'pet.json'), 'utf-8'))
  const bundleHash = crypto.createHash('sha256').update(fs.readFileSync(output.bundlePath)).digest('hex')

  assert.equal(manifest.id, run.petId)
  assert.equal(manifest.spritesheetPath, 'spritesheet.webp')
  assert.equal(fs.existsSync(path.join(output.outputDir, 'spritesheet.webp')), true)
  assert.equal(fs.existsSync(output.bundlePath), true)
  assert.equal(output.sha256, bundleHash)
  assert.equal(output.run.backendStatus.state, 'ready')
  assert.equal(output.run.backendStatus.backend, 'fixture')
  assert.deepEqual(readRunLogs({ dataDir, runId: run.runId }).map((entry) => entry.event), [
    'generate.start',
    'generate.complete'
  ])
})

test('creator studio backend runner records unavailable cloud backend without fixture fallback', () => {
  const { createRun, readRun, readRunLogs } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { runGenerationStep } = require('../../examples/plugins/creator-studio/lib/backend-runner')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-cloud-'))
  const run = createRun({
    dataDir,
    input: { petName: 'Cloud Cat', prompt: 'A cloud generated cat', backend: 'cloud' },
    now: () => '2026-06-19T00:00:00.000Z'
  })

  assert.throws(
    () => runGenerationStep({ dataDir, runId: run.runId }),
    /Cloud backend is not configured/
  )
  const failed = readRun({ dataDir, runId: run.runId })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.currentStep, 'generate')
  assert.equal(failed.backendStatus.backend, 'cloud')
  assert.equal(failed.backendStatus.state, 'not_configured')
  assert.match(failed.error, /Cloud backend is not configured/)
  assert.equal(fs.existsSync(path.join(dataDir, 'runs', run.runId, 'outputs', 'pet.json')), false)
  assert.deepEqual(readRunLogs({ dataDir, runId: run.runId }).map((entry) => entry.event), [
    'generate.start',
    'generate.failed'
  ])
})

const runCreatorCommand = ({ command, dataDir, payload = {}, config = {}, env = {} }) => {
  const result = spawnSync(process.execPath, [path.join(pluginRoot, 'commands', `${command}.js`)], {
    input: `${JSON.stringify({
      pluginId: 'openpet.creator-studio',
      commandId: command,
      payload,
      config: { backend: 'fixture', autoActivateAfterImport: true, ...config },
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

test('creator studio run-step command fails unavailable local backend with persisted run state', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-local-command-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Local Cat', prompt: 'A local generated cat', backend: 'local' },
    config: { backend: 'local' }
  })
  const generated = runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: created.json.run.runId },
    config: { backend: 'local' }
  })
  const run = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', created.json.run.runId, 'run.json'), 'utf-8'))

  assert.equal(created.status, 0)
  assert.equal(generated.status, 1)
  assert.equal(generated.json.ok, false)
  assert.match(generated.json.error, /Local backend is not configured/)
  assert.equal(run.status, 'failed')
  assert.equal(run.backendStatus.backend, 'local')
  assert.equal(run.backendStatus.state, 'not_configured')
})

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

test('creator studio service exposes run detail and logs for dashboard clients', async () => {
  const { appendRunLog, createRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const run = createRun({
    dataDir,
    input: { petName: 'Service Cat', prompt: 'Visible in dashboard', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  appendRunLog({
    dataDir,
    runId: run.runId,
    level: 'info',
    event: 'run.created',
    message: 'Run created',
    now: () => '2026-06-19T00:01:00.000Z'
  })
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const detail = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}`).then((response) => response.json())
    const logs = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/logs`).then((response) => response.json())

    assert.equal(detail.ok, true)
    assert.equal(detail.run.runId, run.runId)
    assert.equal(logs.ok, true)
    assert.deepEqual(logs.logs.map((entry) => entry.event), ['run.created'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
