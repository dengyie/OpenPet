const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCommunitySourceIntakeReport
} = require('../../scripts/create-plugin-community-source-intake-report')
const {
  createPluginCommunitySourceEvidenceFromIntake
} = require('../../scripts/create-plugin-community-source-evidence-from-intake')
const {
  createPluginCommunitySourceSubmissionEvidence
} = require('../../scripts/create-plugin-community-source-submission-evidence')
const {
  createPluginCommunitySourceDiscoveryReport
} = require('../../scripts/create-plugin-community-source-discovery-report')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/weather-status')

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
const runScript = (scriptPath, args, env = process.env) => spawnSync(process.execPath, [scriptPath, ...args], {
  encoding: 'utf-8',
  env
})

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-flow-compatible-'))
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

const createInvalidPluginJsonArchiveFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-flow-invalid-plugin-json-'))
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

const createDownloadArchive = (fixture, finalUrl) => ({ archivePath }) => {
  fs.copyFileSync(fixture.archivePath, archivePath)
  return {
    archivePath,
    finalUrl,
    archiveSha256: fixture.archiveSha256,
    archiveByteSize: fixture.archiveByteSize
  }
}

const createFakeCurlBin = ({ archivePath, finalUrl }) => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-fake-curl-bin-'))
  const curlPath = path.join(binDir, 'curl')
  fs.writeFileSync(curlPath, [
    '#!/bin/sh',
    'set -eu',
    'output=""',
    'write_out=""',
    'url=""',
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in',
    '    --output)',
    '      output="$2"',
    '      shift 2',
    '      ;;',
    '    --write-out)',
    '      write_out="$2"',
    '      shift 2',
    '      ;;',
    '    --location|--fail|--silent|--show-error)',
    '      shift 1',
    '      ;;',
    '    *)',
    '      url="$1"',
    '      shift 1',
    '      ;;',
    '  esac',
    'done',
    'cp "$OPENPET_FAKE_CURL_SOURCE_ARCHIVE" "$output"',
    'if [ -n "$write_out" ]; then',
    '  printf "%s" "${OPENPET_FAKE_CURL_FINAL_URL:-$url}"',
    'fi',
    ''
  ].join('\n'))
  fs.chmodSync(curlPath, 0o755)
  return {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      OPENPET_FAKE_CURL_SOURCE_ARCHIVE: archivePath,
      OPENPET_FAKE_CURL_FINAL_URL: finalUrl
    }
  }
}

test('mock compatible community-source flow reaches Phase 99 evidence and discovery-ready status', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-flow-ready-'))
  const fixture = createCompatibleArchiveFixture()
  const archiveUrl = 'https://example.test/community-plugin/archive.zip'
  const communitySourceUrl = 'https://example.test/community/submission/42'
  const intakeOutputDir = path.join(root, 'intake')
  const submissionOutputDir = path.join(root, 'submission')
  const discoveryOutputDir = path.join(root, 'discovery')

  const intake = await createPluginCommunitySourceIntakeReport({
    archiveUrl,
    pluginPath: 'plugin',
    communitySourceUrl,
    submitter: 'Example Community Author',
    notes: 'Synthetic compatible community source inspected end to end.',
    outputDir: intakeOutputDir,
    now: () => new Date('2026-07-06T12:00:00.000Z'),
    downloadArchive: createDownloadArchive(fixture, archiveUrl)
  })

  assert.equal(intake.status, 'ready-for-community-evidence')
  assert.equal(intake.compatibility.reasonCode, 'openpet-plugin-package')
  assert.equal(intake.archive.archiveSha256, fixture.archiveSha256)
  assert.equal(fs.existsSync(path.join(intakeOutputDir, 'README.md')), true)

  const bridge = await createPluginCommunitySourceEvidenceFromIntake({
    intakeSummary: path.join(intakeOutputDir, 'plugin-community-source-intake-report-summary.json'),
    sourceRelation: 'independent-third-party',
    independenceNotes: 'Synthetic source kept outside OpenPet ownership for tooling rehearsal only.',
    outputDir: submissionOutputDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Synthetic compatible flow promoted into Phase 99 evidence.',
    now: () => new Date('2026-07-06T12:05:00.000Z'),
    createSubmissionEvidence: (options) => createPluginCommunitySourceSubmissionEvidence({
      ...options,
      now: () => new Date('2026-07-06T12:05:00.000Z'),
      downloadArchive: createDownloadArchive(fixture, archiveUrl)
    })
  })

  assert.equal(bridge.bridge.intakeStatus, 'ready-for-community-evidence')
  assert.equal(bridge.submission.communityEvidenceReady, true)
  assert.equal(bridge.submission.sourcePlugin.id, 'openpet.example.weather-status')
  assert.equal(fs.existsSync(path.join(submissionOutputDir, 'plugin-community-source-submission-evidence-summary.json')), true)
  assert.equal(fs.existsSync(path.join(submissionOutputDir, 'community-source-evidence.json')), true)

  const discovery = createPluginCommunitySourceDiscoveryReport({
    searchResults: [
      {
        query: 'Synthetic compatible plugin.json community-source search',
        tool: 'mock-fixture',
        resultCount: 1,
        notes: 'Uses the same compatible fixture that passed intake and submission evidence.'
      }
    ],
    candidates: [
      {
        sourceUrl: communitySourceUrl,
        archiveUrl,
        submitter: 'Example Community Author',
        status: intake.status,
        reasonCode: intake.compatibility.reasonCode,
        intakeReport: `${intake.outputDir}/`,
        phase99Evidence: `${bridge.submission.outputDir}/`,
        notes: 'Synthetic compatible candidate completed Phase 100 and Phase 99 tooling flow.'
      }
    ],
    notes: 'Synthetic end-to-end community-source tooling rehearsal.',
    outputDir: discoveryOutputDir,
    now: () => new Date('2026-07-06T12:10:00.000Z')
  })

  assert.equal(discovery.status, 'community-evidence-ready')
  assert.equal(discovery.nextAction, 'review-community-evidence-for-release-claims')
  assert.equal(discovery.candidateCounts['ready-for-community-evidence'], 1)
  assert.equal(fs.existsSync(path.join(discoveryOutputDir, 'plugin-community-source-discovery-summary.json')), true)
  assert.equal(fs.existsSync(path.join(discoveryOutputDir, 'README-community-source-discovery.md')), true)
  assert.equal(fs.existsSync(path.join(discoveryOutputDir, 'README.md')), true)
})

test('mock invalid foreign plugin.json flow degrades to incompatible discovery evidence without crashing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-flow-invalid-'))
  const fixture = createInvalidPluginJsonArchiveFixture()
  const archiveUrl = 'https://example.test/foreign-plugin/archive.zip'
  const communitySourceUrl = 'https://example.test/community/submission/foreign-plugin'
  const intakeOutputDir = path.join(root, 'intake')
  const discoveryOutputDir = path.join(root, 'discovery')

  const intake = await createPluginCommunitySourceIntakeReport({
    archiveUrl,
    pluginPath: '.',
    communitySourceUrl,
    submitter: 'Foreign Plugin Author',
    notes: 'Synthetic invalid plugin.json source inspected end to end.',
    outputDir: intakeOutputDir,
    now: () => new Date('2026-07-06T12:20:00.000Z'),
    downloadArchive: createDownloadArchive(fixture, archiveUrl)
  })

  assert.equal(intake.status, 'incompatible-package-model')
  assert.equal(intake.compatibility.reasonCode, 'plugin-json-invalid')
  assert.equal(intake.plugin, null)
  assert.equal(fs.existsSync(path.join(intakeOutputDir, 'README.md')), true)

  const discovery = createPluginCommunitySourceDiscoveryReport({
    searchResults: [
      {
        query: 'Synthetic invalid plugin.json community-source search',
        tool: 'mock-fixture',
        resultCount: 1,
        notes: 'Candidate archive contains a foreign plugin schema.'
      }
    ],
    candidates: [
      {
        sourceUrl: communitySourceUrl,
        archiveUrl,
        submitter: 'Foreign Plugin Author',
        status: intake.status,
        reasonCode: intake.compatibility.reasonCode,
        intakeReport: `${intake.outputDir}/`,
        notes: 'Foreign plugin.json schema archived as incompatible instead of forcing Phase 99.'
      }
    ],
    notes: 'Synthetic incompatible community-source tooling rehearsal.',
    outputDir: discoveryOutputDir,
    now: () => new Date('2026-07-06T12:25:00.000Z')
  })

  assert.equal(discovery.status, 'compatible-source-not-found')
  assert.equal(discovery.candidateCounts['incompatible-package-model'], 1)
  assert.equal(discovery.nextAction, 'find-or-invite-compatible-plugin-json-package')
  assert.equal(fs.existsSync(path.join(discoveryOutputDir, 'plugin-community-source-discovery-summary.json')), true)
  assert.equal(fs.existsSync(path.join(discoveryOutputDir, 'README.md')), true)
})

test('mock compatible community-source CLI flow reaches Phase 99 evidence and discovery-ready status without real network access', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-cli-flow-ready-'))
  const fixture = createCompatibleArchiveFixture()
  const archiveUrl = 'https://example.test/community-plugin/archive.zip'
  const communitySourceUrl = 'https://example.test/community/submission/cli-42'
  const intakeOutputDir = path.join(root, 'intake')
  const submissionOutputDir = path.join(root, 'submission')
  const discoveryOutputDir = path.join(root, 'discovery')
  const fakeCurl = createFakeCurlBin({ archivePath: fixture.archivePath, finalUrl: archiveUrl })
  const intakeScript = path.resolve(__dirname, '../../scripts/create-plugin-community-source-intake-report.js')
  const bridgeScript = path.resolve(__dirname, '../../scripts/create-plugin-community-source-evidence-from-intake.js')
  const discoveryScript = path.resolve(__dirname, '../../scripts/create-plugin-community-source-discovery-report.js')

  const intake = runScript(intakeScript, [
    '--archive-url', archiveUrl,
    '--plugin-path', 'plugin',
    '--community-source-url', communitySourceUrl,
    '--submitter', 'Example Community Author',
    '--notes', 'Synthetic compatible community source inspected through the shipped CLI path.',
    '--output-dir', intakeOutputDir,
    '--json'
  ], fakeCurl.env)

  assert.equal(intake.status, 0, intake.stderr)
  const intakeSummary = JSON.parse(intake.stdout)
  assert.equal(intakeSummary.status, 'ready-for-community-evidence')
  assert.equal(intakeSummary.compatibility.reasonCode, 'openpet-plugin-package')
  assert.equal(intakeSummary.archive.archiveSha256, fixture.archiveSha256)
  assert.equal(fs.existsSync(path.join(intakeOutputDir, 'plugin-community-source-intake-report-summary.json')), true)
  assert.equal(fs.existsSync(path.join(intakeOutputDir, 'README.md')), true)

  const bridge = runScript(bridgeScript, [
    '--intake-summary', path.join(intakeOutputDir, 'plugin-community-source-intake-report-summary.json'),
    '--source-relation', 'independent-third-party',
    '--independence-notes', 'Synthetic source kept outside OpenPet ownership for CLI rehearsal only.',
    '--output-dir', submissionOutputDir,
    '--reviewer', 'OpenPet Maintainer',
    '--decision', 'approved',
    '--notes', 'Synthetic compatible CLI flow promoted into Phase 99 evidence.',
    '--json'
  ], fakeCurl.env)

  assert.equal(bridge.status, 0, bridge.stderr)
  const bridgeSummary = JSON.parse(bridge.stdout)
  assert.equal(bridgeSummary.bridge.intakeStatus, 'ready-for-community-evidence')
  assert.equal(bridgeSummary.submission.communityEvidenceReady, true)
  assert.equal(bridgeSummary.submission.sourcePlugin.id, 'openpet.example.weather-status')
  assert.equal(fs.existsSync(path.join(submissionOutputDir, 'plugin-community-source-submission-evidence-summary.json')), true)
  assert.equal(fs.existsSync(path.join(submissionOutputDir, 'community-source-evidence.json')), true)

  const discovery = runScript(discoveryScript, [
    '--search-results',
    JSON.stringify([
      {
        query: 'Synthetic compatible plugin.json community-source CLI search',
        tool: 'mock-fixture',
        resultCount: 1,
        notes: 'Uses the same compatible fixture that passed intake and submission evidence.'
      }
    ]),
    '--candidates',
    JSON.stringify([
      {
        sourceUrl: communitySourceUrl,
        archiveUrl,
        submitter: 'Example Community Author',
        status: intakeSummary.status,
        reasonCode: intakeSummary.compatibility.reasonCode,
        intakeReport: `${intakeSummary.outputDir}/`,
        phase99Evidence: `${bridgeSummary.submission.outputDir}/`,
        notes: 'Synthetic compatible candidate completed Phase 100 and Phase 99 through the shipped CLI path.'
      }
    ]),
    '--notes', 'Synthetic CLI end-to-end community-source tooling rehearsal.',
    '--output-dir', discoveryOutputDir,
    '--json'
  ], fakeCurl.env)

  assert.equal(discovery.status, 0, discovery.stderr)
  const discoverySummary = JSON.parse(discovery.stdout)
  assert.equal(discoverySummary.status, 'community-evidence-ready')
  assert.equal(discoverySummary.nextAction, 'review-community-evidence-for-release-claims')
  assert.equal(discoverySummary.candidateCounts['ready-for-community-evidence'], 1)
  assert.equal(fs.existsSync(path.join(discoveryOutputDir, 'plugin-community-source-discovery-summary.json')), true)
  assert.equal(fs.existsSync(path.join(discoveryOutputDir, 'README-community-source-discovery.md')), true)
  assert.equal(fs.existsSync(path.join(discoveryOutputDir, 'README.md')), true)
})
