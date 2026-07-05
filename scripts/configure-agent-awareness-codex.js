#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  DEFAULT_PORT,
  OPENPET_HOOK_EVENTS,
  createHookCommand,
  createHookSenderScript,
  installCodexHooks,
  mergeOpenPetHooks,
  removeOpenPetHandlers,
  shellQuote
} = require('../examples/plugins/agent-awareness/commands/codex-hook-config')

const usage = () => [
  'Usage: node scripts/configure-agent-awareness-codex.js [options]',
  '',
  'Options:',
  '  --codex-home <dir>   Codex config directory. Defaults to ~/.codex.',
  '  --data-dir <dir>     Agent Awareness data directory. Defaults to the installed bundled plugin data dir when present.',
  '  --port <port>        Agent Awareness service port. Defaults to 8795.',
  '  --dry-run            Print planned changes without writing files.',
  '  --json               Print machine-readable JSON.',
  '  --help               Show this help.',
  '',
  'Creates a Codex hooks.json entry and a best-effort hook sender script for OpenPet Agent Awareness.',
  'Codex still requires reviewing and trusting the new hook once with /hooks before it runs.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv = process.argv.slice(2)) => {
  const options = {
    codexHome: path.join(os.homedir(), '.codex'),
    dataDir: '',
    port: DEFAULT_PORT,
    dryRun: false,
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--codex-home') {
      options.codexHome = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--data-dir') {
      options.dataDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--port') {
      const port = Number(readValue(argv, index, arg))
      if (!Number.isFinite(port) || port <= 0) throw new Error('--port must be a positive number')
      options.port = Math.floor(port)
      index += 1
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const repoRoot = () => path.resolve(__dirname, '..')

const defaultDataDir = ({ homeDir = os.homedir(), projectRoot = repoRoot() } = {}) => {
  const appDataDir = path.join(
    homeDir,
    'Library',
    'Application Support',
    'ibot',
    'plugins',
    '.openpet',
    'openpet.agent-awareness',
    'data'
  )
  const appPluginDir = path.join(
    homeDir,
    'Library',
    'Application Support',
    'ibot',
    'plugins',
    'openpet.agent-awareness'
  )
  if (fs.existsSync(appPluginDir) || fs.existsSync(appDataDir)) return appDataDir
  return path.join(projectRoot, 'examples', 'plugins', '.openpet', 'openpet.agent-awareness', 'data')
}

const configureCodexAgentAwareness = ({
  codexHome = path.join(os.homedir(), '.codex'),
  dataDir = '',
  port = DEFAULT_PORT,
  dryRun = false,
  homeDir = os.homedir(),
  projectRoot = repoRoot()
} = {}) => {
  const resolvedCodexHome = path.resolve(codexHome)
  const resolvedDataDir = path.resolve(dataDir || defaultDataDir({ homeDir, projectRoot }))
  return installCodexHooks({
    codexHome: resolvedCodexHome,
    dataDir: resolvedDataDir,
    port,
    dryRun
  })
}

const printResult = (result, json = false) => {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  process.stdout.write([
    'OpenPet Agent Awareness Codex hook configuration ready.',
    `Codex hooks: ${result.hooksPath}`,
    `Hook script: ${result.hookScriptPath}`,
    `Plugin data: ${result.dataDir}`,
    `Service URL: ${result.serviceUrl}`,
    result.backupPath ? `Backup: ${result.backupPath}` : 'Backup: not needed',
    '',
    `Next: ${result.nextStep}`
  ].join('\n'))
  process.stdout.write('\n')
}

if (require.main === module) {
  try {
    const options = parseArgs()
    if (options.help) {
      process.stdout.write(`${usage()}\n`)
      process.exit(0)
    }
    const result = configureCodexAgentAwareness(options)
    printResult(result, options.json)
  } catch (error) {
    process.stderr.write(`${error.message || 'Failed to configure Codex hooks'}\n`)
    process.exit(1)
  }
}

module.exports = {
  OPENPET_HOOK_EVENTS,
  configureCodexAgentAwareness,
  createHookCommand,
  createHookSenderScript,
  defaultDataDir,
  mergeOpenPetHooks,
  parseArgs,
  removeOpenPetHandlers,
  shellQuote
}
