const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { validateReport: validateWindowsSmokeReport } = require('./validate-windows-smoke-report')
const { validateReport: validateDesktopPickerSmokeReport } = require('./validate-desktop-picker-smoke-report')
const { validateReport: validatePackagedRuntimeSmokeReport } = require('./validate-packaged-runtime-smoke-report')

const DEFAULT_ARCHIVE_DIR = 'release-evidence-archive'
const DEFAULT_WINDOWS_SMOKE_REPORT = 'windows-smoke-report.json'
const DEFAULT_WINDOWS_SMOKE_ARCHIVE_MANIFEST = 'windows-smoke-archive-manifest.json'
const DEFAULT_DESKTOP_PICKER_REPORT = 'desktop-picker-smoke-report.json'
const DEFAULT_DESKTOP_PICKER_ARCHIVE_MANIFEST = 'desktop-picker-archive-manifest.json'
const DEFAULT_PACKAGED_RUNTIME_REPORT = 'packaged-runtime-smoke-report.json'
const DEFAULT_MACOS_CODESIGN_EVIDENCE = 'macos-codesign.txt'
const DEFAULT_MACOS_NOTARIZATION_EVIDENCE = 'macos-notarization.txt'
const DEFAULT_MACOS_GATEKEEPER_EVIDENCE = 'macos-gatekeeper.txt'
const DEFAULT_MANIFEST_NAME = 'release-evidence-archive-manifest.json'

const usage = () => [
  'Usage: node scripts/create-release-evidence-archive-manifest.js [--archive-dir <dir>] [options]',
  '',
  'Options:',
  '  --windows-smoke-report <report.json>',
  '  --windows-smoke-archive-manifest <manifest.json>',
  '  --desktop-picker-report <report.json>',
  '  --desktop-picker-archive-manifest <manifest.json>',
  '  --packaged-runtime-report <report.json>',
  '  --macos-codesign <evidence.txt>',
  '  --macos-notarization <evidence.txt>',
  '  --macos-gatekeeper <evidence.txt>',
  '  --output <manifest.json>',
  '  --require-signed',
  '  --json',
  '',
  'Creates a release-level evidence archive manifest. Archive validity and release readiness are separate: pending or unsigned evidence can be archived, but it cannot prove release readiness.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    archiveDir: DEFAULT_ARCHIVE_DIR,
    windowsSmokeReportPath: null,
    windowsSmokeArchiveManifestPath: null,
    desktopPickerReportPath: null,
    desktopPickerArchiveManifestPath: null,
    packagedRuntimeReportPath: null,
    macosCodesignPath: null,
    macosNotarizationPath: null,
    macosGatekeeperPath: null,
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
    } else if (arg === '--windows-smoke-report') {
      options.windowsSmokeReportPath = readValue(index, arg)
      index += 1
    } else if (arg === '--windows-smoke-archive-manifest') {
      options.windowsSmokeArchiveManifestPath = readValue(index, arg)
      index += 1
    } else if (arg === '--desktop-picker-report') {
      options.desktopPickerReportPath = readValue(index, arg)
      index += 1
    } else if (arg === '--desktop-picker-archive-manifest') {
      options.desktopPickerArchiveManifestPath = readValue(index, arg)
      index += 1
    } else if (arg === '--packaged-runtime-report') {
      options.packagedRuntimeReportPath = readValue(index, arg)
      index += 1
    } else if (arg === '--macos-codesign') {
      options.macosCodesignPath = readValue(index, arg)
      index += 1
    } else if (arg === '--macos-notarization') {
      options.macosNotarizationPath = readValue(index, arg)
      index += 1
    } else if (arg === '--macos-gatekeeper') {
      options.macosGatekeeperPath = readValue(index, arg)
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
  windowsSmokeReportPath = null,
  windowsSmokeArchiveManifestPath = null,
  desktopPickerReportPath = null,
  desktopPickerArchiveManifestPath = null,
  packagedRuntimeReportPath = null,
  macosCodesignPath = null,
  macosNotarizationPath = null,
  macosGatekeeperPath = null,
  outputPath = null
} = {}) => {
  const absoluteArchiveDir = path.resolve(archiveDir)
  const insideArchive = (fileName) => path.join(absoluteArchiveDir, fileName)
  return {
    archiveDir: absoluteArchiveDir,
    windowsSmokeReportPath: windowsSmokeReportPath ? path.resolve(windowsSmokeReportPath) : insideArchive(DEFAULT_WINDOWS_SMOKE_REPORT),
    windowsSmokeArchiveManifestPath: windowsSmokeArchiveManifestPath ? path.resolve(windowsSmokeArchiveManifestPath) : insideArchive(DEFAULT_WINDOWS_SMOKE_ARCHIVE_MANIFEST),
    desktopPickerReportPath: desktopPickerReportPath ? path.resolve(desktopPickerReportPath) : insideArchive(DEFAULT_DESKTOP_PICKER_REPORT),
    desktopPickerArchiveManifestPath: desktopPickerArchiveManifestPath ? path.resolve(desktopPickerArchiveManifestPath) : insideArchive(DEFAULT_DESKTOP_PICKER_ARCHIVE_MANIFEST),
    packagedRuntimeReportPath: packagedRuntimeReportPath ? path.resolve(packagedRuntimeReportPath) : insideArchive(DEFAULT_PACKAGED_RUNTIME_REPORT),
    macosCodesignPath: macosCodesignPath ? path.resolve(macosCodesignPath) : insideArchive(DEFAULT_MACOS_CODESIGN_EVIDENCE),
    macosNotarizationPath: macosNotarizationPath ? path.resolve(macosNotarizationPath) : insideArchive(DEFAULT_MACOS_NOTARIZATION_EVIDENCE),
    macosGatekeeperPath: macosGatekeeperPath ? path.resolve(macosGatekeeperPath) : insideArchive(DEFAULT_MACOS_GATEKEEPER_EVIDENCE),
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

const loadJsonFile = (filePath, fsImpl = fs) => JSON.parse(fsImpl.readFileSync(filePath, 'utf-8'))

const normalizeLinkedReportPath = (linkedPath, archiveDir) => {
  if (!linkedPath || typeof linkedPath !== 'string') return ''
  const trimmed = linkedPath.trim()
  if (!trimmed) return ''
  return path.resolve(archiveDir, trimmed)
}

const validateReportFile = ({ role, filePath, validateReport, requireSigned, fsImpl = fs }) => {
  const file = describeFile({ role, filePath, fsImpl })
  const errors = []
  const warnings = []
  if (!file.exists) {
    errors.push(`missing ${role}: ${filePath}`)
    return { file, report: null, structuralValidation: null, readinessValidation: null, releaseReady: false, errors, warnings }
  }

  try {
    const report = loadJsonFile(filePath, fsImpl)
    const structuralValidation = validateReport(report, { allowPending: true, requireSigned })
    const readinessValidation = validateReport(report, { allowPending: false, requireSigned })
    errors.push(...structuralValidation.errors.map((error) => `${role}: ${error}`))
    warnings.push(...structuralValidation.warnings.map((warning) => `${role}: ${warning}`))
    if (!readinessValidation.ok) warnings.push(`${role} is archived but not release-ready`)
    return {
      file,
      report: {
        platform: report.platform || '',
        arch: report.arch || '',
        generatedAt: report.generatedAt || '',
        artifact: report.artifact || {},
        linkedEvidence: report.linkedEvidence || {}
      },
      structuralValidation,
      readinessValidation,
      releaseReady: readinessValidation.ok,
      errors,
      warnings
    }
  } catch (err) {
    errors.push(`${role} could not be parsed: ${err.message || err}`)
    return { file, report: null, structuralValidation: null, readinessValidation: null, releaseReady: false, errors, warnings }
  }
}

const findFileByRole = (files, role) => Array.isArray(files)
  ? files.find((file) => file && file.role === role)
  : null

const validateLinkedArchiveManifestFile = ({
  role,
  filePath,
  reportFile: expectedReportFile,
  reportRoleLabel,
  requireSigned,
  fsImpl = fs
}) => {
  const file = describeFile({ role, filePath, fsImpl })
  const errors = []
  const warnings = []
  const details = {
    path: '',
    archiveDir: '',
    outputPath: '',
    ok: false,
    releaseReady: false,
    reportPath: '',
    reportSha256: '',
    summaryPath: '',
    matchesReport: false,
    matchesDesktopPickerReport: false
  }

  if (!file.exists) {
    errors.push(`missing ${role}: ${filePath}`)
    return { file, ...details, errors, warnings }
  }

  try {
    const manifest = loadJsonFile(filePath, fsImpl)
    const archiveReportFile = findFileByRole(manifest.files, 'report')
    const reportedPath = manifest.report?.path || archiveReportFile?.path || ''
    const reportedSha256 = archiveReportFile?.sha256 || ''
    const expectedPath = expectedReportFile?.path ? path.resolve(expectedReportFile.path) : ''
    const actualPath = reportedPath ? path.resolve(reportedPath) : ''
    const pathMatches = Boolean(actualPath && expectedPath && actualPath === expectedPath)
    const hashMatches = Boolean(reportedSha256 && expectedReportFile?.sha256 && reportedSha256 === expectedReportFile.sha256)
    const matchesReport = Boolean(pathMatches && hashMatches)

    details.path = path.resolve(filePath)
    details.archiveDir = manifest.archive?.archiveDir || ''
    details.outputPath = manifest.archive?.outputPath || ''
    details.reportPath = reportedPath
    details.reportSha256 = reportedSha256
    details.summaryPath = manifest.summary?.path || ''
    details.matchesReport = matchesReport
    details.matchesDesktopPickerReport = matchesReport
    details.ok = manifest.ok === true && matchesReport
    details.releaseReady = details.ok && manifest.releaseReady === true

    if (manifest.ok !== true) errors.push(`${role} is not valid`)
    if (!reportedPath) errors.push(`${role} does not record a ${reportRoleLabel} path`)
    if (!reportedSha256) errors.push(`${role} does not record the ${reportRoleLabel} hash`)
    if (reportedPath && !pathMatches) {
      errors.push(`${role} references a different ${reportRoleLabel}: ${reportedPath}`)
    }
    if (reportedSha256 && !hashMatches) {
      errors.push(`${role} records a stale ${reportRoleLabel} hash`)
    }
    if (!details.releaseReady) warnings.push(`${role} is archived but not release-ready`)
    if (requireSigned && manifest.ok === true && !details.releaseReady) {
      warnings.push(`${role} does not prove signed ${reportRoleLabel} archive readiness`)
    }
  } catch (err) {
    errors.push(`${role} could not be parsed: ${err.message || err}`)
  }

  return { file, ...details, errors, warnings }
}

const macosEvidenceStatus = ({ content, kind }) => {
  const text = String(content || '')
  if (kind === 'codesign') {
    return /valid on disk/i.test(text) && /satisfies its Designated Requirement/i.test(text) ? 'pass' : 'pending'
  }
  if (kind === 'notarization') {
    return /(^|\n)\s*status\s*:\s*accepted\s*(\r?\n|$)/i.test(text) ? 'pass' : 'pending'
  }
  if (kind === 'gatekeeper') {
    const accepted = /(^|\n).*:\s*accepted\s*(\r?\n|$)/i.test(text) || /(^|\n)\s*accepted\s*(\r?\n|$)/i.test(text)
    return accepted && !/\bnot accepted\b/i.test(text) ? 'pass' : 'pending'
  }
  return 'pending'
}

const validateMacosEvidenceFile = ({ role, filePath, kind, requireSigned, fsImpl = fs }) => {
  const file = describeFile({ role, filePath, fsImpl })
  const errors = []
  const warnings = []
  let status = 'missing'

  if (!file.exists) {
    const message = `missing ${role}: ${filePath}`
    if (requireSigned) errors.push(message)
    else warnings.push(message)
    return { file, status, releaseReady: false, errors, warnings }
  }

  const content = fsImpl.readFileSync(filePath, 'utf-8')
  status = macosEvidenceStatus({ content, kind })
  if (status !== 'pass') {
    const message = `${role} does not prove ${kind} success`
    if (requireSigned) errors.push(message)
    else warnings.push(message)
  }

  return { file, status, releaseReady: status === 'pass', errors, warnings }
}

const createReleaseEvidenceArchiveManifest = ({
  archiveDir = DEFAULT_ARCHIVE_DIR,
  windowsSmokeReportPath = null,
  windowsSmokeArchiveManifestPath = null,
  desktopPickerReportPath = null,
  desktopPickerArchiveManifestPath = null,
  packagedRuntimeReportPath = null,
  macosCodesignPath = null,
  macosNotarizationPath = null,
  macosGatekeeperPath = null,
  outputPath = null,
  requireSigned = false,
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  const paths = resolveArchivePaths({
    archiveDir,
    windowsSmokeReportPath,
    windowsSmokeArchiveManifestPath,
    desktopPickerReportPath,
    desktopPickerArchiveManifestPath,
    packagedRuntimeReportPath,
    macosCodesignPath,
    macosNotarizationPath,
    macosGatekeeperPath,
    outputPath
  })
  const errors = []
  const warnings = []

  const reports = {
    windowsSmoke: validateReportFile({
      role: 'windowsSmokeReport',
      filePath: paths.windowsSmokeReportPath,
      validateReport: validateWindowsSmokeReport,
      requireSigned,
      fsImpl
    }),
    desktopPicker: validateReportFile({
      role: 'desktopPickerReport',
      filePath: paths.desktopPickerReportPath,
      validateReport: validateDesktopPickerSmokeReport,
      requireSigned,
      fsImpl
    }),
    packagedRuntime: validateReportFile({
      role: 'packagedRuntimeReport',
      filePath: paths.packagedRuntimeReportPath,
      validateReport: validatePackagedRuntimeSmokeReport,
      requireSigned,
      fsImpl
    })
  }

  const macos = {
    codesign: validateMacosEvidenceFile({
      role: 'macosCodesignEvidence',
      filePath: paths.macosCodesignPath,
      kind: 'codesign',
      requireSigned,
      fsImpl
    }),
    notarization: validateMacosEvidenceFile({
      role: 'macosNotarizationEvidence',
      filePath: paths.macosNotarizationPath,
      kind: 'notarization',
      requireSigned,
      fsImpl
    }),
    gatekeeper: validateMacosEvidenceFile({
      role: 'macosGatekeeperEvidence',
      filePath: paths.macosGatekeeperPath,
      kind: 'gatekeeper',
      requireSigned,
      fsImpl
    })
  }

  const archives = {
    windowsSmoke: validateLinkedArchiveManifestFile({
      role: 'windowsSmokeArchiveManifest',
      filePath: paths.windowsSmokeArchiveManifestPath,
      reportFile: reports.windowsSmoke.file,
      reportRoleLabel: 'Windows smoke report',
      requireSigned,
      fsImpl
    }),
    desktopPicker: validateLinkedArchiveManifestFile({
      role: 'desktopPickerArchiveManifest',
      filePath: paths.desktopPickerArchiveManifestPath,
      reportFile: reports.desktopPicker.file,
      reportRoleLabel: 'desktop picker report',
      requireSigned,
      fsImpl
    })
  }

  for (const section of [...Object.values(reports), ...Object.values(macos), ...Object.values(archives)]) {
    errors.push(...section.errors)
    warnings.push(...section.warnings)
  }

  if (reports.packagedRuntime.report && reports.desktopPicker.file.exists) {
    const linkedPickerPath = normalizeLinkedReportPath(
      reports.packagedRuntime.report.artifact?.linkedEvidence?.desktopPickerSmokeReport
        || reports.packagedRuntime.report.linkedEvidence?.desktopPickerSmokeReport,
      paths.archiveDir
    )
    const expectedPickerPath = path.resolve(paths.desktopPickerReportPath)
    if (linkedPickerPath && linkedPickerPath !== expectedPickerPath) {
      errors.push(`packagedRuntimeReport links a different desktop picker report: ${linkedPickerPath}`)
    }
  }

  const macosReady = Object.values(macos).every((section) => section.releaseReady)
  const reportsReady = Object.values(reports).every((section) => section.releaseReady)
  const archivesReady = Object.values(archives).every((section) => section.releaseReady)
  const releaseReady = requireSigned && errors.length === 0 && macosReady && reportsReady && archivesReady

  const manifest = {
    generatedAt: now().toISOString(),
    requireSigned,
    ok: errors.length === 0,
    releaseReady,
    archive: {
      archiveDir: paths.archiveDir,
      outputPath: paths.outputPath
    },
    files: [
      reports.windowsSmoke.file,
      archives.windowsSmoke.file,
      reports.desktopPicker.file,
      archives.desktopPicker.file,
      reports.packagedRuntime.file,
      macos.codesign.file,
      macos.notarization.file,
      macos.gatekeeper.file
    ],
    macos: {
      releaseReady: macosReady,
      codesign: { status: macos.codesign.status, file: macos.codesign.file },
      notarization: { status: macos.notarization.status, file: macos.notarization.file },
      gatekeeper: { status: macos.gatekeeper.status, file: macos.gatekeeper.file }
    },
    reports: {
      releaseReady: reportsReady,
      windowsSmoke: reports.windowsSmoke,
      desktopPicker: reports.desktopPicker,
      packagedRuntime: reports.packagedRuntime
    },
    archives: {
      releaseReady: archivesReady,
      windowsSmoke: archives.windowsSmoke,
      desktopPicker: archives.desktopPicker
    },
    errors,
    warnings
  }

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

  const manifest = createReleaseEvidenceArchiveManifest(options)
  const outputPath = writeManifest({ manifest, outputPath: resolveArchivePaths(options).outputPath })

  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2))
  } else {
    console.log(`Release evidence archive manifest created: ${outputPath}`)
    console.log(`Archive valid: ${manifest.ok ? 'yes' : 'no'}`)
    console.log(`Release-ready: ${manifest.releaseReady ? 'yes' : 'no'}`)
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
  createReleaseEvidenceArchiveManifest,
  macosEvidenceStatus,
  parseArgs,
  resolveArchivePaths,
  writeManifest
}
