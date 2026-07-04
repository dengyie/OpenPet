const fs = require('fs')
const path = require('path')

const LIVE_DOC_FILES = [
  'README.md',
  'HANDOFF.md',
  'agent-awareness-development-design.md',
  'development-summary.md',
  'project-status-review.md',
  'openpet-current-todo-architecture.md',
  'project-context.json'
]

const usage = () => [
  'Usage: node scripts/check-docs-drift.js [--docs-root <dir>] [--json]',
  '',
  'Checks live docs for known stale phrases and missing release-evidence index entries.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    docsRoot: path.join(process.cwd(), 'docs'),
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
    if (arg === '--json') {
      options.json = true
    } else if (arg === '--docs-root') {
      options.docsRoot = path.resolve(readValue(index, arg))
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const readDoc = (docsRoot, relativePath) => fs.readFileSync(path.join(docsRoot, relativePath), 'utf-8')

const createChecks = (docsRoot) => {
  const readme = readDoc(docsRoot, 'README.md')
  const handoff = readDoc(docsRoot, 'HANDOFF.md')
  const agentAwarenessDesign = readDoc(docsRoot, 'agent-awareness-development-design.md')
  const developmentSummary = readDoc(docsRoot, 'development-summary.md')
  const projectStatusReview = readDoc(docsRoot, 'project-status-review.md')
  const todoArchitecture = readDoc(docsRoot, 'openpet-current-todo-architecture.md')
  const projectContext = readDoc(docsRoot, 'project-context.json')
  const combined = [
    readme,
    handoff,
    agentAwarenessDesign,
    developmentSummary,
    projectStatusReview,
    todoArchitecture,
    projectContext
  ].join('\n')

  return [
    {
      id: 'no-save-and-test-phrase',
      description: 'Live docs should not keep the older save-and-test wording.',
      run: () => !/save-and-test connection checks|save-and-test workflow|legacy save-and-test wording/i.test(combined),
      failure: 'Found stale save-and-test wording in live docs.'
    },
    {
      id: 'no-fixture-provider-selection-phrase',
      description: 'Live docs should not describe the older fixture/provider generation selection model as current.',
      run: () => !/fixture\/provider generation selection/i.test(combined),
      failure: 'Found stale fixture/provider generation selection wording in live docs.'
    },
    {
      id: 'no-codex-dev-branch-metadata',
      description: 'Live docs should not drift back to the older codex/dev branch metadata.',
      run: () => !/Branch:\s*`codex\/dev`|"branch"\s*:\s*"codex\/dev"/i.test(combined),
      failure: 'Found stale codex/dev branch metadata in live docs.'
    },
    {
      id: 'agent-awareness-bundled-plugin-baseline',
      description: 'Live docs should preserve the bundled openpet.agent-awareness plugin baseline.',
      run: () => /openpet\.agent-awareness/i.test(combined),
      failure: 'Live docs no longer describe the bundled openpet.agent-awareness plugin baseline.'
    },
    {
      id: 'agent-awareness-native-approval-baseline',
      description: 'Live docs should preserve native execution approval as part of the agent-awareness service-start boundary.',
      run: () => /agent-awareness[\s\S]*native execution approval|native execution approval[\s\S]*agent-awareness/i.test(combined),
      failure: 'Live docs no longer describe native execution approval for agent-awareness.'
    },
    {
      id: 'agent-awareness-health-note-baseline',
      description: 'Live docs should preserve the reserved X active · Y sessions · Z events health-note summary.',
      run: () => /X active\s*·\s*Y sessions\s*·\s*Z events/i.test(combined),
      failure: 'Live docs no longer describe the agent-awareness health-note summary contract.'
    },
    {
      id: 'agent-awareness-command-surface-baseline',
      description: 'Live docs should preserve the doctor and codex-hook-plan command surface.',
      run: () => /doctor/i.test(combined) && /codex-hook-plan/i.test(combined),
      failure: 'Live docs no longer describe the doctor and codex-hook-plan command surface.'
    },
    {
      id: 'agent-awareness-smoke-baseline',
      description: 'Live docs should preserve the real-session smoke entrypoint and manual acceptance boundary for agent-awareness.',
      run: () => /run-agent-awareness-local-smoke[\s\S]*manualAcceptanceTemplate/i.test(combined),
      failure: 'Live docs no longer describe the agent-awareness real-session smoke entrypoint and manual acceptance boundary.'
    },
    {
      id: 'agent-awareness-manual-update-baseline',
      description: 'Live docs should preserve the manual acceptance write-back command for archived agent-awareness smoke evidence.',
      run: () => /update-agent-awareness-local-smoke-report/i.test(combined),
      failure: 'Live docs no longer describe the agent-awareness manual acceptance update command.'
    },
    {
      id: 'ai-talk-manual-update-baseline',
      description: 'Live docs should preserve the manual acceptance write-back command for archived AI Talk smoke evidence.',
      run: () => /update-ai-talk-local-smoke-report/i.test(combined),
      failure: 'Live docs no longer describe the AI Talk manual acceptance update command.'
    },
    {
      id: 'ai-pane-timeout-feedback-baseline',
      description: 'Live docs should preserve the provider-specific model discovery timeout feedback baseline.',
      run: () => /模型探测超时|model discovery timeout/i.test(combined),
      failure: 'Live docs no longer describe the AI pane model discovery timeout feedback boundary.'
    },
    {
      id: 'ai-pane-saved-config-honesty-baseline',
      description: 'Live docs should preserve the unsaved-draft warning that discovery and usage rows still reflect saved config.',
      run: () => /未保存[\s\S]*已保存配置|unsaved[\s\S]*saved config/i.test(combined),
      failure: 'Live docs no longer describe that AI pane discovery and usage rows still reflect saved config when drafts are unsaved.'
    },
    {
      id: 'docs-readme-indexes-agent-awareness-route',
      description: 'docs/README.md should keep the agent-awareness design doc and plugin README in the canonical doc map.',
      run: () => /agent-awareness-development-design\.md[\s\S]*examples\/plugins\/agent-awareness\/README\.md/i.test(readme),
      failure: 'docs/README.md is missing the current agent-awareness design or plugin README entry.'
    },
    {
      id: 'release-evidence-indexes-provider-and-release-truth',
      description: 'docs/README.md should index provider smoke and release-truth evidence classes.',
      run: () => /release-evidence\/.*ai-provider-smoke\/.*ai-talk-local-smoke\/.*agent-awareness-local-smoke\/.*creator-studio-provider-smoke\/.*creator-workflow-host-smoke\/.*packaged-runtime\/.*signed-release-closure\//is.test(readme),
      failure: 'docs/README.md is missing one or more maintained release-evidence archive classes.'
    },
    {
      id: 'project-context-keeps-release-truth-paths',
      description: 'project-context should keep packaged runtime and signed release closure archive facts.',
      run: () => /docs\/release-evidence\/packaged-runtime\/2026-06-16T14-52-13-074Z-darwin-arm64\/[\s\S]*docs\/release-evidence\/signed-release-closure\/2026-06-16T15-00-00Z\//i.test(projectContext),
      failure: 'docs/project-context.json is missing the current packaged runtime or signed release closure archive facts.'
    },
    {
      id: 'todo-recommendations-do-not-reopen-closed-milestones',
      description: 'Active TODO recommendations should not point at Creator Studio review polish or AI Provider verification closure after those paths landed.',
      run: () => {
        const recommendedSection = todoArchitecture.split('## Recommended Next Milestone Options')[1] || ''
        return /TypeScript Adapter Boundary Migration/i.test(recommendedSection) &&
          /Release Evidence Closure[\s\S]*mostly Manual-required/i.test(recommendedSection) &&
          !/Creator Studio Review Surface Polish|AI Provider Verification Closure/i.test(recommendedSection)
      },
      failure: 'docs/openpet-current-todo-architecture.md recommends a closed milestone or lacks the current local/manual-required split.'
    }
  ]
}

const checkDocsDrift = ({ docsRoot }) => {
  const missingFiles = LIVE_DOC_FILES.filter((relativePath) => !fs.existsSync(path.join(docsRoot, relativePath)))
  if (missingFiles.length > 0) {
    return {
      ok: false,
      docsRoot,
      checks: [],
      errors: missingFiles.map((relativePath) => `Missing live doc: ${relativePath}`)
    }
  }

  const checks = createChecks(docsRoot).map((check) => ({
    id: check.id,
    description: check.description,
    ok: check.run(),
    failure: check.failure
  }))

  return {
    ok: checks.every((check) => check.ok),
    docsRoot,
    checks,
    errors: checks.filter((check) => !check.ok).map((check) => check.failure)
  }
}

const printTextResult = (result) => {
  console.log(`Docs root: ${result.docsRoot}`)
  for (const check of result.checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id}: ${check.description}`)
  }
  for (const error of result.errors) console.error(`Error: ${error}`)
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = checkDocsDrift({ docsRoot: options.docsRoot })
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
  LIVE_DOC_FILES,
  parseArgs,
  checkDocsDrift
}
