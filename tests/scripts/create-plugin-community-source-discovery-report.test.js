const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCommunitySourceDiscoveryReport,
  parseArgs
} = require('../../scripts/create-plugin-community-source-discovery-report')

const searchResults = [
  {
    query: 'GitHub repository search: openpet desktop plugin',
    tool: 'gh/api search repos',
    resultCount: 3,
    notes: 'Returned adjacent public sources.'
  }
]

test('parseArgs accepts community-source discovery options', () => {
  const options = parseArgs([
    '--search-results', JSON.stringify(searchResults),
    '--candidates', JSON.stringify([
      {
        sourceUrl: 'https://example.test/community/plugin',
        archiveUrl: 'https://example.test/community/plugin/archive.zip',
        submitter: 'Example Author',
        status: 'ready-for-community-evidence',
        reasonCode: 'openpet-plugin-package',
        phase99Evidence: 'docs/release-evidence/plugin-community-source-submission-evidence/session',
        notes: 'Candidate has already passed evidence flow.'
      }
    ]),
    '--notes', 'Public search reviewed.',
    '--output-dir', 'docs/release-evidence/plugin-community-source-discovery-report/session-a',
    '--json'
  ])

  assert.deepEqual(options.searchResults, searchResults)
  assert.equal(options.candidates.length, 1)
  assert.equal(options.candidates[0].sourceUrl, 'https://example.test/community/plugin')
  assert.equal(options.notes, 'Public search reviewed.')
  assert.equal(options.outputDir, 'docs/release-evidence/plugin-community-source-discovery-report/session-a')
  assert.equal(options.json, true)
})

test('parseArgs rejects malformed arrays and unknown candidate statuses', () => {
  assert.throws(() => parseArgs(['--search-results']), /--search-results requires a value/)
  assert.throws(() => parseArgs(['--search-results', '{}']), /Search results must be a JSON array/)
  assert.throws(() => parseArgs([]), /requires at least one search result or candidate/)
  assert.throws(
    () => parseArgs(['--search-results', JSON.stringify([{ query: 'bad', resultCount: -1 }])]),
    /resultCount must be a non-negative integer/
  )
  assert.throws(
    () => parseArgs(['--candidates', JSON.stringify([{ sourceUrl: 'https://example.test/plugin', status: 'trusted' }])]),
    /Unknown candidate status/
  )
  assert.throws(
    () => parseArgs(['--candidates', JSON.stringify([{ sourceUrl: 'http://example.test/plugin' }])]),
    /sourceUrl must use https:/
  )
  assert.throws(() => parseArgs(['--nope']), /Unexpected argument/)
})

test('createPluginCommunitySourceDiscoveryReport writes compatible-source-not-found artifacts', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-discovery-'))
  const summary = createPluginCommunitySourceDiscoveryReport({
    searchResults,
    candidates: [
      {
        sourceUrl: 'https://github.com/alvinunreal/openpets',
        archiveUrl: 'https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main',
        submitter: 'alvinunreal/openpets',
        status: 'incompatible-package-model',
        reasonCode: 'plugin-json-missing',
        intakeReport: 'docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/',
        notes: 'Adjacent ecosystem source uses openpets.plugin.json.'
      },
      {
        sourceUrl: 'https://github.com/Yarrow-Cai/hookcats',
        archiveUrl: 'https://codeload.github.com/Yarrow-Cai/hookcats/zip/refs/heads/main',
        submitter: 'Yarrow-Cai/hookcats',
        status: 'not-found',
        reasonCode: 'plugin-json-not-discovered',
        notes: 'No candidate plugin.json package path discovered.'
      }
    ],
    notes: 'No compatible external OpenPet plugin.json package discovered.',
    outputDir,
    now: () => new Date('2026-06-18T23:55:00.000Z')
  })

  assert.equal(summary.generatedAt, '2026-06-18T23:55:00.000Z')
  assert.equal(summary.status, 'compatible-source-not-found')
  assert.equal(summary.nextAction, 'find-or-invite-compatible-plugin-json-package')
  assert.equal(summary.candidateCounts.total, 2)
  assert.equal(summary.candidateCounts['incompatible-package-model'], 1)
  assert.equal(summary.candidateCounts['not-found'], 1)
  assert.equal(fs.existsSync(summary.files.summary), true)
  assert.equal(fs.existsSync(summary.files.readme), true)

  const readme = fs.readFileSync(summary.files.readme, 'utf-8')
  assert.match(readme, /does not approve, install, run, sign, publish, or trust/i)
  assert.match(readme, /compatible-source-not-found/)
  assert.match(readme, /alvinunreal\/openpets/)
})

test('createPluginCommunitySourceDiscoveryReport marks ready candidate without Phase 99 evidence as found', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-discovery-ready-'))
  const summary = createPluginCommunitySourceDiscoveryReport({
    searchResults,
    candidates: [
      {
        sourceUrl: 'https://example.test/community/plugin',
        archiveUrl: 'https://example.test/community/plugin/archive.zip',
        submitter: 'Example Author',
        status: 'ready-for-community-evidence',
        reasonCode: 'openpet-plugin-package',
        notes: 'Compatible intake found; Phase 99 still pending.'
      }
    ],
    outputDir,
    now: () => new Date('2026-06-18T23:56:00.000Z')
  })

  assert.equal(summary.status, 'compatible-source-found')
  assert.equal(summary.nextAction, 'route-ready-intake-through-phase-103')
})

test('createPluginCommunitySourceDiscoveryReport marks ready candidate with Phase 99 evidence as complete', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-discovery-evidence-'))
  const summary = createPluginCommunitySourceDiscoveryReport({
    searchResults,
    candidates: [
      {
        sourceUrl: 'https://example.test/community/plugin',
        archiveUrl: 'https://example.test/community/plugin/archive.zip',
        submitter: 'Example Author',
        status: 'ready-for-community-evidence',
        reasonCode: 'openpet-plugin-package',
        phase99Evidence: 'docs/release-evidence/plugin-community-source-submission-evidence/session',
        notes: 'Compatible source evidence archived.'
      }
    ],
    outputDir,
    now: () => new Date('2026-06-18T23:57:00.000Z')
  })

  assert.equal(summary.status, 'community-evidence-ready')
  assert.equal(summary.nextAction, 'review-community-evidence-for-release-claims')
})
