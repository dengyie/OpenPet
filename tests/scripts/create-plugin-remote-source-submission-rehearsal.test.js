const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginRemoteSourceSubmissionRehearsal,
  findPluginDirectory,
  parseArgs
} = require('../../scripts/create-plugin-remote-source-submission-rehearsal')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/weather-status')

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const copyDir = (sourceDir, targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true })
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

const createArchiveFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-remote-source-root-'))
  const archiveRoot = path.join(root, 'OpenPet-main')
  const pluginDir = path.join(archiveRoot, 'examples/plugins/weather-status')
  copyDir(EXAMPLE_PLUGIN_PATH, pluginDir)

  const archivePath = path.join(root, 'openpet-main.zip')
  execFileSync('zip', ['-qr', archivePath, 'OpenPet-main'], { cwd: root })
  return {
    archivePath,
    archiveSha256: sha256(archivePath),
    archiveByteSize: fs.statSync(archivePath).size
  }
}

test('parseArgs accepts remote-source submission rehearsal options', () => {
  const options = parseArgs([
    '--archive-url', 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main',
    '--plugin-path', 'examples/plugins/weather-status',
    '--output-dir', 'docs/release-evidence/session-a',
    '--reviewer', 'OpenPet Maintainer',
    '--decision', 'approved',
    '--notes', 'Remote source reviewed.',
    '--json'
  ])

  assert.equal(options.archiveUrl, 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main')
  assert.equal(options.pluginPath, 'examples/plugins/weather-status')
  assert.equal(options.outputDir, 'docs/release-evidence/session-a')
  assert.equal(options.reviewer, 'OpenPet Maintainer')
  assert.equal(options.decision, 'approved')
  assert.equal(options.notes, 'Remote source reviewed.')
  assert.equal(options.json, true)
})

test('parseArgs rejects missing values and unknown decisions', () => {
  assert.throws(() => parseArgs(['--archive-url']), /--archive-url requires a value/)
  assert.throws(() => parseArgs(['--plugin-path']), /--plugin-path requires a value/)
  assert.throws(() => parseArgs(['--output-dir']), /--output-dir requires a value/)
  assert.throws(() => parseArgs(['--reviewer']), /--reviewer requires a value/)
  assert.throws(() => parseArgs(['--decision']), /--decision requires a value/)
  assert.throws(() => parseArgs(['--notes']), /--notes requires a value/)
  assert.throws(
    () => parseArgs(['--archive-url', 'https://example.test/openpet.zip', '--decision', 'pending']),
    /Unknown approval decision/
  )
})

test('findPluginDirectory rejects plugin paths that escape the extracted archive', () => {
  assert.throws(
    () => findPluginDirectory({
      extractRoot: os.tmpdir(),
      entries: ['OpenPet-main/plugin.json'],
      pluginPath: '../outside'
    }),
    /Plugin path must stay inside/
  )
})

test('createPluginRemoteSourceSubmissionRehearsal records remote-source provenance and approval artifacts', async () => {
  const fixture = createArchiveFixture()
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-remote-source-rehearsal-'))

  const summary = await createPluginRemoteSourceSubmissionRehearsal({
    archiveUrl: 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main',
    pluginPath: 'examples/plugins/weather-status',
    outputDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Remote source archive, manifest, package hash, and submission artifacts reviewed.',
    now: () => new Date('2026-06-18T00:30:00.000Z'),
    downloadArchive: ({ archivePath }) => {
      fs.copyFileSync(fixture.archivePath, archivePath)
      return {
        archivePath,
        finalUrl: 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main',
        archiveSha256: fixture.archiveSha256,
        archiveByteSize: fixture.archiveByteSize
      }
    }
  })

  assert.equal(summary.sourceArchive.kind, 'https-archive')
  assert.equal(summary.sourceArchive.archiveUrl, 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main')
  assert.equal(summary.sourceArchive.finalUrl, 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main')
  assert.equal(summary.sourceArchive.archiveSha256, fixture.archiveSha256)
  assert.equal(summary.sourceArchive.archiveByteSize, fixture.archiveByteSize)
  assert.equal(summary.sourceArchive.pluginPath, 'examples/plugins/weather-status')
  assert.equal(summary.sourceArchive.archivePluginPath, 'OpenPet-main/examples/plugins/weather-status')
  assert.match(summary.sourceArchive.extractedFileHashes['plugin.json'], /^[a-f0-9]{64}$/)
  assert.equal(summary.sourcePlugin.id, 'openpet.example.weather-status')
  assert.equal(summary.submission.bundleValidation.ok, true)
  assert.equal(summary.approval.validation.ok, true)
  assert.equal(fs.existsSync(summary.files.readme), true)
  assert.equal(fs.existsSync(summary.files.checklist), true)
  assert.equal(fs.existsSync(summary.files.commands), true)
  assert.equal(fs.existsSync(summary.files.summary), true)
  assert.equal(fs.existsSync(summary.files.provenance), true)
  assert.equal(fs.existsSync(summary.packagePath), true)
  assert.equal(fs.existsSync(summary.submission.bundleDir), true)
  assert.equal(fs.existsSync(summary.approval.record.files.markdown), true)
  assert.equal(fs.existsSync(summary.approval.record.files.json), true)

  const provenance = JSON.parse(fs.readFileSync(summary.files.provenance, 'utf-8'))
  assert.equal(provenance.kind, 'https-archive')
  assert.equal(provenance.archiveSha256, fixture.archiveSha256)
  assert.equal(provenance.pluginPath, 'examples/plugins/weather-status')
  assert.equal(provenance.archivePluginPath, 'OpenPet-main/examples/plugins/weather-status')
})
