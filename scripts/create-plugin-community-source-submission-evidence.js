const fs = require('fs')
const path = require('path')

const {
  createPluginRemoteSourceSubmissionRehearsal,
  sessionIdFromDate
} = require('./create-plugin-remote-source-submission-rehearsal')
const { VALID_DECISIONS } = require('./create-plugin-maintainer-approval')
const { assertSafeRehearsalOutputDir } = require('./create-plugin-author-rehearsal')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-community-source-submission-evidence')
const VALID_SOURCE_LABELS = new Set(['community'])
const VALID_SOURCE_RELATIONS = new Set(['independent-third-party', 'external-community', 'unknown'])

const usage = () => [
  'Usage: node scripts/create-plugin-community-source-submission-evidence.js --archive-url <https-url> --plugin-path <path> --community-source-url <https-url> --submitter <name> [options]',
  '',
  'Options:',
  '  --archive-url <https-url>            HTTPS zip archive URL to rehearse',
  '  --plugin-path <path>                 Plugin directory inside the extracted archive',
  '  --community-source-url <https-url>   Public source, PR, issue, or submission URL being reviewed',
  '  --submitter <name>                   Community submitter or source owner label',
  '  --source-relation <relation>         independent-third-party, external-community, or unknown',
  '  --independence-notes <text>          Maintainer notes about source independence and provenance limits',
  '  --output-dir <dir>                   Directory for evidence artifacts',
  '  --reviewer <name>                    Maintainer or reviewer name',
  '  --decision <approved|changes-requested>',
  '  --notes <text>                       Review notes recorded by the maintainer',
  '  --json                               Print the machine-readable evidence summary',
  '  --help',
  '',
  'Creates a community-source evidence wrapper around the remote-source plugin',
  'submission rehearsal. The command records provenance and review metadata, but',
  'does not install, enable, run, sign, publish, or trust the plugin.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    archiveUrl: '',
    pluginPath: '',
    communitySourceUrl: '',
    submitter: '',
    sourceLabel: 'community',
    sourceRelation: 'unknown',
    independenceNotes: '',
    outputDir: '',
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Community source archive, provenance, package hash, and submission artifacts reviewed.',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--archive-url') {
      options.archiveUrl = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--plugin-path') {
      options.pluginPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--community-source-url') {
      options.communitySourceUrl = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--submitter') {
      options.submitter = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--source-label') {
      options.sourceLabel = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--source-relation') {
      options.sourceRelation = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--independence-notes') {
      options.independenceNotes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--reviewer') {
      options.reviewer = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--decision') {
      options.decision = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.decision && !VALID_DECISIONS.has(options.decision)) {
    throw new Error(`Unknown approval decision: ${options.decision}`)
  }
  if (options.sourceLabel && !VALID_SOURCE_LABELS.has(options.sourceLabel)) {
    throw new Error('Community source evidence requires source label: community')
  }
  if (options.sourceRelation && !VALID_SOURCE_RELATIONS.has(options.sourceRelation)) {
    throw new Error(`Unknown source relation: ${options.sourceRelation}`)
  }

  return options
}

const validateHttpsUrl = (url, label) => {
  let parsed
  try {
    parsed = new URL(url)
  } catch (error) {
    throw new Error(`${label} must be a valid URL`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https:`)
  return parsed.toString()
}

const hasText = (value) => typeof value === 'string' && value.trim().length > 0

const writeJson = (filePath, value, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const writeText = (filePath, content, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`)
}

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`

const commandList = ({
  archiveUrl,
  pluginPath,
  communitySourceUrl,
  submitter,
  sourceRelation,
  independenceNotes,
  outputDir,
  reviewer,
  decision,
  notes
}) => [
  [
    'npm run create-plugin-community-source-submission-evidence --',
    '--archive-url', shellQuote(archiveUrl),
    '--plugin-path', shellQuote(pluginPath),
    '--community-source-url', shellQuote(communitySourceUrl),
    '--submitter', shellQuote(submitter),
    '--source-relation', shellQuote(sourceRelation),
    '--independence-notes', shellQuote(independenceNotes),
    '--output-dir', shellQuote(outputDir),
    '--reviewer', shellQuote(reviewer),
    '--decision', decision,
    '--notes', shellQuote(notes)
  ].join(' ')
]

const sourceRelationLabel = (sourceRelation) => {
  if (sourceRelation === 'independent-third-party') return 'independent third-party'
  if (sourceRelation === 'external-community') return 'external community'
  return 'unknown'
}

const renderReadme = ({ generatedAt, summary, commands }) => [
  '# OpenPet Plugin Community-Source Submission Evidence',
  '',
  `Generated: ${generatedAt}`,
  '',
  'This evidence archive wraps the remote-source submission rehearsal with community provenance metadata. It records who or what source is being reviewed, which public URL led to the package, which remote archive was hashed, and which maintainer notes describe the independence boundary.',
  '',
  '## Community Source',
  '',
  `- Source URL: ${summary.communitySource.url}`,
  `- Source label: ${summary.communitySource.sourceLabel}`,
  `- Source relation: ${sourceRelationLabel(summary.communitySource.sourceRelation)}`,
  `- Submitter: ${summary.communitySource.submitter}`,
  `- Evidence ready: ${summary.communityEvidenceReady ? 'yes' : 'no'}`,
  '',
  '## Plugin Snapshot',
  '',
  `- Name: ${summary.sourcePlugin.name}`,
  `- Id: ${summary.sourcePlugin.id}`,
  `- Version: ${summary.sourcePlugin.version}`,
  `- Archive URL: ${summary.sourceArchive.archiveUrl}`,
  `- Final URL: ${summary.sourceArchive.finalUrl}`,
  `- Archive SHA-256: ${summary.sourceArchive.archiveSha256}`,
  `- Resolved plugin path: ${summary.sourceArchive.archivePluginPath}`,
  `- Submission bundle: ${summary.submission.bundleDir}`,
  `- Approval decision: ${summary.approval.record.decision}`,
  '',
  '## Commands',
  '',
  '```bash',
  ...commands,
  '```',
  '',
  '## Boundary',
  '',
  '- This records community-source submission evidence, not independent safety proof.',
  '- Maintainer approval is a human review artifact.',
  '- The archive does not prove signing trust, catalog publication, runtime safety, or release readiness.',
  '- If source relation is unknown, keep the evidence as provenance capture only.',
  ''
].join('\n')

const renderChecklist = ({ summary }) => [
  '# Community-Source Plugin Submission Evidence Checklist',
  '',
  `- [${summary.communitySource.url ? 'x' : ' '}] Community source URL recorded.`,
  `- [${summary.communitySource.submitter ? 'x' : ' '}] Submitter or source owner label recorded.`,
  `- [${summary.communitySource.sourceLabel === 'community' ? 'x' : ' '}] Source label is community.`,
  `- [${summary.communitySource.independenceNotes ? 'x' : ' '}] Maintainer independence/provenance notes recorded.`,
  `- [${summary.sourceArchive.archiveSha256 ? 'x' : ' '}] Remote archive URL, final URL, byte size, and SHA-256 recorded.`,
  `- [${Object.keys(summary.sourceArchive.extractedFileHashes).length ? 'x' : ' '}] Selected plugin file hashes recorded.`,
  `- [${summary.sourceValidation.ok ? 'x' : ' '}] Extracted source plugin validated.`,
  `- [${summary.packageValidation.ok ? 'x' : ' '}] Plugin package validated.`,
  `- [${summary.submission.bundleValidation.ok ? 'x' : ' '}] Submission bundle validated.`,
  `- [${summary.approval.validation.ok ? 'x' : ' '}] Maintainer approval record validated.`,
  '- [ ] Maintainer separately decides catalog publication policy.',
  '- [ ] Runtime smoke evidence is collected separately before any runtime-safety claim.',
  '',
  'Review reminder: community-source evidence is provenance and review traceability, not signing trust or catalog publication.',
  ''
].join('\n')

const createPluginCommunitySourceSubmissionEvidence = async ({
  archiveUrl,
  pluginPath,
  communitySourceUrl,
  submitter,
  sourceLabel = 'community',
  sourceRelation = 'unknown',
  independenceNotes,
  outputDir = '',
  reviewer = 'OpenPet Maintainer',
  decision = 'approved',
  notes = 'Community source archive, provenance, package hash, and submission artifacts reviewed.',
  now = () => new Date(),
  fsImpl = fs,
  execFile,
  downloadArchive
} = {}) => {
  if (!archiveUrl) throw new Error('Archive URL is required')
  if (!pluginPath) throw new Error('Plugin path is required')
  if (!communitySourceUrl) throw new Error('Community source URL is required')
  if (!hasText(submitter)) throw new Error('Submitter is required')
  if (!hasText(independenceNotes)) throw new Error('Independence notes are required')
  if (!VALID_SOURCE_LABELS.has(sourceLabel)) throw new Error('Community source evidence requires source label: community')
  if (!VALID_SOURCE_RELATIONS.has(sourceRelation)) throw new Error(`Unknown source relation: ${sourceRelation}`)

  const normalizedCommunitySourceUrl = validateHttpsUrl(communitySourceUrl, 'Community source URL')
  validateHttpsUrl(archiveUrl, 'Archive URL')

  const generatedAt = now().toISOString()
  const resolvedOutputDir = outputDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt)))
  const absoluteOutputDir = assertSafeRehearsalOutputDir(resolvedOutputDir)

  const remoteSummary = await createPluginRemoteSourceSubmissionRehearsal({
    archiveUrl,
    pluginPath,
    outputDir: absoluteOutputDir,
    reviewer,
    decision,
    notes,
    now: () => new Date(generatedAt),
    fsImpl,
    ...(execFile ? { execFile } : {}),
    ...(downloadArchive ? { downloadArchive } : {})
  })

  const communitySource = {
    kind: 'community-source',
    url: normalizedCommunitySourceUrl,
    sourceLabel,
    sourceRelation,
    submitter: submitter.trim(),
    independenceNotes: independenceNotes.trim()
  }
  const communityEvidenceReady = (
    communitySource.sourceLabel === 'community' &&
    communitySource.sourceRelation !== 'unknown' &&
    remoteSummary.submission.bundleValidation.ok === true &&
    remoteSummary.approval.validation.ok === true &&
    remoteSummary.approval.record.decision === 'approved'
  )
  const files = {
    readme: path.join(absoluteOutputDir, 'README-community-source.md'),
    checklist: path.join(absoluteOutputDir, 'community-source-checklist.md'),
    commands: path.join(absoluteOutputDir, 'community-source-commands.json'),
    communityEvidence: path.join(absoluteOutputDir, 'community-source-evidence.json'),
    summary: path.join(absoluteOutputDir, 'plugin-community-source-submission-evidence-summary.json')
  }
  const summary = {
    generatedAt,
    outputDir: absoluteOutputDir,
    communitySource,
    communityEvidenceReady,
    sourceArchive: remoteSummary.sourceArchive,
    sourcePlugin: remoteSummary.sourcePlugin,
    sourceValidation: remoteSummary.sourceValidation,
    packagePath: remoteSummary.packagePath,
    packageValidation: remoteSummary.packageValidation,
    submission: remoteSummary.submission,
    approval: remoteSummary.approval,
    remoteSourceRehearsal: {
      summary: remoteSummary.files.summary,
      readme: remoteSummary.files.readme,
      checklist: remoteSummary.files.checklist,
      commands: remoteSummary.files.commands,
      provenance: remoteSummary.files.provenance
    },
    boundaries: [
      'Community-source evidence records provenance and review traceability only.',
      'Maintainer approval does not prove signing trust, catalog publication, runtime safety, or release readiness.',
      'Runtime smoke, cleanup readiness, signing, and catalog publication evidence must be collected separately.'
    ],
    files
  }
  const commands = commandList({
    archiveUrl,
    pluginPath,
    communitySourceUrl: normalizedCommunitySourceUrl,
    submitter: communitySource.submitter,
    sourceRelation,
    independenceNotes: communitySource.independenceNotes,
    outputDir: absoluteOutputDir,
    reviewer,
    decision,
    notes
  })

  writeText(files.readme, renderReadme({ generatedAt, summary, commands }), fsImpl)
  writeText(files.checklist, renderChecklist({ summary }), fsImpl)
  writeJson(files.commands, { commands }, fsImpl)
  writeJson(files.communityEvidence, {
    generatedAt,
    communitySource,
    communityEvidenceReady,
    sourceArchive: remoteSummary.sourceArchive,
    sourcePlugin: remoteSummary.sourcePlugin,
    approval: {
      reviewer: remoteSummary.approval.record.reviewer,
      decision: remoteSummary.approval.record.decision,
      approvalReady: remoteSummary.approval.record.approvalReady
    },
    boundaries: summary.boundaries
  }, fsImpl)
  writeJson(files.summary, summary, fsImpl)

  return summary
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const summary = await createPluginCommunitySourceSubmissionEvidence(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    console.log(`Plugin community-source submission evidence created: ${summary.outputDir}`)
    console.log(`README: ${summary.files.readme}`)
    console.log(`Checklist: ${summary.files.checklist}`)
    console.log(`Submission bundle: ${summary.submission.bundleDir}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  VALID_SOURCE_LABELS,
  VALID_SOURCE_RELATIONS,
  createPluginCommunitySourceSubmissionEvidence,
  parseArgs,
  renderChecklist,
  renderReadme
}
