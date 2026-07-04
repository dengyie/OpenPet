const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const {
  DEFAULT_ARCHIVE_RESULT_NAME,
  DEFAULT_LOG_NAME,
  DEFAULT_README_NAME,
  DEFAULT_RESULT_NAME,
  assertNoSensitiveArchiveText,
  createArchiveResultValue,
  createReadme,
  formatManualAcceptanceStatus,
  requireSanitizedReport
} = require('./create-ai-talk-local-smoke-archive')

const usage = () => [
  'Usage: node scripts/update-ai-talk-local-smoke-report.js <report.json> [options]',
  '',
  'Options:',
  '  --output <report.json>                 Write to a different report path instead of replacing input',
  '  --readme <README.md>                  Write or rewrite a companion archive README at this path',
  '  --no-readme                           Skip README regeneration',
  '  --bubble-visible-long-enough <true|false|pending>',
  '                                        Update manualAcceptanceTemplate.bubbleVisibleLongEnough',
  '  --input-usable <true|false|pending>   Update manualAcceptanceTemplate.inputUsable',
  '  --desktop-feel-notes <text>           Update manualAcceptanceTemplate.desktopFeelNotes',
  '  --desktop-feel-notes-file <path>      Load desktopFeelNotes from a UTF-8 text file',
  '  --request-id <id>                     Override manualAcceptanceTemplate.requestId',
  '  --validate-complete                   Require bubble/input review fields to be filled before writing',
  '  --help',
  '',
  'The updater preserves the telemetry-only archive boundary by rejecting raw local paths,',
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

const parseArgs = (argv) => {
  const options = {
    reportPath: null,
    outputPath: null,
    readmePath: null,
    noReadme: false,
    bubbleVisibleLongEnough: undefined,
    inputUsable: undefined,
    desktopFeelNotes: undefined,
    desktopFeelNotesFile: null,
    requestId: undefined,
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
    } else if (arg === '--bubble-visible-long-enough') {
      options.bubbleVisibleLongEnough = parseReviewBoolean(readValue(index, arg), arg)
      index += 1
    } else if (arg === '--input-usable') {
      options.inputUsable = parseReviewBoolean(readValue(index, arg), arg)
      index += 1
    } else if (arg === '--desktop-feel-notes') {
      options.desktopFeelNotes = readValue(index, arg)
      index += 1
    } else if (arg === '--desktop-feel-notes-file') {
      options.desktopFeelNotesFile = readValue(index, arg)
      index += 1
    } else if (arg === '--request-id') {
      options.requestId = readValue(index, arg)
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
      bubbleVisibleLongEnough: null,
      inputUsable: null,
      desktopFeelNotes: '',
      requestId: ''
    }
  }

  const target = report.manualAcceptanceTemplate
  if (!Object.prototype.hasOwnProperty.call(target, 'bubbleVisibleLongEnough')) target.bubbleVisibleLongEnough = null
  if (!Object.prototype.hasOwnProperty.call(target, 'inputUsable')) target.inputUsable = null
  if (!Object.prototype.hasOwnProperty.call(target, 'desktopFeelNotes')) target.desktopFeelNotes = ''
  if (!Object.prototype.hasOwnProperty.call(target, 'requestId')) target.requestId = ''
  return target
}

const updateReport = (report, options, fsImpl = fs) => {
  const manualAcceptance = ensureManualAcceptanceTemplate(report)
  if (options.bubbleVisibleLongEnough !== undefined) {
    manualAcceptance.bubbleVisibleLongEnough = options.bubbleVisibleLongEnough
  }
  if (options.inputUsable !== undefined) manualAcceptance.inputUsable = options.inputUsable
  if (options.desktopFeelNotes !== undefined) manualAcceptance.desktopFeelNotes = options.desktopFeelNotes
  if (options.desktopFeelNotesFile) {
    manualAcceptance.desktopFeelNotes = fsImpl.readFileSync(path.resolve(options.desktopFeelNotesFile), 'utf-8').trim()
  }
  if (options.requestId !== undefined) manualAcceptance.requestId = options.requestId
  return report
}

const validateUpdatedReport = (report, options = {}) => {
  const errors = []
  const manualAcceptance = ensureManualAcceptanceTemplate(report)
  const bubbleRequestId = String(report?.bubbleAcceptance?.requestId || '').trim()

  requireSanitizedReport(report)
  assertNoSensitiveArchiveText(JSON.stringify(report), 'aiTalkLocalSmokeResult')

  if (![true, false, null].includes(manualAcceptance.bubbleVisibleLongEnough)) {
    errors.push('manualAcceptanceTemplate.bubbleVisibleLongEnough must be true, false, or null')
  }
  if (![true, false, null].includes(manualAcceptance.inputUsable)) {
    errors.push('manualAcceptanceTemplate.inputUsable must be true, false, or null')
  }
  if (typeof manualAcceptance.desktopFeelNotes !== 'string') {
    errors.push('manualAcceptanceTemplate.desktopFeelNotes must be a string')
  }
  if (typeof manualAcceptance.requestId !== 'string') {
    errors.push('manualAcceptanceTemplate.requestId must be a string')
  }
  if (bubbleRequestId && String(manualAcceptance.requestId || '').trim() !== bubbleRequestId) {
    errors.push('manualAcceptanceTemplate.requestId must match bubbleAcceptance.requestId')
  }

  if (options.validateComplete) {
    if (manualAcceptance.bubbleVisibleLongEnough === null) {
      errors.push('manualAcceptanceTemplate.bubbleVisibleLongEnough must be filled before complete validation')
    }
    if (manualAcceptance.inputUsable === null) {
      errors.push('manualAcceptanceTemplate.inputUsable must be filled before complete validation')
    }
    if (
      (manualAcceptance.bubbleVisibleLongEnough === false || manualAcceptance.inputUsable === false) &&
      String(manualAcceptance.desktopFeelNotes || '').trim().length === 0
    ) {
      errors.push('manualAcceptanceTemplate.desktopFeelNotes must explain any failed manual acceptance check')
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      bubbleVisibleLongEnough: formatManualAcceptanceStatus(manualAcceptance.bubbleVisibleLongEnough),
      inputUsable: formatManualAcceptanceStatus(manualAcceptance.inputUsable),
      desktopFeelNotesPresent: String(manualAcceptance.desktopFeelNotes || '').trim().length > 0,
      requestId: String(manualAcceptance.requestId || '').trim()
    }
  }
}

const writeJson = ({ filePath, value, fsImpl = fs }) => {
  const absolutePath = path.resolve(filePath)
  fsImpl.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fsImpl.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`)
  return absolutePath
}

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

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
  const sourceLogPath = existing?.source?.logPath || path.resolve(String(report?.logPath || path.join(archiveDir, DEFAULT_LOG_NAME)))

  const archiveResult = createArchiveResultValue({
    report,
    absoluteSessionDir: sourceSessionDir,
    sourceResultPath,
    sourceLogPath,
    absoluteArchiveDir: existing?.archive?.archiveDir || archiveDir,
    absoluteOutputPath: existing?.archive?.outputPath || archiveResultPath,
    sessionId: existing?.archive?.sessionId || path.basename(archiveDir),
    files: [
      createFileSummary({ filePath: reportOutputPath, role: 'aiTalkLocalSmokeResult', fsImpl }),
      createFileSummary({ filePath: path.join(archiveDir, DEFAULT_LOG_NAME), role: 'aiTalkLocalSmokeLog', fsImpl }),
      createFileSummary({ filePath: readmeOutputPath, role: 'archiveReadme', fsImpl })
    ]
  })

  writeJson({ filePath: archiveResultPath, value: archiveResult, fsImpl })
  return archiveResultPath
}

const updateAiTalkLocalSmokeReport = ({ reportPath, outputPath, readmePath, noReadme = false, options = {}, fsImpl = fs } = {}) => {
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

  const result = updateAiTalkLocalSmokeReport({
    reportPath: cliOptions.reportPath,
    outputPath: cliOptions.outputPath,
    readmePath: cliOptions.readmePath,
    noReadme: cliOptions.noReadme,
    options: cliOptions
  })

  console.log(`AI Talk smoke report updated: ${result.reportPath}`)
  console.log(`Manual acceptance: bubble=${result.summary.bubbleVisibleLongEnough}, input=${result.summary.inputUsable}, requestId=${result.summary.requestId || 'missing'}`)
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
  updateAiTalkLocalSmokeReport,
  updateReport,
  validateUpdatedReport
}
