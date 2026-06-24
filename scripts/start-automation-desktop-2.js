const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  AUTOMATION_ISOLATION_ENV,
  AUTOMATION_TARGET_DESKTOP_ENV,
  AUTOMATION_USER_DATA_DIR_ENV,
  SKIP_DEV_CLEANUP_ENV,
  createAutomationUserDataDirName
} = require('../src/main/runtime/automation-desktop-mode')

const usage = () => [
  'Usage: node scripts/start-automation-desktop-2.js',
  '',
  'Starts a dedicated OpenPet automation instance intended for macOS Desktop 2.',
  'It uses an isolated userData directory, skips dev-instance cleanup, and asks',
  'System Events to switch to Desktop 2 before launching npm start.',
  '',
  'Environment overrides:',
  `  ${AUTOMATION_TARGET_DESKTOP_ENV}=2`,
  `  ${AUTOMATION_USER_DATA_DIR_ENV}=/custom/path`,
  `  ${AUTOMATION_ISOLATION_ENV}=1`
].join('\n')

const runAppleScript = (script, { spawnImpl = spawn } = {}) => new Promise((resolve, reject) => {
  const child = spawnImpl('osascript', ['-e', script], { stdio: 'ignore' })
  child.once('error', reject)
  child.once('exit', (code) => {
    if (code === 0) resolve()
    else reject(new Error(`osascript exited with code ${code}`))
  })
})

const switchToDesktop = async (desktopNumber, deps = {}) => {
  const keyCodeByDesktop = {
    1: 18,
    2: 19,
    3: 20,
    4: 21,
    5: 23,
    6: 22,
    7: 26,
    8: 28,
    9: 25
  }
  const keyCode = keyCodeByDesktop[desktopNumber]
  if (!keyCode) return false
  const script = `tell application "System Events" to key code ${keyCode} using control down`
  await runAppleScript(script, deps)
  return true
}

const startAutomationDesktop2 = async ({
  desktopNumber = Number(process.env[AUTOMATION_TARGET_DESKTOP_ENV] || 2),
  workspaceRoot = path.resolve(__dirname, '..'),
  env = process.env,
  spawnImpl = spawn,
  homeDir = os.homedir()
} = {}) => {
  const resolvedDesktopNumber = Number.isInteger(desktopNumber) && desktopNumber > 0 ? desktopNumber : 2
  const userDataDir = env[AUTOMATION_USER_DATA_DIR_ENV]
    || path.join(homeDir, 'Library', 'Application Support', createAutomationUserDataDirName(resolvedDesktopNumber))
  fs.mkdirSync(userDataDir, { recursive: true })

  let switched = false
  try {
    switched = await switchToDesktop(resolvedDesktopNumber, { spawnImpl })
  } catch (_) {
    switched = false
  }

  const child = spawnImpl('npm', ['start'], {
    cwd: workspaceRoot,
    env: {
      ...env,
      [AUTOMATION_ISOLATION_ENV]: '1',
      [AUTOMATION_TARGET_DESKTOP_ENV]: String(resolvedDesktopNumber),
      [AUTOMATION_USER_DATA_DIR_ENV]: userDataDir,
      [SKIP_DEV_CLEANUP_ENV]: '1'
    },
    stdio: 'inherit'
  })

  return {
    desktopNumber: resolvedDesktopNumber,
    switched,
    userDataDir,
    child
  }
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage())
    process.exit(0)
  }
  startAutomationDesktop2().catch((error) => {
    console.error(`OpenPet automation desktop 2 launch failed: ${error.message}`)
    process.exit(1)
  })
}

module.exports = {
  runAppleScript,
  startAutomationDesktop2,
  switchToDesktop
}
