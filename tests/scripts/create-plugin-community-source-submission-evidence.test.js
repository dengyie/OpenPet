const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCommunitySourceSubmissionEvidence,
  parseArgs
} = require('../../scripts/create-plugin-community-source-submission-evidence')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/weather-status')

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const copyDir = (sourceDir, targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true })
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) copyDir(sourcePath, targetPath)
    else fs.copyFileSync(sourcePath, targetPath)
  }
}

const createArchiveFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-source-root-'))
  const archiveRoot = path.join(root, 'community-plugin-main')
  const pluginDir = path.join(archiveRoot, 'plugin')
  copyDir(EXAMPLE_PLUGIN_PATH, pluginDir)

  const archivePath = path.join(root, 'community-plugin-main.zip')
  execFileSync('zip', ['-qr', archivePath, 'community-plugin-main'], { cwd: root })
  return {
    archivePath,
    archiveSha256: sha256(archivePath),
    archiveByteSize: fs.statSync(archivePath).size
  }
}

test('parseArgs accepts community-source submission evidence options', () => {
  const options = parseArgs([
    '--archive-url', 'https://example.test/community-plugin/archive.zip',
    '--plugin-path', 'plugin',
    '--community-source-url', 'https://example.test/community/submission/42',
    '--submitter', 'Example Community Author',
    '--source-relation', 'independent-third-party',
    '--independence-notes', 'Repository is maintained outside OpenPet.',
    '--output-dir', 'docs/release-evidence/plugin-community-source-submission-evidence/session-a',
    '--reviewer', 'OpenPet Maintainer',
    '--decision', 'approved',
    '--notes', 'Community source reviewed.',
    '--json'
  ])

  assert.equal(options.archiveUrl, 'https://example.test/community-plugin/archive.zip')
  assert.equal(options.pluginPath, 'plugin')
  assert.equal(options.communitySourceUrl, 'https://example.test/community/submission/42')
  assert.equal(options.submitter, 'Example Community Author')
  assert.equal(options.sourceLabel, 'community')
  assert.equal(options.sourceRelation, 'independent-third-party')
  assert.equal(options.independenceNotes, 'Repository is maintained outside OpenPet.')
  assert.equal(options.outputDir, 'docs/release-evidence/plugin-community-source-submission-evidence/session-a')
  assert.equal(options.reviewer, 'OpenPet Maintainer')
  assert.equal(options.decision, 'approved')
  assert.equal(options.notes, 'Community source reviewed.')
  assert.equal(options.json, true)
})

test('parseArgs rejects invalid community-source evidence metadata', () => {
  assert.throws(() => parseArgs(['--community-source-url']), /--community-source-url requires a value/)
  assert.throws(() => parseArgs(['--submitter']), /--submitter requires a value/)
  assert.throws(() => parseArgs(['--source-relation']), /--source-relation requires a value/)
  assert.throws(
    () => parseArgs(['--source-label', 'local']),
    /requires source label: community/
  )
  assert.throws(
    () => parseArgs(['--source-relation', 'same-repository']),
    /Unknown source relation/
  )
  assert.throws(
    () => parseArgs(['--decision', 'pending']),
    /Unknown approval decision/
  )
})

test('createPluginCommunitySourceSubmissionEvidence records provenance without claiming runtime trust', async () => {
  const fixture = createArchiveFixture()
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-source-evidence-'))

  const summary = await createPluginCommunitySourceSubmissionEvidence({
    archiveUrl: 'https://example.test/community-plugin/archive.zip',
    pluginPath: 'plugin',
    communitySourceUrl: 'https://example.test/community/submission/42',
    submitter: 'Example Community Author',
    sourceRelation: 'independent-third-party',
    independenceNotes: 'Repository is maintained outside OpenPet and reviewed as a community source.',
    outputDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Community source archive, provenance, package hash, and submission artifacts reviewed.',
    now: () => new Date('2026-06-18T18:30:00.000Z'),
    downloadArchive: ({ archivePath }) => {
      fs.copyFileSync(fixture.archivePath, archivePath)
      return {
        archivePath,
        finalUrl: 'https://example.test/community-plugin/archive.zip',
        archiveSha256: fixture.archiveSha256,
        archiveByteSize: fixture.archiveByteSize
      }
    }
  })

  assert.equal(summary.communitySource.kind, 'community-source')
  assert.equal(summary.communitySource.url, 'https://example.test/community/submission/42')
  assert.equal(summary.communitySource.sourceLabel, 'community')
  assert.equal(summary.communitySource.sourceRelation, 'independent-third-party')
  assert.equal(summary.communitySource.submitter, 'Example Community Author')
  assert.equal(summary.communityEvidenceReady, true)
  assert.equal(summary.sourceArchive.archiveSha256, fixture.archiveSha256)
  assert.equal(summary.sourceArchive.archivePluginPath, 'community-plugin-main/plugin')
  assert.match(summary.sourceArchive.extractedFileHashes['plugin.json'], /^[a-f0-9]{64}$/)
  assert.equal(summary.sourcePlugin.id, 'openpet.example.weather-status')
  assert.equal(summary.submission.bundleValidation.ok, true)
  assert.equal(summary.approval.validation.ok, true)
  assert.equal(summary.approval.record.decision, 'approved')
  assert.deepEqual(summary.boundaries, [
    'Community-source evidence records provenance and review traceability only.',
    'Maintainer approval does not prove signing trust, catalog publication, runtime safety, or release readiness.',
    'Runtime smoke, cleanup readiness, signing, and catalog publication evidence must be collected separately.'
  ])

  assert.equal(fs.existsSync(summary.files.readme), true)
  assert.equal(fs.existsSync(summary.files.checklist), true)
  assert.equal(fs.existsSync(summary.files.commands), true)
  assert.equal(fs.existsSync(summary.files.communityEvidence), true)
  assert.equal(fs.existsSync(summary.files.summary), true)
  assert.equal(fs.existsSync(summary.remoteSourceRehearsal.summary), true)
  assert.equal(fs.existsSync(summary.remoteSourceRehearsal.provenance), true)
  assert.equal(fs.existsSync(summary.packagePath), true)
  assert.equal(fs.existsSync(summary.submission.bundleDir), true)

  const evidence = JSON.parse(fs.readFileSync(summary.files.communityEvidence, 'utf-8'))
  assert.equal(evidence.communitySource.url, 'https://example.test/community/submission/42')
  assert.equal(evidence.communityEvidenceReady, true)
  assert.equal(evidence.sourceArchive.archiveSha256, fixture.archiveSha256)
  assert.equal(evidence.approval.approvalReady, true)

  const readme = fs.readFileSync(summary.files.readme, 'utf-8')
  assert.match(readme, /does not prove signing trust, catalog publication, runtime safety, or release readiness/)
})

test('createPluginCommunitySourceSubmissionEvidence keeps unknown relation from readiness', async () => {
  const fixture = createArchiveFixture()
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-source-evidence-unknown-'))

  const summary = await createPluginCommunitySourceSubmissionEvidence({
    archiveUrl: 'https://example.test/community-plugin/archive.zip',
    pluginPath: 'plugin',
    communitySourceUrl: 'https://example.test/community/submission/42',
    submitter: 'Example Community Author',
    sourceRelation: 'unknown',
    independenceNotes: 'Source independence has not been established.',
    outputDir,
    now: () => new Date('2026-06-18T18:45:00.000Z'),
    downloadArchive: ({ archivePath }) => {
      fs.copyFileSync(fixture.archivePath, archivePath)
      return {
        archivePath,
        finalUrl: 'https://example.test/community-plugin/archive.zip',
        archiveSha256: fixture.archiveSha256,
        archiveByteSize: fixture.archiveByteSize
      }
    }
  })

  assert.equal(summary.communityEvidenceReady, false)
  const checklist = fs.readFileSync(summary.files.checklist, 'utf-8')
  assert.match(checklist, /Community source URL recorded/)
  assert.match(checklist, /Runtime smoke evidence is collected separately/)
})

test('createPluginCommunitySourceSubmissionEvidence requires https community source URLs and notes', async () => {
  await assert.rejects(
    () => createPluginCommunitySourceSubmissionEvidence({
      archiveUrl: 'https://example.test/community-plugin/archive.zip',
      pluginPath: 'plugin',
      communitySourceUrl: 'http://example.test/community/submission/42',
      submitter: 'Example Community Author',
      independenceNotes: 'Repository is maintained outside OpenPet.'
    }),
    /Community source URL must use https/
  )

  await assert.rejects(
    () => createPluginCommunitySourceSubmissionEvidence({
      archiveUrl: 'https://example.test/community-plugin/archive.zip',
      pluginPath: 'plugin',
      communitySourceUrl: 'https://example.test/community/submission/42',
      submitter: 'Example Community Author'
    }),
    /Independence notes are required/
  )
})
