const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  PLAN_FILE,
  TOKEN_FILE,
  writeCodexHookPlan
} = require('./codex-hook-plan')

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
const HOOK_STATE_FILE = 'hook-install-state.json'
const DEFAULT_PORT = 8795

const normalizeFileText = (text) => text.endsWith('\n') ? text : `${text}\n`

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`

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
    return fs.readFileSync(path.join(dataDir, '${TOKEN_FILE}'), 'utf-8').trim()
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

const isOpenPetHook = (hook = {}) => (
  hook &&
  hook.type === 'command' &&
  typeof hook.command === 'string' &&
  hook.command.includes(OPENPET_HOOK_SCRIPT)
)

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

const removeFileIfPresent = ({ filePath, dryRun }) => {
  const present = fs.existsSync(filePath)
  if (!present || dryRun) return { changed: present, removed: false }
  fs.rmSync(filePath, { force: true })
  return { changed: true, removed: true }
}

const backupFile = ({ filePath, dryRun }) => {
  if (!fs.existsSync(filePath)) return ''
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z')
  const backupPath = `${filePath}.openpet-backup-${stamp}`
  if (!dryRun) fs.copyFileSync(filePath, backupPath)
  return backupPath
}

const writeHookInstallState = ({
  dataDir,
  codexHome,
  hooksPath,
  hookScriptPath,
  backupPath,
  events,
  serviceUrl,
  dryRun
}) => {
  const statePath = path.join(dataDir, HOOK_STATE_FILE)
  const state = {
    installed: true,
    installedAt: new Date().toISOString(),
    codexHome,
    hooksPath,
    hookScriptPath,
    backupPath,
    events,
    serviceUrl
  }
  if (!dryRun) {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  }
  return statePath
}

const clearHookInstallState = ({ dataDir, dryRun }) => removeFileIfPresent({
  filePath: path.join(dataDir, HOOK_STATE_FILE),
  dryRun
})

const installCodexHooks = ({
  codexHome = path.join(os.homedir(), '.codex'),
  dataDir,
  port = DEFAULT_PORT,
  dryRun = false
} = {}) => {
  if (!dataDir) throw new Error('dataDir is required')
  const resolvedCodexHome = path.resolve(codexHome)
  const resolvedDataDir = path.resolve(dataDir)
  const hooksDir = path.join(resolvedCodexHome, 'hooks')
  const hookScriptPath = path.join(hooksDir, OPENPET_HOOK_SCRIPT)
  const hooksPath = path.join(resolvedCodexHome, 'hooks.json')
  const hookPlan = dryRun
    ? {
        instructionsPath: path.join(resolvedDataDir, PLAN_FILE),
        tokenPath: path.join(resolvedDataDir, TOKEN_FILE),
        serviceUrl: `http://127.0.0.1:${port}/api/events`
      }
    : writeCodexHookPlan({ dataDir: resolvedDataDir, port, mode: 'installed' })

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
  writeFileIfChanged({
    filePath: hooksPath,
    content: JSON.stringify(nextConfig, null, 2),
    mode: 0o600,
    dryRun
  })
  const statePath = writeHookInstallState({
    dataDir: resolvedDataDir,
    codexHome: resolvedCodexHome,
    hooksPath,
    hookScriptPath,
    backupPath,
    events: OPENPET_HOOK_EVENTS,
    serviceUrl: hookPlan.serviceUrl,
    dryRun
  })

  return {
    ok: true,
    dryRun,
    installed: true,
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
    statePath,
    nextStep: 'Open a new Codex session and run /hooks once to review and trust the OpenPet hook.'
  }
}

const uninstallCodexHooks = ({
  codexHome = path.join(os.homedir(), '.codex'),
  dataDir,
  port = DEFAULT_PORT,
  dryRun = false
} = {}) => {
  if (!dataDir) throw new Error('dataDir is required')
  const resolvedCodexHome = path.resolve(codexHome)
  const resolvedDataDir = path.resolve(dataDir)
  const hooksDir = path.join(resolvedCodexHome, 'hooks')
  const hookScriptPath = path.join(hooksDir, OPENPET_HOOK_SCRIPT)
  const hooksPath = path.join(resolvedCodexHome, 'hooks.json')
  const hookPlan = dryRun
    ? {
        instructionsPath: path.join(resolvedDataDir, PLAN_FILE),
        tokenPath: path.join(resolvedDataDir, TOKEN_FILE),
        serviceUrl: `http://127.0.0.1:${port}/api/events`
      }
    : writeCodexHookPlan({ dataDir: resolvedDataDir, port, mode: 'removed' })

  const existingConfig = readHooksConfig(hooksPath)
  const nextConfig = removeOpenPetHandlers(existingConfig)
  const hooksChanged = !sameJson(existingConfig, nextConfig)
  const backupPath = hooksChanged ? backupFile({ filePath: hooksPath, dryRun }) : ''
  if (hooksChanged) {
    writeFileIfChanged({
      filePath: hooksPath,
      content: JSON.stringify(nextConfig, null, 2),
      mode: 0o600,
      dryRun
    })
  }
  const scriptResult = removeFileIfPresent({ filePath: hookScriptPath, dryRun })
  clearHookInstallState({ dataDir: resolvedDataDir, dryRun })

  return {
    ok: true,
    dryRun,
    removed: true,
    codexHome: resolvedCodexHome,
    hooksPath,
    hookScriptPath,
    dataDir: resolvedDataDir,
    tokenPath: hookPlan.tokenPath,
    instructionsPath: hookPlan.instructionsPath,
    serviceUrl: hookPlan.serviceUrl,
    hooksChanged,
    hookScriptRemoved: scriptResult.changed,
    backupPath,
    statePath: path.join(resolvedDataDir, HOOK_STATE_FILE),
    nextStep: 'The OpenPet-owned Codex hook handlers were removed. Re-run install-codex-hooks to restore them.'
  }
}

const toInstallCommandOutput = (result = {}) => ({
  ok: result.ok === true,
  installed: result.installed === true,
  hooksChanged: result.hooksChanged === true,
  hookScriptChanged: result.hookScriptChanged === true,
  backupCreated: Boolean(result.backupPath),
  hooksFile: 'codex:hooks.json',
  hookScriptFile: 'codex:hooks/openpet-agent-awareness.js',
  authFile: 'plugin-auth-file',
  instructionsFile: PLAN_FILE,
  stateFile: HOOK_STATE_FILE,
  serviceUrl: String(result.serviceUrl || ''),
  nextStep: String(result.nextStep || '')
})

const toUninstallCommandOutput = (result = {}) => ({
  ok: result.ok === true,
  removed: result.removed === true,
  hooksChanged: result.hooksChanged === true,
  hookScriptRemoved: result.hookScriptRemoved === true,
  backupCreated: Boolean(result.backupPath),
  hooksFile: 'codex:hooks.json',
  hookScriptFile: 'codex:hooks/openpet-agent-awareness.js',
  authFile: 'plugin-auth-file',
  instructionsFile: PLAN_FILE,
  stateFile: HOOK_STATE_FILE,
  serviceUrl: String(result.serviceUrl || ''),
  nextStep: String(result.nextStep || '')
})

module.exports = {
  DEFAULT_PORT,
  HOOK_STATE_FILE,
  OPENPET_HOOK_EVENTS,
  createHookCommand,
  createHookSenderScript,
  installCodexHooks,
  mergeOpenPetHooks,
  removeOpenPetHandlers,
  shellQuote,
  toInstallCommandOutput,
  toUninstallCommandOutput,
  uninstallCodexHooks
}
