const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createMacosReleaseEvidenceArchive,
  parseArgs
} = require('../../scripts/create-macos-release-evidence-archive')

const fixedNow = () => new Date('2026-06-18T03:00:00.000Z')

const writeArtifact = ({ dir, signed = false, includeSummaries = true } = {}) => {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'macos-codesign.txt'),
    signed
      ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n'
      : 'code object is not signed at all\n'
  )
  fs.writeFileSync(
    path.join(dir, 'macos-notarization.txt'),
    signed ? 'status: Accepted\nid: notarization-request\n' : 'status: NotSubmitted\n'
  )
  fs.writeFileSync(
    path.join(dir, 'macos-gatekeeper.txt'),
    signed ? 'release/mac-arm64/OpenPet.app: accepted\nsource=Notarized Developer ID\n' : 'rejected\n'
  )
  if (includeSummaries) {
    fs.writeFileSync(path.join(dir, 'macos-release-evidence-summary.md'), '# macOS Evidence\n')
    fs.writeFileSync(path.join(dir, 'macos-release-evidence-summary.json'), '{"ok":true}\n')
  }
}

test('parseArgs accepts artifact provenance and output controls', () => {
  const options = parseArgs([
    '--artifact-dir', 'downloaded-artifact',
    '--archive-dir', 'docs/release-evidence/macos-release-evidence-archive/v1.0.1',
    '--artifact-name', 'openpet-macos-release-evidence-v1.0.1',
    '--release-tag', 'v1.0.1',
    '--workflow-run-url', 'https://github.com/dengyie/OpenPet/actions/runs/1',
    '--output', 'manifest.json',
    '--json'
  ])

  assert.equal(options.artifactDir, 'downloaded-artifact')
  assert.equal(options.archiveDir, 'docs/release-evidence/macos-release-evidence-archive/v1.0.1')
  assert.equal(options.artifactName, 'openpet-macos-release-evidence-v1.0.1')
  assert.equal(options.releaseTag, 'v1.0.1')
  assert.equal(options.workflowRunUrl, 'https://github.com/dengyie/OpenPet/actions/runs/1')
  assert.equal(options.outputPath, 'manifest.json')
  assert.equal(options.json, true)
})

test('parseArgs rejects missing artifact inputs and unexpected flags', () => {
  assert.throws(() => parseArgs([]), /--artifact-dir is required/)
  assert.throws(() => parseArgs(['--artifact-dir']), /--artifact-dir requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('createMacosReleaseEvidenceArchive copies unsigned artifact evidence without readiness claim', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-artifact-archive-'))
  const artifactDir = path.join(tempDir, 'artifact')
  const archiveDir = path.join(tempDir, 'archive')
  writeArtifact({ dir: artifactDir, signed: false })

  const manifest = createMacosReleaseEvidenceArchive({
    artifactDir,
    archiveDir,
    artifactName: 'openpet-macos-release-evidence-v1.0.1-rc.2',
    releaseTag: 'v1.0.1-rc.2',
    workflowRunUrl: 'https://github.com/dengyie/OpenPet/actions/runs/123',
    now: fixedNow
  })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.macosEvidenceReady, false)
  assert.equal(manifest.source.artifactName, 'openpet-macos-release-evidence-v1.0.1-rc.2')
  assert.equal(manifest.source.releaseTag, 'v1.0.1-rc.2')
  assert.equal(manifest.files.length, 5)
  assert.deepEqual(
    manifest.files.filter((file) => file.releaseReady === false).map((file) => file.role),
    ['macosCodesignEvidence', 'macosNotarizationEvidence', 'macosGatekeeperEvidence']
  )
  assert.equal(fs.existsSync(path.join(archiveDir, 'macos-codesign.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'macos-notarization.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'macos-gatekeeper.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'macos-release-evidence-summary.md')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'macos-release-evidence-summary.json')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'macos-release-evidence-artifact-manifest.json')), true)
  assert.match(manifest.warnings.join('\n'), /does not prove official signed release readiness/)
})

test('createMacosReleaseEvidenceArchive marks passing-looking evidence only as evidence-ready', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-artifact-archive-'))
  const artifactDir = path.join(tempDir, 'artifact')
  const archiveDir = path.join(tempDir, 'archive')
  writeArtifact({ dir: artifactDir, signed: true, includeSummaries: false })

  const manifest = createMacosReleaseEvidenceArchive({
    artifactDir,
    archiveDir,
    now: fixedNow
  })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.macosEvidenceReady, true)
  assert.equal(manifest.files.length, 3)
  assert.deepEqual(manifest.files.map((file) => file.status), ['pass', 'pass', 'pass'])
  assert.match(manifest.warnings.join('\n'), /official release readiness still requires release archive/)
})

test('createMacosReleaseEvidenceArchive rejects incomplete artifacts before writing misleading manifests', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-artifact-archive-'))
  const artifactDir = path.join(tempDir, 'artifact')
  const archiveDir = path.join(tempDir, 'archive')
  fs.mkdirSync(artifactDir)
  fs.writeFileSync(path.join(artifactDir, 'macos-codesign.txt'), 'code object is not signed at all\n')
  fs.writeFileSync(path.join(artifactDir, 'macos-notarization.txt'), 'status: NotSubmitted\n')

  assert.throws(
    () => createMacosReleaseEvidenceArchive({ artifactDir, archiveDir, now: fixedNow }),
    /Missing macosGatekeeperEvidence/
  )
  assert.equal(fs.existsSync(path.join(archiveDir, 'macos-release-evidence-artifact-manifest.json')), false)
})

test('createMacosReleaseEvidenceArchive refuses to overwrite existing archived evidence', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-artifact-archive-'))
  const artifactDir = path.join(tempDir, 'artifact')
  const archiveDir = path.join(tempDir, 'archive')
  writeArtifact({ dir: artifactDir, signed: true })
  fs.mkdirSync(archiveDir)
  fs.writeFileSync(path.join(archiveDir, 'macos-codesign.txt'), 'previous evidence\n')

  assert.throws(
    () => createMacosReleaseEvidenceArchive({ artifactDir, archiveDir, now: fixedNow }),
    /already exists in archive/
  )
  assert.equal(fs.readFileSync(path.join(archiveDir, 'macos-codesign.txt'), 'utf-8'), 'previous evidence\n')
})
