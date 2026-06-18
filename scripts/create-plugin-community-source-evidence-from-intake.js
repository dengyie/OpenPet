const fs = require('fs')
const path = require('path')

const {
  VALID_SOURCE_RELATIONS,
  createPluginCommunitySourceSubmissionEvidence
} = require('./create-plugin-community-source-submission-evidence')

const usage = () => [
  'Usage: node scripts/create-plugin-community-source-evidence-from-intake.js --intake-summary <summary.json> --source-relation <relation> --independence-notes <text> [options]',
  '',
  'Options:',
  '  --intake-summary <summary.json>      Phase 100 intake summary JSON to promote',
  '  --source-relation <relation>         independent-third-party, external-community, or unknown',
  '  --independence-notes <text>          Maintainer notes about source independence and provenance limits',
  '  --output-dir <dir>                   Directory for Phase 99 evidence artifacts',
  '  --reviewer <name>                    Maintainer or reviewer name',
  '  --decision <approved|changes-requested>',
  '  --notes <text>                       Review notes recorded by the maintainer',
  '  --json                               Print the machine-readable bridge summary',
  '  --help',
  '',
  'Promotes only ready Phase 100 community-source intake summaries into the',
  'Phase 99 submission evidence flow. Incompatible intake archives are rejected.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    intakeSummary: '',
    sourceRelation: 'unknown',
    independenceNotes: '',
    outputDir: '',
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Community source intake reviewed and routed into submission evidence.',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--intake-summary') {
      options.intakeSummary = readValue(argv, index, arg)
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

  if (options.sourceRelation && !VALID_SOURCE_RELATIONS.has(options.sourceRelation)) {
    throw new Error(`Unknown source relation: ${options.sourceRelation}`)
  }

  return options
}

const hasText = (value) => typeof value === 'string' && value.trim().length > 0

const readJson = (filePath, fsImpl = fs) => {
  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf-8'))
  } catch (error) {
    throw new Error(`Unable to read intake summary JSON: ${error.message}`)
  }
}

const assertReadyIntake = (summary) => {
  if (!summary || typeof summary !== 'object') throw new Error('Intake summary must be an object')
  if (summary.status !== 'ready-for-community-evidence') {
    throw new Error(`Intake summary is not ready for community evidence: ${summary.status || 'unknown'}`)
  }
  if (!summary.compatibility || summary.compatibility.ok !== true || summary.compatibility.reasonCode !== 'openpet-plugin-package') {
    throw new Error('Intake summary compatibility metadata is inconsistent with ready status')
  }
  if (!summary.plugin || !hasText(summary.plugin.id)) {
    throw new Error('Intake summary is missing compatible plugin metadata')
  }
  if (!summary.archive || !hasText(summary.archive.archiveUrl) || !hasText(summary.archive.pluginPath)) {
    throw new Error('Intake summary is missing archive URL or plugin path')
  }
  if (!summary.communitySource || !hasText(summary.communitySource.url) || !hasText(summary.communitySource.submitter)) {
    throw new Error('Intake summary is missing community source metadata')
  }
}

const createPluginCommunitySourceEvidenceFromIntake = async ({
  intakeSummary,
  sourceRelation = 'unknown',
  independenceNotes,
  outputDir = '',
  reviewer = 'OpenPet Maintainer',
  decision = 'approved',
  notes = 'Community source intake reviewed and routed into submission evidence.',
  fsImpl = fs,
  createSubmissionEvidence = createPluginCommunitySourceSubmissionEvidence,
  now = () => new Date()
} = {}) => {
  if (!hasText(intakeSummary)) throw new Error('Intake summary is required')
  if (!hasText(independenceNotes)) throw new Error('Independence notes are required')
  if (!VALID_SOURCE_RELATIONS.has(sourceRelation)) throw new Error(`Unknown source relation: ${sourceRelation}`)

  const absoluteIntakeSummary = path.resolve(intakeSummary)
  const intake = readJson(absoluteIntakeSummary, fsImpl)
  assertReadyIntake(intake)

  const submission = await createSubmissionEvidence({
    archiveUrl: intake.archive.archiveUrl,
    pluginPath: intake.archive.pluginPath,
    communitySourceUrl: intake.communitySource.url,
    submitter: intake.communitySource.submitter,
    sourceRelation,
    independenceNotes,
    outputDir,
    reviewer,
    decision,
    notes
  })

  return {
    generatedAt: now().toISOString(),
    bridge: {
      intakeSummary: absoluteIntakeSummary,
      intakeOutputDir: intake.outputDir || '',
      intakeStatus: intake.status,
      intakeReasonCode: intake.compatibility.reasonCode,
      sourcePlugin: intake.plugin,
      sourceArchive: intake.archive,
      communitySource: intake.communitySource,
      boundaries: [
        'Only ready Phase 100 intake summaries can enter this bridge.',
        'The bridge preserves intake provenance but does not prove signing trust, catalog publication, runtime safety, or release readiness.',
        'Incompatible intake summaries remain intake evidence and must not be routed into Phase 99.'
      ]
    },
    submission
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = await createPluginCommunitySourceEvidenceFromIntake(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    console.log(`Plugin community-source evidence created from intake: ${result.submission.outputDir}`)
    console.log(`Intake summary: ${result.bridge.intakeSummary}`)
    console.log(`Submission summary: ${result.submission.files.summary}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  createPluginCommunitySourceEvidenceFromIntake,
  parseArgs
}
