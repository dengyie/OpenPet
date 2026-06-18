const fs = require('fs')
const path = require('path')

const { sessionIdFromDate } = require('./create-plugin-remote-source-submission-rehearsal')
const { assertSafeRehearsalOutputDir } = require('./create-plugin-author-rehearsal')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-community-source-invitation-kit')
const DEFAULT_CAPABILITIES = ['pet-dialogue', 'pet-action', 'weather']
const CAPABILITY_PATTERN = /^[a-z0-9-]+$/

const usage = () => [
  'Usage: node scripts/create-plugin-community-source-invitation-kit.js --target-author <name> [options]',
  '',
  'Options:',
  '  --target-author <name>              Community author, project, or audience label',
  '  --target-url <https-url>            Optional public source/profile/discussion URL',
  '  --candidate-context <text>          Why this author or audience is relevant',
  '  --requested-capabilities <list>     Space- or comma-separated capability slugs',
  '  --maintainer <name>                 Maintainer preparing the invitation',
  '  --output-dir <dir>                  Directory for invitation artifacts',
  '  --json                              Print the machine-readable invitation summary',
  '  --help',
  '',
  'Creates a draft invitation packet for finding compatible third-party OpenPet',
  'plugin.json packages. It does not send messages, approve candidates, install,',
  'run, sign, publish, or trust any plugin.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function hasText (value) {
  return typeof value === 'string' && value.trim().length > 0
}

const validateHttpsUrl = (value, label) => {
  if (!hasText(value)) return ''
  let parsed
  try {
    parsed = new URL(value)
  } catch (error) {
    throw new Error(`${label} must be a valid URL`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https:`)
  return parsed.toString()
}

const parseCapabilities = (value) => {
  if (!hasText(value)) return [...DEFAULT_CAPABILITIES]
  const capabilities = value
    .split(/[,\s]+/)
    .map((capability) => capability.trim())
    .filter(Boolean)
  if (!capabilities.length) return [...DEFAULT_CAPABILITIES]
  for (const capability of capabilities) {
    if (!CAPABILITY_PATTERN.test(capability)) {
      throw new Error('Requested capability must use lowercase letters, numbers, and hyphens')
    }
  }
  return [...new Set(capabilities)]
}

function parseArgs (argv) {
  const options = {
    targetAuthor: '',
    targetUrl: '',
    candidateContext: '',
    requestedCapabilities: [...DEFAULT_CAPABILITIES],
    maintainer: 'OpenPet Maintainer',
    outputDir: '',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--target-author') {
      options.targetAuthor = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--target-url') {
      options.targetUrl = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--candidate-context') {
      options.candidateContext = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--requested-capabilities') {
      options.requestedCapabilities = parseCapabilities(readValue(argv, index, arg))
      index += 1
    } else if (arg === '--maintainer') {
      options.maintainer = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.help) validateOptions(options)
  return options
}

const validateOptions = (options) => {
  if (!hasText(options.targetAuthor)) throw new Error('Target author is required')
  options.targetAuthor = options.targetAuthor.trim()
  options.targetUrl = validateHttpsUrl(options.targetUrl, 'Target URL')
  options.candidateContext = hasText(options.candidateContext) ? options.candidateContext.trim() : ''
  options.maintainer = hasText(options.maintainer) ? options.maintainer.trim() : 'OpenPet Maintainer'
  options.requestedCapabilities = parseCapabilities(options.requestedCapabilities.join(' '))
}

const writeJson = (filePath, value, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const writeText = (filePath, content, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`)
}

const renderInvitationMessage = ({ summary }) => [
  `Hi ${summary.target.author},`,
  '',
  'OpenPet welcomes third-party extension authors. We are looking for compatible community examples that use the current OpenPet `plugin.json` package model and can pass the public intake flow.',
  '',
  summary.target.url ? `We noticed this public source or profile: ${summary.target.url}` : 'We are preparing this as a general community invitation and have not linked a specific public source yet.',
  summary.candidateContext ? `Context: ${summary.candidateContext}` : '',
  '',
  'Useful plugin ideas for this invitation:',
  ...summary.requestedCapabilities.map((capability) => `- ${capability}`),
  '',
  'A compatible submission should include:',
  '- a package root with `plugin.json`;',
  '- clear `entries.commands`, `entries.services`, `entries.dashboards`, or legacy `main` behavior as needed;',
  '- conservative permissions and no secret-like config values;',
  '- enough README notes for maintainers to run Phase 100 intake before any Phase 99 community-source evidence.',
  '',
  'This invitation draft does not approve, install, run, sign, publish, or trust any plugin. Phase 100 intake, Phase 103 bridge, maintainer review, and Phase 99 evidence still decide compatibility and provenance.',
  '',
  `Prepared by: ${summary.maintainer}`
].filter((line) => line !== '').join('\n')

const renderChecklist = () => [
  '# Community Source Invitation Checklist',
  '',
  '- [ ] Invitation sent',
  '- [ ] Reply received from target author or community',
  '- [ ] Compatible `plugin.json` package received',
  '- [ ] Phase 104 discovery report updated or linked',
  '- [ ] Phase 100 intake report generated',
  '- [ ] Phase 103 bridge used only if intake is `ready-for-community-evidence`',
  '- [ ] Phase 99 community-source evidence generated only after compatible intake',
  '- [ ] Maintainer review records trust/publication decisions separately'
].join('\n')

const renderReadme = ({ generatedAt, summary }) => [
  '# OpenPet Community Source Invitation Kit',
  '',
  `Generated: ${generatedAt}`,
  `Status: ${summary.status}`,
  `Next action: ${summary.nextAction}`,
  '',
  'This kit is a draft invitation packet for finding compatible third-party OpenPet extension sources. It does not prove an invitation was sent, a reply was received, a compatible plugin exists, or any trust/release decision has been made.',
  '',
  '## Target',
  '',
  `- Author or audience: ${summary.target.author}`,
  `- URL: ${summary.target.url || 'not recorded'}`,
  `- Contact state: ${summary.contactState}`,
  `- Context: ${summary.candidateContext || 'not recorded'}`,
  '',
  '## Requested Capabilities',
  '',
  ...summary.requestedCapabilities.map((capability) => `- ${capability}`),
  '',
  '## Boundaries',
  '',
  ...summary.boundaries.map((boundary) => `- ${boundary}`),
  ''
].join('\n')

const createPluginCommunitySourceInvitationKit = ({
  targetAuthor = '',
  targetUrl = '',
  candidateContext = '',
  requestedCapabilities = DEFAULT_CAPABILITIES,
  maintainer = 'OpenPet Maintainer',
  outputDir = '',
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  const options = {
    targetAuthor,
    targetUrl,
    candidateContext,
    requestedCapabilities: Array.isArray(requestedCapabilities)
      ? requestedCapabilities
      : parseCapabilities(requestedCapabilities),
    maintainer
  }
  validateOptions(options)

  const generatedAt = now().toISOString()
  const resolvedOutputDir = outputDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt)))
  const absoluteOutputDir = assertSafeRehearsalOutputDir(resolvedOutputDir)
  const files = {
    summary: path.join(absoluteOutputDir, 'plugin-community-source-invitation-summary.json'),
    readme: path.join(absoluteOutputDir, 'README-community-source-invitation.md'),
    message: path.join(absoluteOutputDir, 'invitation-message.md'),
    checklist: path.join(absoluteOutputDir, 'invitation-checklist.md')
  }
  const summary = {
    generatedAt,
    outputDir: absoluteOutputDir,
    status: 'invitation-draft-ready',
    nextAction: 'send-invitation-and-wait-for-compatible-plugin-json-package',
    contactState: 'not-sent',
    target: {
      author: options.targetAuthor,
      url: options.targetUrl
    },
    candidateContext: options.candidateContext,
    requestedCapabilities: options.requestedCapabilities,
    maintainer: options.maintainer,
    boundaries: [
      'Invitation kits are draft outreach materials only.',
      'Invitation kits do not prove an invitation was sent or accepted.',
      'Invitation kits do not prove OpenPet plugin compatibility.',
      'Invitation kits do not prove signing trust, catalog publication, runtime safety, or release readiness.',
      'A received package must still pass Phase 104 discovery, Phase 100 intake, Phase 103 bridge, Phase 99 evidence, and maintainer review.'
    ],
    files
  }

  writeText(files.readme, renderReadme({ generatedAt, summary }), fsImpl)
  writeText(files.message, renderInvitationMessage({ summary }), fsImpl)
  writeText(files.checklist, renderChecklist(), fsImpl)
  writeJson(files.summary, summary, fsImpl)

  return summary
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const summary = createPluginCommunitySourceInvitationKit(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    console.log(`Plugin community-source invitation kit created: ${summary.outputDir}`)
    console.log(`Message: ${summary.files.message}`)
    console.log(`Status: ${summary.status}`)
    console.log(`Next action: ${summary.nextAction}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  createPluginCommunitySourceInvitationKit,
  parseArgs,
  renderChecklist,
  renderInvitationMessage,
  renderReadme
}
