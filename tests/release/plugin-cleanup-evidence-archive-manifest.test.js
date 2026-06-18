const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCleanupEvidenceReport
} = require('../../scripts/create-plugin-cleanup-evidence-report')
const {
  createCollector,
  createCommandNotes,
  createManualChecklist
} = require('../../scripts/create-plugin-cleanup-evidence-collector')
const { REQUIRED_CHECKS } = require('../../scripts/validate-plugin-cleanup-evidence-report')
const {
  createPluginCleanupEvidenceArchiveManifest,
  parseArgs,
  resolveArchivePaths,
  writeManifest
} = require('../../scripts/create-plugin-cleanup-evidence-archive-manifest')

const fixedNow = () => new Date('2026-06-18T13:00:00.000Z')

const createReport = ({ status = 'pending' } = {}) => {
  const report = createPluginCleanupEvidenceReport({
    platform: 'darwin',
    arch: 'arm64',
    nodeVersion: 'v24.1.0',
    hostname: () => 'cleanup-archive-host',
    env: {
      RUNNER_NAME: 'manual cleanup archive validation'
    },
    now: () => new Date('2026-06-18T12:00:00.000Z'),
    pluginId: 'openpet.cleanup-fixture',
    hostApp: 'OpenPet packaged app',
    notes: 'Packaged cleanup evidence archive rehearsal'
  })

  report.environment.evidence = 'plugin-cleanup-evidence-collected/environment.txt'
  report.checks = REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status,
    evidence: status === 'pass' ? `Evidence for ${check.id}` : '',
    notes: check.label
  }))

  return report
}

const createArchive = ({ status = 'pending', collectorOverride = null } = {}) => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-archive-'))
  const evidenceDir = path.join(archiveDir, 'plugin-cleanup-evidence-collected')
  fs.mkdirSync(evidenceDir)

  const report = createReport({ status })
  const reportPath = path.join(archiveDir, 'plugin-cleanup-evidence-report.json')
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const collector = collectorOverride || createCollector({
    report,
    reportPath,
    generatedAt: fixedNow()
  })
  fs.writeFileSync(path.join(archiveDir, 'plugin-cleanup-evidence-collector.sh'), `${collector}\n`)

  const files = {
    'environment.txt': 'CollectedAt: 2026-06-18T13:00:00Z\nHostname: cleanup-archive-host\nNode: v24.1.0\nNpm: 11.3.0\n',
    'report-structure-validation.txt': 'Plugin cleanup evidence report: plugin-cleanup-evidence-report.json\nReport structure is valid.\n',
    'cleanup-controlled-fixture-output.json': JSON.stringify({ ok: true, claimBoundary: 'controlled fixture only' }, null, 2),
    'cleanup-controlled-fixture-stderr.txt': '',
    'cleanup-controlled-fixture-status.txt': 'Controlled fixture evidence created under: plugin-cleanup-evidence-collected/cleanup-controlled-fixture\n',
    'manual-checks.md': createManualChecklist(),
    'update-report-commands.md': createCommandNotes({ reportFileName: reportPath })
  }

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(evidenceDir, fileName), content)
  }

  return { archiveDir, evidenceDir, reportPath }
}

test('parseArgs accepts plugin cleanup archive paths and json output', () => {
  const options = parseArgs([
    '--archive-dir', 'archive',
    '--report', 'archive/report.json',
    '--collector', 'archive/collector.sh',
    '--evidence-dir', 'archive/evidence',
    '--output', 'archive/manifest.json',
    '--json'
  ])

  assert.equal(options.archiveDir, 'archive')
  assert.equal(options.reportPath, 'archive/report.json')
  assert.equal(options.collectorPath, 'archive/collector.sh')
  assert.equal(options.evidenceDir, 'archive/evidence')
  assert.equal(options.outputPath, 'archive/manifest.json')
  assert.equal(options.json, true)
})

test('parseArgs rejects incomplete and unexpected plugin cleanup archive arguments', () => {
  assert.throws(() => parseArgs(['--archive-dir']), /--archive-dir requires a value/)
  assert.throws(() => parseArgs(['--unknown']), /Unexpected argument/)
})

test('resolveArchivePaths defaults to the plugin cleanup archive shape', () => {
  const paths = resolveArchivePaths({ archiveDir: 'archive' })

  assert.equal(paths.reportPath, path.resolve('archive/plugin-cleanup-evidence-report.json'))
  assert.equal(paths.collectorPath, path.resolve('archive/plugin-cleanup-evidence-collector.sh'))
  assert.equal(paths.evidenceDir, path.resolve('archive/plugin-cleanup-evidence-collected'))
  assert.equal(paths.outputPath, path.resolve('archive/plugin-cleanup-evidence-archive-manifest.json'))
})

test('createPluginCleanupEvidenceArchiveManifest records a complete pending archive without readiness claim', () => {
  const { archiveDir } = createArchive()

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.cleanupReady, false)
  assert.equal(manifest.files.length, 2)
  assert.equal(manifest.evidence.requiredFilesPresent, true)
  assert.equal(manifest.evidence.files.length, 7)
  assert.equal(manifest.report.structuralValidation.ok, true)
  assert.equal(manifest.report.readinessValidation.ok, false)
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/)
  assert.match(manifest.warnings.join('\n'), /does not prove plugin cleanup readiness/)
})

test('createPluginCleanupEvidenceArchiveManifest fails when required evidence files are missing', () => {
  const { archiveDir, evidenceDir } = createArchive()
  fs.unlinkSync(path.join(evidenceDir, 'manual-checks.md'))

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.cleanupReady, false)
  assert.match(manifest.errors.join('\n'), /missing evidence file: .*manual-checks\.md/)
})

test('createPluginCleanupEvidenceArchiveManifest rejects symlinked evidence files', () => {
  const { archiveDir, evidenceDir } = createArchive()
  fs.symlinkSync(path.join(evidenceDir, 'environment.txt'), path.join(evidenceDir, 'environment-link.txt'))

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.cleanupReady, false)
  assert.match(manifest.errors.join('\n'), /evidence file must not be a symlink: environment-link\.txt/)
})

test('createPluginCleanupEvidenceArchiveManifest rejects required evidence symlinks without following them', () => {
  const { archiveDir, evidenceDir } = createArchive()
  fs.unlinkSync(path.join(evidenceDir, 'manual-checks.md'))
  fs.symlinkSync(evidenceDir, path.join(evidenceDir, 'manual-checks.md'))

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.cleanupReady, false)
  assert.match(manifest.errors.join('\n'), /evidence file must not be a symlink: manual-checks\.md/)
  assert.match(manifest.errors.join('\n'), /missing evidence file: .*manual-checks\.md/)
})

test('createPluginCleanupEvidenceArchiveManifest rejects misleading collector pass shortcuts', () => {
  const { archiveDir } = createArchive({
    collectorOverride: [
      '#!/usr/bin/env bash',
      'npm run update-plugin-cleanup-evidence-report -- report.json --status pass'
    ].join('\n')
  })

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.match(manifest.errors.join('\n'), /collector must not include --status pass/)
  assert.match(manifest.errors.join('\n'), /collector must state that it does not prove cleanup readiness/)
})

test('createPluginCleanupEvidenceArchiveManifest rejects evidence symlinks without accepting them as required files', () => {
  const { archiveDir, evidenceDir } = createArchive()
  fs.unlinkSync(path.join(evidenceDir, 'manual-checks.md'))
  fs.symlinkSync(path.join(evidenceDir, 'environment.txt'), path.join(evidenceDir, 'manual-checks.md'))

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.evidence.requiredFilesPresent, false)
  assert.match(manifest.errors.join('\n'), /evidence file must not be a symlink: manual-checks\.md/)
  assert.match(manifest.errors.join('\n'), /missing evidence file: .*manual-checks\.md/)
})

test('createPluginCleanupEvidenceArchiveManifest can mark all-pass reviewed archives cleanup-ready', () => {
  const { archiveDir } = createArchive({ status: 'pass' })

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.cleanupReady, true)
  assert.equal(manifest.report.readinessValidation.summary.cleanupReady, true)
})

test('writeManifest writes a pretty JSON plugin cleanup archive manifest', () => {
  const { archiveDir } = createArchive()
  const outputPath = path.join(archiveDir, 'manifest', 'plugin-cleanup-evidence-archive-manifest.json')
  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, outputPath, now: fixedNow })

  assert.equal(writeManifest({ manifest, outputPath }), outputPath)
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf-8')).cleanupReady, false)
})
