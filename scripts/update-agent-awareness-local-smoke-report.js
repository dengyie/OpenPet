const fs = require('fs')
const path = require('path')

const {
  DEFAULT_ARCHIVE_RESULT_NAME,
  DEFAULT_README_NAME,
  DEFAULT_RESULT_NAME,
  assertNoSensitiveArchiveText,
  createArchiveResultValue,
  createReadme,
  formatManualAcceptanceStatus,
  requireSanitizedReport
} = require('./create-agent-awareness-local-smoke-archive')

const usage = () => [
  'Usage: node scripts/update-agent-awareness-local-smoke-report.js <report.json> [options]',
  '',
  'Options:',
  '  --output <report.json>                    Write to a different report path instead of replacing input',
  '  --readme <README.md>                     Write or rewrite a companion archive README at this path',
  '  --no-readme                              Skip README regeneration',
  '  --dashboard-useful <true|false|pending>  Update manualAcceptanceTemplate.dashboardUseful',
  '  --pet-speech-noise-acceptable <true|false|pending>',
  '                                           Update manualAcceptanceTemplate.petSpeechNoiseAcceptable',
  '  --redaction-looks-safe <true|false>      Update manualAcceptanceTemplate.redactionLooksSafe',
  '  --notes <text>                           Update manualAcceptanceTemplate.notes',
  '  --notes-file <path>                      Load manualAcceptanceTemplate.notes from a UTF-8 text file',
  '  --validate-complete                      Require dashboard/noise review fields to be filled before writing',
  '  --help',
  '',
  'The updater preserves the privacy-first archive boundary by rejecting raw local paths,',
  'loopback URLs, secrets, or authorization-like text in the final report.'
].join('\n')

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const parseReviewBoolean = (value, label) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (['true', '1', 'yes', 'pass'].includes(normalized)) return true
  if (['false', '0', 'no', 'fail'].includes(normalized)) return false
  if (['pending', 'null', 'unset'].includes(normalized)) return null
  throw new Error(`${label} must be true, false, or pending`)
}

const parseRequiredBoolean = (value, label) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (['true', '1', 'yes', 'pass'].includes(normalized)) return true
  if (['false', '0', 'no', 'fail'].includes(normalized)) return false
  throw new Error(`${label} must be true or false`)
}

const parseArgs = (argv) => {
  const options = {
    reportPath: null,
    outputPath: null,
    readmePath: null,
    noReadme: false,
    dashboardUseful: undefined,
    petSpeechNoiseAcceptable: undefined,
    redactionLooksSafe: undefined,
    notes: undefined,
    notesFile: null,
    validateComplete: false,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (arg === '--readme') {
      options.readmePath = readValue(index, arg)
      index += 1
    } else if (arg === '--no-readme') {
      options.noReadme = true
    } else if (arg === '--dashboard-useful') {
      options.dashboardUseful = parseReviewBoolean(readValue(index, arg), arg)
      index += 1
    } else if (arg === '--pet-speech-noise-acceptable') {
      options.petSpeechNoiseAcceptable = parseReviewBoolean(readValue(index, arg), arg)
      index += 1
    } else if (arg === '--redaction-looks-safe') {
      options.redactionLooksSafe = parseRequiredBoolean(readValue(index, arg), arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(index, arg)
      index += 1
    } else if (arg === '--notes-file') {
      options.notesFile = readValue(index, arg)
      index += 1
    } else if (arg === '--validate-complete') {
      options.validateComplete = true
    } else if (!options.reportPath) {
      options.reportPath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.noReadme && options.readmePath) throw new Error('--readme cannot be used with --no-readme')
  return options
}

const loadReport = (reportPath, fsImpl = fs) => {
  if (!reportPath) throw new Error('Report path is required')
  const absolutePath = path.resolve(reportPath)
  return {
    absolutePath,
    report: JSON.parse(fsImpl.readFileSync(absolutePath, 'utf-8'))
  }
}

const ensureManualAcceptanceTemplate = (report) => {
  if (!isObject(report)) throw new Error('Report must be a JSON object')
  if (!isObject(report.manualAcceptanceTemplate)) {
    report.manualAcceptanceTemplate = {
      dashboardUseful: null,
      petSpeechNoiseAcceptable: null,
      redactionLooksSafe: true,
      notes: ''
    }
  }

  const target = report.manualAcceptanceTemplate
  if (!Object.prototype.hasOwnProperty.call(target, 'dashboardUseful')) target.dashboardUseful = null
  if (!Object.prototype.hasOwnProperty.call(target, 'petSpeechNoiseAcceptable')) target.petSpeechNoiseAcceptable = null
  if (!Object.prototype.hasOwnProperty.call(target, 'redactionLooksSafe')) target.redactionLooksSafe = true
  if (!Object.prototype.hasOwnProperty.call(target, 'notes')) target.notes = ''
  return target
}

const updateReport = (report, options, fsImpl = fs) => {
  const manualAcceptance = ensureManualAcceptanceTemplate(report)

  if (options.dashboardUseful !== undefined) manualAcceptance.dashboardUseful = options.dashboardUseful
  if (options.petSpeechNoiseAcceptable !== undefined) {
    manualAcceptance.petSpeechNoiseAcceptable = options.petSpeechNoiseAcceptable
  }
  if (options.redactionLooksSafe !== undefined) manualAcceptance.redactionLooksSafe = options.redactionLooksSafe
  if (options.notes !== undefined) manualAcceptance.notes = options.notes
  if (options.notesFile) manualAcceptance.notes = fsImpl.readFileSync(path.resolve(options.notesFile), 'utf-8').trim()

  return report
}

const validateUpdatedReport = (report, options = {}) => {
  const errors = []
  const manualAcceptance = ensureManualAcceptanceTemplate(report)

  requireSanitizedReport(report)
  assertNoSensitiveArchiveText(JSON.stringify(report), 'agentAwarenessLocalSmokeResult')

  if (![true, false, null].includes(manualAcceptance.dashboardUseful)) {
    errors.push('manualAcceptanceTemplate.dashboardUseful must be true, false, or null')
  }
  if (![true, false, null].includes(manualAcceptance.petSpeechNoiseAcceptable)) {
    errors.push('manualAcceptanceTemplate.petSpeechNoiseAcceptable must be true, false, or null')
  }
  if (typeof manualAcceptance.redactionLooksSafe !== 'boolean') {
    errors.push('manualAcceptanceTemplate.redactionLooksSafe must be true or false')
  }
  if (typeof manualAcceptance.notes !== 'string') {
    errors.push('manualAcceptanceTemplate.notes must be a string')
  }

  if (options.validateComplete) {
    if (manualAcceptance.dashboardUseful === null) {
      errors.push('manualAcceptanceTemplate.dashboardUseful must be filled before complete validation')
    }
    if (manualAcceptance.petSpeechNoiseAcceptable === null) {
      errors.push('manualAcceptanceTemplate.petSpeechNoiseAcceptable must be filled before complete validation')
    }
    if (
      (manualAcceptance.dashboardUseful === false ||
        manualAcceptance.petSpeechNoiseAcceptable === false ||
        manualAcceptance.redactionLooksSafe === false) &&
      String(manualAcceptance.notes || '').trim().length === 0
    ) {
      errors.push('manualAcceptanceTemplate.notes must explain any failed manual acceptance check')
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      dashboardUseful: formatManualAcceptanceStatus(manualAcceptance.dashboardUseful),
      petSpeechNoiseAcceptable: formatManualAcceptanceStatus(manualAcceptance.petSpeechNoiseAcceptable),
      redactionLooksSafe: formatManualAcceptanceStatus(manualAcceptance.redactionLooksSafe),
      notesPresent: String(manualAcceptance.notes || '').trim().length > 0
    }
  }
}

const writeJson = ({ filePath, value, fsImpl = fs }) => {
  const absolutePath = path.resolve(filePath)
  fsImpl.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fsImpl.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`)
  return absolutePath
}

const sha256 = (content) => require('crypto').createHash('sha256').update(content).digest('hex')

const createFileSummary = ({ filePath, role, fsImpl = fs }) => {
  const content = fsImpl.readFileSync(filePath)
  return {
    role,
    path: filePath,
    bytes: content.length,
    sha256: sha256(content)
  }
}

const writeReadme = ({ report, reportOutputPath, readmePath, fsImpl = fs }) => {
  const absoluteReadmePath = path.resolve(readmePath || path.join(path.dirname(reportOutputPath), DEFAULT_README_NAME))
  const readme = createReadme({ report, archiveDir: path.dirname(reportOutputPath) })
  fsImpl.mkdirSync(path.dirname(absoluteReadmePath), { recursive: true })
  fsImpl.writeFileSync(absoluteReadmePath, readme)
  return absoluteReadmePath
}

const maybeWriteArchiveResult = ({
  report,
  reportOutputPath,
  readmeOutputPath,
  fsImpl = fs
}) => {
  const archiveDir = path.dirname(reportOutputPath)
  const archiveResultPath = path.join(archiveDir, DEFAULT_ARCHIVE_RESULT_NAME)
  const existing = fsImpl.existsSync(archiveResultPath)
    ? JSON.parse(fsImpl.readFileSync(archiveResultPath, 'utf-8'))
    : null
  const sourceSessionDir = existing?.source?.sessionDir || path.resolve(String(report?.sessionDir || archiveDir))
  const sourceResultPath = existing?.source?.resultPath || path.resolve(String(report?.resultPath || reportOutputPath))
  const archiveResult = createArchiveResultValue({
    report,
    absoluteSessionDir: sourceSessionDir,
    sourceResultPath,
    absoluteArchiveDir: existing?.archive?.archiveDir || archiveDir,
    absoluteOutputPath: existing?.archive?.outputPath || archiveResultPath,
    files: [
      createFileSummary({ filePath: reportOutputPath, role: 'agentAwarenessLocalSmokeResult', fsImpl }),
      createFileSummary({ filePath: readmeOutputPath, role: 'archiveReadme', fsImpl })
    ]
  })

  writeJson({ filePath: archiveResultPath, value: archiveResult, fsImpl })
  return archiveResultPath
}

const updateAgentAwarenessLocalSmokeReport = ({ reportPath, outputPath, readmePath, noReadme = false, options = {}, fsImpl = fs } = {}) => {
  const { absolutePath, report } = loadReport(reportPath, fsImpl)
  const updated = updateReport(report, options, fsImpl)
  const validation = validateUpdatedReport(updated, options)
  if (!validation.ok) {
    const error = new Error(validation.errors.join('\n'))
    error.validation = validation
    throw error
  }

  const finalReportPath = writeJson({ filePath: outputPath || absolutePath, value: updated, fsImpl })
  const finalReadmePath = noReadme ? null : writeReadme({
    report: updated,
    reportOutputPath: finalReportPath,
    readmePath,
    fsImpl
  })
  const finalArchiveResultPath = finalReadmePath
    ? maybeWriteArchiveResult({
      report: updated,
      reportOutputPath: finalReportPath,
      readmeOutputPath: finalReadmePath,
      fsImpl
    })
    : null

  return {
    ok: true,
    reportPath: finalReportPath,
    readmePath: finalReadmePath,
    archiveResultPath: finalArchiveResultPath,
    manualAcceptanceTemplate: updated.manualAcceptanceTemplate,
    summary: validation.summary
  }
}

const main = () => {
  const cliOptions = parseArgs(process.argv.slice(2))
  if (cliOptions.help) {
    console.log(usage())
    return
  }

  const result = updateAgentAwarenessLocalSmokeReport({
    reportPath: cliOptions.reportPath,
    outputPath: cliOptions.outputPath,
    readmePath: cliOptions.readmePath,
    noReadme: cliOptions.noReadme,
    options: cliOptions
  })

  console.log(`Agent-awareness smoke report updated: ${result.reportPath}`)
  console.log(`Manual acceptance: dashboard=${result.summary.dashboardUseful}, petSpeech=${result.summary.petSpeechNoiseAcceptable}, redaction=${result.summary.redactionLooksSafe}`)
  if (result.readmePath) console.log(`README updated: ${result.readmePath}`)
  if (result.archiveResultPath) console.log(`Archive result updated: ${result.archiveResultPath}`)
  if (cliOptions.validateComplete) {
    console.log('Manual acceptance review is structurally complete.')
  } else {
    console.log('Report structure is valid; pending manual acceptance fields may remain.')
  }
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message || error)
    process.exit(1)
  }
}

module.exports = {
  parseArgs,
  updateAgentAwarenessLocalSmokeReport,
  updateReport,
  validateUpdatedReport
}
