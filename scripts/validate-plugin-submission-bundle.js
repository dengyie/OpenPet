const fs = require('fs')
const path = require('path')

const REQUIRED_FILES = {
  report: 'plugin-submission-report.md',
  pr: 'plugin-submission-pr.md',
  summary: 'plugin-submission-summary.json'
}

const VALID_DECISIONS = new Set(['ready-for-human-review', 'blocked-before-review'])

const usage = () => [
  'Usage: node scripts/validate-plugin-submission-bundle.js <bundle-dir> [options]',
  '',
  'Options:',
  '  --json                          Print machine-readable validation result',
  '  --require-ready                 Fail unless the bundle is ready for human review',
  '',
  'Validates a local plugin submission workflow bundle created by create-plugin-submission-bundle.',
  'The command does not install, enable, or run plugin code.'
].join('\n')

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const hasText = (value) => typeof value === 'string' && value.trim().length > 0
const toPosixPath = (value) => String(value || '').split(path.sep).join('/')
const isSafeRelativePath = (value) => {
  const normalized = toPosixPath(String(value || '').trim())
  if (!normalized) return false
  if (normalized.startsWith('/')) return false
  if (/^[A-Za-z]:\//.test(normalized)) return false
  return !normalized.split('/').some((segment) => segment === '..')
}
const isAbsoluteLocalPath = (value) => {
  const text = String(value || '').trim()
  return Boolean(text) && (path.isAbsolute(text) || /^[A-Za-z]:[\\/]/.test(text))
}

const parseArgs = (argv) => {
  const options = {
    bundleDir: '',
    json: false,
    requireReady: false,
    help: false
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--require-ready') {
      options.requireReady = true
    } else if (!options.bundleDir) {
      options.bundleDir = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const expectedFilePaths = (bundleDir) => {
  const absoluteBundleDir = path.resolve(bundleDir)
  return Object.fromEntries(
    Object.entries(REQUIRED_FILES).map(([key, fileName]) => [key, path.join(absoluteBundleDir, fileName)])
  )
}

const loadBundle = ({ bundleDir, fsImpl = fs } = {}) => {
  if (!bundleDir) throw new Error('Bundle directory is required')

  const absoluteBundleDir = path.resolve(bundleDir)
  const files = expectedFilePaths(absoluteBundleDir)
  const missingFiles = Object.entries(files)
    .filter(([, filePath]) => !fsImpl.existsSync(filePath))
    .map(([key]) => REQUIRED_FILES[key])

  let summary = null
  let summaryParseError = ''
  let summaryRaw = ''
  if (!missingFiles.includes(REQUIRED_FILES.summary)) {
    try {
      summaryRaw = fsImpl.readFileSync(files.summary, 'utf-8')
      summary = JSON.parse(summaryRaw)
    } catch (err) {
      summaryParseError = err.message || String(err)
    }
  }

  const readOptional = (filePath) => (fsImpl.existsSync(filePath) ? fsImpl.readFileSync(filePath, 'utf-8') : '')

  return {
    bundleDir: absoluteBundleDir,
    files,
    missingFiles,
    summary,
    summaryRaw,
    summaryParseError,
    reportMarkdown: readOptional(files.report),
    prMarkdown: readOptional(files.pr)
  }
}

const includesText = (content, value) => hasText(value) && content.includes(value)

const validateSummaryFiles = ({ bundle, errors, warnings }) => {
  const summaryFiles = bundle.summary.files
  if (!isObject(summaryFiles)) {
    errors.push('summary.files must be an object')
    return
  }

  for (const [key, fileName] of Object.entries(REQUIRED_FILES)) {
    const recordedPath = summaryFiles[key]
    if (!hasText(recordedPath)) {
      errors.push(`summary.files.${key} is required`)
      continue
    }
    if (path.basename(recordedPath) !== fileName) {
      errors.push(`summary.files.${key} must point to ${fileName}`)
    }
    if (isAbsoluteLocalPath(recordedPath) && path.resolve(recordedPath) !== bundle.files[key]) {
      warnings.push(`summary.files.${key} does not match the current bundle directory; the bundle may have been moved`)
    }
    if (!isAbsoluteLocalPath(recordedPath) && !isSafeRelativePath(recordedPath)) {
      warnings.push(`summary.files.${key} should be a safe relative path`)
    }
  }
}

const validateBundle = (bundle, options = {}) => {
  const requireReady = Boolean(options.requireReady)
  const errors = []
  const warnings = []

  if (!isObject(bundle)) {
    return { ok: false, errors: ['Bundle must be an object'], warnings, summary: { filesPresent: 0, filesTotal: 3 } }
  }

  for (const fileName of bundle.missingFiles || []) errors.push(`missing required file: ${fileName}`)
  if (bundle.summaryParseError) errors.push(`plugin-submission-summary.json is not valid JSON: ${bundle.summaryParseError}`)

  const summary = bundle.summary
  if (!isObject(summary)) {
    errors.push('plugin-submission-summary.json must contain a JSON object')
  } else {
    if (!hasText(summary.generatedAt)) errors.push('summary.generatedAt is required')
    if (!hasText(summary.sourcePath)) errors.push('summary.sourcePath is required')
    if (!hasText(summary.outputDir)) errors.push('summary.outputDir is required')
    if (isAbsoluteLocalPath(summary.outputDir) && path.resolve(summary.outputDir) !== bundle.bundleDir) {
      warnings.push('summary.outputDir does not match the current bundle directory; the bundle may have been moved')
    }
    if (!isAbsoluteLocalPath(summary.outputDir) && hasText(summary.outputDir) && !isSafeRelativePath(summary.outputDir)) {
      warnings.push('summary.outputDir should be a safe relative path')
    }

    if (typeof summary.readyForHumanReview !== 'boolean') errors.push('summary.readyForHumanReview must be a boolean')
    if (!VALID_DECISIONS.has(summary.decision)) errors.push('summary.decision is invalid')
    if (summary.readyForHumanReview === true && summary.decision !== 'ready-for-human-review') {
      errors.push('summary.decision must be ready-for-human-review when readyForHumanReview is true')
    }
    if (summary.readyForHumanReview === false && summary.decision !== 'blocked-before-review') {
      errors.push('summary.decision must be blocked-before-review when readyForHumanReview is false')
    }
    if (requireReady && summary.readyForHumanReview !== true) {
      errors.push('bundle is not ready for human review')
    }

    if (!isObject(summary.plugin)) {
      errors.push('summary.plugin must be an object')
    } else {
      if (!hasText(summary.plugin.id)) errors.push('summary.plugin.id is required')
      if (!hasText(summary.plugin.name)) errors.push('summary.plugin.name is required')
      if (!hasText(summary.plugin.version)) errors.push('summary.plugin.version is required')
    }

    if (!isObject(summary.package)) {
      errors.push('summary.package must be an object')
    } else if (!/^[a-f0-9]{64}$/i.test(String(summary.package.sha256 || ''))) {
      errors.push('summary.package.sha256 must be a 64-character hex digest')
    }

    if (!isObject(summary.signature)) {
      errors.push('summary.signature must be an object')
    } else {
      if (!hasText(summary.signature.status)) errors.push('summary.signature.status is required')
      if (!hasText(summary.signature.label)) errors.push('summary.signature.label is required')
    }

    if (!isObject(summary.validation)) {
      errors.push('summary.validation must be an object')
    } else if (typeof summary.validation.ok !== 'boolean') {
      errors.push('summary.validation.ok must be a boolean')
    }

    if (!Array.isArray(summary.nextSteps) || summary.nextSteps.length === 0) {
      warnings.push('summary.nextSteps is empty')
    }

    validateSummaryFiles({ bundle, errors, warnings })

    if (hasText(bundle.reportMarkdown)) {
      if (!bundle.reportMarkdown.includes('OpenPet Plugin Submission Report')) {
        errors.push('plugin-submission-report.md is not an OpenPet submission report')
      }
      if (summary.plugin?.id && !includesText(bundle.reportMarkdown, summary.plugin.id)) {
        errors.push('summary.plugin.id is not present in plugin-submission-report.md')
      }
      if (summary.package?.sha256 && !includesText(bundle.reportMarkdown, summary.package.sha256)) {
        errors.push('summary.package.sha256 is not present in plugin-submission-report.md')
      }
    }

    if (hasText(bundle.prMarkdown)) {
      if (!bundle.prMarkdown.includes('Plugin submission:')) {
        errors.push('plugin-submission-pr.md is not an OpenPet plugin submission PR body')
      }
      if (summary.plugin?.id && !includesText(bundle.prMarkdown, summary.plugin.id)) {
        errors.push('summary.plugin.id is not present in plugin-submission-pr.md')
      }
      if (summary.package?.sha256 && !includesText(bundle.prMarkdown, summary.package.sha256)) {
        errors.push('summary.package.sha256 is not present in plugin-submission-pr.md')
      }
    }
  }

  const filesPresent = Object.keys(REQUIRED_FILES).length - (bundle.missingFiles?.length || 0)
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      filesPresent,
      filesTotal: Object.keys(REQUIRED_FILES).length,
      readyForHumanReview: summary?.readyForHumanReview === true,
      decision: summary?.decision || '',
      requireReady
    }
  }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const bundle = loadBundle({ bundleDir: options.bundleDir })
  const result = validateBundle(bundle, options)

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ bundleDir: bundle.bundleDir, ...result }, null, 2)}\n`)
  } else {
    console.log(`Plugin submission bundle: ${bundle.bundleDir}`)
    console.log(`Files: ${result.summary.filesPresent}/${result.summary.filesTotal} present`)
    console.log(`Decision: ${result.summary.decision || '(unknown)'}`)
    console.log(`Ready for human review: ${result.summary.readyForHumanReview ? 'yes' : 'no'}`)
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
  }

  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    process.exit(1)
  }

  if (!options.json) console.log('Plugin submission bundle validation passed.')
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
  REQUIRED_FILES,
  expectedFilePaths,
  loadBundle,
  parseArgs,
  validateBundle
}
