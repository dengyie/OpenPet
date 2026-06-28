const fs = require('fs')
const path = require('path')

const LIVE_DOC_FILES = [
  'README.md',
  'HANDOFF.md',
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
  const developmentSummary = readDoc(docsRoot, 'development-summary.md')
  const projectStatusReview = readDoc(docsRoot, 'project-status-review.md')
  const todoArchitecture = readDoc(docsRoot, 'openpet-current-todo-architecture.md')
  const projectContext = readDoc(docsRoot, 'project-context.json')
  const combined = [readme, handoff, developmentSummary, projectStatusReview, todoArchitecture, projectContext].join('\n')

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
      id: 'release-evidence-indexes-provider-and-release-truth',
      description: 'docs/README.md should index provider smoke and release-truth evidence classes.',
      run: () => /release-evidence\/.*ai-provider-smoke\/.*creator-studio-provider-smoke\/.*packaged-runtime\/.*signed-release-closure\//is.test(readme),
      failure: 'docs/README.md is missing one or more maintained release-evidence archive classes.'
    },
    {
      id: 'project-context-keeps-release-truth-paths',
      description: 'project-context should keep packaged runtime and signed release closure archive facts.',
      run: () => /docs\/release-evidence\/packaged-runtime\/2026-06-16T14-52-13-074Z-darwin-arm64\/[\s\S]*docs\/release-evidence\/signed-release-closure\/2026-06-16T15-00-00Z\//i.test(projectContext),
      failure: 'docs/project-context.json is missing the current packaged runtime or signed release closure archive facts.'
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
