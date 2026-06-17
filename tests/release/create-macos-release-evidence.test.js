const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createMacosReleaseEvidence,
  parseArgs,
  renderMarkdownSummary,
  runEvidenceCommand,
  writeSummary
} = require('../../scripts/create-macos-release-evidence')

const fixedNow = () => new Date('2026-06-18T02:00:00.000Z')

const writeSourceEvidence = ({ dir, signed = false } = {}) => {
  fs.mkdirSync(dir, { recursive: true })
  const codesignPath = path.join(dir, 'source-codesign.txt')
  const notarizationPath = path.join(dir, 'source-notarization.txt')
  const gatekeeperPath = path.join(dir, 'source-gatekeeper.txt')

  fs.writeFileSync(
    codesignPath,
    signed
      ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n'
      : 'code object is not signed at all\n'
  )
  fs.writeFileSync(
    notarizationPath,
    signed
      ? 'status: Accepted\nid: notarization-request\n'
      : 'status: NotSubmitted\n'
  )
  fs.writeFileSync(
    gatekeeperPath,
    signed
      ? 'release/mac-arm64/OpenPet.app: accepted\nsource=Notarized Developer ID\n'
      : 'rejected\n'
  )

  return { codesignPath, notarizationPath, gatekeeperPath }
}

test('parseArgs accepts app, output, source evidence, skip, and json flags', () => {
  const options = parseArgs([
    '--app', 'release/mac-arm64/OpenPet.app',
    '--output-dir', 'docs/release-evidence/macos-release-evidence/session',
    '--codesign-source', 'codesign.txt',
    '--notarization-source', 'notary.txt',
    '--gatekeeper-source', 'spctl.txt',
    '--skip-codesign',
    '--skip-spctl',
    '--json'
  ])

  assert.equal(options.appPath, 'release/mac-arm64/OpenPet.app')
  assert.equal(options.outputDir, 'docs/release-evidence/macos-release-evidence/session')
  assert.equal(options.codesignSource, 'codesign.txt')
  assert.equal(options.notarizationSource, 'notary.txt')
  assert.equal(options.gatekeeperSource, 'spctl.txt')
  assert.equal(options.skipCodesign, true)
  assert.equal(options.skipSpctl, true)
  assert.equal(options.json, true)
})

test('parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseArgs(['--app']), /--app requires a value/)
  assert.throws(() => parseArgs(['--output-dir']), /--output-dir requires a value/)
  assert.throws(() => parseArgs(['--codesign-source']), /--codesign-source requires a value/)
  assert.throws(() => parseArgs(['--notarization-source']), /--notarization-source requires a value/)
  assert.throws(() => parseArgs(['--gatekeeper-source']), /--gatekeeper-source requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('createMacosReleaseEvidence imports unsigned evidence without readiness claim', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-evidence-'))
  const sourceDir = path.join(tempDir, 'sources')
  const outputDir = path.join(tempDir, 'archive')
  const sources = writeSourceEvidence({ dir: sourceDir, signed: false })

  const summary = createMacosReleaseEvidence({
    appPath: 'release/mac-arm64/OpenPet.app',
    outputDir,
    codesignSource: sources.codesignPath,
    notarizationSource: sources.notarizationPath,
    gatekeeperSource: sources.gatekeeperPath,
    skipCodesign: true,
    skipSpctl: true,
    now: fixedNow
  })

  assert.equal(summary.ok, true)
  assert.equal(summary.releaseReady, false)
  assert.equal(summary.statuses.codesign, 'pending')
  assert.equal(summary.statuses.notarization, 'pending')
  assert.equal(summary.statuses.gatekeeper, 'pending')
  assert.equal(fs.existsSync(path.join(outputDir, 'macos-codesign.txt')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'macos-notarization.txt')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'macos-gatekeeper.txt')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'macos-release-evidence-summary.md')), true)
  assert.equal(fs.existsSync(path.join(outputDir, 'macos-release-evidence-summary.json')), true)
})

test('createMacosReleaseEvidence marks signed-looking evidence ready', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-evidence-'))
  const sourceDir = path.join(tempDir, 'sources')
  const outputDir = path.join(tempDir, 'archive')
  const sources = writeSourceEvidence({ dir: sourceDir, signed: true })

  const summary = createMacosReleaseEvidence({
    outputDir,
    codesignSource: sources.codesignPath,
    notarizationSource: sources.notarizationPath,
    gatekeeperSource: sources.gatekeeperPath,
    skipCodesign: true,
    skipSpctl: true,
    now: fixedNow
  })

  assert.equal(summary.ok, true)
  assert.equal(summary.releaseReady, true)
  assert.deepEqual(summary.statuses, {
    codesign: 'pass',
    notarization: 'pass',
    gatekeeper: 'pass'
  })
})

test('runEvidenceCommand captures non-zero command output without throwing', () => {
  const result = runEvidenceCommand({
    command: 'codesign',
    args: ['--verify', 'OpenPet.app'],
    execFile: (command, args) => {
      const error = new Error('command failed')
      error.status = 1
      error.stdout = 'stdout evidence'
      error.stderr = `${command} ${args.join(' ')} failed`
      throw error
    }
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.ok, false)
  assert.match(result.content, /stdout evidence/)
  assert.match(result.content, /codesign --verify OpenPet.app failed/)
})

test('runEvidenceCommand captures successful stderr evidence', () => {
  const result = runEvidenceCommand({
    command: 'codesign',
    args: ['--verify', 'OpenPet.app'],
    execFile: () => ({
      stdout: '',
      stderr: 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n'
    })
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.ok, true)
  assert.match(result.content, /valid on disk/)
  assert.match(result.content, /satisfies its Designated Requirement/)
})

test('createMacosReleaseEvidence runs fake codesign and spctl commands', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-evidence-'))
  const outputDir = path.join(tempDir, 'archive')
  const commands = []

  const summary = createMacosReleaseEvidence({
    appPath: 'release/mac-arm64/OpenPet.app',
    outputDir,
    notarizationText: 'status: Accepted\n',
    execFile: (command, args) => {
      commands.push([command, ...args])
      return command === 'codesign'
        ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n'
        : 'release/mac-arm64/OpenPet.app: accepted\nsource=Notarized Developer ID\n'
    },
    now: fixedNow
  })

  assert.equal(summary.releaseReady, true)
  assert.deepEqual(commands, [
    ['codesign', '--verify', '--deep', '--strict', '--verbose=2', 'release/mac-arm64/OpenPet.app'],
    ['spctl', '--assess', '--type', 'execute', '--verbose=4', 'release/mac-arm64/OpenPet.app']
  ])
})

test('renderMarkdownSummary and writeSummary expose readiness boundaries', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-evidence-'))
  const sourceDir = path.join(tempDir, 'sources')
  const outputDir = path.join(tempDir, 'archive')
  const sources = writeSourceEvidence({ dir: sourceDir, signed: false })
  const summary = createMacosReleaseEvidence({
    outputDir,
    codesignSource: sources.codesignPath,
    notarizationSource: sources.notarizationPath,
    gatekeeperSource: sources.gatekeeperPath,
    skipCodesign: true,
    skipSpctl: true,
    now: fixedNow
  })
  const markdown = renderMarkdownSummary(summary)
  const jsonPath = path.join(tempDir, 'summary.json')

  assert.match(markdown, /^# macOS Release Evidence Summary/)
  assert.match(markdown, /macOS signed release-ready: no/)
  assert.match(markdown, /does not prove official signed release readiness/)
  assert.equal(writeSummary({ summary, outputPath: jsonPath, json: true }), jsonPath)
  assert.equal(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')).releaseReady, false)
})
