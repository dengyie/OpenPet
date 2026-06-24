const path = require('path')

const AUTOMATION_ISOLATION_ENV = 'OPENPET_AUTOMATION_ISOLATION'
const AUTOMATION_TARGET_DESKTOP_ENV = 'OPENPET_AUTOMATION_TARGET_DESKTOP'
const AUTOMATION_USER_DATA_DIR_ENV = 'OPENPET_USER_DATA_DIR'
const SKIP_DEV_CLEANUP_ENV = 'OPENPET_SKIP_DEV_CLEANUP'
const AUTOMATION_USER_DATA_PREFIX = 'ibot-automation-desktop'

const parseDesktopNumber = (value) => {
  const desktop = Number(value)
  return Number.isInteger(desktop) && desktop > 0 ? desktop : 0
}

const isAutomationIsolationEnabled = (env = process.env) => env[AUTOMATION_ISOLATION_ENV] === '1'

const shouldSkipDevCleanup = (env = process.env) => (
  env[SKIP_DEV_CLEANUP_ENV] === '1'
  || isAutomationIsolationEnabled(env)
)

const createAutomationUserDataDirName = (targetDesktop) => (
  targetDesktop > 0
    ? `${AUTOMATION_USER_DATA_PREFIX}-${targetDesktop}`
    : AUTOMATION_USER_DATA_PREFIX
)

const getAutomationDesktopProfile = ({ env = process.env, appDataPath = '' } = {}) => {
  const enabled = isAutomationIsolationEnabled(env)
  const targetDesktop = parseDesktopNumber(env[AUTOMATION_TARGET_DESKTOP_ENV])
  const userDataDirName = createAutomationUserDataDirName(targetDesktop)
  const configuredUserDataPath = String(env[AUTOMATION_USER_DATA_DIR_ENV] || '').trim()
  const userDataPath = configuredUserDataPath || (
    enabled && appDataPath
      ? path.join(appDataPath, userDataDirName)
      : ''
  )

  return {
    enabled,
    targetDesktop,
    userDataDirName,
    userDataPath,
    visibleOnAllWorkspaces: !enabled
  }
}

const applyWorkspaceVisibility = (window, { env = process.env } = {}) => {
  const visibleOnAllWorkspaces = getAutomationDesktopProfile({ env }).visibleOnAllWorkspaces
  if (typeof window?.setVisibleOnAllWorkspaces !== 'function') return visibleOnAllWorkspaces
  if (visibleOnAllWorkspaces) {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else {
    window.setVisibleOnAllWorkspaces(false)
  }
  return visibleOnAllWorkspaces
}

module.exports = {
  AUTOMATION_ISOLATION_ENV,
  AUTOMATION_TARGET_DESKTOP_ENV,
  AUTOMATION_USER_DATA_DIR_ENV,
  AUTOMATION_USER_DATA_PREFIX,
  SKIP_DEV_CLEANUP_ENV,
  applyWorkspaceVisibility,
  createAutomationUserDataDirName,
  getAutomationDesktopProfile,
  isAutomationIsolationEnabled,
  shouldSkipDevCleanup
}
