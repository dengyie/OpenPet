const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  CHECK_GUIDANCE,
  createRunbook,
  defaultOutputPath,
  parseArgs: parseRunbookArgs,
  writeRunbook
} = require('../../scripts/create-packaged-runtime-smoke-runbook')
const {
  listChecks,
  parseArgs: parseUpdateArgs,
  updateReport,
  validateUpdatedReport,
  writeReport
} = require('../../scripts/update-packaged-runtime-smoke-report')
const { REQUIRED_CHECKS } = require('../../scripts/validate-packaged-runtime-smoke-report')

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createPendingReport = () => ({
  platform: 'darwin',
  arch: 'arm64',
  generatedAt: '2026-06-16T00:00:00.000Z',
  environment: {
    osRelease: 'Darwin 25.0.0',
    machine: 'mac-runtime-host',
    runner: 'manual packaged runtime smoke',
    evidence: 'local validation transcript'
  },
  artifact: {
    version: '1.0.1-rc.2',
    releaseDir: '/tmp/release',
    appPath: 'mac-arm64/OpenPet.app',
    installer: 'OpenPet-1.0.1-rc.2-mac.dmg',
    zip: 'OpenPet-1.0.1-rc.2-mac.zip',
    latestYml: 'latest-mac.yml',
    signed: false,
    signatureStatus: 'NotSigned',
    signatureEvidence: 'code object is not signed at all'
  },
  fixtures: {
    builtInPacks: {
      'legacy-cat': 'cat_anime/',
      doro: 'assets/pet-packs/doro/',
      duodong: 'assets/pet-packs/duodong/',
      chispa: 'assets/pet-packs/chispa/'
    },
    pluginPackage: 'fixtures/focus.openpet-plugin.zip',
    petPackZip: 'fixtures/doro.codex-pet.zip',
    invalidPackage: 'fixtures/invalid.zip'
  },
  linkedEvidence: {
    desktopPickerSmokeReport: '',
    desktopPickerSmokeRunbook: '',
    screenshots: [],
    recordings: []
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status: 'pending',
    evidence: '',
    notes: check.label
  }))
})

test('runbook parseArgs accepts report and output paths', () => {
  const options = parseRunbookArgs(['release/packaged-runtime-smoke-report.json', '--output', 'release/packaged-runtime-smoke-runbook.md'])

  assert.equal(options.reportPath, 'release/packaged-runtime-smoke-report.json')
  assert.equal(options.outputPath, 'release/packaged-runtime-smoke-runbook.md')
})

test('runbook parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseRunbookArgs(['report.json', '--output']), /--output requires a value/)
  assert.throws(() => parseRunbookArgs(['report.json', 'extra.json']), /Unexpected argument/)
})

test('defaultOutputPath writes the runbook next to the report', () => {
  assert.equal(
    defaultOutputPath(path.join('release', 'packaged-runtime-smoke-report.json')),
    path.resolve('release', 'packaged-runtime-smoke-runbook.md')
  )
})

test('createRunbook documents every required packaged runtime check', () => {
  const report = createPendingReport()
  const runbook = createRunbook({
    report,
    reportPath: path.resolve('release/packaged-runtime-smoke-report.json'),
    generatedAt: new Date('2026-06-16T01:00:00.000Z')
  })

  assert.match(runbook, /# OpenPet Packaged Runtime Smoke Runbook/)
  assert.match(runbook, /Generated: 2026-06-16T01:00:00.000Z/)
  assert.match(runbook, /App path: mac-arm64\/OpenPet\.app/)
  assert.match(runbook, /This file does not prove runtime success by itself/)
  assert.match(runbook, /npm run validate-packaged-runtime-smoke-report -- release\/packaged-runtime-smoke-report\.json/)
  assert.match(runbook, /--require-signed/)

  for (const check of REQUIRED_CHECKS) {
    assert.equal(runbook.includes(`\`${check.id}\``), true)
    assert.match(runbook, new RegExp(escapeRegExp(check.label)))
    assert.match(runbook, new RegExp(escapeRegExp(CHECK_GUIDANCE[check.id])))
  }
})

test('createRunbook rejects structurally invalid reports', () => {
  const report = createPendingReport()
  report.checks = report.checks.filter((check) => check.id !== 'packaged-launch')

  assert.throws(
    () => createRunbook({ report, reportPath: 'release/packaged-runtime-smoke-report.json' }),
    /Cannot create packaged runtime smoke runbook.*missing required check: packaged-launch/
  )
})

test('writeRunbook writes markdown with a trailing newline', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-runtime-runbook-'))
  const outputPath = path.join(tempDir, 'nested', 'packaged-runtime-smoke-runbook.md')

  const writtenPath = writeRunbook({ content: '# Runbook', outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.equal(raw, '# Runbook\n')
})

test('update parseArgs accepts metadata, linked evidence, and check updates', () => {
  const options = parseUpdateArgs([
    'report.json',
    '--set-env', 'machine=mac-runtime-host',
    '--set-artifact', 'signed=true',
    '--set-fixture', 'pluginPackage=fixtures/focus.openpet-plugin.zip',
    '--set-built-in-pack', 'doro=assets/pet-packs/doro/',
    '--set-linked-evidence', 'desktopPickerSmokeReport=release/desktop-picker-smoke-report.json',
    '--add-screenshot', 'release/screenshots/doro.png',
    '--add-recording', 'release/recordings/runtime.mov',
    '--check', 'transparent-background',
    '--status', 'pass',
    '--evidence', 'Screenshot shows transparent pet window',
    '--notes', 'Observed in packaged app'
  ])

  assert.equal(options.reportPath, 'report.json')
  assert.deepEqual(options.envUpdates, [{ key: 'machine', value: 'mac-runtime-host' }])
  assert.deepEqual(options.artifactUpdates, [{ key: 'signed', value: 'true' }])
  assert.deepEqual(options.fixtureUpdates, [{ key: 'pluginPackage', value: 'fixtures/focus.openpet-plugin.zip' }])
  assert.deepEqual(options.builtInPackUpdates, [{ key: 'doro', value: 'assets/pet-packs/doro/' }])
  assert.deepEqual(options.linkedEvidenceUpdates, [{ key: 'desktopPickerSmokeReport', value: 'release/desktop-picker-smoke-report.json' }])
  assert.deepEqual(options.screenshots, ['release/screenshots/doro.png'])
  assert.deepEqual(options.recordings, ['release/recordings/runtime.mov'])
  assert.equal(options.checkId, 'transparent-background')
  assert.equal(options.status, 'pass')
})

test('update parseArgs rejects incomplete or unsafe flag combinations', () => {
  assert.throws(() => parseUpdateArgs(['report.json', '--check']), /--check requires a value/)
  assert.throws(() => parseUpdateArgs(['report.json', '--check', 'transparent-background', '--status', 'done']), /Invalid check status/)
  assert.throws(() => parseUpdateArgs(['report.json', '--status', 'pass']), /--check is required/)
  assert.throws(() => parseUpdateArgs(['report.json', '--require-signed']), /--require-signed must be used with --validate-ready/)
})

test('updateReport updates environment, artifact, fixtures, linked evidence, and selected check evidence', () => {
  const updated = updateReport(createPendingReport(), {
    envUpdates: [{ key: 'machine', value: 'mac-runtime-host-2' }],
    artifactUpdates: [{ key: 'signed', value: 'true' }, { key: 'signatureStatus', value: 'Valid' }],
    fixtureUpdates: [{ key: 'pluginPackage', value: 'fixtures/focus.openpet-plugin.zip' }],
    builtInPackUpdates: [{ key: 'doro', value: 'assets/pet-packs/doro/' }],
    linkedEvidenceUpdates: [{ key: 'desktopPickerSmokeReport', value: 'release/desktop-picker-smoke-report.json' }],
    screenshots: ['release/screenshots/transparent.png'],
    recordings: ['release/recordings/runtime.mov'],
    checkId: 'transparent-background',
    status: 'pass',
    evidence: 'Transparent screenshot observed',
    notes: 'Observed in packaged app'
  })

  assert.equal(updated.environment.machine, 'mac-runtime-host-2')
  assert.equal(updated.artifact.signed, true)
  assert.equal(updated.artifact.signatureStatus, 'Valid')
  assert.equal(updated.fixtures.pluginPackage, 'fixtures/focus.openpet-plugin.zip')
  assert.equal(updated.fixtures.builtInPacks.doro, 'assets/pet-packs/doro/')
  assert.equal(updated.linkedEvidence.desktopPickerSmokeReport, 'release/desktop-picker-smoke-report.json')
  assert.deepEqual(updated.linkedEvidence.screenshots, ['release/screenshots/transparent.png'])
  assert.deepEqual(updated.linkedEvidence.recordings, ['release/recordings/runtime.mov'])
  const check = updated.checks.find((item) => item.id === 'transparent-background')
  assert.equal(check.status, 'pass')
  assert.equal(check.evidence, 'Transparent screenshot observed')
  assert.equal(validateUpdatedReport(updated, { validateReady: false }).ok, true)
})

test('updateReport reads selected check evidence from a text file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-runtime-update-'))
  const evidencePath = path.join(tempDir, 'evidence.txt')
  fs.writeFileSync(evidencePath, 'Sprite and floating bubble chat visible; old inline bubble hidden\n')

  const updated = updateReport(createPendingReport(), {
    checkId: 'speech-bubble-rendered',
    status: 'pass',
    evidenceFile: evidencePath
  })

  const check = updated.checks.find((item) => item.id === 'speech-bubble-rendered')
  assert.equal(check.evidence, 'Sprite and floating bubble chat visible; old inline bubble hidden')
})

test('updateReport rejects unknown metadata and check ids', () => {
  assert.throws(
    () => updateReport(createPendingReport(), { envUpdates: [{ key: 'os', value: 'macOS' }] }),
    /Unknown environment key: os/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { artifactUpdates: [{ key: 'path', value: 'OpenPet.app' }] }),
    /Unknown artifact key: path/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { fixtureUpdates: [{ key: 'plugin', value: 'plugin.zip' }] }),
    /Unknown fixture key: plugin/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { linkedEvidenceUpdates: [{ key: 'video', value: 'runtime.mov' }] }),
    /Unknown linked evidence key: video/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { checkId: 'unknown-check', status: 'pass' }),
    /Unknown check id: unknown-check/
  )
})

test('validateUpdatedReport allows incremental reports but rejects readiness with pending checks', () => {
  const report = createPendingReport()
  const incremental = validateUpdatedReport(report, { validateReady: false })
  assert.equal(incremental.ok, true)

  const ready = validateUpdatedReport(report, { validateReady: true })
  assert.equal(ready.ok, false)
  assert.match(ready.errors.join('\n'), /packaged-launch must pass/)
})

test('listChecks prints every required packaged runtime smoke check', () => {
  const output = listChecks()
  for (const check of REQUIRED_CHECKS) {
    assert.match(output, new RegExp(escapeRegExp(`${check.id}\t${check.label}`)))
  }
})

test('writeReport writes pretty JSON to the requested path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-runtime-write-'))
  const outputPath = path.join(tempDir, 'nested', 'packaged-runtime-smoke-report.json')

  const writtenPath = writeReport({ report: createPendingReport(), outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.match(raw, /\n  "platform": "darwin"/)
  assert.equal(raw.endsWith('\n'), true)
})

test('update CLI does not write invalid ready updates when validation fails', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-runtime-cli-'))
  const reportPath = path.join(tempDir, 'packaged-runtime-smoke-report.json')
  const original = createPendingReport()
  writeReport({ report: original, outputPath: reportPath })

  assert.throws(
    () => execFileSync(process.execPath, [
      path.join(__dirname, '../../scripts/update-packaged-runtime-smoke-report.js'),
      reportPath,
      '--check', 'packaged-launch',
      '--status', 'pass',
      '--validate-ready'
    ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }),
    /packaged-launch passed but has no evidence/
  )

  const afterFailedUpdate = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  const packagedLaunch = afterFailedUpdate.checks.find((check) => check.id === 'packaged-launch')
  assert.equal(packagedLaunch.status, 'pending')
  assert.equal(packagedLaunch.evidence, '')
})
