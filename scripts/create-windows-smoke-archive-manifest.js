const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { createWindowsSmokeEvidenceSummary } = require('./create-windows-smoke-evidence-summary')
const { validateEvidenceBundle } = require('./validate-windows-smoke-evidence-bundle')
const { validateReport } = require('./validate-windows-smoke-report')

const DEFAULT_ARCHIVE_DIR = 'windows-smoke-archive'
const DEFAULT_REPORT_NAME = 'windows-smoke-report.json'
const DEFAULT_RUNBOOK_NAME = 'windows-smoke-runbook.md'
const DEFAULT_COLLECTOR_NAME = 'windows-smoke-collector.ps1'
const DEFAULT_EVIDENCE_DIR_NAME = 'windows-smoke-evidence'
const DEFAULT_SUMMARY_MARKDOWN_NAME = 'windows-smoke-evidence-summary.md'
const DEFAULT_SUMMARY_JSON_NAME = 'windows-smoke-evidence-summary.json'
const DEFAULT_MANIFEST_NAME = 'windows-smoke-archive-manifest.json'

const usage = () => [
  'Usage: node scripts/create-windows-smoke-archive-manifest.js [--archive-dir <dir>] [--report <report.json>] [--evidence-dir <dir>] [--runbook <runbook.md>] [--collector <collector.ps1>] [--summary <summary.md|summary.json>] [--output <manifest.json>] [--require-signed] [--json]',
  '',
  `Defaults to ./${DEFAULT_ARCHIVE_DIR} with the standard Windows smoke evidence filenames.`,
  'Creates a hash manifest for a reviewed Windows smoke evidence archive.',
  'This checks archive completeness and evidence/report structure; it does not mark runtime smoke checks as passed.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    archiveDir: DEFAULT_ARCHIVE_DIR,
    reportPath: null,
    evidenceDir: null,
    runbookPath: null,
    collectorPath: null,
    summaryPath: null,
    outputPath: null,
    requireSigned: false,
    json: false,
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
    } else if (arg === '--archive-dir') {
      options.archiveDir = readValue(index, arg)
      index += 1
    } else if (arg === '--report') {
      options.reportPath = readValue(index, arg)
      index += 1
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = readValue(index, arg)
      index += 1
    } else if (arg === '--runbook') {
      options.runbookPath = readValue(index, arg)
      index += 1
    } else if (arg === '--collector') {
      options.collectorPath = readValue(index, arg)
      index += 1
    } else if (arg === '--summary') {
      options.summaryPath = readValue(index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (arg === '--require-signed') {
      options.requireSigned = true
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.archiveDir) throw new Error('--archive-dir requires a value')
  return options
}

const resolveArchivePaths = ({
  archiveDir = DEFAULT_ARCHIVE_DIR,
  reportPath = null,
  evidenceDir = null,
  runbookPath = null,
  collectorPath = null,
  summaryPath = null,
  outputPath = null,
  fsImpl = fs
} = {}) => {
  const absoluteArchiveDir = path.resolve(archiveDir)
  const resolveInsideArchive = (fileName) => path.join(absoluteArchiveDir, fileName)
  const defaultSummaryMarkdown = resolveInsideArchive(DEFAULT_SUMMARY_MARKDOWN_NAME)
  const defaultSummaryJson = resolveInsideArchive(DEFAULT_SUMMARY_JSON_NAME)

  let resolvedSummaryPath = summaryPath ? path.resolve(summaryPath) : defaultSummaryMarkdown
  if (!summaryPath && !fsImpl.existsSync(defaultSummaryMarkdown) && fsImpl.existsSync(defaultSummaryJson)) {
    resolvedSummaryPath = defaultSummaryJson
  }

  return {
    archiveDir: absoluteArchiveDir,
    reportPath: reportPath ? path.resolve(reportPath) : resolveInsideArchive(DEFAULT_REPORT_NAME),
    evidenceDir: evidenceDir ? path.resolve(evidenceDir) : resolveInsideArchive(DEFAULT_EVIDENCE_DIR_NAME),
    runbookPath: runbookPath ? path.resolve(runbookPath) : resolveInsideArchive(DEFAULT_RUNBOOK_NAME),
    collectorPath: collectorPath ? path.resolve(collectorPath) : resolveInsideArchive(DEFAULT_COLLECTOR_NAME),
    summaryPath: resolvedSummaryPath,
    outputPath: outputPath ? path.resolve(outputPath) : resolveInsideArchive(DEFAULT_MANIFEST_NAME)
  }
}

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

const describeFile = ({ role, filePath, fsImpl = fs }) => {
  if (!fsImpl.existsSync(filePath)) {
    return { role, path: filePath, exists: false, bytes: 0, sha256: '' }
  }

  const stat = fsImpl.statSync(filePath)
  if (!stat.isFile()) {
    return { role, path: filePath, exists: false, bytes: 0, sha256: '', error: 'path is not a file' }
  }

  const content = fsImpl.readFileSync(filePath)
  return {
    role,
    path: filePath,
    exists: true,
    bytes: content.length,
    sha256: sha256(content)
  }
}

const loadReport = (reportPath, fsImpl = fs) => JSON.parse(fsImpl.readFileSync(reportPath, 'utf-8'))

const summarizeSummaryFile = ({ summaryPath, computedSummary, requireSigned, fsImpl = fs }) => {
  const file = describeFile({ role: 'summary', filePath: summaryPath, fsImpl })
  const errors = []
  const warnings = []
  let format = ''

  if (!file.exists) {
    errors.push(`missing archive summary file: ${summaryPath}`)
    return { file, format, matchesComputedSummary: false, errors, warnings }
  }

  const content = fsImpl.readFileSync(summaryPath, 'utf-8')
  const expectedReady = computedSummary.releaseReady ? 'yes' : 'no'
  const expectedOk = computedSummary.ok ? 'yes' : 'no'
  const expectedRequired = `${computedSummary.evidence.presentCount}/${computedSummary.evidence.requiredCount}`

  if (/\.json$/i.test(summaryPath)) {
    format = 'json'
    try {
      const parsed = JSON.parse(content)
      if (parsed.releaseReady !== computedSummary.releaseReady) errors.push('summary JSON releaseReady does not match recomputed evidence state')
      if (parsed.ok !== computedSummary.ok) errors.push('summary JSON ok does not match recomputed evidence state')
      if (parsed.requireSigned !== requireSigned) errors.push('summary JSON requireSigned does not match archive manifest mode')
      if (parsed.evidence?.presentCount !== computedSummary.evidence.presentCount) errors.push('summary JSON evidence.presentCount does not match recomputed evidence state')
      if (parsed.evidence?.requiredCount !== computedSummary.evidence.requiredCount) errors.push('summary JSON evidence.requiredCount does not match recomputed evidence state')
    } catch (err) {
      errors.push(`summary JSON could not be parsed: ${err.message || err}`)
    }
  } else {
    format = 'markdown'
    if (!content.includes(`Windows release-ready: ${expectedReady}`)) errors.push(`summary Markdown must include Windows release-ready: ${expectedReady}`)
    if (!content.includes(`Evidence/report validation valid: ${expectedOk}`)) errors.push(`summary Markdown must include Evidence/report validation valid: ${expectedOk}`)
    if (!content.includes(`Required files present: ${expectedRequired}`)) errors.push(`summary Markdown must include Required files present: ${expectedRequired}`)
    if (!content.includes('Pending or unsigned evidence does not prove Windows release readiness')) {
      warnings.push('summary Markdown does not include the standard release-readiness warning')
    }
  }

  return {
    file,
    format,
    matchesComputedSummary: errors.length === 0,
    errors,
    warnings
  }
}

const createWindowsSmokeArchiveManifest = ({
  archiveDir = DEFAULT_ARCHIVE_DIR,
  reportPath = null,
  evidenceDir = null,
  runbookPath = null,
  collectorPath = null,
  summaryPath = null,
  outputPath = null,
  requireSigned = false,
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  const paths = resolveArchivePaths({ archiveDir, reportPath, evidenceDir, runbookPath, collectorPath, summaryPath, outputPath, fsImpl })
  const files = [
    describeFile({ role: 'report', filePath: paths.reportPath, fsImpl }),
    describeFile({ role: 'runbook', filePath: paths.runbookPath, fsImpl }),
    describeFile({ role: 'collector', filePath: paths.collectorPath, fsImpl })
  ]
  const errors = []
  const warnings = []

  for (const file of files) {
    if (!file.exists) errors.push(file.error ? `${file.role}: ${file.error}` : `missing archive file: ${file.path}`)
  }

  let reportValidation = { ok: false, errors: ['report could not be loaded'], warnings: [], summary: { passed: 0, total: 0 } }
  let readinessValidation = { ok: false, errors: ['report could not be loaded'], warnings: [], summary: { passed: 0, total: 0 } }
  let report = null
  if (files[0].exists) {
    try {
      report = loadReport(paths.reportPath, fsImpl)
      reportValidation = validateReport(report, { allowPending: true, requireSigned })
      readinessValidation = validateReport(report, { allowPending: false, requireSigned })
      errors.push(...reportValidation.errors.map((error) => `report: ${error}`))
      warnings.push(...reportValidation.warnings.map((warning) => `report: ${warning}`))
    } catch (err) {
      errors.push(`report could not be parsed: ${err.message || err}`)
    }
  }

  const evidenceValidation = validateEvidenceBundle({ evidenceDir: paths.evidenceDir, reportPath: paths.reportPath, requireSigned })
  errors.push(...evidenceValidation.errors.map((error) => `evidence: ${error}`))
  warnings.push(...evidenceValidation.warnings.map((warning) => `evidence: ${warning}`))

  const computedSummary = createWindowsSmokeEvidenceSummary({
    evidenceDir: paths.evidenceDir,
    reportPath: paths.reportPath,
    requireSigned,
    now
  })
  const summary = summarizeSummaryFile({ summaryPath: paths.summaryPath, computedSummary, requireSigned, fsImpl })
  errors.push(...summary.errors.map((error) => `summary: ${error}`))
  warnings.push(...summary.warnings.map((warning) => `summary: ${warning}`))

  const manifest = {
    generatedAt: now().toISOString(),
    requireSigned,
    ok: false,
    releaseReady: Boolean(evidenceValidation.ok && readinessValidation.ok),
    archive: {
      archiveDir: paths.archiveDir,
      outputPath: paths.outputPath
    },
    files: [...files, summary.file],
    evidence: {
      evidenceDir: paths.evidenceDir,
      ok: evidenceValidation.ok,
      files: evidenceValidation.summary.files,
      signed: evidenceValidation.summary.signed === true
    },
    summary: {
      path: paths.summaryPath,
      format: summary.format,
      matchesComputedSummary: summary.matchesComputedSummary
    },
    report: {
      path: paths.reportPath,
      platform: report?.platform || '',
      arch: report?.arch || '',
      generatedAt: report?.generatedAt || '',
      structuralValidation: reportValidation,
      readinessValidation
    },
    errors,
    warnings
  }
  manifest.ok = errors.length === 0
  return manifest
}

const writeManifest = ({ manifest, outputPath, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const manifest = createWindowsSmokeArchiveManifest(options)
  const outputPath = writeManifest({ manifest, outputPath: resolveArchivePaths(options).outputPath })

  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2))
  } else {
    console.log(`Windows smoke archive manifest created: ${outputPath}`)
    console.log(`Archive valid: ${manifest.ok ? 'yes' : 'no'}`)
    console.log(`Windows release-ready: ${manifest.releaseReady ? 'yes' : 'no'}`)
    for (const warning of manifest.warnings) console.warn(`Warning: ${warning}`)
    for (const error of manifest.errors) console.error(`Error: ${error}`)
  }

  if (!manifest.ok) process.exit(1)
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
  createWindowsSmokeArchiveManifest,
  parseArgs,
  resolveArchivePaths,
  writeManifest
}
