const fs = require('fs')
const path = require('path')
const { PLAN_FILE, TOKEN_FILE } = require('../commands/codex-hook-plan')

const HOOK_STATE_FILE = 'hook-install-state.json'
const OPENPET_HOOK_SCRIPT = 'openpet-agent-awareness.js'

const readHookInstallState = (dataDir) => {
  const statePath = path.join(dataDir, HOOK_STATE_FILE)
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    return state && typeof state === 'object' ? state : null
  } catch (_) {
    return null
  }
}

const readJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (_) {
    return null
  }
}

const isOpenPetHookCommand = (hook, { hookScriptPath, hookScriptName }) => (
  hook &&
  hook.type === 'command' &&
  typeof hook.command === 'string' &&
  (
    (hookScriptPath && hook.command.includes(hookScriptPath)) ||
    hook.command.includes(hookScriptName)
  )
)

const hasInstalledOpenPetHooks = (installState) => {
  const hooksPath = typeof installState?.hooksPath === 'string' ? installState.hooksPath : ''
  const hookScriptPath = typeof installState?.hookScriptPath === 'string' ? installState.hookScriptPath : ''
  const configuredEvents = Array.isArray(installState?.events)
    ? installState.events.filter((eventName) => typeof eventName === 'string' && eventName)
    : []

  if (!hooksPath || !hookScriptPath) return false
  if (!fs.existsSync(hooksPath) || !fs.existsSync(hookScriptPath)) return false

  const hooksConfig = readJsonFile(hooksPath)
  const hooks = hooksConfig?.hooks
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return false

  const hookScriptName = path.basename(hookScriptPath) || OPENPET_HOOK_SCRIPT
  return configuredEvents.length > 0 && configuredEvents.every((eventName) => {
    const groups = hooks[eventName]
    if (!Array.isArray(groups)) return false
    return groups.some((group) => (
      Array.isArray(group?.hooks) &&
      group.hooks.some((hook) => isOpenPetHookCommand(hook, { hookScriptPath, hookScriptName }))
    ))
  })
}

const readHookMode = (dataDir) => {
  const tokenPresent = fs.existsSync(path.join(dataDir, TOKEN_FILE))
  const planPresent = fs.existsSync(path.join(dataDir, PLAN_FILE))
  const installState = readHookInstallState(dataDir)
  const installed = installState?.installed === true &&
    tokenPresent &&
    hasInstalledOpenPetHooks(installState)
  return {
    installed,
    mode: installed ? 'installed' : 'not-installed',
    planAvailable: planPresent,
    tokenConfigured: tokenPresent,
    ingestAuthRequired: tokenPresent
  }
}

module.exports = {
  HOOK_STATE_FILE,
  readHookInstallState,
  readHookMode
}
