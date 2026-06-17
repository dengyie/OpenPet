const { spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { macosEvidenceStatus } = require('./create-release-evidence-archive-manifest')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'macos-release-evidence')
const CODESIGN_FILE = 'macos-codesign.txt'
const NOTARIZATION_FILE = 'macos-notarization.txt'
const GATEKEEPER_FILE = 'macos-gatekeeper.txt'
const SUMMARY_MD = 'macos-release-evidence-summary.md'
const SUMMARY_JSON = 'macos-release-evidence-summary.json'

const usage = () => [
  'Usage: node scripts/create-macos-release-evidence.js [options]',
  '',
  'Options:',
  '  --app <OpenPet.app>                 App bundle to verify with codesign and spctl',
  '  --output-dir <dir>                  Directory for macOS release evidence files',
  '  --codesign-source <file>            Copy existing codesign evidence instead of running codesign',
  '  --notarization-source <file>        Copy existing notarization evidence',
  '  --notarization-text <text>          Inline notarization evidence text',
  '  --gatekeeper-source <file>          Copy existing Gatekeeper evidence instead of running spctl',
  '  --skip-codesign                     Write pending codesign evidence without running codesign',
  '  --skip-spctl                        Write pending Gatekeeper evidence without running spctl',
  '  --json                              Print the machine-readable summary',
  '  --help',
  '',
  'Writes macos-codesign.txt, macos-notarization.txt, macos-gatekeeper.txt,',
  'and macOS release evidence summaries. This command records evidence; it',
  'does not upgrade pending, unsigned, or missing evidence into release readiness.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    appPath: '',
    outputDir: '',
    codesignSource: '',
    notarizationSource: '',
    notarizationText: '',
    gatekeeperSource: '',
    skipCodesign: false,
    skipSpctl: false,
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--app') {
      options.appPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--codesign-source') {
      options.codesignSource = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notarization-source') {
      options.notarizationSource = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notarization-text') {
      options.notarizationText = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--gatekeeper-source') {
      options.gatekeeperSource = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--skip-codesign') {
      options.skipCodesign = true
    } else if (arg === '--skip-spctl') {
      options.skipSpctl = true
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const sessionIdFromDate = (date) => date.toISOString().replace(/[:.]/g, '-').replace(/-000Z$/, 'Z')

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

const ensureTrailingNewline = (value) => String(value || '').endsWith('\n') ? String(value || '') : `${String(value || '')}\n`

const executeEvidenceCommand = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf-8', stdio: 'pipe' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const error = new Error(`${command} failed with exit code ${result.status}`)
    error.status = result.status
    error.stdout = result.stdout || ''
    error.stderr = result.stderr || ''
    throw error
  }
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  }
}

const normalizeCommandOutput = (output) => {
  if (output && typeof output === 'object' && !Buffer.isBuffer(output)) {
    return {
      stdout: String(output.stdout || ''),
      stderr: String(output.stderr || '')
    }
  }
  return {
    stdout: String(output || ''),
    stderr: ''
  }
}

const runEvidenceCommand = ({ command, args, execFile = executeEvidenceCommand }) => {
  try {
    const output = normalizeCommandOutput(execFile(command, args, { encoding: 'utf-8', stdio: 'pipe' }))
    return {
      command,
      args,
      exitCode: 0,
      ok: true,
      stdout: output.stdout,
      stderr: output.stderr,
      content: ensureTrailingNewline([
        `$ ${command} ${args.join(' ')}`,
        output.stdout.trimEnd(),
        output.stderr.trimEnd()
      ].filter(Boolean).join('\n'))
    }
  } catch (error) {
    const stdout = String(error.stdout || '')
    const stderr = String(error.stderr || error.message || '')
    const exitCode = Number.isInteger(error.status) ? error.status : 1
    return {
      command,
      args,
      exitCode,
      ok: false,
      stdout,
      stderr,
      content: ensureTrailingNewline([
        `$ ${command} ${args.join(' ')}`,
        stdout.trimEnd(),
        stderr.trimEnd(),
        `exitCode: ${exitCode}`
      ].filter(Boolean).join('\n'))
    }
  }
}

const readSourceText = ({ sourcePath, fsImpl = fs }) => fsImpl.readFileSync(path.resolve(sourcePath), 'utf-8')

const writeText = ({ filePath, content, fsImpl = fs }) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, ensureTrailingNewline(content))
}

const describeFile = ({ role, filePath, fsImpl = fs }) => {
  const content = fsImpl.readFileSync(filePath)
  return {
    role,
    path: filePath,
    exists: true,
    bytes: content.length,
    sha256: sha256(content)
  }
}

const boolText = (value) => value ? 'yes' : 'no'

const createMacosReleaseEvidence = ({
  appPath = '',
  outputDir = '',
  codesignSource = '',
  notarizationSource = '',
  notarizationText = '',
  gatekeeperSource = '',
  skipCodesign = false,
  skipSpctl = false,
  now = () => new Date(),
  execFile = executeEvidenceCommand,
  fsImpl = fs
} = {}) => {
  const generatedAt = now().toISOString()
  const absoluteOutputDir = path.resolve(outputDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt))))
  fsImpl.mkdirSync(absoluteOutputDir, { recursive: true })

  const codesignPath = path.join(absoluteOutputDir, CODESIGN_FILE)
  const notarizationPath = path.join(absoluteOutputDir, NOTARIZATION_FILE)
  const gatekeeperPath = path.join(absoluteOutputDir, GATEKEEPER_FILE)

  const commands = []

  let codesignContent = ''
  if (codesignSource) {
    codesignContent = readSourceText({ sourcePath: codesignSource, fsImpl })
  } else if (skipCodesign || !appPath) {
    codesignContent = `codesign evidence pending. Provide --app or --codesign-source.\nGenerated at: ${generatedAt}\n`
  } else {
    const result = runEvidenceCommand({
      command: 'codesign',
      args: ['--verify', '--deep', '--strict', '--verbose=2', appPath],
      execFile
    })
    commands.push(result)
    codesignContent = result.content
  }

  let notarizationContent = ''
  if (notarizationSource) {
    notarizationContent = readSourceText({ sourcePath: notarizationSource, fsImpl })
  } else if (notarizationText) {
    notarizationContent = notarizationText
  } else {
    notarizationContent = `status: NotSubmitted\nGenerated at: ${generatedAt}\n`
  }

  let gatekeeperContent = ''
  if (gatekeeperSource) {
    gatekeeperContent = readSourceText({ sourcePath: gatekeeperSource, fsImpl })
  } else if (skipSpctl || !appPath) {
    gatekeeperContent = `Gatekeeper evidence pending. Provide --app or --gatekeeper-source.\nGenerated at: ${generatedAt}\n`
  } else {
    const result = runEvidenceCommand({
      command: 'spctl',
      args: ['--assess', '--type', 'execute', '--verbose=4', appPath],
      execFile
    })
    commands.push(result)
    gatekeeperContent = result.content
  }

  writeText({ filePath: codesignPath, content: codesignContent, fsImpl })
  writeText({ filePath: notarizationPath, content: notarizationContent, fsImpl })
  writeText({ filePath: gatekeeperPath, content: gatekeeperContent, fsImpl })

  const statuses = {
    codesign: macosEvidenceStatus({ kind: 'codesign', content: codesignContent }),
    notarization: macosEvidenceStatus({ kind: 'notarization', content: notarizationContent }),
    gatekeeper: macosEvidenceStatus({ kind: 'gatekeeper', content: gatekeeperContent })
  }
  const releaseReady = statuses.codesign === 'pass' && statuses.notarization === 'pass' && statuses.gatekeeper === 'pass'
  const evidenceFiles = [
    describeFile({ role: 'macosCodesignEvidence', filePath: codesignPath, fsImpl }),
    describeFile({ role: 'macosNotarizationEvidence', filePath: notarizationPath, fsImpl }),
    describeFile({ role: 'macosGatekeeperEvidence', filePath: gatekeeperPath, fsImpl })
  ]

  const summary = {
    generatedAt,
    ok: true,
    releaseReady,
    appPath: appPath ? path.resolve(appPath) : '',
    outputDir: absoluteOutputDir,
    statuses,
    files: {
      codesign: codesignPath,
      notarization: notarizationPath,
      gatekeeper: gatekeeperPath,
      markdownSummary: path.join(absoluteOutputDir, SUMMARY_MD),
      jsonSummary: path.join(absoluteOutputDir, SUMMARY_JSON)
    },
    evidenceFiles,
    commands,
    warnings: releaseReady ? [] : ['macOS evidence is archived but does not prove official signed release readiness']
  }

  writeSummary({ summary, outputPath: summary.files.markdownSummary, fsImpl })
  writeSummary({ summary, outputPath: summary.files.jsonSummary, json: true, fsImpl })

  return summary
}

const renderMarkdownSummary = (summary) => {
  const lines = [
    '# macOS Release Evidence Summary',
    '',
    `Generated at: ${summary.generatedAt}`,
    `App path: ${summary.appPath || '(not provided)'}`,
    `Evidence directory: ${summary.outputDir}`,
    `Evidence valid: ${boolText(summary.ok)}`,
    `macOS signed release-ready: ${boolText(summary.releaseReady)}`,
    '',
    'This summary archives macOS signing, notarization, and Gatekeeper evidence metadata for review. Pending, unsigned, rejected, or missing evidence does not prove official signed release readiness.',
    '',
    '## Status',
    '',
    `- codesign: ${summary.statuses.codesign}`,
    `- notarization: ${summary.statuses.notarization}`,
    `- Gatekeeper: ${summary.statuses.gatekeeper}`,
    '',
    '## Evidence Files',
    '',
    '| Role | Bytes | SHA-256 | Path |',
    '|------|-------|---------|------|'
  ]

  for (const file of summary.evidenceFiles) {
    lines.push(`| ${file.role} | ${file.bytes} | ${file.sha256} | ${file.path} |`)
  }

  if (summary.commands.length > 0) {
    lines.push('', '## Commands', '')
    for (const command of summary.commands) {
      lines.push(`- \`${command.command} ${command.args.join(' ')}\` -> exit ${command.exitCode}`)
    }
  }

  if (summary.warnings.length > 0) {
    lines.push('', '## Warnings', '')
    for (const warning of summary.warnings) lines.push(`- ${warning}`)
  }

  return `${lines.join('\n')}\n`
}

const writeSummary = ({ summary, outputPath, json = false, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(
    absoluteOutputPath,
    json ? `${JSON.stringify(summary, null, 2)}\n` : renderMarkdownSummary(summary)
  )
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const summary = createMacosReleaseEvidence(options)
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log(`macOS release evidence created: ${summary.outputDir}`)
    console.log(`Summary: ${summary.files.markdownSummary}`)
    console.log(`macOS signed release-ready: ${summary.releaseReady ? 'yes' : 'no'}`)
  }
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
  createMacosReleaseEvidence,
  executeEvidenceCommand,
  parseArgs,
  renderMarkdownSummary,
  runEvidenceCommand,
  writeSummary
}
