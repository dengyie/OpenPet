const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-windows-smoke-report')
const {
  DEFAULT_EVIDENCE_DIR,
  REQUIRED_EVIDENCE_FILES,
  validateEvidenceBundle
} = require('./validate-windows-smoke-evidence-bundle')

const STATUS_ORDER = ['pass', 'fail', 'pending', 'blocked']

const usage = () => [
  'Usage: node scripts/create-windows-smoke-evidence-summary.js [evidence-dir] [--evidence-dir <dir>] [--report <report.json>] [--require-signed] [--output <summary.md>] [--json]',
  '',
  `Defaults to ./${DEFAULT_EVIDENCE_DIR}.`,
  'Creates an auditable summary of a Windows smoke evidence directory and optional paired smoke report.',
  '--require-signed keeps the existing signed-evidence gate; it does not mark runtime smoke checks as passed.',
  '--json writes the structured summary instead of Markdown.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    evidenceDir: null,
    reportPath: null,
    requireSigned: false,
    outputPath: null,
    json: false,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

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
  return options
}

const loadReport = (reportPath) => {
  const absoluteReportPath = path.resolve(reportPath)
  return {
    absoluteReportPath,
    report: JSON.parse(fs.readFileSync(absoluteReportPath, 'utf-8'))
  }
}

const countChecksByStatus = (checks = []) => {
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]))
  const byStatus = Object.fromEntries(STATUS_ORDER.map((status) => [status, []]))

  for (const check of checks) {
    const status = STATUS_ORDER.includes(check?.status) ? check.status : 'unknown'
    if (!counts[status]) counts[status] = 0
    if (!byStatus[status]) byStatus[status] = []
    counts[status] += 1
    byStatus[status].push(check?.id || '(missing id)')
  }

  return { counts, byStatus }
}

const summarizeReport = ({ reportPath, requireSigned }) => {
  if (!reportPath) return null

  try {
    const { absoluteReportPath, report } = loadReport(reportPath)
    const structuralValidation = validateReport(report, { allowPending: true, requireSigned })
    const readinessValidation = validateReport(report, { allowPending: false, requireSigned })
    const checks = Array.isArray(report.checks) ? report.checks : []
    const checkSummary = countChecksByStatus(checks)

    return {
      reportPath: absoluteReportPath,
      platform: report.platform || '',
      arch: report.arch || '',
      generatedAt: report.generatedAt || '',
      artifact: {
        version: report.artifact?.version || '',
        installer: report.artifact?.installer || '',
        zip: report.artifact?.zip || '',
        latestYml: report.artifact?.latestYml || '',
        signed: report.artifact?.signed === true,
        authenticodeStatus: report.artifact?.authenticodeStatus || ''
      },
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
      error: err.message || String(err)
    }
  }
}

const createWindowsSmokeEvidenceSummary = ({
  evidenceDir = DEFAULT_EVIDENCE_DIR,
  reportPath = null,
  requireSigned = false,
  now = () => new Date()
} = {}) => {
  const evidenceValidation = validateEvidenceBundle({ evidenceDir, reportPath, requireSigned })
  const report = summarizeReport({ reportPath, requireSigned })
  const reportHasLoadError = Boolean(report?.error)

  return {
    generatedAt: now().toISOString(),
    requireSigned,
    ok: evidenceValidation.ok && !reportHasLoadError,
    releaseReady: Boolean(report?.readinessValidation?.ok && evidenceValidation.ok),
    evidence: {
      evidenceDir: evidenceValidation.summary.evidenceDir,
      requiredFiles: REQUIRED_EVIDENCE_FILES,
      presentFiles: evidenceValidation.summary.files,
      presentCount: evidenceValidation.summary.files.length,
      requiredCount: evidenceValidation.summary.requiredFiles,
      signed: evidenceValidation.summary.signed === true
    },
    report,
    errors: [
      ...evidenceValidation.errors,
      ...(reportHasLoadError ? [`report: ${report.error}`] : [])
    ],
    warnings: evidenceValidation.warnings
  }
}

const boolText = (value) => (value ? 'yes' : 'no')

const renderMarkdownSummary = (summary) => {
  const lines = [
    '# Windows Smoke Evidence Summary',
    '',
    `Generated at: ${summary.generatedAt}`,
    `Evidence directory: ${summary.evidence.evidenceDir}`,
    `Signed evidence required: ${boolText(summary.requireSigned)}`,
    `Evidence/report validation valid: ${boolText(summary.ok)}`,
    `Windows release-ready: ${boolText(summary.releaseReady)}`,
    '',
    'This summary archives evidence metadata for review. Pending or unsigned evidence does not prove Windows release readiness; a real Windows smoke report must pass readiness validation, and official stable releases must also pass signed Authenticode validation.',
    '',
    '## Evidence Files',
    '',
    `Required files present: ${summary.evidence.presentCount}/${summary.evidence.requiredCount}`,
    `Authenticode evidence valid: ${boolText(summary.evidence.signed)}`,
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
    if (summary.report.error) {
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
        `| installer | ${summary.report.artifact.installer} |`,
        `| zip | ${summary.report.artifact.zip} |`,
        `| latestYml | ${summary.report.artifact.latestYml} |`,
        `| signed | ${boolText(summary.report.artifact.signed)} |`,
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

  const summary = createWindowsSmokeEvidenceSummary(options)
  if (options.outputPath) {
    const outputPath = writeSummary({ summary, outputPath: options.outputPath, json: options.json })
    console.log(`Windows smoke evidence summary created: ${outputPath}`)
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
    console.error(err.message || err)
    process.exit(1)
  }
}

module.exports = {
  createWindowsSmokeEvidenceSummary,
  parseArgs,
  renderMarkdownSummary,
  writeSummary
}
