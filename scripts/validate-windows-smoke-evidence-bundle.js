const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-windows-smoke-report')

const DEFAULT_EVIDENCE_DIR = 'windows-smoke-evidence'
const REQUIRED_EVIDENCE_FILES = [
  'environment.txt',
  'authenticode.txt',
  'process.txt',
  'install-registry.txt',
  'manual-checks.md',
  'update-report-commands.md'
]

const usage = () => [
  'Usage: node scripts/validate-windows-smoke-evidence-bundle.js [evidence-dir] [--report <report.json>] [--require-signature-integrity] [--json]',
  '',
  `Defaults to ./${DEFAULT_EVIDENCE_DIR}.`,
  'Validates the evidence files produced by windows-smoke-collector.ps1.',
  '--report validates the paired Windows smoke report with pending checks allowed.',
  '--require-signature-integrity requires Authenticode integrity evidence with Status : Valid.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    evidenceDir: null,
    reportPath: null,
    requireSignatureIntegrity: false,
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
    } else if (arg === '--report') {
      options.reportPath = readValue(index, arg)
      index += 1
    } else if (arg === '--require-signature-integrity') {
      options.requireSignatureIntegrity = true
    } else if (arg === '--require-signed') {
      options.requireSigned = true
    } else if (arg === '--json') {
      options.json = true
    } else if (!options.evidenceDir) {
      options.evidenceDir = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.evidenceDir) options.evidenceDir = DEFAULT_EVIDENCE_DIR
  return options
}

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

const createEvidenceManifest = ({ evidenceDir }) => {
  const absoluteEvidenceDir = path.resolve(evidenceDir)
  return REQUIRED_EVIDENCE_FILES.map((fileName) => {
    const filePath = path.join(absoluteEvidenceDir, fileName)
    const content = fs.readFileSync(filePath)
    return {
      file: fileName,
      bytes: content.length,
      sha256: sha256(content)
    }
  })
}

const hasValidAuthenticodeStatus = (content) => /(^|\n)\s*Status\s*:\s*Valid\s*(\r?\n|$)/i.test(content)

const loadReport = (reportPath) => {
  const absoluteReportPath = path.resolve(reportPath)
  return {
    absoluteReportPath,
    report: JSON.parse(fs.readFileSync(absoluteReportPath, 'utf-8'))
  }
}

const validateEvidenceBundle = ({ evidenceDir = DEFAULT_EVIDENCE_DIR, reportPath = null, requireSignatureIntegrity = false, requireSigned = false } = {}) => {
  const signatureGate = requireSignatureIntegrity || requireSigned
  const absoluteEvidenceDir = path.resolve(evidenceDir)
  const errors = []
  const warnings = []
  const files = []

  if (!fs.existsSync(absoluteEvidenceDir)) {
    errors.push(`evidence directory does not exist: ${absoluteEvidenceDir}`)
    return { ok: false, errors, warnings, summary: { evidenceDir: absoluteEvidenceDir, files, requiredFiles: REQUIRED_EVIDENCE_FILES.length } }
  }

  const stat = fs.statSync(absoluteEvidenceDir)
  if (!stat.isDirectory()) {
    errors.push(`evidence path is not a directory: ${absoluteEvidenceDir}`)
    return { ok: false, errors, warnings, summary: { evidenceDir: absoluteEvidenceDir, files, requiredFiles: REQUIRED_EVIDENCE_FILES.length } }
  }

  const contentsByFile = new Map()
  for (const fileName of REQUIRED_EVIDENCE_FILES) {
    const filePath = path.join(absoluteEvidenceDir, fileName)
    if (!fs.existsSync(filePath)) {
      errors.push(`missing required evidence file: ${fileName}`)
      continue
    }

    const fileStat = fs.statSync(filePath)
    if (!fileStat.isFile()) {
      errors.push(`required evidence path is not a file: ${fileName}`)
      continue
    }

    const content = fs.readFileSync(filePath)
    files.push({ file: fileName, bytes: content.length, sha256: sha256(content) })
    contentsByFile.set(fileName, content.toString('utf-8'))

    if (content.toString('utf-8').trim().length === 0) {
      errors.push(`required evidence file is empty: ${fileName}`)
    }
  }

  const manualChecks = contentsByFile.get('manual-checks.md') || ''
  for (const check of REQUIRED_CHECKS) {
    if (!manualChecks.includes(`\`${check.id}\``)) {
      errors.push(`manual-checks.md is missing required check id: ${check.id}`)
    }
  }

  const commandNotes = contentsByFile.get('update-report-commands.md') || ''
  if (/--status\s+pass/i.test(commandNotes)) {
    errors.push('update-report-commands.md must not include --status pass commands')
  }

  const authenticode = contentsByFile.get('authenticode.txt') || ''
  const signed = hasValidAuthenticodeStatus(authenticode)
  if (signatureGate && !signed) {
    errors.push('authenticode.txt must contain Authenticode evidence with Status : Valid when --require-signature-integrity is used')
  } else if (!signatureGate && !signed) {
    warnings.push('Authenticode status is not Valid; this evidence bundle cannot prove Windows signature integrity')
  }

  let reportSummary = null
  if (reportPath) {
    try {
      const { absoluteReportPath, report } = loadReport(reportPath)
      const reportValidation = validateReport(report, { allowPending: true, requireSignatureIntegrity: signatureGate })
      reportSummary = {
        reportPath: absoluteReportPath,
        passed: reportValidation.summary.passed,
        total: reportValidation.summary.total,
        smokeReady: reportValidation.summary.smokeReady,
        signatureIntegrityReady: reportValidation.summary.signatureIntegrityReady
      }
      warnings.push(...reportValidation.warnings)
      errors.push(...reportValidation.errors.map((error) => `report: ${error}`))
    } catch (err) {
      errors.push(`unable to validate report: ${err.message || err}`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      evidenceDir: absoluteEvidenceDir,
      files,
      requiredFiles: REQUIRED_EVIDENCE_FILES.length,
      signed,
      report: reportSummary
    }
  }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = validateEvidenceBundle(options)

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Windows smoke evidence bundle: ${result.summary.evidenceDir}`)
    console.log(`Evidence files: ${result.summary.files.length}/${result.summary.requiredFiles} required files present`)
    if (result.summary.report) {
      console.log(`Paired report checks: ${result.summary.report.passed}/${result.summary.report.total} passed`)
    }
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
    for (const error of result.errors) console.error(`Error: ${error}`)
    if (result.ok) {
      console.log('Evidence bundle structure is valid. Windows release readiness still requires a filled smoke report and real validation evidence.')
    }
  }

  if (!result.ok) process.exit(1)
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
  DEFAULT_EVIDENCE_DIR,
  REQUIRED_EVIDENCE_FILES,
  createEvidenceManifest,
  hasValidAuthenticodeStatus,
  parseArgs,
  validateEvidenceBundle
}
