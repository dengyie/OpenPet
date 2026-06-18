const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-plugin-cleanup-evidence-report')

const DEFAULT_ARCHIVE_DIR = 'plugin-cleanup-evidence-archive'
const DEFAULT_REPORT_NAME = 'plugin-cleanup-evidence-report.json'
const DEFAULT_COLLECTOR_NAME = 'plugin-cleanup-evidence-collector.sh'
const DEFAULT_EVIDENCE_DIR_NAME = 'plugin-cleanup-evidence-collected'
const DEFAULT_MANIFEST_NAME = 'plugin-cleanup-evidence-archive-manifest.json'

const REQUIRED_EVIDENCE_FILES = [
  'environment.txt',
  'report-structure-validation.txt',
  'cleanup-controlled-fixture-output.json',
  'cleanup-controlled-fixture-stderr.txt',
  'cleanup-controlled-fixture-status.txt',
  'manual-checks.md',
  'update-report-commands.md'
]

const usage = () => [
  'Usage: node scripts/create-plugin-cleanup-evidence-archive-manifest.js [--archive-dir <dir>] [--report <report.json>] [--collector <collector.sh>] [--evidence-dir <dir>] [--output <manifest.json>] [--json]',
  '',
  `Defaults to ./${DEFAULT_ARCHIVE_DIR} with the standard plugin cleanup evidence filenames.`,
  'Creates a hash manifest for a reviewed plugin cleanup evidence archive.',
  'Archive validity and plugin cleanup readiness are separate: pending evidence can be archived, but it cannot prove cleanup readiness.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    archiveDir: DEFAULT_ARCHIVE_DIR,
    reportPath: null,
    collectorPath: null,
    evidenceDir: null,
    outputPath: null,
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
    } else if (arg === '--collector') {
      options.collectorPath = readValue(index, arg)
      index += 1
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = readValue(index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
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
  collectorPath = null,
  evidenceDir = null,
  outputPath = null
} = {}) => {
  const absoluteArchiveDir = path.resolve(archiveDir)
  const insideArchive = (fileName) => path.join(absoluteArchiveDir, fileName)
  return {
    archiveDir: absoluteArchiveDir,
    reportPath: reportPath ? path.resolve(reportPath) : insideArchive(DEFAULT_REPORT_NAME),
    collectorPath: collectorPath ? path.resolve(collectorPath) : insideArchive(DEFAULT_COLLECTOR_NAME),
    evidenceDir: evidenceDir ? path.resolve(evidenceDir) : insideArchive(DEFAULT_EVIDENCE_DIR_NAME),
    outputPath: outputPath ? path.resolve(outputPath) : insideArchive(DEFAULT_MANIFEST_NAME)
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

const walkEvidenceFiles = ({ evidenceDir, fsImpl = fs }) => {
  const files = []
  const errors = []

  if (!fsImpl.existsSync(evidenceDir)) {
    return { files, errors: [`evidence directory is missing: ${evidenceDir}`] }
  }
  const rootStat = fsImpl.lstatSync(evidenceDir)
  if (rootStat.isSymbolicLink()) {
    return { files, errors: [`evidence directory must not be a symlink: ${evidenceDir}`] }
  }
  if (!rootStat.isDirectory()) {
    return { files, errors: [`evidence path is not a directory: ${evidenceDir}`] }
  }

  const walk = (dir) => {
    for (const entry of fsImpl.readdirSync(dir).sort()) {
      const entryPath = path.join(dir, entry)
      const relativePath = path.relative(evidenceDir, entryPath).replace(/\\/g, '/')
      const stat = fsImpl.lstatSync(entryPath)
      if (stat.isSymbolicLink()) {
        errors.push(`evidence file must not be a symlink: ${relativePath}`)
      } else if (stat.isDirectory()) {
        walk(entryPath)
      } else if (stat.isFile()) {
        const content = fsImpl.readFileSync(entryPath)
        files.push({
          role: 'evidence',
          file: relativePath,
          path: entryPath,
          bytes: content.length,
          sha256: sha256(content)
        })
      }
    }
  }

  walk(evidenceDir)
  return { files, errors }
}

const loadJsonFile = (filePath, fsImpl = fs) => JSON.parse(fsImpl.readFileSync(filePath, 'utf-8'))

const validateCollectorFile = ({ collectorPath, fsImpl = fs }) => {
  const file = describeFile({ role: 'collector', filePath: collectorPath, fsImpl })
  const errors = []
  const warnings = []

  if (!file.exists) {
    errors.push(file.error ? `collector: ${file.error}` : `missing archive file: ${collectorPath}`)
    return { file, conservativeWording: false, avoidsPassShortcut: false, errors, warnings }
  }

  const content = fsImpl.readFileSync(collectorPath, 'utf-8')
  const conservativeWording = content.includes('does not prove cleanup readiness')
  const avoidsPassShortcut = !content.includes('--status pass')

  if (!conservativeWording) errors.push('collector must state that it does not prove cleanup readiness')
  if (!avoidsPassShortcut) errors.push('collector must not include --status pass')
  if (!content.includes('manual-checks.md')) warnings.push('collector does not mention manual-checks.md')
  if (!content.includes('update-report-commands.md')) warnings.push('collector does not mention update-report-commands.md')

  return { file, conservativeWording, avoidsPassShortcut, errors, warnings }
}

const validateEvidenceFiles = ({ evidenceDir, files, fsImpl = fs }) => {
  const errors = []
  const warnings = []
  const byName = new Set(files.map((file) => file.file))

  for (const fileName of REQUIRED_EVIDENCE_FILES) {
    if (!byName.has(fileName)) errors.push(`missing evidence file: ${path.join(evidenceDir, fileName)}`)
  }

  const readEvidence = (fileName) => {
    const filePath = path.join(evidenceDir, fileName)
    if (!fsImpl.existsSync(filePath)) return ''
    const stat = fsImpl.lstatSync(filePath)
    if (!stat.isFile() || stat.isSymbolicLink()) return ''
    return fsImpl.readFileSync(filePath, 'utf-8')
  }

  const validationText = readEvidence('report-structure-validation.txt')
  if (validationText && !validationText.includes('Report structure is valid.')) {
    errors.push('report-structure-validation.txt must show pending report validation succeeded')
  }

  const manualChecks = readEvidence('manual-checks.md')
  for (const check of REQUIRED_CHECKS) {
    if (manualChecks && !manualChecks.includes(`\`${check.id}\``)) {
      errors.push(`manual-checks.md is missing required cleanup check: ${check.id}`)
    }
  }

  const commandNotes = readEvidence('update-report-commands.md')
  if (commandNotes && !commandNotes.includes('npm run update-plugin-cleanup-evidence-report')) {
    errors.push('update-report-commands.md must reference the cleanup report updater')
  }
  if (commandNotes && commandNotes.includes('--status pass')) {
    errors.push('update-report-commands.md must not include --status pass')
  }
  if (commandNotes && !commandNotes.includes('Do not use these commands to mark checks as pass')) {
    warnings.push('update-report-commands.md does not include the standard pass-warning')
  }

  return {
    requiredFiles: REQUIRED_EVIDENCE_FILES,
    requiredFilesPresent: errors.filter((error) => error.startsWith('missing evidence file:')).length === 0,
    errors,
    warnings
  }
}

const createPluginCleanupEvidenceArchiveManifest = ({
  archiveDir = DEFAULT_ARCHIVE_DIR,
  reportPath = null,
  collectorPath = null,
  evidenceDir = null,
  outputPath = null,
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  const paths = resolveArchivePaths({ archiveDir, reportPath, collectorPath, evidenceDir, outputPath })
  const reportFile = describeFile({ role: 'report', filePath: paths.reportPath, fsImpl })
  const collector = validateCollectorFile({ collectorPath: paths.collectorPath, fsImpl })
  const errors = []
  const warnings = []
  let report = null
  let structuralValidation = { ok: false, errors: ['report could not be loaded'], warnings: [], summary: { passed: 0, total: REQUIRED_CHECKS.length, cleanupReady: false } }
  let readinessValidation = { ok: false, errors: ['report could not be loaded'], warnings: [], summary: { passed: 0, total: REQUIRED_CHECKS.length, cleanupReady: false } }

  if (!reportFile.exists) {
    errors.push(reportFile.error ? `report: ${reportFile.error}` : `missing archive file: ${paths.reportPath}`)
  } else {
    try {
      report = loadJsonFile(paths.reportPath, fsImpl)
      structuralValidation = validateReport(report, { allowPending: true })
      readinessValidation = validateReport(report, { allowPending: false })
      errors.push(...structuralValidation.errors.map((error) => `report: ${error}`))
      warnings.push(...structuralValidation.warnings.map((warning) => `report: ${warning}`))
      if (!readinessValidation.ok) warnings.push('archive is valid but does not prove plugin cleanup readiness until every required check passes with evidence')
    } catch (err) {
      errors.push(`report could not be parsed: ${err.message || err}`)
    }
  }

  errors.push(...collector.errors)
  warnings.push(...collector.warnings)

  const walkedEvidence = walkEvidenceFiles({ evidenceDir: paths.evidenceDir, fsImpl })
  errors.push(...walkedEvidence.errors)
  const evidenceValidation = validateEvidenceFiles({ evidenceDir: paths.evidenceDir, files: walkedEvidence.files, fsImpl })
  errors.push(...evidenceValidation.errors)
  warnings.push(...evidenceValidation.warnings)

  const manifest = {
    generatedAt: now().toISOString(),
    ok: false,
    cleanupReady: false,
    archive: {
      archiveDir: paths.archiveDir,
      outputPath: paths.outputPath
    },
    files: [reportFile, collector.file],
    collector: {
      path: paths.collectorPath,
      conservativeWording: collector.conservativeWording,
      avoidsPassShortcut: collector.avoidsPassShortcut
    },
    evidence: {
      evidenceDir: paths.evidenceDir,
      requiredFiles: evidenceValidation.requiredFiles,
      requiredFilesPresent: evidenceValidation.requiredFilesPresent,
      files: walkedEvidence.files
    },
    report: {
      path: paths.reportPath,
      schemaVersion: report?.schemaVersion || '',
      generatedAt: report?.generatedAt || '',
      source: report?.source || '',
      environment: report?.environment || {},
      scenario: report?.scenario || {},
      structuralValidation,
      readinessValidation
    },
    errors,
    warnings
  }
  manifest.ok = errors.length === 0
  manifest.cleanupReady = Boolean(manifest.ok && readinessValidation.ok)
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

  const manifest = createPluginCleanupEvidenceArchiveManifest(options)
  const paths = resolveArchivePaths(options)
  const outputPath = writeManifest({ manifest, outputPath: paths.outputPath })

  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2))
  } else {
    console.log(`Plugin cleanup evidence archive manifest created: ${outputPath}`)
    console.log(`Archive valid: ${manifest.ok ? 'yes' : 'no'}`)
    console.log(`Plugin cleanup ready: ${manifest.cleanupReady ? 'yes' : 'no'}`)
    if (manifest.errors.length > 0) console.log(`Errors: ${manifest.errors.length}`)
    if (manifest.warnings.length > 0) console.log(`Warnings: ${manifest.warnings.length}`)
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
  DEFAULT_ARCHIVE_DIR,
  REQUIRED_EVIDENCE_FILES,
  createPluginCleanupEvidenceArchiveManifest,
  parseArgs,
  resolveArchivePaths,
  writeManifest
}
