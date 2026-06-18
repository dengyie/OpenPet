const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const { createServiceProcessTree } = require('../src/main/services/service-process-tree')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-cleanup-evidence')
const DEFAULT_JSON_NAME = 'plugin-cleanup-evidence.json'
const DEFAULT_MARKDOWN_NAME = 'plugin-cleanup-evidence.md'
const DEFAULT_TIMEOUT_MS = 4000

const usage = () => [
  'Usage: node scripts/create-plugin-cleanup-evidence.js [options]',
  '',
  'Options:',
  '  --output-dir <dir>  Directory for JSON and Markdown evidence output.',
  '  --json             Print the generated JSON report.',
  '  --help',
  '',
  'Runs a controlled local process-tree cleanup fixture and records host evidence.',
  'This proves only the current host/session behavior and does not claim universal cleanup guarantees.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    outputDir: '',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const sessionIdFromDate = (date) => date.toISOString().replace(/[:.]/g, '-').replace(/-000Z$/, 'Z')

const waitFor = async (predicate, { timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = 25 } = {}) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

const isPidRunning = (pid, killProcessImpl = process.kill) => {
  try {
    killProcessImpl(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

const waitForLine = (stream, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => new Promise((resolve, reject) => {
  let buffer = ''
  const timeout = setTimeout(() => {
    cleanup()
    reject(new Error('Timed out waiting for cleanup fixture metadata'))
  }, timeoutMs)
  const cleanup = () => {
    clearTimeout(timeout)
    stream.off('data', onData)
    stream.off('error', onError)
  }
  const onError = (error) => {
    cleanup()
    reject(error)
  }
  const onData = (chunk) => {
    buffer += chunk.toString('utf-8')
    const newlineIndex = buffer.indexOf('\n')
    if (newlineIndex === -1) return
    const line = buffer.slice(0, newlineIndex).trim()
    cleanup()
    try {
      resolve(JSON.parse(line))
    } catch (error) {
      reject(new Error(`Invalid cleanup fixture metadata: ${line}`))
    }
  }
  stream.on('data', onData)
  stream.on('error', onError)
})

const createFixtureScripts = () => {
  const descendantScript = [
    "process.on('SIGTERM', () => process.exit(0))",
    "process.on('SIGINT', () => process.exit(0))",
    'setInterval(() => {}, 1000)'
  ].join(';')

  const rootScript = [
    "const { spawn } = require('child_process')",
    `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: ['ignore', 'ignore', 'ignore'] })`,
    "process.stdout.write(`${JSON.stringify({ childPid: child.pid })}\\n`)",
    "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 20))",
    "process.on('SIGINT', () => setTimeout(() => process.exit(0), 20))",
    'setInterval(() => {}, 1000)'
  ].join(';')

  return { rootScript, descendantScript }
}

const waitForExit = (child, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => new Promise((resolve) => {
  let resolved = false
  const finish = (result) => {
    if (resolved) return
    resolved = true
    clearTimeout(timeout)
    child.off('exit', onExit)
    resolve(result)
  }
  const onExit = (code, signal) => finish({ exited: true, exitCode: code, signal: signal || '' })
  const timeout = setTimeout(() => finish({ exited: false, exitCode: null, signal: '' }), timeoutMs)
  child.once('exit', onExit)
})

const spawnCleanupFixture = async ({ spawnImpl = spawn, execPath = process.execPath, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const { rootScript } = createFixtureScripts()
  const root = spawnImpl(execPath, ['-e', rootScript], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const metadata = await waitForLine(root.stdout, { timeoutMs })
  if (!Number.isInteger(metadata.childPid) || metadata.childPid <= 0) {
    throw new Error('Cleanup fixture did not report a valid child pid')
  }
  return { root, childPid: metadata.childPid }
}

const renderMarkdownCleanupEvidence = (report) => [
  '# Plugin Cleanup Evidence',
  '',
  `Generated at: ${report.generatedAt}`,
  `Phase: ${report.phase}`,
  `Platform: ${report.platform}`,
  `Signal: ${report.signal}`,
  `Result: ${report.ok ? 'pass' : 'not-ready'}`,
  `Claim boundary: ${report.claimBoundary}`,
  '',
  '## Process Tree',
  '',
  `- Root PID: ${report.rootPid}`,
  `- Descendants before cleanup: ${report.descendantPidsBefore.join(', ') || 'none'}`,
  `- Live descendants after cleanup: ${report.liveDescendantPidsAfter.join(', ') || 'none'}`,
  `- Root exited: ${report.rootExited ? 'yes' : 'no'}`,
  `- Descendants exited: ${report.descendantsExited ? 'yes' : 'no'}`,
  '',
  '## Warnings',
  '',
  ...report.warnings.map((warning) => `- ${warning}`)
].join('\n') + '\n'

const assertOutputDoesNotExist = ({ outputDir, fsImpl = fs }) => {
  for (const fileName of [DEFAULT_JSON_NAME, DEFAULT_MARKDOWN_NAME]) {
    const outputPath = path.join(outputDir, fileName)
    if (fsImpl.existsSync(outputPath)) throw new Error(`Plugin cleanup evidence already exists: ${outputPath}`)
  }
}

const writeCleanupEvidence = ({ report, outputDir, fsImpl = fs }) => {
  const jsonPath = path.join(outputDir, DEFAULT_JSON_NAME)
  const markdownPath = path.join(outputDir, DEFAULT_MARKDOWN_NAME)
  assertOutputDoesNotExist({ outputDir, fsImpl })
  fsImpl.mkdirSync(outputDir, { recursive: true })
  const reportWithFiles = {
    ...report,
    files: {
      json: jsonPath,
      markdown: markdownPath
    }
  }
  fsImpl.writeFileSync(jsonPath, `${JSON.stringify(reportWithFiles, null, 2)}\n`)
  fsImpl.writeFileSync(markdownPath, renderMarkdownCleanupEvidence(reportWithFiles))
  return reportWithFiles
}

const createPluginCleanupEvidence = async ({
  outputDir = '',
  now = () => new Date(),
  platform = process.platform,
  processTree = createServiceProcessTree({ platform }),
  spawnImpl = spawn,
  execPath = process.execPath,
  killProcessImpl = process.kill,
  fsImpl = fs,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
  const generatedAt = now().toISOString()
  const absoluteOutputDir = path.resolve(outputDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt))))
  assertOutputDoesNotExist({ outputDir: absoluteOutputDir, fsImpl })

  const fixture = await spawnCleanupFixture({ spawnImpl, execPath, timeoutMs })
  const rootPid = fixture.root.pid
  let descendantPidsBefore = []
  let cleanupAttempted = false
  let rootExit = { exited: false, exitCode: null, signal: '' }

  try {
    await waitFor(() => {
      descendantPidsBefore = processTree.listServiceDescendantPids(rootPid)
      return descendantPidsBefore.includes(fixture.childPid)
    }, { timeoutMs })

    if (!descendantPidsBefore.includes(fixture.childPid)) descendantPidsBefore.push(fixture.childPid)
    descendantPidsBefore = [...new Set(descendantPidsBefore)].sort((left, right) => left - right)

    cleanupAttempted = processTree.signalServiceProcessTree(rootPid, 'SIGTERM')
    rootExit = await waitForExit(fixture.root, { timeoutMs })
    await waitFor(
      () => descendantPidsBefore.every((pid) => !isPidRunning(pid, killProcessImpl)),
      { timeoutMs }
    )

    const liveDescendantPidsAfter = descendantPidsBefore.filter((pid) => isPidRunning(pid, killProcessImpl))
    const report = {
      generatedAt,
      ok: cleanupAttempted && rootExit.exited && liveDescendantPidsAfter.length === 0,
      phase: 86,
      platform,
      signal: 'SIGTERM',
      cleanupAttempted,
      rootPid,
      rootExited: rootExit.exited,
      rootExitCode: rootExit.exitCode,
      rootSignal: rootExit.signal,
      descendantPidsBefore,
      liveDescendantPidsAfter,
      descendantsExited: liveDescendantPidsAfter.length === 0,
      claimBoundary: 'single controlled host cleanup fixture; not a universal process-tree guarantee',
      warnings: [
        'This evidence only covers a controlled fixture on the current host and OS.',
        'OpenPet still does not claim guaranteed descendant termination for every plugin or platform.',
        'Runtime cleanup semantics remain bounded to the documented service/setup/command stop paths.'
      ]
    }
    return writeCleanupEvidence({ report, outputDir: absoluteOutputDir, fsImpl })
  } finally {
    if (isPidRunning(rootPid, killProcessImpl)) {
      try { killProcessImpl(rootPid, 'SIGKILL') } catch (error) {}
    }
    if (isPidRunning(fixture.childPid, killProcessImpl)) {
      try { killProcessImpl(fixture.childPid, 'SIGKILL') } catch (error) {}
    }
  }
}

const main = async () => {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      process.stdout.write(`${usage()}\n`)
      return
    }
    const report = await createPluginCleanupEvidence({ outputDir: options.outputDir })
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      return
    }
    process.stdout.write(`Wrote plugin cleanup evidence: ${report.files.json}\n`)
  } catch (error) {
    process.stderr.write(`${error.message || 'Failed to create plugin cleanup evidence'}\n\n${usage()}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  createPluginCleanupEvidence,
  parseArgs,
  renderMarkdownCleanupEvidence,
  writeCleanupEvidence
}
