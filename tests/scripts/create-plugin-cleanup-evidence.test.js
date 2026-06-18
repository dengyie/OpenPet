const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCleanupEvidence,
  parseArgs,
  renderMarkdownCleanupEvidence,
  writeCleanupEvidence
} = require('../../scripts/create-plugin-cleanup-evidence')

const fixedNow = () => new Date('2026-06-18T10:00:00.000Z')

test('parseArgs accepts output and json controls', () => {
  const options = parseArgs([
    '--output-dir', 'docs/release-evidence/plugin-cleanup-evidence/session',
    '--json'
  ])

  assert.equal(options.outputDir, 'docs/release-evidence/plugin-cleanup-evidence/session')
  assert.equal(options.json, true)
})

test('parseArgs rejects incomplete and unexpected arguments', () => {
  assert.throws(() => parseArgs(['--output-dir']), /--output-dir requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('createPluginCleanupEvidence writes a controlled host cleanup evidence report', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-evidence-'))
  const outputDir = path.join(tempDir, 'evidence')

  const report = await createPluginCleanupEvidence({
    outputDir,
    now: fixedNow,
    timeoutMs: 5000
  })

  assert.equal(report.ok, true)
  assert.equal(report.phase, 86)
  assert.equal(report.cleanupAttempted, true)
  assert.equal(report.rootExited, true)
  assert.equal(report.descendantsExited, true)
  assert.equal(report.liveDescendantPidsAfter.length, 0)
  assert.equal(report.descendantPidsBefore.length >= 1, true)
  assert.match(report.claimBoundary, /not a universal process-tree guarantee/)
  assert.equal(fs.existsSync(path.join(outputDir, 'plugin-cleanup-evidence.json')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'plugin-cleanup-evidence.md')), true)

  const persisted = JSON.parse(fs.readFileSync(path.join(outputDir, 'plugin-cleanup-evidence.json'), 'utf-8'))
  assert.equal(persisted.ok, true)
  assert.equal(persisted.files.json, path.join(outputDir, 'plugin-cleanup-evidence.json'))
})

test('writeCleanupEvidence refuses to overwrite existing evidence', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-evidence-'))
  const outputDir = path.join(tempDir, 'evidence')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'plugin-cleanup-evidence.json'), '{}\n')

  assert.throws(
    () => writeCleanupEvidence({
      outputDir,
      report: {
        generatedAt: fixedNow().toISOString(),
        ok: true,
        phase: 86,
        platform: process.platform,
        signal: 'SIGTERM',
        cleanupAttempted: true,
        rootPid: 1,
        rootExited: true,
        rootExitCode: 0,
        rootSignal: '',
        descendantPidsBefore: [2],
        liveDescendantPidsAfter: [],
        descendantsExited: true,
        claimBoundary: 'single controlled host cleanup fixture; not a universal process-tree guarantee',
        warnings: []
      }
    }),
    /already exists/
  )
})

test('renderMarkdownCleanupEvidence keeps readiness language conservative', () => {
  const markdown = renderMarkdownCleanupEvidence({
    generatedAt: fixedNow().toISOString(),
    ok: true,
    phase: 86,
    platform: 'darwin',
    signal: 'SIGTERM',
    cleanupAttempted: true,
    rootPid: 123,
    rootExited: true,
    rootExitCode: 0,
    rootSignal: '',
    descendantPidsBefore: [456],
    liveDescendantPidsAfter: [],
    descendantsExited: true,
    claimBoundary: 'single controlled host cleanup fixture; not a universal process-tree guarantee',
    warnings: ['OpenPet still does not claim guaranteed descendant termination for every plugin or platform.']
  })

  assert.match(markdown, /Result: pass/)
  assert.match(markdown, /not a universal process-tree guarantee/)
  assert.match(markdown, /does not claim guaranteed descendant termination/)
})
