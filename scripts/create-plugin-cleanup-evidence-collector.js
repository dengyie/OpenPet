const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-plugin-cleanup-evidence-report')

const DEFAULT_OUTPUT_NAME = 'plugin-cleanup-evidence-collector.sh'

const CHECK_GUIDANCE = {
  'service-exit-confirmed-stop': 'Attach service logs or terminal output showing the service stayed in stopping state until child exit confirmation.',
  'service-process-group-cleanup': 'Attach logs or process listings showing service stop attempted process-group cleanup.',
  'service-tree-fallback-cleanup': 'Attach process-tree evidence showing host-owned descendant cleanup was attempted when process-group cleanup failed.',
  'service-force-stop': 'Attach stubborn-service evidence showing exactly one bounded host-side force-stop attempt.',
  'setup-exit-confirmed-stop': 'Attach setup runtime logs showing stop completion only after child exit confirmation.',
  'setup-tree-fallback-cleanup': 'Attach setup cleanup logs or process listings showing tree fallback before direct child kill.',
  'command-exit-confirmed-stop': 'Attach declaration-command logs showing stop completion only after child exit confirmation.',
  'command-tree-fallback-cleanup': 'Attach declaration-command cleanup logs or process listings showing tree fallback before direct child kill.'
}

const usage = () => [
  'Usage: node scripts/create-plugin-cleanup-evidence-collector.js <report.json> [--output <collector.sh>]',
  '',
  'Creates a POSIX helper for collecting plugin cleanup evidence during real host validation.',
  'The collector gathers evidence only; it does not mark cleanup checks as passed.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    reportPath: null,
    outputPath: null,
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
    } else if (!options.reportPath) {
      options.reportPath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

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

const defaultOutputPath = (reportPath) => path.join(path.dirname(path.resolve(reportPath)), DEFAULT_OUTPUT_NAME)

const shellDoubleQuotedSegment = (value) => String(value).replace(/(["\\$`])/g, '\\$1')

const shellSingleQuotedValue = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

const markdownTableEscape = (value) => String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

const createManualChecklist = () => {
  const lines = []
  lines.push('# OpenPet Plugin Cleanup Evidence Manual Checklist')
  lines.push('')
  lines.push('This checklist is generated from the same required check matrix used by the cleanup evidence validator. Attach concrete evidence before marking any check as pass.')
  lines.push('')
  lines.push('| Check ID | What To Prove | Evidence Guidance |')
  lines.push('|----------|---------------|-------------------|')
  for (const check of REQUIRED_CHECKS) {
    lines.push(`| \`${check.id}\` | ${markdownTableEscape(check.label)} | ${markdownTableEscape(CHECK_GUIDANCE[check.id] || 'Record concrete evidence from the real host cleanup validation run.')} |`)
  }
  lines.push('')
  return lines.join('\n')
}

const createCommandNotes = ({ reportFileName }) => {
  const quotedReportFileName = shellSingleQuotedValue(reportFileName)
  const lines = []
  lines.push('# OpenPet Plugin Cleanup Evidence Update Commands')
  lines.push('')
  lines.push('Run these from the repository root after reviewing the collected evidence. Replace placeholders with concrete file paths or transcript excerpts.')
  lines.push('')
  lines.push('```bash')
  lines.push(`npm run update-plugin-cleanup-evidence-report -- ${quotedReportFileName} --set-env machine="$(hostname)" --set-env runner="manual plugin cleanup validation" --set-env evidence="<evidence directory or transcript link>"`)
  lines.push(`npm run validate-plugin-cleanup-evidence-report -- ${quotedReportFileName} --allow-pending`)
  lines.push('```')
  lines.push('')
  lines.push('Do not use these commands to mark checks as pass until the matching real-host cleanup evidence exists.')
  lines.push('')
  return lines.join('\n')
}

const hereDoc = ({ file, marker, content }) => [
  `cat > "$EVIDENCE_DIR/${file}" <<'${marker}'`,
  String(content).replace(/\r\n/g, '\n').trimEnd(),
  marker
].join('\n')

const createCollector = ({ report, reportPath, generatedAt = new Date() }) => {
  const validation = validateReport(report, { allowPending: true })
  if (!validation.ok) {
    throw new Error(`Cannot create plugin cleanup evidence collector from an invalid report: ${validation.errors.join('; ')}`)
  }

  const reportFileName = path.resolve(reportPath || 'plugin-cleanup-evidence-report.json')
  const manualChecklist = createManualChecklist()
  const commandNotes = createCommandNotes({ reportFileName })
  const escapedReportPath = shellDoubleQuotedSegment(reportFileName)
  const lines = []

  lines.push('#!/usr/bin/env bash')
  lines.push('# Collects local plugin cleanup evidence for an OpenPet validation session.')
  lines.push('# This helper does not mark cleanup checks as passed and does not prove cleanup readiness.')
  lines.push(`# Generated: ${generatedAt.toISOString()}`)
  lines.push('')
  lines.push('set -euo pipefail')
  lines.push('')
  lines.push('SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"')
  lines.push(`REPORT_PATH="\${REPORT_PATH:-${escapedReportPath}}"`)
  lines.push('EVIDENCE_DIR="${EVIDENCE_DIR:-$SCRIPT_DIR/plugin-cleanup-evidence-collected}"')
  lines.push('CONTROLLED_FIXTURE_DIR="$EVIDENCE_DIR/cleanup-controlled-fixture"')
  lines.push('')
  lines.push('mkdir -p "$EVIDENCE_DIR"')
  lines.push('')
  lines.push('{')
  lines.push('  echo "CollectedAt: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"')
  lines.push('  echo "Hostname: $(hostname)"')
  lines.push('  echo "Kernel: $(uname -a)"')
  lines.push('  echo "Node: $(node -v)"')
  lines.push('  echo "Npm: $(npm -v)"')
  lines.push('  echo "ReportPath: $REPORT_PATH"')
  lines.push('  echo "EvidenceDir: $EVIDENCE_DIR"')
  lines.push('} > "$EVIDENCE_DIR/environment.txt"')
  lines.push('')
  lines.push('npm run validate-plugin-cleanup-evidence-report -- "$REPORT_PATH" --allow-pending > "$EVIDENCE_DIR/report-structure-validation.txt" 2>&1')
  lines.push('')
  lines.push('if npm run create-plugin-cleanup-evidence -- --output-dir "$CONTROLLED_FIXTURE_DIR" --json > "$EVIDENCE_DIR/cleanup-controlled-fixture-output.json" 2> "$EVIDENCE_DIR/cleanup-controlled-fixture-stderr.txt"; then')
  lines.push('  echo "Controlled fixture evidence created under: $CONTROLLED_FIXTURE_DIR" > "$EVIDENCE_DIR/cleanup-controlled-fixture-status.txt"')
  lines.push('else')
  lines.push('  status=$?')
  lines.push('  echo "Controlled fixture evidence command failed with exit code: $status" > "$EVIDENCE_DIR/cleanup-controlled-fixture-status.txt"')
  lines.push('fi')
  lines.push('')
  lines.push(hereDoc({
    file: 'manual-checks.md',
    marker: 'OPENPET_PLUGIN_CLEANUP_MANUAL_CHECKS',
    content: manualChecklist
  }))
  lines.push('')
  lines.push(hereDoc({
    file: 'update-report-commands.md',
    marker: 'OPENPET_PLUGIN_CLEANUP_UPDATE_COMMANDS',
    content: commandNotes
  }))
  lines.push('')
  lines.push('echo "OpenPet plugin cleanup evidence collected in: $EVIDENCE_DIR"')
  lines.push('echo "Review manual-checks.md and collected transcripts before marking any cleanup check as pass."')
  lines.push('echo "This collector does not prove cleanup readiness."')
  lines.push('')

  return lines.join('\n')
}

const writeCollector = ({ content, outputPath, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, `${content.trimEnd()}\n`)
  if (typeof fsImpl.chmodSync === 'function') fsImpl.chmodSync(absoluteOutputPath, 0o755)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const { absolutePath, report } = loadReport(options.reportPath)
  const outputPath = options.outputPath || defaultOutputPath(absolutePath)
  const content = createCollector({ report, reportPath: absolutePath })
  const writtenPath = writeCollector({ content, outputPath })

  console.log(`Plugin cleanup evidence collector created: ${writtenPath}`)
  console.log(`Checks referenced: ${REQUIRED_CHECKS.length}`)
  console.log('This collector gathers evidence only; it does not prove plugin cleanup readiness.')
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
  CHECK_GUIDANCE,
  createCollector,
  createCommandNotes,
  createManualChecklist,
  defaultOutputPath,
  parseArgs,
  shellSingleQuotedValue,
  writeCollector
}
