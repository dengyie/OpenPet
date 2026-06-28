const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  defaultArchiveDir,
  parseArgs,
  createPackagedCreatorStudioEvidenceRun
} = require('../../scripts/run-packaged-creator-studio-evidence')

test('packaged creator studio runner parseArgs accepts app, archive dir, and json flag', () => {
  const options = parseArgs([
    '--app', '/Applications/OpenPet.app',
    '--archive-dir', 'docs/release-evidence/creator-studio-packaged/session',
    '--json'
  ])

  assert.equal(options.appPath, '/Applications/OpenPet.app')
  assert.equal(options.archiveDir, 'docs/release-evidence/creator-studio-packaged/session')
  assert.equal(options.json, true)
})

test('packaged creator studio runner parseArgs rejects missing values and unexpected flags', () => {
  assert.throws(
    () => parseArgs(['--app']),
    /--app requires a value/
  )
  assert.throws(
    () => parseArgs(['--unexpected']),
    /Unexpected argument: --unexpected/
  )
})

test('packaged creator studio runner defaultArchiveDir names packaged creator studio sessions', () => {
  const archiveDir = defaultArchiveDir({
    now: () => new Date('2026-06-29T09:00:00.000Z'),
    platform: 'darwin',
    arch: 'arm64'
  })

  assert.match(archiveDir, /2026-06-29T09-00-00Z-darwin-arm64-packaged-creator-studio$/)
})

test('createPackagedCreatorStudioEvidenceRun persists runtime artifact and summary', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-'))

  const result = await createPackagedCreatorStudioEvidenceRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir,
    now: () => new Date('2026-06-29T09:00:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const runtimeArtifactPath = path.join(runArchiveDir, 'packaged-creator-studio-runtime.json')
      const stdoutPath = path.join(runArchiveDir, 'packaged-creator-studio-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-creator-studio-stderr.txt')
      const runtimeArtifact = {
        schemaVersion: 1,
        generatedAt: '2026-06-29T09:00:00.000Z',
        pluginId: 'openpet.creator-studio',
        pluginFound: true,
        pluginEnabledBefore: false,
        hostApp: 'OpenPet.app',
        dashboard: {
          present: true,
          id: 'main',
          title: 'Creator Studio',
          url: 'http://127.0.0.1:8794'
        },
        service: {
          present: true,
          id: 'studio',
          title: 'Creator Studio Service',
          startRequested: true,
          stopRequested: true,
          healthOk: true,
          healthStatus: 'healthy',
          statusBeforeStart: 'stopped',
          statusAfterStart: 'running',
          statusAfterStop: 'stopped'
        },
        command: {
          requested: true,
          commandId: 'draft-task',
          ok: true,
          runId: 'run-packaged-creator-1',
          status: 'draft',
          taskStatus: 'ready_for_confirmation',
          mode: 'single-action'
        }
      }
      fs.writeFileSync(runtimeArtifactPath, `${JSON.stringify(runtimeArtifact, null, 2)}\n`)
      fs.writeFileSync(stdoutPath, 'discovered openpet.creator-studio\n')
      fs.writeFileSync(stderrPath, '')
      return {
        runtimeArtifact,
        runtimeArtifactPath,
        stdoutPath,
        stderrPath,
        errors: []
      }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.runtimeArtifact.pluginFound, true)
  assert.equal(result.summary.commandOk, true)
  assert.equal(result.summary.serviceHealthOk, true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-runtime.json')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-stdout.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-stderr.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-evidence-summary.json')), true)
})

test('createPackagedCreatorStudioEvidenceRun preserves orchestration failures in summary output', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-fail-'))

  const result = await createPackagedCreatorStudioEvidenceRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir,
    now: () => new Date('2026-06-29T09:00:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const stderrPath = path.join(runArchiveDir, 'packaged-creator-studio-stderr.txt')
      fs.writeFileSync(stderrPath, 'timed out waiting for packaged creator studio evidence\n')
      return {
        runtimeArtifact: null,
        runtimeArtifactPath: path.join(runArchiveDir, 'packaged-creator-studio-runtime.json'),
        stdoutPath: path.join(runArchiveDir, 'packaged-creator-studio-stdout.txt'),
        stderrPath,
        errors: ['timed out waiting for packaged creator studio evidence']
      }
    }
  })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /timed out waiting for packaged creator studio evidence/)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-evidence-summary.json')), true)
})
