const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const { REQUIRED_CHECKS } = require('./validate-windows-smoke-report')

const DEFAULT_RELEASE_DIR = path.join(__dirname, '..', 'release')
const DEFAULT_OUTPUT_PATH = path.join(DEFAULT_RELEASE_DIR, 'windows-smoke-report.json')

const usage = () => [
  'Usage: node scripts/create-windows-smoke-report.js [--release-dir <dir>] [--output <report.json>] [--allow-non-windows]',
  '',
  'Creates a structured Windows smoke evidence report from release artifacts.',
  'The generated report keeps runtime smoke checks pending; real pass evidence must be filled after Windows validation.'
].join('\n')

const hasPlatformToken = (fileName, tokens) => {
  const lowerName = String(fileName || '').toLowerCase()
  return tokens.some((token) => new RegExp(`(^|[-_.\\s])${token}([-_.\\s]|$)`).test(lowerName))
}

const hasMacToken = (fileName) => hasPlatformToken(fileName, ['darwin', 'mac', 'macos'])
const hasWindowsToken = (fileName) => hasPlatformToken(fileName, ['win', 'win32', 'windows'])

const isWindowsZip = (fileName) => {
  if (!/\.zip$/i.test(fileName)) return false
  if (hasMacToken(fileName)) return false
  return hasWindowsToken(fileName) || !hasMacToken(fileName)
}

const getFileSize = (filePath, fsImpl = fs) => fsImpl.statSync(filePath).size

const listReleaseFiles = (releaseDir, fsImpl = fs) => {
  if (!fsImpl.existsSync(releaseDir)) throw new Error(`Release directory not found: ${releaseDir}`)
  return fsImpl.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

const pickWindowsArtifacts = ({ releaseDir, files, fsImpl = fs }) => {
  const installer = files.find((fileName) => /\.exe$/i.test(fileName) && !hasMacToken(fileName)) || ''
  const zip = files.find(isWindowsZip) || ''
  const latestYml = files.includes('latest.yml') ? 'latest.yml' : ''
  const blockmaps = files.filter((fileName) => /\.blockmap$/i.test(fileName) && !hasMacToken(fileName))
  const allArtifacts = [installer, zip, latestYml, ...blockmaps].filter(Boolean)

  return {
    installer,
    zip,
    latestYml,
    blockmaps,
    files: allArtifacts.map((fileName) => ({
      name: fileName,
      size: getFileSize(path.join(releaseDir, fileName), fsImpl)
    }))
  }
}

const parseAuthenticodeStatus = (output) => {
  const text = String(output || '').trim()
  const match = text.match(/^\s*Status\s*:\s*(.+?)\s*$/mi)
  return match ? match[1].trim() : ''
}

const getAuthenticodeEvidence = ({ installerPath, platform = process.platform, execFile = execFileSync } = {}) => {
  if (!installerPath || platform !== 'win32') {
    return { status: 'NotChecked', evidence: '' }
  }

  try {
    const output = execFile('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Get-AuthenticodeSignature -LiteralPath ${JSON.stringify(installerPath)} | Format-List`
    ], { encoding: 'utf-8' })
    const status = parseAuthenticodeStatus(output) || 'Unknown'
    return { status, evidence: String(output || '').trim() }
  } catch (err) {
    return {
      status: 'Unknown',
      evidence: `Get-AuthenticodeSignature failed: ${err.message || err}`
    }
  }
}

const getWindowsVersion = ({ platform = process.platform, osRelease = os.release } = {}) => {
  if (platform !== 'win32') return ''
  return `Windows ${osRelease()}`
}

const getRunnerEvidence = (env = process.env) => {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
  }
  return env.GITHUB_RUN_ID ? `GitHub Actions run ${env.GITHUB_RUN_ID}` : ''
}

const createPendingChecks = () => REQUIRED_CHECKS.map((check) => ({
  id: check.id,
  status: 'pending',
  evidence: '',
  notes: `${check.label}. Fill with evidence from a real Windows smoke validation run.`
}))

const createWindowsSmokeReport = ({
  releaseDir = DEFAULT_RELEASE_DIR,
  packageJsonPath = path.join(__dirname, '..', 'package.json'),
  platform = process.platform,
  arch = 'x64',
  allowNonWindows = false,
  fsImpl = fs,
  env = process.env,
  execFile = execFileSync,
  osRelease = os.release,
  hostname = os.hostname,
  now = () => new Date()
} = {}) => {
  if (platform !== 'win32' && !allowNonWindows) {
    throw new Error('Windows smoke reports must be generated on Windows unless --allow-non-windows is used for local structure checks')
  }

  const absoluteReleaseDir = path.resolve(releaseDir)
  const files = listReleaseFiles(absoluteReleaseDir, fsImpl)
  const artifacts = pickWindowsArtifacts({ releaseDir: absoluteReleaseDir, files, fsImpl })
  const missing = []
  if (!artifacts.installer) missing.push('Windows .exe installer')
  if (!artifacts.zip) missing.push('Windows .zip archive')
  if (!artifacts.latestYml) missing.push('latest.yml')
  if (missing.length > 0) throw new Error(`Missing required Windows release artifact(s): ${missing.join(', ')}`)

  const packageJson = JSON.parse(fsImpl.readFileSync(packageJsonPath, 'utf-8'))
  const installerPath = path.join(absoluteReleaseDir, artifacts.installer)
  const authenticode = getAuthenticodeEvidence({ installerPath, platform, execFile })
  const signed = String(authenticode.status || '').toLowerCase() === 'valid'

  return {
    platform: 'win32',
    arch,
    generatedAt: now().toISOString(),
    source: 'scripts/create-windows-smoke-report.js',
    environment: {
      windowsVersion: getWindowsVersion({ platform, osRelease }),
      machine: platform === 'win32' ? hostname() : 'non-Windows structure check',
      runner: env.GITHUB_RUNNER_NAME || env.RUNNER_NAME || '',
      evidence: getRunnerEvidence(env)
    },
    artifact: {
      version: packageJson.version || '',
      installer: artifacts.installer,
      zip: artifacts.zip,
      latestYml: artifacts.latestYml,
      blockmaps: artifacts.blockmaps,
      files: artifacts.files,
      signed,
      authenticodeStatus: authenticode.status,
      authenticodeEvidence: authenticode.evidence
    },
    checks: createPendingChecks()
  }
}

const parseArgs = (argv) => {
  const options = {
    releaseDir: DEFAULT_RELEASE_DIR,
    outputPath: DEFAULT_OUTPUT_PATH,
    allowNonWindows: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--release-dir') {
      options.releaseDir = argv[index + 1]
      index += 1
    } else if (arg === '--output') {
      options.outputPath = argv[index + 1]
      index += 1
    } else if (arg === '--allow-non-windows') {
      options.allowNonWindows = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.releaseDir) throw new Error('--release-dir requires a value')
  if (!options.outputPath) throw new Error('--output requires a value')
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

  const report = createWindowsSmokeReport({
    releaseDir: options.releaseDir,
    allowNonWindows: options.allowNonWindows
  })
  const outputPath = writeReport({ report, outputPath: options.outputPath })

  console.log(`Windows smoke report created: ${outputPath}`)
  console.log(`Artifact: ${report.artifact.installer}`)
  console.log(`Authenticode: ${report.artifact.authenticodeStatus}`)
  console.log('Runtime smoke checks remain pending until a real Windows validation run fills evidence.')
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
  createPendingChecks,
  createWindowsSmokeReport,
  getAuthenticodeEvidence,
  parseAuthenticodeStatus,
  pickWindowsArtifacts,
  writeReport
}
