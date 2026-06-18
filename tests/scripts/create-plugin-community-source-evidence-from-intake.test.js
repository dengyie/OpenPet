const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCommunitySourceEvidenceFromIntake,
  parseArgs
} = require('../../scripts/create-plugin-community-source-evidence-from-intake')

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const createReadyIntakeSummary = ({
  rootDir,
  archiveUrl = 'https://example.test/community-plugin/archive.zip'
} = {}) => {
  const outputDir = path.join(rootDir, 'intake')
  const summary = {
    generatedAt: '2026-06-18T23:40:00.000Z',
    outputDir,
    communitySource: {
      kind: 'community-source',
      url: 'https://example.test/community/submission/42',
      submitter: 'Example Community Author'
    },
    archive: {
      kind: 'https-archive',
      archiveUrl,
      finalUrl: archiveUrl,
      archiveSha256: 'a'.repeat(64),
      archiveByteSize: 1234,
      pluginPath: 'plugin',
      archivePluginPath: 'community-plugin-main/plugin',
      extractedFileHashes: {
        'plugin.json': 'b'.repeat(64)
      }
    },
    plugin: {
      id: 'openpet.example.weather-status',
      name: 'Weather Status',
      version: '1.0.0',
      permissions: [],
      networkAllowlist: []
    },
    compatibility: {
      ok: true,
      reasonCode: 'openpet-plugin-package',
      summary: 'Candidate archive contains a valid OpenPet plugin package rooted by plugin.json.'
    },
    status: 'ready-for-community-evidence',
    notes: 'Candidate source inspected.',
    files: {}
  }
  const summaryPath = path.join(outputDir, 'plugin-community-source-intake-report-summary.json')
  writeJson(summaryPath, summary)
  return { summary, summaryPath }
}

const createIncompatibleIntakeSummary = ({ rootDir } = {}) => {
  const { summary, summaryPath } = createReadyIntakeSummary({ rootDir })
  summary.status = 'incompatible-package-model'
  summary.compatibility = {
    ok: false,
    reasonCode: 'plugin-json-missing',
    summary: 'Candidate archive is incompatible with the current OpenPet plugin model because it requires a package rooted by plugin.json.'
  }
  summary.plugin = null
  writeJson(summaryPath, summary)
  return { summary, summaryPath }
}

test('parseArgs accepts intake bridge options', () => {
  const options = parseArgs([
    '--intake-summary', 'docs/release-evidence/plugin-community-source-intake-report/session/plugin-community-source-intake-report-summary.json',
    '--source-relation', 'independent-third-party',
    '--independence-notes', 'Repository is maintained outside OpenPet.',
    '--output-dir', 'docs/release-evidence/plugin-community-source-submission-evidence/session',
    '--reviewer', 'OpenPet Maintainer',
    '--decision', 'approved',
    '--notes', 'Community source reviewed.',
    '--json'
  ])

  assert.equal(options.intakeSummary, 'docs/release-evidence/plugin-community-source-intake-report/session/plugin-community-source-intake-report-summary.json')
  assert.equal(options.sourceRelation, 'independent-third-party')
  assert.equal(options.independenceNotes, 'Repository is maintained outside OpenPet.')
  assert.equal(options.outputDir, 'docs/release-evidence/plugin-community-source-submission-evidence/session')
  assert.equal(options.reviewer, 'OpenPet Maintainer')
  assert.equal(options.decision, 'approved')
  assert.equal(options.notes, 'Community source reviewed.')
  assert.equal(options.json, true)
})

test('parseArgs rejects missing values and unknown source relations', () => {
  assert.throws(() => parseArgs(['--intake-summary']), /--intake-summary requires a value/)
  assert.throws(() => parseArgs(['--source-relation']), /--source-relation requires a value/)
  assert.throws(() => parseArgs(['--source-relation', 'same-repo']), /Unknown source relation/)
  assert.throws(() => parseArgs(['--nope']), /Unexpected argument/)
})

test('createPluginCommunitySourceEvidenceFromIntake routes ready intake into submission evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-intake-bridge-ready-'))
  const { summary: intake, summaryPath } = createReadyIntakeSummary({ rootDir: root })
  const outputDir = path.join(root, 'submission')
  const calls = []

  const result = await createPluginCommunitySourceEvidenceFromIntake({
    intakeSummary: summaryPath,
    sourceRelation: 'independent-third-party',
    independenceNotes: 'Repository is maintained outside OpenPet.',
    outputDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Community source reviewed.',
    createSubmissionEvidence: async (options) => {
      calls.push(options)
      return {
        outputDir,
        communityEvidenceReady: true,
        files: {
          summary: path.join(outputDir, 'plugin-community-source-submission-evidence-summary.json')
        }
      }
    },
    now: () => new Date('2026-06-18T23:50:00.000Z')
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].archiveUrl, intake.archive.archiveUrl)
  assert.equal(calls[0].pluginPath, intake.archive.pluginPath)
  assert.equal(calls[0].communitySourceUrl, intake.communitySource.url)
  assert.equal(calls[0].submitter, intake.communitySource.submitter)
  assert.equal(calls[0].sourceRelation, 'independent-third-party')
  assert.equal(calls[0].independenceNotes, 'Repository is maintained outside OpenPet.')
  assert.equal(result.generatedAt, '2026-06-18T23:50:00.000Z')
  assert.equal(result.bridge.intakeSummary, path.resolve(summaryPath))
  assert.equal(result.bridge.intakeStatus, 'ready-for-community-evidence')
  assert.equal(result.bridge.intakeReasonCode, 'openpet-plugin-package')
  assert.equal(result.submission.communityEvidenceReady, true)
})

test('createPluginCommunitySourceEvidenceFromIntake rejects incompatible intake summaries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-intake-bridge-incompatible-'))
  const { summaryPath } = createIncompatibleIntakeSummary({ rootDir: root })

  await assert.rejects(
    () => createPluginCommunitySourceEvidenceFromIntake({
      intakeSummary: summaryPath,
      sourceRelation: 'independent-third-party',
      independenceNotes: 'Repository is maintained outside OpenPet.'
    }),
    /Intake summary is not ready for community evidence/
  )
})

test('createPluginCommunitySourceEvidenceFromIntake rejects ready status without compatible metadata', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-intake-bridge-stale-'))
  const { summary, summaryPath } = createReadyIntakeSummary({ rootDir: root })
  summary.compatibility.ok = false
  writeJson(summaryPath, summary)

  await assert.rejects(
    () => createPluginCommunitySourceEvidenceFromIntake({
      intakeSummary: summaryPath,
      sourceRelation: 'independent-third-party',
      independenceNotes: 'Repository is maintained outside OpenPet.'
    }),
    /Intake summary compatibility metadata is inconsistent/
  )
})

test('createPluginCommunitySourceEvidenceFromIntake requires independence notes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-intake-bridge-notes-'))
  const { summaryPath } = createReadyIntakeSummary({ rootDir: root })

  await assert.rejects(
    () => createPluginCommunitySourceEvidenceFromIntake({
      intakeSummary: summaryPath,
      sourceRelation: 'independent-third-party'
    }),
    /Independence notes are required/
  )
})
