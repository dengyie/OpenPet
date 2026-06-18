const fs = require('fs')
const path = require('path')

const { sessionIdFromDate } = require('./create-plugin-remote-source-submission-rehearsal')
const { assertSafeRehearsalOutputDir } = require('./create-plugin-author-rehearsal')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-community-source-discovery-report')
const VALID_CANDIDATE_STATUSES = new Set([
  'not-inspected',
  'not-found',
  'incompatible-package-model',
  'ready-for-community-evidence'
])

const usage = () => [
  'Usage: node scripts/create-plugin-community-source-discovery-report.js --search-results <json-array> --candidates <json-array> [options]',
  '',
  'Options:',
  '  --search-results <json-array>        Public search or inspection observations',
  '  --candidates <json-array>            Candidate source observations and intake/evidence status',
  '  --notes <text>                       Maintainer notes about discovery scope and limits',
  '  --output-dir <dir>                   Directory for discovery artifacts',
  '  --json                               Print the machine-readable discovery summary',
  '  --help',
  '',
  'Creates a pre-intake discovery report for community-source search results. The',
  'command records observations only; it does not download, validate, install,',
  'enable, run, sign, publish, or trust candidate plugins.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseJsonArray = (value, label) => {
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(`${label} must be valid JSON`)
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`)
  return parsed
}

function parseArgs (argv) {
  const options = {
    searchResults: [],
    candidates: [],
    notes: 'Community-source discovery observations recorded before compatibility intake.',
    outputDir: '',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--search-results') {
      options.searchResults = parseJsonArray(readValue(argv, index, arg), 'Search results')
      index += 1
    } else if (arg === '--candidates') {
      options.candidates = parseJsonArray(readValue(argv, index, arg), 'Candidates')
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.help) {
    const normalizedCandidates = options.candidates.map(normalizeCandidate)
    const normalizedSearchResults = options.searchResults.map(normalizeSearchResult)
    assertHasDiscoveryEvidence(normalizedSearchResults, normalizedCandidates)
  }
  return options
}

function hasText (value) {
  return typeof value === 'string' && value.trim().length > 0
}

const validateHttpsUrl = (value, label) => {
  if (!hasText(value)) return ''
  let parsed
  try {
    parsed = new URL(value)
  } catch (error) {
    throw new Error(`${label} must be a valid URL`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https:`)
  return parsed.toString()
}

const writeJson = (filePath, value, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const writeText = (filePath, content, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`)
}

const normalizeSearchResult = (result = {}, index = 0) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`Search result ${index + 1} must be an object`)
  }
  if (!hasText(result.query)) throw new Error(`Search result ${index + 1} query is required`)
  if (result.resultCount !== undefined && (!Number.isInteger(result.resultCount) || result.resultCount < 0)) {
    throw new Error(`Search result ${index + 1} resultCount must be a non-negative integer`)
  }
  return {
    query: result.query.trim(),
    tool: hasText(result.tool) ? result.tool.trim() : '',
    resultCount: result.resultCount ?? 0,
    notes: hasText(result.notes) ? result.notes.trim() : ''
  }
}

const normalizeCandidate = (candidate = {}, index = 0) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`Candidate ${index + 1} must be an object`)
  }
  if (!hasText(candidate.sourceUrl)) throw new Error(`Candidate ${index + 1} sourceUrl is required`)
  const status = hasText(candidate.status) ? candidate.status.trim() : 'not-inspected'
  if (!VALID_CANDIDATE_STATUSES.has(status)) throw new Error(`Unknown candidate status: ${status}`)
  return {
    sourceUrl: validateHttpsUrl(candidate.sourceUrl, `Candidate ${index + 1} sourceUrl`),
    archiveUrl: validateHttpsUrl(candidate.archiveUrl || '', `Candidate ${index + 1} archiveUrl`),
    submitter: hasText(candidate.submitter) ? candidate.submitter.trim() : '',
    status,
    reasonCode: hasText(candidate.reasonCode) ? candidate.reasonCode.trim() : '',
    intakeReport: hasText(candidate.intakeReport) ? candidate.intakeReport.trim() : '',
    phase99Evidence: hasText(candidate.phase99Evidence) ? candidate.phase99Evidence.trim() : '',
    notes: hasText(candidate.notes) ? candidate.notes.trim() : ''
  }
}

const assertHasDiscoveryEvidence = (searchResults, candidates) => {
  if (searchResults.length === 0 && candidates.length === 0) {
    throw new Error('Discovery report requires at least one search result or candidate')
  }
}

const countCandidates = (candidates) => {
  const counts = {
    total: candidates.length,
    'not-inspected': 0,
    'ready-for-community-evidence': 0,
    'incompatible-package-model': 0,
    'not-found': 0
  }
  for (const candidate of candidates) {
    counts[candidate.status] = (counts[candidate.status] || 0) + 1
  }
  return counts
}

const discoveryStatus = (candidates) => {
  const readyCandidates = candidates.filter((candidate) => candidate.status === 'ready-for-community-evidence')
  if (readyCandidates.some((candidate) => candidate.phase99Evidence)) {
    return {
      status: 'community-evidence-ready',
      nextAction: 'review-community-evidence-for-release-claims'
    }
  }
  if (readyCandidates.length) {
    return {
      status: 'compatible-source-found',
      nextAction: 'route-ready-intake-through-phase-103'
    }
  }
  return {
    status: 'compatible-source-not-found',
    nextAction: 'find-or-invite-compatible-plugin-json-package'
  }
}

const renderReadme = ({ generatedAt, summary }) => [
  '# OpenPet Plugin Community-Source Discovery Report',
  '',
  `Generated: ${generatedAt}`,
  `Status: ${summary.status}`,
  `Next action: ${summary.nextAction}`,
  '',
  'This discovery report records public-search observations before Phase 100 intake. It does not approve, install, run, sign, publish, or trust any plugin.',
  '',
  '## Boundaries',
  '',
  ...summary.boundaries.map((boundary) => `- ${boundary}`),
  '',
  '## Search Results',
  '',
  ...(summary.searchResults.length
    ? summary.searchResults.flatMap((result) => [
      `- ${result.query || '(unnamed search)'}`,
      `  - Tool: ${result.tool || '(not recorded)'}`,
      `  - Result count: ${result.resultCount}`,
      `  - Notes: ${result.notes || '(none)'}`
    ])
    : ['- No search results recorded.']),
  '',
  '## Candidates',
  '',
  ...(summary.candidates.length
    ? summary.candidates.flatMap((candidate) => [
      `- ${candidate.sourceUrl || '(source url not recorded)'}`,
      `  - Submitter: ${candidate.submitter || '(not recorded)'}`,
      `  - Status: ${candidate.status}`,
      `  - Reason: ${candidate.reasonCode || '(none)'}`,
      `  - Intake report: ${candidate.intakeReport || 'not recorded'}`,
      `  - Phase 99 evidence: ${candidate.phase99Evidence || 'not recorded'}`,
      `  - Notes: ${candidate.notes || '(none)'}`
    ])
    : ['- No candidates recorded.']),
  '',
  '## Candidate Counts',
  '',
  `- Total: ${summary.candidateCounts.total}`,
  `- Ready for community evidence: ${summary.candidateCounts['ready-for-community-evidence']}`,
  `- Incompatible package model: ${summary.candidateCounts['incompatible-package-model']}`,
  `- Not found: ${summary.candidateCounts['not-found']}`,
  `- Not inspected: ${summary.candidateCounts['not-inspected']}`,
  ''
].join('\n')

const createPluginCommunitySourceDiscoveryReport = ({
  searchResults = [],
  candidates = [],
  notes = 'Community-source discovery observations recorded before compatibility intake.',
  outputDir = '',
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  if (!Array.isArray(searchResults)) throw new Error('Search results must be a JSON array')
  if (!Array.isArray(candidates)) throw new Error('Candidates must be a JSON array')

  const normalizedSearchResults = searchResults.map(normalizeSearchResult)
  const normalizedCandidates = candidates.map(normalizeCandidate)
  assertHasDiscoveryEvidence(normalizedSearchResults, normalizedCandidates)
  const generatedAt = now().toISOString()
  const resolvedOutputDir = outputDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt)))
  const absoluteOutputDir = assertSafeRehearsalOutputDir(resolvedOutputDir)
  const files = {
    summary: path.join(absoluteOutputDir, 'plugin-community-source-discovery-summary.json'),
    readme: path.join(absoluteOutputDir, 'README-community-source-discovery.md')
  }
  const status = discoveryStatus(normalizedCandidates)
  const summary = {
    generatedAt,
    outputDir: absoluteOutputDir,
    status: status.status,
    nextAction: status.nextAction,
    searchResults: normalizedSearchResults,
    candidates: normalizedCandidates,
    candidateCounts: countCandidates(normalizedCandidates),
    notes: hasText(notes) ? notes.trim() : '',
    boundaries: [
      'Discovery records search and candidate source observations only.',
      'Discovery does not prove OpenPet plugin compatibility.',
      'Discovery does not prove signing trust, catalog publication, runtime safety, or release readiness.',
      'Only compatible plugin.json package candidates should continue into Phase 100, Phase 103, and Phase 99.'
    ],
    files
  }

  writeText(files.readme, renderReadme({ generatedAt, summary }), fsImpl)
  writeJson(files.summary, summary, fsImpl)

  return summary
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const summary = createPluginCommunitySourceDiscoveryReport(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    console.log(`Plugin community-source discovery report created: ${summary.outputDir}`)
    console.log(`README: ${summary.files.readme}`)
    console.log(`Status: ${summary.status}`)
    console.log(`Next action: ${summary.nextAction}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  VALID_CANDIDATE_STATUSES,
  createPluginCommunitySourceDiscoveryReport,
  parseArgs,
  renderReadme
}
