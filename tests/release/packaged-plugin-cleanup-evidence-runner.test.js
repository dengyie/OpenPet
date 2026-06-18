const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCleanupEvidenceReport
} = require('../../scripts/create-plugin-cleanup-evidence-report')
const {
  createPluginCleanupEvidenceArchiveManifest
} = require('../../scripts/create-plugin-cleanup-evidence-archive-manifest')
const {
  defaultArchiveDir,
  parseArgs,
  createPackagedPluginCleanupEvidenceRun
} = require('../../scripts/run-packaged-plugin-cleanup-evidence')

test('packaged cleanup runner parseArgs accepts app, plugin source, archive dir, and json flag', () => {
  const options = parseArgs([
    '--app', '/Applications/OpenPet.app',
    '--plugin-source', 'tests/fixtures/plugins/cleanup-evidence-fixture',
    '--archive-dir', 'docs/release-evidence/plugin-cleanup-evidence/packaged-session',
    '--json'
  ])

  assert.equal(options.appPath, '/Applications/OpenPet.app')
  assert.equal(options.pluginSource, 'tests/fixtures/plugins/cleanup-evidence-fixture')
  assert.equal(options.archiveDir, 'docs/release-evidence/plugin-cleanup-evidence/packaged-session')
  assert.equal(options.json, true)
})

test('packaged cleanup runner parseArgs rejects missing plugin source and unexpected flags', () => {
  assert.throws(
    () => parseArgs(['--app', '/Applications/OpenPet.app', '--plugin-source']),
    /--plugin-source requires a value/
  )
  assert.throws(
    () => parseArgs(['--unknown']),
    /Unexpected argument: --unknown/
  )
})

test('packaged cleanup runner defaultArchiveDir names packaged plugin cleanup sessions', () => {
  const archiveDir = defaultArchiveDir({
    now: () => new Date('2026-06-18T19:00:00.000Z'),
    platform: 'darwin',
    arch: 'arm64'
  })

  assert.match(archiveDir, /2026-06-18T19-00-00Z-darwin-arm64-packaged-plugin-cleanup$/)
})

test('createPackagedPluginCleanupEvidenceRun persists transcripts, updated report, and archive manifest', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-plugin-cleanup-'))

  const result = await createPackagedPluginCleanupEvidenceRun({
    appPath: '/Applications/OpenPet.app',
    pluginSource: 'tests/fixtures/plugins/cleanup-evidence-fixture',
    archiveDir,
    now: () => new Date('2026-06-18T19:00:00.000Z'),
    createReportImpl: ({ pluginId, hostApp, now }) => createPluginCleanupEvidenceReport({
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v22.0.0',
      hostname: () => 'packaged-cleanup-host',
      env: { RUNNER_NAME: 'packaged cleanup runner test' },
      pluginId,
      hostApp,
      now
    }),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir, appPath, pluginSource }) => {
      const runtimeArtifactPath = path.join(runArchiveDir, 'packaged-plugin-cleanup-runtime.json')
      const stdoutPath = path.join(runArchiveDir, 'packaged-plugin-cleanup-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-plugin-cleanup-stderr.txt')
      fs.writeFileSync(stdoutPath, `Launch ${appPath} with ${pluginSource}\n`)
      fs.writeFileSync(stderrPath, '')
      const runtimeArtifact = {
        schemaVersion: 1,
        generatedAt: '2026-06-18T19:00:00.000Z',
        pluginId: 'openpet.cleanup-evidence-fixture',
        hostApp: 'OpenPet.app',
        setup: {
          requested: true,
          stopRequested: true,
          exitConfirmed: true,
          treeCleanupAttempted: false,
          transcriptPath: stdoutPath
        },
        command: {
          requested: true,
          stopRequested: true,
          exitConfirmed: true,
          treeCleanupAttempted: false,
          transcriptPath: stdoutPath
        },
        service: {
          requested: true,
          stopRequested: true,
          exitConfirmed: true,
          processGroupCleanupAttempted: true,
          treeCleanupAttempted: false,
          forceStopAttempted: false,
          transcriptPath: stdoutPath
        }
      }
      fs.writeFileSync(runtimeArtifactPath, `${JSON.stringify(runtimeArtifact, null, 2)}\n`)
      return {
        runtimeArtifact,
        runtimeArtifactPath,
        stdoutPath,
        stderrPath
      }
    },
    createArchiveManifestImpl: ({ archiveDir, reportPath, collectorPath, evidenceDir, outputPath, now, fsImpl }) =>
      createPluginCleanupEvidenceArchiveManifest({ archiveDir, reportPath, collectorPath, evidenceDir, outputPath, now, fsImpl })
  })

  assert.equal(result.ok, true)
  assert.equal(result.reportValidation.ok, true)
  assert.equal(result.manifest.ok, true)
  assert.equal(result.manifest.cleanupReady, false)
  assert.equal(result.updatedReport.checks.some((check) => check.status === 'pass'), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-plugin-cleanup-runtime.json')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-plugin-cleanup-stdout.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-plugin-cleanup-stderr.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'plugin-cleanup-evidence-report.json')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'plugin-cleanup-evidence-archive-manifest.json')), true)
})

test('createPackagedPluginCleanupEvidenceRun preserves orchestration failures and invalid archive state', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-plugin-cleanup-fail-'))

  const result = await createPackagedPluginCleanupEvidenceRun({
    appPath: '/Applications/OpenPet.app',
    pluginSource: 'tests/fixtures/plugins/cleanup-evidence-fixture',
    archiveDir,
    now: () => new Date('2026-06-18T19:00:00.000Z'),
    createReportImpl: ({ pluginId, hostApp, now }) => createPluginCleanupEvidenceReport({
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v22.0.0',
      hostname: () => 'packaged-cleanup-host',
      env: { RUNNER_NAME: 'packaged cleanup runner test' },
      pluginId,
      hostApp,
      now
    }),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const stdoutPath = path.join(runArchiveDir, 'packaged-plugin-cleanup-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-plugin-cleanup-stderr.txt')
      fs.writeFileSync(stdoutPath, '')
      fs.writeFileSync(stderrPath, 'timed out waiting for packaged cleanup flow\n')
      return {
        runtimeArtifact: null,
        runtimeArtifactPath: path.join(runArchiveDir, 'packaged-plugin-cleanup-runtime.json'),
        stdoutPath,
        stderrPath,
        errors: ['timed out waiting for packaged cleanup flow']
      }
    }
  })

  assert.equal(result.ok, false)
  assert.equal(result.manifest.ok, false)
  assert.match(result.errors.join('\n'), /timed out|failed/i)
})

test('createPackagedPluginCleanupEvidenceRun converts orchestration throws into archived diagnostics', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-plugin-cleanup-throw-'))

  const result = await createPackagedPluginCleanupEvidenceRun({
    appPath: '/Applications/OpenPet.app',
    pluginSource: 'tests/fixtures/plugins/cleanup-evidence-fixture',
    archiveDir,
    now: () => new Date('2026-06-18T19:00:00.000Z'),
    createReportImpl: ({ pluginId, hostApp, now }) => createPluginCleanupEvidenceReport({
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v22.0.0',
      hostname: () => 'packaged-cleanup-host',
      env: { RUNNER_NAME: 'packaged cleanup runner throw test' },
      pluginId,
      hostApp,
      now
    }),
    orchestratePackagedAppImpl: () => {
      throw new Error('packaged app launch failed')
    }
  })

  assert.equal(result.ok, false)
  assert.equal(result.manifest.ok, false)
  assert.match(result.errors.join('\n'), /packaged app launch failed/)
  assert.match(
    fs.readFileSync(path.join(archiveDir, 'packaged-plugin-cleanup-stderr.txt'), 'utf-8'),
    /packaged app launch failed/
  )
  assert.equal(fs.existsSync(path.join(archiveDir, 'plugin-cleanup-evidence-archive-manifest.json')), true)
})

test('createPackagedPluginCleanupEvidenceRun rejects existing archive outputs before writing', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-plugin-cleanup-existing-'))
  fs.writeFileSync(path.join(archiveDir, 'plugin-cleanup-evidence-report.json'), '{}\n')

  await assert.rejects(
    createPackagedPluginCleanupEvidenceRun({
      appPath: '/Applications/OpenPet.app',
      pluginSource: 'tests/fixtures/plugins/cleanup-evidence-fixture',
      archiveDir
    }),
    /already exists/
  )
})
