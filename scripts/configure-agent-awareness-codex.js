#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')

const { writeCodexHookPlan } = require('../examples/plugins/agent-awareness/commands/codex-hook-plan')

const DEFAULT_PORT = 8795
const OPENPET_HOOK_SCRIPT = 'openpet-agent-awareness.js'
const OPENPET_STATUS_MESSAGE = 'Notifying OpenPet'
const OPENPET_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'Stop'
]

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

const createHookSenderScript = () => `#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8795/api/events'
const DEFAULT_DATA_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'ibot',
  'plugins',
  '.openpet',
  'openpet.agent-awareness',
  'data'
)

const readStdinJson = () => {
  try {
    const text = fs.readFileSync(0, 'utf-8')
    return text.trim() ? JSON.parse(text) : {}
  } catch (_) {
    return {}
  }
}

const readToken = (dataDir) => {
  try {
    return fs.readFileSync(path.join(dataDir, 'ingest-token.txt'), 'utf-8').trim()
  } catch (_) {
    return ''
  }
}

const sanitize = (value, maxLength = 180) => String(value || '')
  .replace(/[\\r\\n\\t]+/g, ' ')
  .replace(/\\s+/g, ' ')
  .replace(/Bearer\\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
  .trim()
  .slice(0, maxLength)

const statusForEvent = (eventName) => {
  if (eventName === 'SessionStart') return 'working'
  if (eventName === 'UserPromptSubmit') return 'thinking'
  if (eventName === 'PreToolUse') return 'working'
  if (eventName === 'PermissionRequest') return 'waiting'
  if (eventName === 'PostToolUse') return 'working'
  if (eventName === 'Stop') return 'completed'
  return 'working'
}

const messageForEvent = (input) => {
  const eventName = sanitize(input.hook_event_name, 64) || 'codex.hook'
  const toolName = sanitize(input.tool_name, 64)
  if (eventName === 'SessionStart') return 'Codex session started.'
  if (eventName === 'UserPromptSubmit') return 'Codex received a new prompt.'
  if (eventName === 'PreToolUse' && toolName) return \`Codex is starting \${toolName}.\`
  if (eventName === 'PermissionRequest' && toolName) return \`Codex is waiting for \${toolName} approval.\`
  if (eventName === 'PostToolUse' && toolName) return \`Codex finished \${toolName}.\`
  if (eventName === 'Stop') return 'Codex finished this turn.'
  return \`Codex event: \${eventName}.\`
}

const main = async () => {
  const input = readStdinJson()
  const dataDir = process.env.OPENPET_AGENT_AWARENESS_DATA_DIR || DEFAULT_DATA_DIR
  const endpoint = process.env.OPENPET_AGENT_AWARENESS_URL || DEFAULT_ENDPOINT
  const token = readToken(dataDir)
  if (!token) return

  const eventName = sanitize(input.hook_event_name, 64) || 'codex.hook'
  const payload = {
    adapter: 'codex',
    sessionId: sanitize(input.session_id || input.turn_id || 'codex-session', 96),
    type: eventName,
    status: statusForEvent(eventName),
    message: messageForEvent(input),
    cwd: sanitize(input.cwd, 512),
    toolName: sanitize(input.tool_name, 64),
    timestamp: new Date().toISOString()
  }

  await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${token}\`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1000)
  }).catch(() => {})
}

main().catch(() => {})
`

const normalizeFileText = (text) => text.endsWith('\n') ? text : `${text}\n`

const isOpenPetHook = (hook = {}) => (
  hook &&
  hook.type === 'command' &&
  typeof hook.command === 'string' &&
  hook.command.includes(OPENPET_HOOK_SCRIPT)
)

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`

const createHookCommand = ({ dataDir, port, scriptPath }) => {
  const endpoint = `http://127.0.0.1:${port}/api/events`
  return [
    `OPENPET_AGENT_AWARENESS_DATA_DIR=${shellQuote(dataDir)}`,
    `OPENPET_AGENT_AWARENESS_URL=${shellQuote(endpoint)}`,
    '/usr/bin/env node',
    shellQuote(scriptPath)
  ].join(' ')
}

const createHookHandler = ({ dataDir, port, scriptPath }) => ({
  type: 'command',
  command: createHookCommand({ dataDir, port, scriptPath }),
  timeout: 3,
  statusMessage: OPENPET_STATUS_MESSAGE
})

const matcherForEvent = (eventName) => {
  if (eventName === 'SessionStart') return 'startup|resume|clear|compact'
  if (['PreToolUse', 'PermissionRequest', 'PostToolUse'].includes(eventName)) return '*'
  return null
}

const createMatcherGroup = ({ eventName, handler }) => {
  const matcher = matcherForEvent(eventName)
  return {
    ...(matcher ? { matcher } : {}),
    hooks: [handler]
  }
}

const removeOpenPetHandlers = (hooksConfig = {}) => {
  const next = JSON.parse(JSON.stringify(hooksConfig || {}))
  const hooks = next.hooks && typeof next.hooks === 'object' && !Array.isArray(next.hooks)
    ? next.hooks
    : {}
  next.hooks = hooks

  for (const [eventName, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue
    const filteredGroups = groups
      .map((group) => {
        if (!group || !Array.isArray(group.hooks)) return group
        return {
          ...group,
          hooks: group.hooks.filter((hook) => !isOpenPetHook(hook))
        }
      })
      .filter((group) => !Array.isArray(group?.hooks) || group.hooks.length > 0)
    if (filteredGroups.length > 0) {
      hooks[eventName] = filteredGroups
    } else {
      delete hooks[eventName]
    }
  }
  return next
}

const mergeOpenPetHooks = ({ existingConfig = {}, dataDir, port, scriptPath }) => {
  const next = removeOpenPetHandlers(existingConfig)
  if (!next.hooks || typeof next.hooks !== 'object' || Array.isArray(next.hooks)) next.hooks = {}
  const handler = createHookHandler({ dataDir, port, scriptPath })
  for (const eventName of OPENPET_HOOK_EVENTS) {
    const current = Array.isArray(next.hooks[eventName]) ? next.hooks[eventName] : []
    next.hooks[eventName] = [
      ...current,
      createMatcherGroup({ eventName, handler })
    ]
  }
  return next
}

const readHooksConfig = (hooksPath) => {
  if (!fs.existsSync(hooksPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(hooksPath, 'utf-8'))
  } catch (error) {
    throw new Error(`Failed to parse existing Codex hooks file: ${hooksPath}: ${error.message}`)
  }
}

const sameJson = (left, right) => JSON.stringify(left, null, 2) === JSON.stringify(right, null, 2)

const writeFileIfChanged = ({ filePath, content, mode, dryRun }) => {
  const normalized = normalizeFileText(content)
  const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null
  const changed = before !== normalized
  if (!changed || dryRun) return { changed, written: false }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, normalized, mode ? { mode } : undefined)
  if (mode) fs.chmodSync(filePath, mode)
  return { changed, written: true }
}

const backupFile = ({ filePath, dryRun }) => {
  if (!fs.existsSync(filePath)) return ''
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z')
  const backupPath = `${filePath}.openpet-backup-${stamp}`
  if (!dryRun) fs.copyFileSync(filePath, backupPath)
  return backupPath
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
  const hooksDir = path.join(resolvedCodexHome, 'hooks')
  const hookScriptPath = path.join(hooksDir, OPENPET_HOOK_SCRIPT)
  const hooksPath = path.join(resolvedCodexHome, 'hooks.json')
  const hookPlan = dryRun
    ? {
        instructionsPath: path.join(resolvedDataDir, 'codex-hooks.manual.md'),
        tokenPath: path.join(resolvedDataDir, 'ingest-token.txt'),
        serviceUrl: `http://127.0.0.1:${port}/api/events`
      }
    : writeCodexHookPlan({ paths: { dataDir: resolvedDataDir }, port })

  const existingConfig = readHooksConfig(hooksPath)
  const nextConfig = mergeOpenPetHooks({
    existingConfig,
    dataDir: resolvedDataDir,
    port,
    scriptPath: hookScriptPath
  })
  const hooksChanged = !sameJson(existingConfig, nextConfig)
  const scriptResult = writeFileIfChanged({
    filePath: hookScriptPath,
    content: createHookSenderScript(),
    mode: 0o700,
    dryRun
  })
  const backupPath = hooksChanged ? backupFile({ filePath: hooksPath, dryRun }) : ''
  const hooksResult = writeFileIfChanged({
    filePath: hooksPath,
    content: JSON.stringify(nextConfig, null, 2),
    mode: 0o600,
    dryRun
  })

  return {
    ok: true,
    dryRun,
    codexHome: resolvedCodexHome,
    hooksPath,
    hookScriptPath,
    dataDir: resolvedDataDir,
    tokenPath: hookPlan.tokenPath,
    instructionsPath: hookPlan.instructionsPath,
    serviceUrl: hookPlan.serviceUrl,
    hooksChanged,
    hookScriptChanged: scriptResult.changed,
    backupPath,
    events: OPENPET_HOOK_EVENTS,
    nextStep: 'Open a new Codex session and run /hooks once to review and trust the OpenPet hook.'
  }
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
