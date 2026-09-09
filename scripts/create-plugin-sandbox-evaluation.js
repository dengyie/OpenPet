const fs = require('fs')

const DEFAULT_OUTPUT_PATH = 'docs/plugin-sandbox-evaluation.md'

const usage = () => [
  'Usage: node scripts/create-plugin-sandbox-evaluation.js [options]',
  '',
  'Options:',
  '  --output <path>  Write evaluation to a Markdown or JSON file. Defaults to docs/plugin-sandbox-evaluation.md.',
  '  --json           Print or write machine-readable JSON.',
  '',
  'Creates a deterministic Phase 39 plugin sandbox evaluation from current local runner facts.',
  'The command does not install dependencies, execute third-party plugins, or claim absolute sandbox safety.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    outputPath: '',
    json: false,
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
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const createPluginSandboxEvaluation = ({ now = () => new Date() } = {}) => ({
  generatedAt: now().toISOString(),
  phase: 39,
  scope: 'Compare the current local plugin runner with SES and Electron utilityProcess before expanding third-party plugin trust.',
  currentRunner: {
    id: 'current-child-process-node-permission-vm',
    label: 'Current local plugin runner',
    files: [
      'apps/desktop/src/services/plugin-service.js',
      'apps/desktop/src/services/plugins/local-plugin-runner.js'
    ],
    guarantees: [
      'Local third-party plugins execute in a child process created with child_process.fork.',
      'The runner starts with Node permission model flags and only allows filesystem reads for the runner file and the plugin main file.',
      'Plugin source runs inside a VM context with string and WebAssembly code generation disabled.',
      'The VM bootstrap exposes module exports and a no-op console, but does not expose require, process, Electron APIs, or Node globals as plugin SDK surfaces.',
      'Plugin SDK operations are bridged to the parent process through JSON-serialized IPC messages.',
      'Pet, AI, storage, and network operations are permission-checked in the main process before execution.',
      'Network calls are restricted to HTTPS, manifest allowlisted hosts, GET/POST methods, size limits, and non-sensitive request headers.',
      'Plugin command execution has a parent-side timeout of 5000ms and runner script execution has a VM timeout of 1000ms.'
    ],
    limits: [
      'The current runner should not be described as providing absolute sandbox safety.',
      'Node permission model behavior depends on the bundled Electron/Node runtime and should stay covered by local smoke and package verification.',
      'Crash isolation exists at child-process level, but there is no separate Electron utility process lifecycle or Chromium service sandbox boundary.',
      'The VM context restricts exposed globals but is still in the same child process as the runner bridge code.',
      'Long-lived background plugins are not part of the current trust model.',
      'The current design does not grant arbitrary filesystem, shell, Electron, or unrestricted network access.'
    ]
  },
  candidates: [
    {
      id: 'current-runner',
      label: 'Current child process + Node permission model + VM runner',
      isolationBoundary: 'separate Node child process plus VM context',
      apiRestriction: 'explicit OpenPet SDK bridge only',
      filesystemControl: 'Node permission model allows runner and plugin main reads only',
      networkControl: 'main-process HTTPS allowlist and header/body/response limits',
      crashIsolation: 'child process can be killed and command timeout enforced',
      packagingCost: 'already integrated in packaged app path',
      debugCost: 'low; errors already flow through plugin logs and command failures',
      migrationRisk: 'low',
      recommendation: 'keep for v1.1 while documenting limits'
    },
    {
      id: 'ses',
      label: 'SES',
      isolationBoundary: 'hardened JavaScript compartments inside a JavaScript realm',
      apiRestriction: 'strong object-capability discipline if all endowments are audited',
      filesystemControl: 'not a process or OS filesystem boundary by itself',
      networkControl: 'must still be mediated by OpenPet SDK policy',
      crashIsolation: 'no separate process crash boundary by itself',
      packagingCost: 'requires adding and validating a new runtime dependency',
      debugCost: 'medium; hardened globals and lockdown can change plugin authoring behavior',
      migrationRisk: 'medium',
      recommendation: 'research candidate only until dependency, lockdown order, and plugin compatibility are validated'
    },
    {
      id: 'electron-utility-process',
      label: 'Electron utilityProcess',
      isolationBoundary: 'Electron-managed utility process',
      apiRestriction: 'can host a narrow bridge but still needs SDK mediation',
      filesystemControl: 'must be combined with explicit runtime restrictions and app policy',
      networkControl: 'must still be mediated by OpenPet SDK policy',
      crashIsolation: 'stronger app-managed process isolation and lifecycle hooks than a generic child process',
      packagingCost: 'requires Electron-specific runner integration and packaged-app validation',
      debugCost: 'medium; process lifecycle and logging become more Electron-specific',
      migrationRisk: 'medium-high',
      recommendation: 're-evaluate when plugins need long-lived background execution or stronger crash/process lifecycle isolation'
    }
  ],
  recommendation: {
    decision: 'keep-current-runner-for-v1.1',
    claimBoundary: 'permission-limited-isolated-runner-not-absolute-sandbox',
    summary: 'Keep the current runner for v1.1, document its guarantees and limits, and avoid adding higher-risk plugin permissions until a utilityProcess or equivalent migration is justified by product requirements.',
    requiredLanguage: [
      'Describe plugins as permission-limited and isolated.',
      'Do not describe third-party plugins as absolutely safe.',
      'Keep API keys and secrets outside renderer code, ordinary plugin storage, and plugin config.',
      'Treat sandbox strategy as a reviewable product boundary before adding new plugin capabilities.'
    ]
  },
  reEvaluationTriggers: [
    'Plugins become long-lived background workers.',
    'Plugins request broader filesystem access.',
    'Plugins need direct desktop, shell, or Electron capabilities.',
    'A plugin crash can affect host app stability or user trust.',
    'Remote marketplace distribution expands beyond curated local review.',
    'Electron utilityProcess integration can be validated in packaged macOS and Windows builds.'
  ],
  nextActions: [
    'Generate and commit docs/plugin-sandbox-evaluation.md from this evaluation.',
    'Keep the current runner for v1.1 unless a new plugin capability changes the threat model.',
    'Add packaged-app smoke coverage if the runner implementation moves to utilityProcess.',
    'Review sandbox wording whenever README, plugin docs, or submission tooling changes.'
  ]
})

const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>')

const renderMarkdownSandboxEvaluation = (evaluation) => {
  const lines = [
    '# OpenPet Plugin Sandbox Evaluation',
    '',
    `Generated at: ${evaluation.generatedAt}`,
    `Phase: ${evaluation.phase}`,
    `Decision: ${evaluation.recommendation.decision}`,
    `Claim boundary: ${evaluation.recommendation.claimBoundary}`,
    '',
    evaluation.scope,
    '',
    '## Current Runner',
    '',
    `Label: ${evaluation.currentRunner.label}`,
    '',
    'Files:',
    ...evaluation.currentRunner.files.map((file) => `- \`${file}\``),
    '',
    '### Guarantees',
    '',
    ...evaluation.currentRunner.guarantees.map((item) => `- ${item}`),
    '',
    '### Limits',
    '',
    ...evaluation.currentRunner.limits.map((item) => `- ${item}`),
    '',
    '## Candidate Matrix',
    '',
    '| Candidate | Isolation | API restriction | Filesystem | Network | Crash isolation | Packaging cost | Debug cost | Migration risk | Recommendation |',
    '|-----------|-----------|-----------------|------------|---------|-----------------|----------------|------------|----------------|----------------|'
  ]

  for (const candidate of evaluation.candidates) {
    lines.push([
      `| ${escapeCell(candidate.label)}`,
      escapeCell(candidate.isolationBoundary),
      escapeCell(candidate.apiRestriction),
      escapeCell(candidate.filesystemControl),
      escapeCell(candidate.networkControl),
      escapeCell(candidate.crashIsolation),
      escapeCell(candidate.packagingCost),
      escapeCell(candidate.debugCost),
      escapeCell(candidate.migrationRisk),
      `${escapeCell(candidate.recommendation)} |`
    ].join(' | '))
  }

  lines.push(
    '',
    '## Recommendation',
    '',
    evaluation.recommendation.summary,
    '',
    'Required language:',
    ...evaluation.recommendation.requiredLanguage.map((item) => `- ${item}`),
    '',
    '## Re-Evaluation Triggers',
    '',
    ...evaluation.reEvaluationTriggers.map((item) => `- ${item}`),
    '',
    '## Next Actions',
    '',
    ...evaluation.nextActions.map((item) => `- ${item}`)
  )

  return `${lines.join('\n')}\n`
}

const writeEvaluation = ({ evaluation, outputPath = DEFAULT_OUTPUT_PATH, json = false, fsImpl = fs }) => {
  const content = json
    ? `${JSON.stringify(evaluation, null, 2)}\n`
    : renderMarkdownSandboxEvaluation(evaluation)
  fsImpl.writeFileSync(outputPath || DEFAULT_OUTPUT_PATH, content)
  return outputPath || DEFAULT_OUTPUT_PATH
}

const main = () => {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      process.stdout.write(`${usage()}\n`)
      return
    }

    const evaluation = createPluginSandboxEvaluation()
    if (options.outputPath) {
      const outputPath = writeEvaluation({ evaluation, outputPath: options.outputPath, json: options.json })
      process.stdout.write(`Wrote plugin sandbox evaluation: ${outputPath}\n`)
      return
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`)
      return
    }

    const outputPath = writeEvaluation({ evaluation, outputPath: DEFAULT_OUTPUT_PATH })
    process.stdout.write(`Wrote plugin sandbox evaluation: ${outputPath}\n`)
  } catch (error) {
    process.stderr.write(`${error.message || 'Failed to create plugin sandbox evaluation'}\n\n${usage()}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  createPluginSandboxEvaluation,
  parseArgs,
  renderMarkdownSandboxEvaluation,
  writeEvaluation
}
