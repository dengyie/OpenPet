const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createCommandNotes,
  createManualChecklist
} = require('../../scripts/create-plugin-cleanup-evidence-collector')
const {
  DEFAULT_COLLECTOR_TIMEOUT_MS,
  createPluginCleanupEvidenceRun,
  defaultArchiveDir,
  parseArgs,
  runCollectorCommand
} = require('../../scripts/run-plugin-cleanup-evidence-collector')

const fixedNow = () => new Date('2026-06-18T14:00:00.000Z')

const writeCollectedEvidence = ({ evidenceDir, reportPath }) => {
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(path.join(evidenceDir, 'environment.txt'), [
    'CollectedAt: 2026-06-18T14:00:00Z',
    'Hostname: packaged-cleanup-host',
    'Kernel: Darwin test',
    'Node: v24.1.0',
    'Npm: 11.3.0',
    `ReportPath: ${reportPath}`,
    `EvidenceDir: ${evidenceDir}`,
    ''
  ].join('\n'))
  fs.writeFileSync(path.join(evidenceDir, 'report-structure-validation.txt'), [
    `Plugin cleanup evidence report: ${reportPath}`,
    'Report structure is valid.',
    ''
  ].join('\n'))
  fs.writeFileSync(path.join(evidenceDir, 'cleanup-controlled-fixture-output.json'), `${JSON.stringify({
    ok: true,
    claimBoundary: 'single controlled host cleanup fixture; not a universal process-tree guarantee'
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(evidenceDir, 'cleanup-controlled-fixture-stderr.txt'), '')
  fs.writeFileSync(path.join(evidenceDir, 'cleanup-controlled-fixture-status.txt'), `Controlled fixture evidence created under: ${path.join(evidenceDir, 'cleanup-controlled-fixture')}\n`)
  fs.writeFileSync(path.join(evidenceDir, 'manual-checks.md'), createManualChecklist())
  fs.writeFileSync(path.join(evidenceDir, 'update-report-commands.md'), createCommandNotes({ reportFileName: reportPath }))
}

test('parseArgs accepts packaged cleanup runner options', () => {
  const options = parseArgs([
    '--archive-dir', 'release/plugin-cleanup',
    '--plugin-id', 'openpet.cleanup-fixture',
    '--host-app', 'OpenPet packaged app',
    '--notes', 'packaged cleanup rehearsal',
    '--json'
  ])

  assert.equal(options.archiveDir, 'release/plugin-cleanup')
  assert.equal(options.pluginId, 'openpet.cleanup-fixture')
  assert.equal(options.hostApp, 'OpenPet packaged app')
  assert.equal(options.notes, 'packaged cleanup rehearsal')
  assert.equal(options.json, true)
})

test('parseArgs rejects incomplete and unexpected packaged cleanup runner arguments', () => {
  assert.throws(() => parseArgs(['--archive-dir']), /--archive-dir requires a value/)
  assert.throws(() => parseArgs(['--plugin-id', '']), /--plugin-id requires a value/)
  assert.throws(() => parseArgs(['--unknown']), /Unexpected argument/)
})

test('defaultArchiveDir creates a dated release evidence session path', () => {
  const archiveDir = defaultArchiveDir({
    now: fixedNow,
    platform: 'darwin',
    arch: 'arm64'
  })

  assert.equal(
    archiveDir,
    path.join('docs', 'release-evidence', 'plugin-cleanup-evidence', '2026-06-18T14-00-00Z-darwin-arm64')
  )
})

test('runCollectorCommand writes execution transcripts and passes report/evidence env', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-run-command-'))
  const reportPath = path.join(tempDir, 'plugin-cleanup-evidence-report.json')
  const evidenceDir = path.join(tempDir, 'plugin-cleanup-evidence-collected')
  const collectorPath = path.join(tempDir, 'plugin-cleanup-evidence-collector.sh')
  fs.writeFileSync(collectorPath, '#!/usr/bin/env bash\n')

  const result = runCollectorCommand({
    collectorPath,
    reportPath,
    evidenceDir,
    now: fixedNow,
    spawnSyncImpl: (command, args, options) => {
      assert.equal(command, 'bash')
      assert.deepEqual(args, [collectorPath])
      assert.equal(options.env.REPORT_PATH, reportPath)
      assert.equal(options.env.EVIDENCE_DIR, evidenceDir)
      assert.equal(options.timeout, DEFAULT_COLLECTOR_TIMEOUT_MS)
      return { status: 0, signal: null, stdout: 'collector ok\n', stderr: '' }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.exitCode, 0)
  assert.equal(fs.readFileSync(path.join(evidenceDir, 'collector-stdout.txt'), 'utf-8'), 'collector ok\n')
  assert.equal(fs.readFileSync(path.join(evidenceDir, 'collector-stderr.txt'), 'utf-8'), '')
  assert.equal(JSON.parse(fs.readFileSync(path.join(evidenceDir, 'collector-run.json'), 'utf-8')).command[0], 'bash')
})

test('runCollectorCommand records timeout errors as failed collector runs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-run-timeout-'))
  const reportPath = path.join(tempDir, 'plugin-cleanup-evidence-report.json')
  const evidenceDir = path.join(tempDir, 'plugin-cleanup-evidence-collected')
  const collectorPath = path.join(tempDir, 'plugin-cleanup-evidence-collector.sh')
  fs.writeFileSync(collectorPath, '#!/usr/bin/env bash\n')

  const result = runCollectorCommand({
    collectorPath,
    reportPath,
    evidenceDir,
    timeoutMs: 25,
    now: fixedNow,
    spawnSyncImpl: (_command, _args, options) => {
      assert.equal(options.timeout, 25)
      return {
        status: null,
        signal: 'SIGTERM',
        stdout: 'partial output\n',
        stderr: 'timed out\n',
        error: new Error('spawnSync bash ETIMEDOUT')
      }
    }
  })

  const persisted = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'collector-run.json'), 'utf-8'))
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, null)
  assert.equal(result.signal, 'SIGTERM')
  assert.match(result.error, /ETIMEDOUT/)
  assert.equal(persisted.timeoutMs, 25)
  assert.equal(fs.readFileSync(path.join(evidenceDir, 'collector-stdout.txt'), 'utf-8'), 'partial output\n')
})

test('createPluginCleanupEvidenceRun executes collector and archives a pending evidence bundle', () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-run-'))
  fs.rmSync(archiveDir, { recursive: true, force: true })

  const result = createPluginCleanupEvidenceRun({
    archiveDir,
    now: fixedNow,
    platform: 'darwin',
    arch: 'arm64',
    nodeVersion: 'v24.1.0',
    hostname: () => 'packaged-cleanup-host',
    env: { RUNNER_NAME: 'packaged cleanup runner test' },
    spawnSyncImpl: (_command, _args, options) => {
      writeCollectedEvidence({
        evidenceDir: options.env.EVIDENCE_DIR,
        reportPath: options.env.REPORT_PATH
      })
      return { status: 0, signal: null, stdout: 'OpenPet plugin cleanup evidence collected\n', stderr: '' }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.collectorRun.ok, true)
  assert.equal(result.manifest.ok, true)
  assert.equal(result.manifest.cleanupReady, false)
  assert.equal(fs.existsSync(path.join(archiveDir, 'plugin-cleanup-evidence-report.json')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'plugin-cleanup-evidence-collector.sh')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'plugin-cleanup-evidence-archive-manifest.json')), true)
  assert.equal(result.manifest.evidence.files.some((file) => file.file === 'collector-run.json'), true)
})

test('createPluginCleanupEvidenceRun preserves failed collector evidence without claiming archive validity', () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-run-fail-'))
  fs.rmSync(archiveDir, { recursive: true, force: true })

  const result = createPluginCleanupEvidenceRun({
    archiveDir,
    now: fixedNow,
    spawnSyncImpl: () => ({ status: 2, signal: null, stdout: '', stderr: 'collector failed\n' })
  })

  assert.equal(result.ok, false)
  assert.equal(result.collectorRun.ok, false)
  assert.equal(result.manifest.ok, false)
  assert.equal(result.manifest.cleanupReady, false)
  assert.match(result.manifest.errors.join('\n'), /missing evidence file/)
  assert.equal(fs.readFileSync(path.join(archiveDir, 'plugin-cleanup-evidence-collected', 'collector-stderr.txt'), 'utf-8'), 'collector failed\n')
})

test('createPluginCleanupEvidenceRun refuses to overwrite an existing archive session', () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-run-existing-'))
  fs.writeFileSync(path.join(archiveDir, 'plugin-cleanup-evidence-report.json'), '{}\n')

  assert.throws(
    () => createPluginCleanupEvidenceRun({ archiveDir, now: fixedNow }),
    /Plugin cleanup evidence run output already exists/
  )
})
