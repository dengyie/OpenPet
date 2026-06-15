const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPluginInstallService } = require('../src/main/services/plugin-install-service')

const usage = () => [
  'Usage: node scripts/validate-plugin-package.js <plugin-dir-or-zip> [options]',
  '',
  'Options:',
  '  --json                         Print machine-readable JSON only',
  '  --require-signature            Fail unless signature hash metadata is verified',
  '  --installed-dir <dir>          Compare against an installed plugin directory for update diffs',
  '  --block-id <pluginId>          Treat this plugin id as blocked; repeatable',
  '  --block-sha256 <sha256>        Treat this package hash as blocked; repeatable',
  '',
  'The command inspects packages through PluginInstallService and does not install or run plugin code.'
].join('\n')

const createSettingsService = () => {
  let current = {
    plugins: {
      enabled: {},
      config: {},
      storage: {},
      installed: {}
    }
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const parseArgs = (argv) => {
  const options = {
    sourcePath: '',
    json: false,
    requireSignature: false,
    installedDir: '',
    blockedIds: [],
    blockedHashes: [],
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--require-signature') {
      options.requireSignature = true
    } else if (arg === '--installed-dir') {
      options.installedDir = readValue(index, arg)
      index += 1
    } else if (arg === '--block-id') {
      options.blockedIds.push(readValue(index, arg))
      index += 1
    } else if (arg === '--block-sha256') {
      options.blockedHashes.push(readValue(index, arg).toLowerCase())
      index += 1
    } else if (!options.sourcePath) {
      options.sourcePath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const getPluginBlockStatusFactory = ({ blockedIds = [], blockedHashes = [] } = {}) => {
  const idSet = new Set(blockedIds)
  const hashSet = new Set(blockedHashes.map((value) => String(value).toLowerCase()))

  return ({ id, sha256 }) => {
    const reasons = []
    if (idSet.has(id)) reasons.push(`blocked plugin id: ${id}`)
    if (hashSet.has(String(sha256 || '').toLowerCase())) reasons.push(`blocked package hash: ${sha256}`)
    return {
      blocked: reasons.length > 0,
      reasons
    }
  }
}

const toPublicReview = (review) => ({
  sourceType: review.sourceType,
  installMode: review.installMode,
  plugin: review.plugin,
  signature: review.signature,
  permissionDiff: review.permissionDiff,
  blockStatus: review.blockStatus,
  packageHash: review.packageHash,
  fileCount: review.fileCount,
  byteSize: review.byteSize,
  requiresReview: review.requiresReview,
  riskLevel: review.riskLevel
})

const validateReview = (review, options = {}) => {
  const errors = []
  const warnings = []

  if (review.blockStatus?.blocked) {
    errors.push(`Plugin is blocked: ${review.blockStatus.reasons.join(', ')}`)
  }
  if (review.signature?.errors?.length) {
    errors.push(...review.signature.errors.map((error) => `Signature error: ${error}`))
  }
  if (options.requireSignature && review.signature?.status !== 'hash-verified') {
    errors.push('Signature hash metadata must be verified when --require-signature is used')
  }
  if (review.signature?.status === 'unsigned') {
    warnings.push('Plugin is unsigned; local testing may continue, but catalog/release review should require trusted signature evidence')
  } else if (review.signature?.status === 'present-unverified') {
    warnings.push('Signature metadata is present but not verified')
  }
  if (review.requiresReview) {
    warnings.push('Update adds permissions or network hosts and requires explicit permission review')
  }
  if (review.riskLevel === 'review') {
    warnings.push('Package requires human review before distribution')
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    review: toPublicReview(review)
  }
}

const validatePluginPackage = (sourcePath, options = {}) => {
  if (!sourcePath) throw new Error('Plugin source path is required')
  const pluginDir = options.installedDir
    ? path.resolve(options.installedDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-validate-installed-'))
  fs.mkdirSync(pluginDir, { recursive: true })

  const service = createPluginInstallService({
    settingsService: createSettingsService(),
    pluginDir,
    getPluginBlockStatus: getPluginBlockStatusFactory(options)
  })

  let review
  try {
    review = service.inspectPluginPackage(path.resolve(sourcePath))
    const result = validateReview(review, options)
    service.clearPendingSelection(review.selectionId)
    return result
  } catch (error) {
    if (review?.selectionId) service.clearPendingSelection(review.selectionId)
    throw error
  } finally {
    if (!options.installedDir) fs.rmSync(pluginDir, { recursive: true, force: true })
  }
}

const printTextResult = (result) => {
  const { review } = result
  console.log(`Plugin package: ${review.plugin.id}@${review.plugin.version}`)
  console.log(`Name: ${review.plugin.name}`)
  console.log(`Source: ${review.sourceType}`)
  console.log(`Mode: ${review.installMode}`)
  console.log(`Permissions: ${review.plugin.permissions.join(', ') || 'none'}`)
  console.log(`Network allowlist: ${review.plugin.network.allowlist.join(', ') || 'none'}`)
  console.log(`Commands: ${review.plugin.commands.map((command) => command.id).join(', ') || 'none'}`)
  console.log(`Signature: ${review.signature.label}`)
  console.log(`Package hash: ${review.packageHash}`)
  console.log(`Files: ${review.fileCount}, bytes: ${review.byteSize}`)
  console.log(`Risk: ${review.riskLevel}`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    return
  }
  console.log('Plugin package validation passed.')
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = validatePluginPackage(options.sourcePath, options)
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    printTextResult(result)
  }

  if (!result.ok) process.exit(1)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message || error)
    process.exit(1)
  }
}

module.exports = {
  parseArgs,
  validatePluginPackage,
  validateReview
}
