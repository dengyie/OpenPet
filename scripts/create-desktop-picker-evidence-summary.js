// @ts-check

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-desktop-picker-smoke-report')

const DEFAULT_EVIDENCE_DIR = 'desktop-picker-evidence'
const STATUS_ORDER = ['pass', 'fail', 'pending', 'blocked']

/** @typedef {import('../src/shared/openpet-contracts').DesktopPickerEvidenceSummary} DesktopPickerEvidenceSummary */
/** @typedef {import('../src/shared/openpet-contracts').DesktopPickerEvidenceReport} DesktopPickerEvidenceReport */
/** @typedef {import('../src/shared/openpet-contracts').DesktopPickerEvidenceFile} DesktopPickerEvidenceFile */
/** @typedef {import('../src/shared/openpet-contracts').DesktopPickerSmokeCheck} DesktopPickerSmokeCheck */
/** @typedef {import('../src/shared/openpet-contracts').DesktopPickerSmokeReport} DesktopPickerSmokeReport */
/** @typedef {import('../src/shared/openpet-contracts').DesktopPickerValidationResult} DesktopPickerValidationResult */
/** @typedef {{ evidenceDir: string, reportPath: string | null, requireSigned: boolean, outputPath: string | null, json: boolean, help: boolean }} CliOptions */
/** @typedef {{ evidenceDir: string | null, reportPath: string | null, requireSigned: boolean, outputPath: string | null, json: boolean, help: boolean }} CliParseState */
/** @typedef {{ evidenceDir?: string, reportPath?: string | null, requireSigned?: boolean, now?: () => Date, fsImpl?: typeof fs }} SummaryOptions */
/** @typedef {{ summary: DesktopPickerEvidenceSummary, outputPath: string, json?: boolean, fsImpl?: typeof fs }} WriteSummaryOptions */

const usage = () => [
  'Usage: node scripts/create-desktop-picker-evidence-summary.js [evidence-dir] [--evidence-dir <dir>] [--report <report.json>] [--require-signed] [--output <summary.md>] [--json]',
  '',
  `Defaults to ./${DEFAULT_EVIDENCE_DIR}.`,
  'Creates an auditable summary of a desktop picker evidence directory and optional paired smoke report.',
  '--require-signed keeps the existing signed-evidence gate; it does not mark picker checks as passed.',
  '--json writes the structured summary instead of Markdown.'
].join('\n')

/** @param {string[]} argv @returns {CliOptions} */
const parseArgs = (argv) => {
  /** @type {CliParseState} */
  const options = {
    evidenceDir: null,
    reportPath: null,
    requireSigned: false,
    outputPath: null,
    json: false,
    help: false
  }

  /** @param {number} index @param {string} flag */
  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  /** @param {string} value */
  const setEvidenceDir = (value) => {
    if (options.evidenceDir) throw new Error('Evidence directory was provided more than once')
    options.evidenceDir = value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--evidence-dir') {
      setEvidenceDir(readValue(index, arg))
      index += 1
    } else if (arg === '--report') {
      options.reportPath = readValue(index, arg)
      index += 1
    } else if (arg === '--require-signed') {
      options.requireSigned = true
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else if (!arg.startsWith('--')) {
      setEvidenceDir(arg)
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.evidenceDir) options.evidenceDir = DEFAULT_EVIDENCE_DIR
  return /** @type {CliOptions} */ (options)
}

/** @param {crypto.BinaryLike} content @returns {string} */
const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

/** @param {string} evidenceDir @param {typeof fs} [fsImpl] @returns {DesktopPickerEvidenceFile[]} */
const describeEvidenceFiles = (evidenceDir, fsImpl = fs) => {
  const absoluteEvidenceDir = path.resolve(evidenceDir)
  if (!fsImpl.existsSync(absoluteEvidenceDir)) return []
  return fsImpl.readdirSync(absoluteEvidenceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(absoluteEvidenceDir, entry.name)
      const content = fsImpl.readFileSync(filePath)
      return {
        file: entry.name,
        path: filePath,
        bytes: content.length,
        sha256: sha256(content)
      }
    })
    .sort((a, b) => a.file.localeCompare(b.file))
}

/** @param {string} reportPath @param {typeof fs} [fsImpl] @returns {{ absoluteReportPath: string, report: DesktopPickerSmokeReport }} */
const loadReport = (reportPath, fsImpl = fs) => {
  const absoluteReportPath = path.resolve(reportPath)
  return {
    absoluteReportPath,
    report: /** @type {DesktopPickerSmokeReport} */ (JSON.parse(fsImpl.readFileSync(absoluteReportPath, 'utf-8')))
  }
}

/** @param {DesktopPickerSmokeCheck[]} [checks] */
const countChecksByStatus = (checks = []) => {
  /** @type {{ pass: number, fail: number, pending: number, blocked: number } & Record<string, number>} */
  const counts = { pass: 0, fail: 0, pending: 0, blocked: 0 }
  /** @type {{ pass: string[], fail: string[], pending: string[], blocked: string[] } & Record<string, string[]>} */
  const byStatus = { pass: [], fail: [], pending: [], blocked: [] }

  for (const check of checks) {
    const status = STATUS_ORDER.includes(check?.status) ? check.status : 'unknown'
    if (!counts[status]) counts[status] = 0
    if (!byStatus[status]) byStatus[status] = []
    counts[status] += 1
    byStatus[status].push(check?.id || '(missing id)')
  }

  return { counts, byStatus }
}

/**
 * @param {{ reportPath: string | null, requireSigned: boolean, fsImpl?: typeof fs }} options
 * @returns {DesktopPickerEvidenceReport | null}
 */
const summarizeReport = ({ reportPath, requireSigned, fsImpl = fs }) => {
  if (!reportPath) return null

  try {
    const { absoluteReportPath, report } = loadReport(reportPath, fsImpl)
    const structuralValidation = /** @type {DesktopPickerValidationResult} */ (validateReport(report, { allowPending: true, requireSigned }))
    const readinessValidation = /** @type {DesktopPickerValidationResult} */ (validateReport(report, { allowPending: false, requireSigned }))
    const checks = Array.isArray(report.checks) ? report.checks : []
    const checkSummary = countChecksByStatus(checks)

    return {
      reportPath: absoluteReportPath,
      platform: report.platform || '',
      arch: report.arch || '',
      generatedAt: report.generatedAt || '',
      artifact: {
        version: report.artifact?.version || '',
        appPath: report.artifact?.appPath || '',
        installer: report.artifact?.installer || '',
        zip: report.artifact?.zip || '',
        latestYml: report.artifact?.latestYml || '',
        signed: report.artifact?.signed === true,
        signatureStatus: report.artifact?.signatureStatus || '',
        authenticodeStatus: report.artifact?.authenticodeStatus || ''
      },
      fixtures: { ...report.fixture },
      checks: {
        total: REQUIRED_CHECKS.length,
        present: checks.length,
        counts: checkSummary.counts,
        byStatus: checkSummary.byStatus
      },
      structuralValidation: {
        ok: structuralValidation.ok,
        errors: structuralValidation.errors,
        warnings: structuralValidation.warnings,
        summary: structuralValidation.summary
      },
      readinessValidation: {
        ok: readinessValidation.ok,
        errors: readinessValidation.errors,
        warnings: readinessValidation.warnings,
        summary: readinessValidation.summary
      }
    }
  } catch (err) {
    return {
      reportPath: path.resolve(reportPath),
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/** @param {SummaryOptions} [options] @returns {DesktopPickerEvidenceSummary} */
const createDesktopPickerEvidenceSummary = ({
  evidenceDir = DEFAULT_EVIDENCE_DIR,
  reportPath = null,
  requireSigned = false,
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  const absoluteEvidenceDir = path.resolve(evidenceDir)
  const presentFiles = describeEvidenceFiles(absoluteEvidenceDir, fsImpl)
  const report = summarizeReport({ reportPath, requireSigned, fsImpl })
  const reportHasLoadError = Boolean(report && 'error' in report)
  const validReport = report && !('error' in report) ? report : null
  const evidenceDirExists = fsImpl.existsSync(absoluteEvidenceDir)

  const errors = [
    ...(!evidenceDirExists ? [`evidence directory is missing: ${absoluteEvidenceDir}`] : []),
    ...(report && 'error' in report ? [`report: ${report.error}`] : [])
  ]
  const warnings = [
    ...(requireSigned || validReport?.readinessValidation.summary.officialReady
      ? []
      : ['Pending or unsigned evidence cannot prove signed official desktop picker readiness'])
  ]

  return {
    generatedAt: now().toISOString(),
    requireSigned,
    ok: errors.length === 0 && !reportHasLoadError,
    releaseReady: Boolean(validReport?.readinessValidation.ok && errors.length === 0),
    evidence: {
      evidenceDir: absoluteEvidenceDir,
      presentFiles,
      presentCount: presentFiles.length
    },
    report,
    errors,
    warnings
  }
}

/** @param {unknown} value @returns {string} */
const boolText = (value) => (value ? 'yes' : 'no')

/** @param {DesktopPickerEvidenceSummary} summary @returns {string} */
const renderMarkdownSummary = (summary) => {
  const lines = [
    '# Desktop Picker Evidence Summary',
    '',
    `Generated at: ${summary.generatedAt}`,
    `Evidence directory: ${summary.evidence.evidenceDir}`,
    `Signed evidence required: ${boolText(summary.requireSigned)}`,
    `Evidence/report validation valid: ${boolText(summary.ok)}`,
    `Desktop picker smoke ready: ${boolText(summary.releaseReady)}`,
    '',
    'This summary archives evidence metadata for review. Pending or unsigned evidence does not prove desktop picker smoke readiness; a real packaged-app picker report must pass readiness validation, and official stable releases must also pass signed artifact validation.',
    '',
    '## Evidence Files',
    '',
    `Evidence files present: ${summary.evidence.presentCount}`,
    '',
    '| File | Bytes | SHA-256 |',
    '|------|-------|---------|'
  ]

  for (const file of summary.evidence.presentFiles) {
    lines.push(`| ${file.file} | ${file.bytes} | ${file.sha256} |`)
  }
  if (summary.evidence.presentFiles.length === 0) lines.push('| _(none)_ | 0 |  |')

  if (summary.report) {
    lines.push('', '## Paired Report', '')
    if ('error' in summary.report) {
      lines.push(`Report path: ${summary.report.reportPath}`, `Report error: ${summary.report.error}`)
    } else {
      lines.push(
        `Report path: ${summary.report.reportPath}`,
        `Platform: ${summary.report.platform}`,
        `Architecture: ${summary.report.arch}`,
        `Report generated at: ${summary.report.generatedAt || '(not recorded)'}`,
        '',
        '| Artifact Field | Value |',
        '|----------------|-------|',
        `| version | ${summary.report.artifact.version} |`,
        `| appPath | ${summary.report.artifact.appPath} |`,
        `| installer | ${summary.report.artifact.installer} |`,
        `| zip | ${summary.report.artifact.zip} |`,
        `| latestYml | ${summary.report.artifact.latestYml} |`,
        `| signed | ${boolText(summary.report.artifact.signed)} |`,
        `| signatureStatus | ${summary.report.artifact.signatureStatus} |`,
        `| authenticodeStatus | ${summary.report.artifact.authenticodeStatus} |`,
        '',
        '## Check Statuses',
        '',
        `Required checks present: ${summary.report.checks.present}/${summary.report.checks.total}`,
        '',
        '| Status | Count | Check IDs |',
        '|--------|-------|-----------|'
      )

      for (const status of STATUS_ORDER) {
        const ids = summary.report.checks.byStatus[status] || []
        lines.push(`| ${status} | ${summary.report.checks.counts[status] || 0} | ${ids.join(', ') || '-'} |`)
      }

      lines.push(
        '',
        '## Validation Flags',
        '',
        `Structural report validation: ${boolText(summary.report.structuralValidation.ok)}`,
        `Readiness validation: ${boolText(summary.report.readinessValidation.ok)}`,
        `Smoke ready: ${boolText(summary.report.readinessValidation.summary.smokeReady)}`,
        `Official signed ready: ${boolText(summary.report.readinessValidation.summary.officialReady)}`
      )
    }
  }

  if (summary.warnings.length > 0) {
    lines.push('', '## Warnings', '')
    for (const warning of summary.warnings) lines.push(`- ${warning}`)
  }

  if (summary.errors.length > 0) {
    lines.push('', '## Errors', '')
    for (const error of summary.errors) lines.push(`- ${error}`)
  }

  return `${lines.join('\n')}\n`
}

/** @param {WriteSummaryOptions} options @returns {string} */
const writeSummary = ({ summary, outputPath, json = false, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  const content = json ? `${JSON.stringify(summary, null, 2)}\n` : renderMarkdownSummary(summary)
  fsImpl.writeFileSync(absoluteOutputPath, content)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const summary = createDesktopPickerEvidenceSummary(options)
  if (options.outputPath) {
    const outputPath = writeSummary({ summary, outputPath: options.outputPath, json: options.json })
    console.log(`Desktop picker evidence summary created: ${outputPath}`)
  } else if (options.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    process.stdout.write(renderMarkdownSummary(summary))
  }

  if (!summary.ok) process.exit(1)
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

module.exports = {
  createDesktopPickerEvidenceSummary,
  parseArgs,
  renderMarkdownSummary,
  writeSummary
}
