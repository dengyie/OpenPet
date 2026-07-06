const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const { REQUIRED_CHECKS } = require('./validate-desktop-picker-smoke-report')

const DEFAULT_RELEASE_DIR = path.join(__dirname, '..', 'release')
const DEFAULT_OUTPUT_PATH = path.join(DEFAULT_RELEASE_DIR, 'desktop-picker-smoke-report.json')
const DEFAULT_RELEASE_DIR_LABEL = 'release'

const usage = () => [
  'Usage: node scripts/create-desktop-picker-smoke-report.js [--platform <darwin|win32>] [--release-dir <dir>] [--output <report.json>] [--allow-any-platform]',
  '',
  'Creates a pending packaged desktop native OS file picker smoke report.',
  'The report is a structure and evidence container only; real picker checks remain pending until a manual packaged-app smoke run fills them.'
].join('\n')

const createPendingChecks = () => REQUIRED_CHECKS.map((check) => ({
  id: check.id,
  status: 'pending',
  evidence: '',
  notes: `${check.label}. Fill with evidence from a real packaged-app native picker smoke validation run.`
}))

const toPosixPath = (value) => String(value || '').split(path.sep).join('/')
const isSafeRelativePath = (value) => {
  const normalized = toPosixPath(String(value || '').trim())
  if (!normalized) return false
  if (normalized.startsWith('/')) return false
  if (/^[A-Za-z]:\//.test(normalized)) return false
  return !normalized.split('/').some((segment) => segment === '..')
}

const createSafeProjectPath = (targetPath, fallback) => {
  const relative = toPosixPath(path.relative(process.cwd(), String(targetPath || '').trim()))
  return isSafeRelativePath(relative) ? relative : fallback
}

const hasPlatformToken = (fileName, tokens) => {
  const lowerName = String(fileName || '').toLowerCase()
  return tokens.some((token) => new RegExp(`(^|[-_.\\s])${token}([-_.\\s]|$)`).test(lowerName))
}

const hasMacToken = (fileName) => hasPlatformToken(fileName, ['darwin', 'mac', 'macos'])
const hasWindowsToken = (fileName) => hasPlatformToken(fileName, ['win', 'win32', 'windows'])
const normalizeArchToken = (value) => {
  const token = String(value || '').toLowerCase()
  if (token === 'x86_64') return 'x64'
  if (token === 'aarch64') return 'arm64'
  return token
}

const inferArchFromFileName = (fileName) => {
  const match = String(fileName || '').toLowerCase().match(/(^|[-_.\/\s])(x64|arm64|aarch64|x86_64|ia32)(?=$|[-_.\/\s])/)
  return match ? normalizeArchToken(match[2]) : ''
}

const inferArtifactArch = ({ artifact, files }) => {
  const candidates = [
    artifact?.appPath,
    artifact?.installer,
    artifact?.zip,
    artifact?.latestYml,
    ...(artifact?.blockmaps || []),
    ...(artifact?.files || []).map((file) => file?.name),
    ...(files || [])
  ].filter(Boolean)

  for (const candidate of candidates) {
    const inferred = inferArchFromFileName(candidate)
    if (inferred) return inferred
  }

  return ''
}

const listReleaseFiles = (releaseDir, fsImpl = fs) => {
  if (!fsImpl.existsSync(releaseDir)) return []
  return fsImpl.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

const findMacAppPath = ({ releaseDir, files, fsImpl = fs }) => {
  const direct = files.find((fileName) => /\.app$/i.test(fileName))
  if (direct) return direct

  const macDirs = files.filter((fileName) => /^(mac|mac-|mac_|macos|darwin|darwin-|darwin_)/i.test(fileName) || /^mac/i.test(fileName))
  for (const dirName of macDirs) {
    const candidateDir = path.join(releaseDir, dirName)
    if (!fsImpl.existsSync(candidateDir) || !fsImpl.statSync(candidateDir).isDirectory()) continue
    const nested = fsImpl.readdirSync(candidateDir).find((fileName) => /\.app$/i.test(fileName))
    if (nested) return path.join(dirName, nested)
  }

  return ''
}

const getFileSize = (filePath, fsImpl = fs) => {
  try {
    return fsImpl.statSync(filePath).size
  } catch (_) {
    return 0
  }
}

const pickArtifacts = ({ releaseDir, platform, files, fsImpl = fs }) => {
  if (platform === 'darwin') {
    const appPath = findMacAppPath({ releaseDir, files, fsImpl })
    const dmg = files.find((fileName) => /\.dmg$/i.test(fileName) && !hasWindowsToken(fileName)) || ''
    const zip = files.find((fileName) => /\.zip$/i.test(fileName) && !hasWindowsToken(fileName) && (hasMacToken(fileName) || !hasWindowsToken(fileName))) || ''
    const latestYml = files.includes('latest-mac.yml') ? 'latest-mac.yml' : ''
    const names = [appPath, dmg, zip, latestYml].filter(Boolean)
    return {
      appPath,
      installer: dmg,
      zip,
      latestYml,
      files: names.map((name) => ({ name, size: getFileSize(path.join(releaseDir, name), fsImpl) }))
    }
  }

  if (platform === 'win32') {
    const installer = files.find((fileName) => /\.exe$/i.test(fileName) && !hasMacToken(fileName)) || ''
    const zip = files.find((fileName) => /\.zip$/i.test(fileName) && !hasMacToken(fileName) && (hasWindowsToken(fileName) || !hasMacToken(fileName))) || ''
    const latestYml = files.includes('latest.yml') ? 'latest.yml' : ''
    const blockmaps = files.filter((fileName) => /\.blockmap$/i.test(fileName) && !hasMacToken(fileName))
    const names = [installer, zip, latestYml, ...blockmaps].filter(Boolean)
    return {
      appPath: '',
      installer,
      zip,
      latestYml,
      blockmaps,
      files: names.map((name) => ({ name, size: getFileSize(path.join(releaseDir, name), fsImpl) }))
    }
  }

  throw new Error(`Unsupported platform for desktop picker smoke report: ${platform}`)
}

const parseMacSignatureStatus = (output) => {
  const text = String(output || '')
  if (/valid on disk/i.test(text) && /satisfies its Designated Requirement/i.test(text)) return 'Valid'
  if (/code object is not signed/i.test(text) || /rejected/i.test(text)) return 'NotSigned'
  return text.trim() ? 'Unknown' : 'NotChecked'
}

const parseAuthenticodeStatus = (output) => {
  const text = String(output || '').trim()
  const match = text.match(/^\s*Status\s*:\s*(.+?)\s*$/mi)
  return match ? match[1].trim() : ''
}

const getSignatureEvidence = ({ releaseDir, platform, artifact, execFile = execFileSync } = {}) => {
  if (platform === 'darwin') {
    const target = artifact.appPath || artifact.installer
    if (!target) return { signed: false, signatureStatus: 'NotChecked', signatureEvidence: '' }
    try {
      const output = execFile('codesign', ['--verify', '--deep', '--strict', '--verbose=2', path.join(releaseDir, target)], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
      const evidence = String(output || '').trim()
      const status = parseMacSignatureStatus(evidence) || 'Unknown'
      return { signed: status === 'Valid', signatureStatus: status, signatureEvidence: evidence }
    } catch (err) {
      const evidence = String(err.stderr || err.stdout || err.message || err).trim()
      const status = parseMacSignatureStatus(evidence) || 'Unknown'
      return { signed: status === 'Valid', signatureStatus: status, signatureEvidence: evidence }
    }
  }

  if (platform === 'win32') {
    if (!artifact.installer || process.platform !== 'win32') {
      return { signed: false, authenticodeStatus: 'NotChecked', signatureEvidence: '', authenticodeEvidence: '' }
    }
    try {
      const output = execFile('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Get-AuthenticodeSignature -LiteralPath ${JSON.stringify(path.join(releaseDir, artifact.installer))} | Format-List`
      ], { encoding: 'utf-8' })
      const evidence = String(output || '').trim()
      const status = parseAuthenticodeStatus(evidence) || 'Unknown'
      return { signed: status.toLowerCase() === 'valid', authenticodeStatus: status, signatureEvidence: evidence, authenticodeEvidence: evidence }
    } catch (err) {
      const evidence = `Get-AuthenticodeSignature failed: ${err.message || err}`
      return { signed: false, authenticodeStatus: 'Unknown', signatureEvidence: evidence, authenticodeEvidence: evidence }
    }
  }

  return { signed: false, signatureStatus: 'NotChecked', signatureEvidence: '' }
}

const getRunnerEvidence = (env = process.env) => {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
  }
  return env.GITHUB_RUN_ID ? `GitHub Actions run ${env.GITHUB_RUN_ID}` : ''
}

const createDesktopPickerSmokeReport = ({
  releaseDir = DEFAULT_RELEASE_DIR,
  packageJsonPath = path.join(__dirname, '..', 'package.json'),
  platform = process.platform,
  arch = process.arch,
  allowAnyPlatform = false,
  fsImpl = fs,
  env = process.env,
  execFile = execFileSync,
  hostname = os.hostname,
  now = () => new Date()
} = {}) => {
  if (!['darwin', 'win32'].includes(platform)) throw new Error('Desktop picker smoke reports only support darwin and win32')
  if (!allowAnyPlatform && platform !== process.platform) {
    throw new Error('Desktop picker smoke reports must be generated on their target platform unless --allow-any-platform is used for structure checks')
  }

  const absoluteReleaseDir = path.resolve(releaseDir)
  const files = listReleaseFiles(absoluteReleaseDir, fsImpl)
  const artifact = pickArtifacts({ releaseDir: absoluteReleaseDir, platform, files, fsImpl })
  const packageJson = JSON.parse(fsImpl.readFileSync(packageJsonPath, 'utf-8'))
  const signature = getSignatureEvidence({ releaseDir: absoluteReleaseDir, platform, artifact, execFile })
  const resolvedArch = inferArtifactArch({ artifact, files }) || arch

  return {
    platform,
    arch: resolvedArch,
    generatedAt: now().toISOString(),
    source: 'scripts/create-desktop-picker-smoke-report.js',
    environment: {
      osRelease: os.release(),
      machine: hostname(),
      runner: env.GITHUB_RUNNER_NAME || env.RUNNER_NAME || '',
      evidence: getRunnerEvidence(env)
    },
    artifact: {
      version: packageJson.version || '',
      releaseDir: createSafeProjectPath(absoluteReleaseDir, DEFAULT_RELEASE_DIR_LABEL),
      ...artifact,
      ...signature
    },
    fixture: {
      pluginPackage: 'Use a valid .openpet-plugin.zip fixture with a signature.json hash metadata file.',
      frameFolder: 'Use a folder containing ordered transparent PNG frames.',
      petPack: 'Use a valid pet pack directory with pet.json and sprite assets.'
    },
    checks: createPendingChecks()
  }
}

const parseArgs = (argv) => {
  const options = {
    platform: process.platform,
    releaseDir: DEFAULT_RELEASE_DIR,
    outputPath: DEFAULT_OUTPUT_PATH,
    allowAnyPlatform: false,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--platform') {
      options.platform = readValue(index, arg)
      index += 1
    } else if (arg === '--release-dir') {
      options.releaseDir = readValue(index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (arg === '--allow-any-platform') {
      options.allowAnyPlatform = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!['darwin', 'win32'].includes(options.platform)) throw new Error('--platform must be darwin or win32')
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

  const report = createDesktopPickerSmokeReport(options)
  const outputPath = writeReport({ report, outputPath: options.outputPath })

  console.log(`Desktop picker smoke report created: ${outputPath}`)
  console.log(`Platform: ${report.platform}`)
  console.log(`Artifact: ${report.artifact.appPath || report.artifact.installer || report.artifact.zip || 'not discovered'}`)
  console.log('Native picker smoke checks remain pending until a packaged-app validation run fills evidence.')
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
  createDesktopPickerSmokeReport,
  createPendingChecks,
  getSignatureEvidence,
  parseAuthenticodeStatus,
  parseMacSignatureStatus,
  pickArtifacts,
  writeReport
}
