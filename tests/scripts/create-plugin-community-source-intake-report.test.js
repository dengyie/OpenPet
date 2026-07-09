const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCommunitySourceIntakeReport,
  parseArgs
} = require('../../scripts/create-plugin-community-source-intake-report')

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

const createCompatibleArchiveFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-intake-compatible-'))
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

const createCompatibleRootArchiveFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-intake-compatible-root-'))
  const archiveRoot = path.join(root, 'community-plugin-root')
  copyDir(EXAMPLE_PLUGIN_PATH, archiveRoot)

  const archivePath = path.join(root, 'community-plugin-root.zip')
  execFileSync('zip', ['-qr', archivePath, 'community-plugin-root'], { cwd: root })
  return {
    archivePath,
    archiveSha256: sha256(archivePath),
    archiveByteSize: fs.statSync(archivePath).size
  }
}

const createIncompatibleArchiveFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-intake-incompatible-'))
  const archiveRoot = path.join(root, 'opencode-pets-main')
  fs.mkdirSync(path.join(archiveRoot, 'src'), { recursive: true })
  fs.writeFileSync(path.join(archiveRoot, 'package.json'), JSON.stringify({
    name: 'opencode-pets',
    version: '0.1.0',
    type: 'module'
  }, null, 2))
  fs.writeFileSync(path.join(archiveRoot, 'README.md'), '# OpenCode Pets\n')

  const archivePath = path.join(root, 'opencode-pets-main.zip')
  execFileSync('zip', ['-qr', archivePath, 'opencode-pets-main'], { cwd: root })
  return {
    archivePath,
    archiveSha256: sha256(archivePath),
    archiveByteSize: fs.statSync(archivePath).size
  }
}

const createInvalidPluginJsonArchiveFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-intake-invalid-plugin-json-'))
  const archiveRoot = path.join(root, 'foreign-plugin-main')
  fs.mkdirSync(archiveRoot, { recursive: true })
  fs.writeFileSync(path.join(archiveRoot, 'plugin.json'), JSON.stringify({
    id: 'foreign.plugin.example',
    name: 'Foreign Plugin Example',
    version: '1.0.0',
    main: 'index.js',
    permissions: {
      commands: ['pet:say']
    }
  }, null, 2))
  fs.writeFileSync(path.join(archiveRoot, 'index.js'), 'module.exports = {}\n')

  const archivePath = path.join(root, 'foreign-plugin-main.zip')
  execFileSync('zip', ['-qr', archivePath, 'foreign-plugin-main'], { cwd: root })
  return {
    archivePath,
    archiveSha256: sha256(archivePath),
    archiveByteSize: fs.statSync(archivePath).size
  }
}

test('parseArgs accepts community-source intake options', () => {
  const options = parseArgs([
    '--archive-url', 'https://example.test/community-plugin/archive.zip',
    '--plugin-path', 'plugin',
    '--community-source-url', 'https://example.test/community/submission/42',
    '--submitter', 'Example Author',
    '--output-dir', 'docs/release-evidence/plugin-community-source-intake-report/session-a',
    '--notes', 'Candidate source inspected.',
    '--json'
  ])

  assert.equal(options.archiveUrl, 'https://example.test/community-plugin/archive.zip')
  assert.equal(options.pluginPath, 'plugin')
  assert.equal(options.communitySourceUrl, 'https://example.test/community/submission/42')
  assert.equal(options.submitter, 'Example Author')
  assert.equal(options.outputDir, 'docs/release-evidence/plugin-community-source-intake-report/session-a')
  assert.equal(options.notes, 'Candidate source inspected.')
  assert.equal(options.json, true)
})

test('parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseArgs(['--archive-url']), /--archive-url requires a value/)
  assert.throws(() => parseArgs(['--plugin-path']), /--plugin-path requires a value/)
  assert.throws(() => parseArgs(['--community-source-url']), /--community-source-url requires a value/)
  assert.throws(() => parseArgs(['--submitter']), /--submitter requires a value/)
  assert.throws(() => parseArgs(['--notes']), /--notes requires a value/)
  assert.throws(() => parseArgs(['--nope']), /Unexpected argument/)
})

test('createPluginCommunitySourceIntakeReport marks compatible OpenPet plugin candidates as ready for community evidence', async () => {
  const fixture = createCompatibleArchiveFixture()
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-intake-report-compatible-'))

  const summary = await createPluginCommunitySourceIntakeReport({
    archiveUrl: 'https://example.test/community-plugin/archive.zip',
    pluginPath: 'plugin',
    communitySourceUrl: 'https://example.test/community/submission/42',
    submitter: 'Example Community Author',
    outputDir,
    notes: 'Candidate source inspected.',
    now: () => new Date('2026-06-18T22:00:00.000Z'),
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

  assert.equal(summary.status, 'ready-for-community-evidence')
  assert.equal(summary.compatibility.ok, true)
  assert.equal(summary.compatibility.reasonCode, 'openpet-plugin-package')
  assert.equal(summary.plugin.id, 'openpet.example.weather-status')
  assert.equal(summary.plugin.version, '1.0.0')
  assert.equal(summary.archive.archiveSha256, fixture.archiveSha256)
  assert.equal(summary.archive.archivePluginPath, 'community-plugin-main/plugin')
  assert.equal(path.isAbsolute(summary.outputDir), false)
  assert.equal(path.isAbsolute(summary.files.readme), false)
  assert.equal(fs.existsSync(path.join(outputDir, 'README-community-intake.md')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'README.md')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'plugin-community-source-intake-report-summary.json')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'community-source-intake.json')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'community-intake-commands.json')), true)

  const directoryReadme = fs.readFileSync(path.join(outputDir, 'README.md'), 'utf-8')
  assert.match(directoryReadme, /README-community-intake\.md/)
  assert.match(directoryReadme, /ready-for-community-evidence/)
  assert.match(directoryReadme, /does not install, enable, run, sign, publish, or trust/i)

  const commands = JSON.parse(fs.readFileSync(path.join(outputDir, 'community-intake-commands.json'), 'utf-8')).commands
  assert.ok(commands.some((command) => command.includes('create-plugin-community-source-intake-report')))
  assert.ok(commands.some((command) => command.includes('create-plugin-community-source-submission-evidence')))
  assert.ok(commands.some((command) => command.includes('docs/release-evidence/plugin-community-source-submission-evidence/<session>')))
})

test('createPluginCommunitySourceIntakeReport resolves archive root plugin paths inside top-level zip directories', async () => {
  const fixture = createCompatibleRootArchiveFixture()
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-intake-report-compatible-root-'))

  const summary = await createPluginCommunitySourceIntakeReport({
    archiveUrl: 'https://example.test/community-plugin-root/archive.zip',
    pluginPath: '.',
    communitySourceUrl: 'https://example.test/community/submission/root',
    submitter: 'Example Root Author',
    outputDir,
    notes: 'Candidate root source inspected.',
    now: () => new Date('2026-06-18T22:05:00.000Z'),
    downloadArchive: ({ archivePath }) => {
      fs.copyFileSync(fixture.archivePath, archivePath)
      return {
        archivePath,
        finalUrl: 'https://example.test/community-plugin-root/archive.zip',
        archiveSha256: fixture.archiveSha256,
        archiveByteSize: fixture.archiveByteSize
      }
    }
  })

  assert.equal(summary.status, 'ready-for-community-evidence')
  assert.equal(summary.compatibility.ok, true)
  assert.equal(summary.compatibility.reasonCode, 'openpet-plugin-package')
  assert.equal(summary.archive.archivePluginPath, 'community-plugin-root')
  assert.equal(summary.plugin.id, 'openpet.example.weather-status')
})

test('createPluginCommunitySourceIntakeReport records incompatible package models without overstating ecosystem support', async () => {
  const fixture = createIncompatibleArchiveFixture()
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-intake-report-incompatible-'))

  const summary = await createPluginCommunitySourceIntakeReport({
    archiveUrl: 'https://example.test/opencode-pets/archive.zip',
    pluginPath: '.',
    communitySourceUrl: 'https://example.test/community/submission/99',
    submitter: 'OpenCode Pets Author',
    outputDir,
    notes: 'Candidate source inspected.',
    now: () => new Date('2026-06-18T22:15:00.000Z'),
    downloadArchive: ({ archivePath }) => {
      fs.copyFileSync(fixture.archivePath, archivePath)
      return {
        archivePath,
        finalUrl: 'https://example.test/opencode-pets/archive.zip',
        archiveSha256: fixture.archiveSha256,
        archiveByteSize: fixture.archiveByteSize
      }
    }
  })

  assert.equal(summary.status, 'incompatible-package-model')
  assert.equal(summary.compatibility.ok, false)
  assert.equal(summary.compatibility.reasonCode, 'plugin-json-missing')
  assert.match(summary.compatibility.summary, /plugin\.json/i)
  assert.equal(summary.plugin, null)

  const readme = fs.readFileSync(path.join(outputDir, 'README-community-intake.md'), 'utf-8')
  assert.match(readme, /does not prove community plugin compatibility/i)
  assert.match(readme, /requires a package rooted by plugin\.json/i)
  const directoryReadme = fs.readFileSync(path.join(outputDir, 'README.md'), 'utf-8')
  assert.match(directoryReadme, /README-community-intake\.md/)
  assert.match(directoryReadme, /incompatible-package-model/)
})

test('createPluginCommunitySourceIntakeReport records invalid foreign plugin.json schemas without throwing', async () => {
  const fixture = createInvalidPluginJsonArchiveFixture()
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-intake-report-invalid-plugin-json-'))

  const summary = await createPluginCommunitySourceIntakeReport({
    archiveUrl: 'https://example.test/foreign-plugin/archive.zip',
    pluginPath: '.',
    communitySourceUrl: 'https://example.test/community/submission/foreign-plugin',
    submitter: 'Foreign Plugin Author',
    outputDir,
    notes: 'Candidate source inspected.',
    now: () => new Date('2026-07-06T11:00:00.000Z'),
    downloadArchive: ({ archivePath }) => {
      fs.copyFileSync(fixture.archivePath, archivePath)
      return {
        archivePath,
        finalUrl: 'https://example.test/foreign-plugin/archive.zip',
        archiveSha256: fixture.archiveSha256,
        archiveByteSize: fixture.archiveByteSize
      }
    }
  })

  assert.equal(summary.status, 'incompatible-package-model')
  assert.equal(summary.compatibility.ok, false)
  assert.equal(summary.compatibility.reasonCode, 'plugin-json-invalid')
  assert.match(summary.compatibility.summary, /permissions must be an array/i)
  assert.equal(summary.plugin, null)

  const readme = fs.readFileSync(path.join(outputDir, 'README-community-intake.md'), 'utf-8')
  assert.match(readme, /structurally incompatible/i)
  assert.match(readme, /permissions must be an array/i)
  const directoryReadme = fs.readFileSync(path.join(outputDir, 'README.md'), 'utf-8')
  assert.match(directoryReadme, /README-community-intake\.md/)
  assert.match(directoryReadme, /plugin-json-invalid/)
})
