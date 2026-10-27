const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createManualChecklist, createCommandNotes } = require('../../scripts/create-windows-smoke-collector')
const { REQUIRED_CHECKS } = require('../../scripts/validate-windows-smoke-report')
const {
  REQUIRED_EVIDENCE_FILES,
  createEvidenceManifest,
  hasValidAuthenticodeStatus,
  parseArgs,
  validateEvidenceBundle
} = require('../../scripts/validate-windows-smoke-evidence-bundle')

const createPendingReport = () => ({
  platform: 'win32',
  arch: 'x64',
  generatedAt: '2026-06-14T00:00:00.000Z',
  environment: {
    windowsVersion: 'Windows 11 23H2',
    machine: 'windows-smoke-vm',
    runner: 'manual validation',
    evidence: 'windows-smoke-evidence/environment.txt'
  },
  artifact: {
    version: '1.0.1-rc.1',
    installer: 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe',
    zip: 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.zip',
    latestYml: 'latest.yml',
    signed: false,
    authenticodeStatus: 'NotSigned',
    authenticodeEvidence: 'windows-smoke-evidence/authenticode.txt'
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status: 'pending',
    evidence: '',
    notes: check.label
  }))
})

const createEvidenceDir = ({ authenticode = 'Status : NotSigned\n', commandNotes = null, manualChecklist = null } = {}) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-evidence-'))
  const evidenceDir = path.join(tempDir, 'windows-smoke-evidence')
  fs.mkdirSync(evidenceDir)

  const files = {
    'environment.txt': 'CollectedAt: 2026-06-14T00:00:00.000Z\nComputerName: WIN-SMOKE',
    'authenticode.txt': authenticode,
    'process.txt': 'Name : OpenPet\nId : 42',
    'install-registry.txt': 'DisplayName : OpenPet\nDisplayVersion : 1.0.1-rc.1',
    'manual-checks.md': manualChecklist || createManualChecklist(),
    'update-report-commands.md': commandNotes || createCommandNotes({ reportFileName: 'windows-smoke-report.json' })
  }

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(evidenceDir, fileName), content)
  }

  return { tempDir, evidenceDir }
}

test('parseArgs accepts evidence directory, report, signing, and json flags', () => {
  const options = parseArgs(['windows-smoke-evidence', '--report', 'windows-smoke-report.json', '--require-signed', '--json'])

  assert.equal(options.evidenceDir, 'windows-smoke-evidence')
  assert.equal(options.reportPath, 'windows-smoke-report.json')
  assert.equal(options.requireSigned, true)
  assert.equal(options.json, true)
})

test('parseArgs defaults to the collector evidence directory and rejects bad input', () => {
  assert.equal(parseArgs([]).evidenceDir, 'windows-smoke-evidence')
  assert.throws(() => parseArgs(['--report']), /--report requires a value/)
  assert.throws(() => parseArgs(['one', 'two']), /Unexpected argument/)
})

test('hasValidAuthenticodeStatus only accepts a Valid status line', () => {
  assert.equal(hasValidAuthenticodeStatus('SignerCertificate : OpenPet\nStatus : Valid\n'), true)
  assert.equal(hasValidAuthenticodeStatus('Status : NotSigned\n'), false)
  assert.equal(hasValidAuthenticodeStatus('StatusMessage : Valid signature expected\n'), false)
})

test('validateEvidenceBundle accepts a complete unsigned evidence bundle with warning', () => {
  const { evidenceDir } = createEvidenceDir()
  const result = validateEvidenceBundle({ evidenceDir })

  assert.equal(result.ok, true)
  assert.equal(result.summary.files.length, REQUIRED_EVIDENCE_FILES.length)
  assert.equal(result.summary.signed, false)
  assert.match(result.warnings.join('\n'), /cannot prove Windows signature integrity/)

  for (const file of result.summary.files) {
    assert.equal(typeof file.sha256, 'string')
    assert.equal(file.sha256.length, 64)
    assert.equal(file.bytes > 0, true)
  }
})

test('validateEvidenceBundle rejects missing and empty required files', () => {
  const { evidenceDir } = createEvidenceDir()
  fs.rmSync(path.join(evidenceDir, 'process.txt'))
  fs.writeFileSync(path.join(evidenceDir, 'environment.txt'), '   \n')

  const result = validateEvidenceBundle({ evidenceDir })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /missing required evidence file: process\.txt/)
  assert.match(result.errors.join('\n'), /required evidence file is empty: environment\.txt/)
})

test('validateEvidenceBundle checks manual checklist ids and refuses automatic pass commands', () => {
  const manualChecklist = createManualChecklist().replace('`launch`', '`launch-missing`')
  const commandNotes = `${createCommandNotes({ reportFileName: 'windows-smoke-report.json' })}\nnpm run update-windows-smoke-report -- report.json --check launch --status pass`
  const { evidenceDir } = createEvidenceDir({ manualChecklist, commandNotes })

  const result = validateEvidenceBundle({ evidenceDir })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /manual-checks\.md is missing required check id: launch/)
  assert.match(result.errors.join('\n'), /must not include --status pass/)
})

test('validateEvidenceBundle requires valid Authenticode evidence when requested', () => {
  const unsigned = createEvidenceDir({ authenticode: 'Status : NotSigned\n' })
  const unsignedResult = validateEvidenceBundle({ evidenceDir: unsigned.evidenceDir, requireSigned: true })

  assert.equal(unsignedResult.ok, false)
  assert.match(unsignedResult.errors.join('\n'), /Status : Valid/)

  const signed = createEvidenceDir({ authenticode: 'SignerCertificate : OpenPet\nStatus : Valid\n' })
  const signedResult = validateEvidenceBundle({ evidenceDir: signed.evidenceDir, requireSigned: true })

  assert.equal(signedResult.ok, true)
  assert.equal(signedResult.summary.signed, true)
})

test('validateEvidenceBundle can validate a paired pending report without claiming readiness', () => {
  const { tempDir, evidenceDir } = createEvidenceDir()
  const reportPath = path.join(tempDir, 'windows-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createPendingReport(), null, 2))

  const result = validateEvidenceBundle({ evidenceDir, reportPath })

  assert.equal(result.ok, true)
  assert.equal(result.summary.report.passed, 0)
  assert.equal(result.summary.report.smokeReady, false)
})

test('createEvidenceManifest records deterministic file metadata', () => {
  const { evidenceDir } = createEvidenceDir()
  const manifest = createEvidenceManifest({ evidenceDir })

  assert.deepEqual(manifest.map((entry) => entry.file), REQUIRED_EVIDENCE_FILES)
  for (const entry of manifest) {
    assert.equal(entry.bytes > 0, true)
    assert.match(entry.sha256, /^[a-f0-9]{64}$/)
  }
})
