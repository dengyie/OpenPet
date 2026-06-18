const fs = require('fs')
const os = require('os')
const path = require('path')

const { REQUIRED_CHECKS, SCHEMA_VERSION } = require('./validate-plugin-cleanup-evidence-report')

const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'release-evidence', 'plugin-cleanup-evidence', 'plugin-cleanup-evidence-report.json')

const usage = () => [
  'Usage: node scripts/create-plugin-cleanup-evidence-report.js [--output <report.json>] [--plugin-id <id>] [--host-app <label>] [--notes <text>]',
  '',
  'Creates a pending plugin cleanup evidence report for real-host validation.',
  'The generated report does not prove hard cleanup guarantees until every check is filled with passing evidence.'
].join('\n')

const getRunnerEvidence = (env = process.env) => {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
  }
  return env.GITHUB_RUN_ID ? `GitHub Actions run ${env.GITHUB_RUN_ID}` : ''
}

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const createPendingChecks = () => REQUIRED_CHECKS.map((check) => ({
  id: check.id,
  status: 'pending',
  evidence: '',
  notes: `${check.label}. Fill with logs, process listings, screenshots, or terminal transcripts from a real host cleanup validation run.`
}))

const createPluginCleanupEvidenceReport = ({
  platform = process.platform,
  arch = process.arch,
  nodeVersion = process.version,
  env = process.env,
  hostname = os.hostname,
  now = () => new Date(),
  pluginId = 'openpet.cleanup-fixture',
  hostApp = 'OpenPet local or packaged app',
  notes = ''
} = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  generatedAt: now().toISOString(),
  source: 'scripts/create-plugin-cleanup-evidence-report.js',
  environment: {
    platform,
    arch,
    node: nodeVersion,
    machine: hostname(),
    runner: env.GITHUB_RUNNER_NAME || env.RUNNER_NAME || '',
    evidence: getRunnerEvidence(env)
  },
  scenario: {
    pluginId,
    hostApp,
    notes: String(notes || '')
  },
  checks: createPendingChecks()
})

const parseArgs = (argv) => {
  const options = {
    outputPath: DEFAULT_OUTPUT_PATH,
    pluginId: 'openpet.cleanup-fixture',
    hostApp: 'OpenPet local or packaged app',
    notes: '',
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output') {
      options.outputPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--plugin-id') {
      options.pluginId = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--host-app') {
      options.hostApp = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.outputPath) throw new Error('--output requires a value')
  if (!options.pluginId) throw new Error('--plugin-id requires a value')
  if (!options.hostApp) throw new Error('--host-app requires a value')
  return options
}

const writeReport = ({ report, outputPath, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const report = createPluginCleanupEvidenceReport({
    pluginId: options.pluginId,
    hostApp: options.hostApp,
    notes: options.notes
  })
  const outputPath = writeReport({ report, outputPath: options.outputPath })

  console.log(`Plugin cleanup evidence report created: ${outputPath}`)
  console.log(`Plugin: ${report.scenario.pluginId}`)
  console.log('Cleanup checks remain pending until real host evidence is filled.')
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}

module.exports = {
  createPendingChecks,
  createPluginCleanupEvidenceReport,
  getRunnerEvidence,
  parseArgs,
  writeReport
}
