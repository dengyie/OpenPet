const fs = require('fs')
const path = require('path')

const { loadBundle, validateBundle } = require('./validate-plugin-submission-bundle')
const { VALID_DECISIONS } = require('./create-plugin-maintainer-approval')

const REQUIRED_FILES = {
  markdown: 'plugin-maintainer-approval.md',
  json: 'plugin-maintainer-approval.json',
  submissionSummary: 'plugin-submission-summary.json'
}

const usage = () => [
  'Usage: node scripts/validate-plugin-maintainer-approval.js <bundle-dir> [options]',
  '',
  'Options:',
  '  --json                        Print machine-readable validation result',
  '  --require-approved            Fail unless the approval decision is approved and the bundle was ready for review',
  '',
  'Validates maintainer approval artifacts for an existing plugin submission bundle.',
  'The command does not install, enable, or run plugin code.'
].join('\n')

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const hasText = (value) => typeof value === 'string' && value.trim().length > 0

const parseArgs = (argv) => {
  const options = {
    bundleDir: '',
    json: false,
    requireApproved: false,
    help: false
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--require-approved') {
      options.requireApproved = true
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

const loadApprovalBundle = ({ bundleDir, fsImpl = fs } = {}) => {
  if (!bundleDir) throw new Error('Bundle directory is required')

  const bundle = loadBundle({ bundleDir, fsImpl })
  const files = expectedFilePaths(bundleDir)
  const missingFiles = Object.entries(files)
    .filter(([, filePath]) => !fsImpl.existsSync(filePath))
    .map(([key]) => REQUIRED_FILES[key])

  let approval = null
  let approvalParseError = ''
  let approvalRaw = ''
  if (!missingFiles.includes(REQUIRED_FILES.json)) {
    try {
      approvalRaw = fsImpl.readFileSync(files.json, 'utf-8')
      approval = JSON.parse(approvalRaw)
    } catch (err) {
      approvalParseError = err.message || String(err)
    }
  }

  return {
    bundle,
    bundleDir: bundle.bundleDir,
    files,
    missingFiles,
    approval,
    approvalRaw,
    approvalParseError,
    markdown: fsImpl.existsSync(files.markdown) ? fsImpl.readFileSync(files.markdown, 'utf-8') : ''
  }
}

const validateMaintainerApproval = (approvalBundle, options = {}) => {
  const requireApproved = Boolean(options.requireApproved)
  const errors = []
  const warnings = []

  if (!isObject(approvalBundle)) {
    return { ok: false, errors: ['Approval bundle must be an object'], warnings, summary: { approved: false } }
  }

  for (const fileName of approvalBundle.missingFiles || []) errors.push(`missing required file: ${fileName}`)
  if (approvalBundle.approvalParseError) errors.push(`plugin-maintainer-approval.json is not valid JSON: ${approvalBundle.approvalParseError}`)

  const submissionValidation = validateBundle(approvalBundle.bundle, { requireReady: false })
  if (!submissionValidation.ok) {
    errors.push(`submission bundle is invalid: ${submissionValidation.errors.join('; ')}`)
  }

  const approval = approvalBundle.approval
  const submissionSummary = approvalBundle.bundle.summary

  if (!isObject(approval)) {
    errors.push('plugin-maintainer-approval.json must contain a JSON object')
  } else {
    if (!hasText(approval.generatedAt)) errors.push('approval.generatedAt is required')
    if (!hasText(approval.reviewer)) errors.push('approval.reviewer is required')
    if (!hasText(approval.notes)) errors.push('approval.notes is required')
    if (!hasText(approval.sourceBundleDir)) errors.push('approval.sourceBundleDir is required')
    if (!VALID_DECISIONS.has(approval.decision)) errors.push('approval.decision is invalid')

    if (!isObject(approval.plugin)) {
      errors.push('approval.plugin must be an object')
    } else {
      if (!hasText(approval.plugin.id)) errors.push('approval.plugin.id is required')
      if (!hasText(approval.plugin.version)) errors.push('approval.plugin.version is required')
      if (submissionSummary?.plugin?.id && approval.plugin.id !== submissionSummary.plugin.id) {
        errors.push('approval.plugin.id does not match submission bundle')
      }
      if (submissionSummary?.plugin?.version && approval.plugin.version !== submissionSummary.plugin.version) {
        errors.push('approval.plugin.version does not match submission bundle')
      }
    }

    if (!isObject(approval.package)) {
      errors.push('approval.package must be an object')
    } else if (!/^[a-f0-9]{64}$/i.test(String(approval.package.sha256 || ''))) {
      errors.push('approval.package.sha256 must be a 64-character hex digest')
    } else if (submissionSummary?.package?.sha256 && approval.package.sha256 !== submissionSummary.package.sha256) {
      errors.push('approval package sha256 does not match submission bundle')
    }

    if (submissionSummary?.decision && approval.submissionDecision !== submissionSummary.decision) {
      errors.push('approval.submissionDecision does not match submission bundle')
    }

    const expectedReady = submissionValidation.summary.readyForHumanReview && approval.decision === 'approved'
    if (Boolean(approval.approvalReady) !== expectedReady) {
      errors.push('approval.approvalReady does not match the submission readiness plus decision')
    }
    if (requireApproved && approval.decision !== 'approved') {
      errors.push('approval is not marked approved')
    }
    if (requireApproved && submissionValidation.summary.readyForHumanReview !== true) {
      errors.push('source submission bundle is not ready for human review')
    }

    if (hasText(approvalBundle.markdown) && !approvalBundle.markdown.includes('Plugin Maintainer Approval')) {
      errors.push('plugin-maintainer-approval.md is not an OpenPet maintainer approval record')
    }

    if (path.resolve(String(approval.sourceBundleDir || '')) !== approvalBundle.bundleDir) {
      warnings.push('approval.sourceBundleDir does not match the current bundle directory; the bundle may have been moved')
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      approved: approval?.decision === 'approved',
      approvalReady: approval?.approvalReady === true,
      requireApproved
    }
  }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const approvalBundle = loadApprovalBundle({ bundleDir: options.bundleDir })
  const result = validateMaintainerApproval(approvalBundle, options)

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ bundleDir: approvalBundle.bundleDir, ...result }, null, 2)}\n`)
  } else {
    console.log(`Plugin maintainer approval bundle: ${approvalBundle.bundleDir}`)
    console.log(`Approved: ${result.summary.approved ? 'yes' : 'no'}`)
    console.log(`Approval ready: ${result.summary.approvalReady ? 'yes' : 'no'}`)
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
  }

  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    process.exit(1)
  }

  if (!options.json) console.log('Plugin maintainer approval validation passed.')
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
  loadApprovalBundle,
  parseArgs,
  validateMaintainerApproval
}
