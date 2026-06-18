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
  createManualChecklist,
  defaultOutputPath,
  parseArgs,
  shellSingleQuotedValue,
  writeCollector
} = require('../../scripts/create-plugin-cleanup-evidence-collector')
const { REQUIRED_CHECKS } = require('../../scripts/validate-plugin-cleanup-evidence-report')

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createPendingReport = () => createPluginCleanupEvidenceReport({
  platform: 'darwin',
  arch: 'arm64',
  nodeVersion: 'v24.1.0',
  hostname: () => 'cleanup-host',
  env: {
    RUNNER_NAME: 'manual cleanup validation'
  },
  now: () => new Date('2026-06-18T12:00:00.000Z'),
  pluginId: 'openpet.cleanup-fixture',
  hostApp: 'OpenPet packaged app',
  notes: 'Real-host cleanup report template'
})

test('cleanup evidence collector parseArgs accepts report and output paths', () => {
  const options = parseArgs([
    'release/plugin-cleanup-evidence-report.json',
    '--output', 'release/plugin-cleanup-evidence-collector.sh'
  ])

  assert.equal(options.reportPath, 'release/plugin-cleanup-evidence-report.json')
  assert.equal(options.outputPath, 'release/plugin-cleanup-evidence-collector.sh')
})

test('cleanup evidence collector parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseArgs(['report.json', '--output']), /--output requires a value/)
  assert.throws(() => parseArgs(['report.json', 'extra.json']), /Unexpected argument/)
})

test('cleanup evidence collector defaultOutputPath writes next to the report', () => {
  assert.equal(
    defaultOutputPath(path.join('release', 'plugin-cleanup-evidence-report.json')),
    path.resolve('release', 'plugin-cleanup-evidence-collector.sh')
  )
})

test('createManualChecklist documents every required cleanup evidence check', () => {
  const checklist = createManualChecklist()

  assert.match(checklist, /# OpenPet Plugin Cleanup Evidence Manual Checklist/)
  for (const check of REQUIRED_CHECKS) {
    assert.match(checklist, new RegExp(escapeRegExp(`\`${check.id}\``)))
    assert.match(checklist, new RegExp(escapeRegExp(check.label)))
  }
})

test('createCommandNotes keeps cleanup report updates evidence-first', () => {
  const notes = createCommandNotes({ reportFileName: 'plugin-cleanup-evidence-report.json' })

  assert.match(notes, /npm run update-plugin-cleanup-evidence-report -- 'plugin-cleanup-evidence-report\.json' --set-env/)
  assert.match(notes, /npm run validate-plugin-cleanup-evidence-report -- 'plugin-cleanup-evidence-report\.json' --allow-pending/)
  assert.match(notes, /Do not use these commands to mark checks as pass/)
  assert.doesNotMatch(notes, /--status pass/)
})

test('createCommandNotes shell-quotes report filenames for copyable commands', () => {
  assert.equal(shellSingleQuotedValue("cleanup report's final.json"), "'cleanup report'\\''s final.json'")

  const notes = createCommandNotes({ reportFileName: "cleanup report's final.json" })

  assert.match(notes, /'cleanup report'\\''s final\.json'/)
})

test('createCollector writes a POSIX helper without claiming readiness', () => {
  const collector = createCollector({
    report: createPendingReport(),
    reportPath: path.resolve('release/plugin-cleanup-evidence-report.json'),
    generatedAt: new Date('2026-06-18T12:30:00.000Z')
  })

  assert.match(collector, /Collects local plugin cleanup evidence/)
  assert.match(collector, /Generated: 2026-06-18T12:30:00.000Z/)
  assert.match(collector, /cleanup-controlled-fixture/)
  assert.match(collector, /npm run create-plugin-cleanup-evidence/)
  assert.match(collector, /manual-checks\.md/)
  assert.match(collector, /update-report-commands\.md/)
  assert.match(collector, /does not prove cleanup readiness/)
  assert.doesNotMatch(collector, /--status pass/)

  for (const check of REQUIRED_CHECKS) {
    assert.equal(collector.includes(`\`${check.id}\``), true)
  }
})

test('createCollector embeds the actual report path so custom output locations still work', () => {
  const reportPath = path.join(os.tmpdir(), 'plugin-cleanup-evidence-report.json')
  const collector = createCollector({
    report: createPendingReport(),
    reportPath,
    generatedAt: new Date('2026-06-18T12:30:00.000Z')
  })

  assert.equal(collector.includes(`REPORT_PATH="\${REPORT_PATH:-${reportPath}}"`), true)
  assert.equal(collector.includes('$SCRIPT_DIR/plugin-cleanup-evidence-report.json'), false)
})

test('createCollector rejects structurally invalid cleanup reports', () => {
  const report = createPendingReport()
  report.checks = report.checks.filter((check) => check.id !== 'service-exit-confirmed-stop')

  assert.throws(
    () => createCollector({ report, reportPath: 'release/plugin-cleanup-evidence-report.json' }),
    /Cannot create plugin cleanup evidence collector.*missing required check: service-exit-confirmed-stop/
  )
})

test('writeCollector writes shell content with a trailing newline', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-collector-'))
  const outputPath = path.join(tempDir, 'nested', 'plugin-cleanup-evidence-collector.sh')

  const writtenPath = writeCollector({ content: 'echo ok\n', outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.equal(raw, 'echo ok\n')
})
