const fs = require('fs')
const os = require('os')
const path = require('path')

const { REQUIRED_CHECKS } = require('./validate-rc-upgrade-smoke-report')

const LEGACY_USER_DATA_DIR_NAME = 'ibot'
const CURRENT_USER_DATA_DIR_NAME = 'OpenPet'
const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', 'release', 'rc-upgrade-smoke-report.json')

const defaultAppDataDir = ({ platform = process.platform, env = process.env, homedir = os.homedir } = {}) => {
  if (platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support')
  if (platform === 'win32') return env.APPDATA || path.join(homedir(), 'AppData', 'Roaming')
  return env.XDG_CONFIG_HOME || path.join(homedir(), '.config')
}

const usage = () => [
  'Usage: node scripts/create-rc-upgrade-smoke-report.js [--app-data-dir <dir>] [--observed-user-data-dir <dir>] [--output <report.json>]',
  '',
  'Creates a local OpenPet RC upgrade compatibility smoke report.',
  'The report proves readiness only after --observed-user-data-dir points at the legacy ibot directory and every preserved data check passes.'
].join('\n')

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const safeReadJson = (filePath, fsImpl = fs) => {
  try {
    return { ok: true, value: JSON.parse(fsImpl.readFileSync(filePath, 'utf-8')), error: '' }
  } catch (err) {
    return { ok: false, value: null, error: err.message || String(err) }
  }
}

const fileExists = (filePath, fsImpl = fs) => {
  try {
    return fsImpl.existsSync(filePath) && fsImpl.statSync(filePath).isFile()
  } catch (_) {
    return false
  }
}

const dirExists = (dirPath, fsImpl = fs) => {
  try {
    return fsImpl.existsSync(dirPath) && fsImpl.statSync(dirPath).isDirectory()
  } catch (_) {
    return false
  }
}

const listDir = (dirPath, fsImpl = fs) => {
  try {
    if (!dirExists(dirPath, fsImpl)) return []
    return fsImpl.readdirSync(dirPath).sort((a, b) => a.localeCompare(b))
  } catch (_) {
    return []
  }
}

const createCheck = ({ id, status, evidence = '', notes = '' }) => ({
  id,
  status,
  evidence,
  notes
})

const createPendingChecks = () => REQUIRED_CHECKS.map((check) => createCheck({
  id: check.id,
  status: 'pending',
  notes: `${check.label}. Fill by running the packaged OpenPet RC against a seeded legacy ibot userData directory.`
}))

const stateEntriesInDir = (dirPath, fsImpl = fs) => {
  const entries = []
  if (fileExists(path.join(dirPath, 'settings.json'), fsImpl)) entries.push('settings.json')
  if (fileExists(path.join(dirPath, 'secrets.json'), fsImpl)) entries.push('secrets.json')
  if (dirExists(path.join(dirPath, 'plugins'), fsImpl)) entries.push('plugins/')
  if (dirExists(path.join(dirPath, 'pet-packs'), fsImpl)) entries.push('pet-packs/')
  return entries
}

const createChecks = ({ legacyUserDataDir, currentUserDataDir, observedUserDataDir, settingsResult, fsImpl = fs }) => {
  const checks = []
  const legacyExists = dirExists(legacyUserDataDir, fsImpl)
  const observed = observedUserDataDir ? path.resolve(observedUserDataDir) : ''
  const legacyResolved = path.resolve(legacyUserDataDir)

  checks.push(createCheck({
    id: 'legacy-dir-exists',
    status: legacyExists ? 'pass' : 'fail',
    evidence: legacyExists ? legacyUserDataDir : '',
    notes: legacyExists ? 'Legacy directory exists.' : `Legacy directory missing: ${legacyUserDataDir}`
  }))

  checks.push(createCheck({
    id: 'observed-user-data-dir',
    status: observed ? (observed === legacyResolved ? 'pass' : 'fail') : 'pending',
    evidence: observed || '',
    notes: observed
      ? (observed === legacyResolved ? 'Observed userData resolves to the legacy directory.' : `Observed userData did not resolve to legacy directory: ${legacyResolved}`)
      : 'Pass --observed-user-data-dir from the packaged smoke run before claiming upgrade readiness.'
  }))

  checks.push(createCheck({
    id: 'settings-preserved',
    status: settingsResult.ok ? 'pass' : 'fail',
    evidence: settingsResult.ok ? path.join(legacyUserDataDir, 'settings.json') : '',
    notes: settingsResult.ok ? 'settings.json is readable JSON.' : `settings.json missing or unreadable: ${settingsResult.error}`
  }))

  checks.push(createCheck({
    id: 'secrets-preserved',
    status: fileExists(path.join(legacyUserDataDir, 'secrets.json'), fsImpl) ? 'pass' : 'fail',
    evidence: fileExists(path.join(legacyUserDataDir, 'secrets.json'), fsImpl) ? path.join(legacyUserDataDir, 'secrets.json') : '',
    notes: 'Seed a legacy secrets.json fixture before the RC upgrade smoke run.'
  }))

  const pluginEntries = listDir(path.join(legacyUserDataDir, 'plugins'), fsImpl)
  checks.push(createCheck({
    id: 'plugins-preserved',
    status: pluginEntries.length > 0 ? 'pass' : 'fail',
    evidence: pluginEntries.length > 0 ? pluginEntries.join(', ') : '',
    notes: pluginEntries.length > 0 ? 'Legacy plugin entries remain present.' : 'Legacy plugins directory is missing or empty.'
  }))

  const petPackEntries = listDir(path.join(legacyUserDataDir, 'pet-packs'), fsImpl)
  checks.push(createCheck({
    id: 'pet-packs-preserved',
    status: petPackEntries.length > 0 ? 'pass' : 'fail',
    evidence: petPackEntries.length > 0 ? petPackEntries.join(', ') : '',
    notes: petPackEntries.length > 0 ? 'Legacy pet-pack entries remain present.' : 'Legacy pet-packs directory is missing or empty.'
  }))

  const localHttpLogs = Array.isArray(settingsResult.value?.localHttp?.logs) ? settingsResult.value.localHttp.logs : []
  checks.push(createCheck({
    id: 'local-http-logs-preserved',
    status: localHttpLogs.length > 0 ? 'pass' : 'fail',
    evidence: localHttpLogs.length > 0 ? `${localHttpLogs.length} local HTTP log entries` : '',
    notes: localHttpLogs.length > 0 ? 'settings.json still contains local HTTP logs.' : 'Seed localHttp.logs before the RC upgrade smoke run.'
  }))

  const currentStateEntries = stateEntriesInDir(currentUserDataDir, fsImpl)
  checks.push(createCheck({
    id: 'openpet-dir-not-active',
    status: currentStateEntries.length === 0 ? 'pass' : 'fail',
    evidence: currentStateEntries.length === 0 ? `No active state files in ${currentUserDataDir}` : currentStateEntries.join(', '),
    notes: currentStateEntries.length === 0
      ? 'OpenPet-named directory is absent or has no active state files.'
      : 'OpenPet-named directory contains state files and may have become an active data source.'
  }))

  return checks
}

const createRcUpgradeSmokeReport = ({
  appDataDir = defaultAppDataDir(),
  legacyDirName = LEGACY_USER_DATA_DIR_NAME,
  currentDirName = CURRENT_USER_DATA_DIR_NAME,
  observedUserDataDir = '',
  packageJsonPath = path.join(__dirname, '..', 'package.json'),
  platform = process.platform,
  arch = process.arch,
  fsImpl = fs,
  hostname = os.hostname,
  now = () => new Date()
} = {}) => {
  const absoluteAppDataDir = path.resolve(appDataDir)
  const legacyUserDataDir = path.join(absoluteAppDataDir, legacyDirName)
  const currentUserDataDir = path.join(absoluteAppDataDir, currentDirName)
  const settingsPath = path.join(legacyUserDataDir, 'settings.json')
  const settingsResult = safeReadJson(settingsPath, fsImpl)
  const packageJson = JSON.parse(fsImpl.readFileSync(packageJsonPath, 'utf-8'))

  return {
    platform,
    arch,
    generatedAt: now().toISOString(),
    source: 'scripts/create-rc-upgrade-smoke-report.js',
    environment: {
      appDataDir: absoluteAppDataDir,
      legacyUserDataDir,
      currentUserDataDir,
      observedUserDataDir: observedUserDataDir ? path.resolve(observedUserDataDir) : '',
      machine: hostname()
    },
    artifact: {
      version: packageJson.version || '',
      productName: packageJson.build?.productName || packageJson.productName || packageJson.name || 'OpenPet',
      legacyDirName,
      currentDirName
    },
    fixture: {
      settings: settingsPath,
      secrets: path.join(legacyUserDataDir, 'secrets.json'),
      plugins: path.join(legacyUserDataDir, 'plugins'),
      petPacks: path.join(legacyUserDataDir, 'pet-packs')
    },
    checks: dirExists(legacyUserDataDir, fsImpl)
      ? createChecks({ legacyUserDataDir, currentUserDataDir, observedUserDataDir, settingsResult, fsImpl })
      : createPendingChecks()
  }
}

const parseArgs = (argv) => {
  const options = {
    appDataDir: defaultAppDataDir(),
    observedUserDataDir: '',
    outputPath: DEFAULT_OUTPUT_PATH,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--app-data-dir') {
      options.appDataDir = readValue(index, arg)
      index += 1
    } else if (arg === '--observed-user-data-dir') {
      options.observedUserDataDir = readValue(index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const writeReport = ({ report, outputPath, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const report = createRcUpgradeSmokeReport({
    appDataDir: options.appDataDir,
    observedUserDataDir: options.observedUserDataDir
  })
  const outputPath = writeReport({ report, outputPath: options.outputPath })
  const passed = report.checks.filter((check) => check.status === 'pass').length

  console.log(`RC upgrade smoke report created: ${outputPath}`)
  console.log(`Legacy userData: ${report.environment.legacyUserDataDir}`)
  console.log(`Checks: ${passed}/${report.checks.length} passed`)
  console.log('Validate without --allow-pending only after a packaged OpenPet RC run confirms the observed userData directory.')
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
  CURRENT_USER_DATA_DIR_NAME,
  LEGACY_USER_DATA_DIR_NAME,
  createRcUpgradeSmokeReport,
  defaultAppDataDir,
  parseArgs,
  writeReport
}
