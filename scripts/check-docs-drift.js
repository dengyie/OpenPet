const fs = require('fs')
const path = require('path')

const LIVE_DOC_FILES = [
  'README.md',
  'HANDOFF.md',
  'TODO.md',
  'development-workflow.md',
  'agent-awareness-development-design.md',
  'development-summary.md',
  'project-status-review.md',
  'testing-strategy.md',
  'release-checklist.md',
  'openpet-current-todo-architecture.md',
  'project-context.json',
  'release-evidence/README.md',
  'superpowers/plans/2026-07-12-production-review-remediation.md'
]

const usage = () => [
  'Usage: node scripts/check-docs-drift.js [--docs-root <dir>] [--json]',
  '',
  'Checks required live docs, metadata, completion state, and known content drift.'
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

const isValidIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const hasValidUpdateDateHeader = (content) => {
  const match = content.match(/^>\s*Last updated:\s*(\S+)\s*$/m)
  return Boolean(match && isValidIsoDate(match[1]))
}

const readProjectContext = (docsRoot) => {
  const relativePath = 'project-context.json'
  const source = readDoc(docsRoot, relativePath)

  try {
    return {
      source,
      value: JSON.parse(source),
      error: null
    }
  } catch (error) {
    return {
      source,
      value: null,
      error: `Invalid live doc JSON: ${relativePath}: ${error.message || error}`
    }
  }
}

const createChecks = (docsRoot, { projectContext, context }) => {
  const readme = readDoc(docsRoot, 'README.md')
  const handoff = readDoc(docsRoot, 'HANDOFF.md')
  const todo = readDoc(docsRoot, 'TODO.md')
  const developmentWorkflow = readDoc(docsRoot, 'development-workflow.md')
  const agentAwarenessDesign = readDoc(docsRoot, 'agent-awareness-development-design.md')
  const developmentSummary = readDoc(docsRoot, 'development-summary.md')
  const projectStatusReview = readDoc(docsRoot, 'project-status-review.md')
  const testingStrategy = readDoc(docsRoot, 'testing-strategy.md')
  const releaseChecklist = readDoc(docsRoot, 'release-checklist.md')
  const todoArchitecture = readDoc(docsRoot, 'openpet-current-todo-architecture.md')
  const releaseEvidenceReadme = readDoc(docsRoot, 'release-evidence/README.md')
  const productionRemediation = readDoc(
    docsRoot,
    'superpowers/plans/2026-07-12-production-review-remediation.md'
  )
  const combined = [
    readme,
    handoff,
    todo,
    developmentWorkflow,
    agentAwarenessDesign,
    developmentSummary,
    projectStatusReview,
    testingStrategy,
    releaseChecklist,
    todoArchitecture,
    projectContext,
    releaseEvidenceReadme
  ].join('\n')
  const updateDateChecks = [
    ['HANDOFF.md', handoff],
    ['TODO.md', todo],
    ['development-summary.md', developmentSummary],
    ['project-status-review.md', projectStatusReview]
  ].map(([relativePath, content]) => ({
    id: relativePath.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-has-valid-update-date',
    description: `${relativePath} should carry its own valid ISO update date.`,
    run: () => hasValidUpdateDateHeader(content),
    failure: `${relativePath} must carry a valid ISO update date.`
  }))

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
    ...updateDateChecks,
    {
      id: 'project-context-has-valid-update-date',
      description: 'project-context.json should carry its own valid ISO update date.',
      run: () => isValidIsoDate(context.updated),
      failure: 'project-context.json must carry a valid ISO update date.'
    },
    {
      id: 'live-docs-use-canonical-main-metadata',
      description: 'Live docs should identify main as the canonical integration branch.',
      run: () => {
        const branchDocs = [handoff, developmentSummary, projectStatusReview]
        const unexpectedBranchPattern = /Branch:\s*\x60(?!main\x60)[^\x60]+\x60/i

        return context.branch === 'main' &&
          branchDocs.every((doc) => /^>\s*Branch:\s*\x60main\x60\s*$/m.test(doc)) &&
          !branchDocs.some((doc) => unexpectedBranchPattern.test(doc))
      },
      failure: 'Live docs no longer agree on canonical main branch metadata.'
    },
    {
      id: 'production-remediation-remains-complete',
      description: 'The production remediation runbook should remain a closed execution record.',
      run: () =>
        /Status:\s*Complete/i.test(productionRemediation) &&
        !/^\s*- \[ \]/m.test(productionRemediation) &&
        /## Completion Evidence/.test(productionRemediation),
      failure: 'The production remediation execution record is no longer complete.'
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
      id: 'agent-awareness-mock-rehearsal-baseline',
      description: 'Live docs should preserve the synthetic agent-awareness mock rehearsal entrypoint and keep it separate from real acceptance.',
      run: () => /tests\/scripts\/mock-agent-awareness-flow\.test\.js/i.test(handoff),
      failure: 'Live docs no longer describe the agent-awareness mock rehearsal baseline.'
    },
    {
      id: 'community-source-mock-rehearsal-baseline',
      description: 'Live docs should preserve the synthetic community-source mock rehearsal entrypoint.',
      run: () => /tests\/scripts\/mock-plugin-community-source-flow\.test\.js/i.test(handoff),
      failure: 'Live docs no longer describe the community-source mock rehearsal baseline.'
    },
    {
      id: 'packaged-provider-mock-rehearsal-baseline',
      description: 'Live docs should preserve the synthetic packaged-provider mock rehearsal entrypoint.',
      run: () => /tests\/release\/mock-packaged-provider-flow\.test\.js/i.test(handoff),
      failure: 'Live docs no longer describe the packaged-provider mock rehearsal baseline.'
    },
    {
      id: 'picker-runtime-mock-rehearsal-baseline',
      description: 'Live docs should preserve the synthetic picker-runtime mock rehearsal entrypoint.',
      run: () => /tests\/release\/mock-picker-runtime-flow\.test\.js/i.test(handoff),
      failure: 'Live docs no longer describe the picker-runtime mock rehearsal baseline.'
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
      id: 'docs-readme-keeps-current-truth-routing',
      description: 'docs/README.md should route current truth to live docs and demote historical phase/review/spec files to audit records.',
      run: () =>
        /Where should I read next\?/i.test(readme) &&
        /Use the live docs above for current truth/i.test(readme) &&
        /Phase, review, and old Superpowers plan\/spec files are audit records/i.test(readme),
      failure: 'docs/README.md no longer clearly routes current truth to live docs while demoting historical records.'
    },
    {
      id: 'release-evidence-indexes-provider-and-release-truth',
      description: 'docs/README.md should index provider smoke and release-truth evidence classes.',
      run: () => /release-evidence\/.*ai-provider-smoke\/.*ai-talk-local-smoke\/.*agent-awareness-local-smoke\/.*creator-studio-provider-smoke\/.*creator-workflow-host-smoke\/.*release-public-assets\/.*packaged-runtime\/.*signed-release-closure\//is.test(readme),
      failure: 'docs/README.md is missing one or more maintained release-evidence archive classes.'
    },
    {
      id: 'docs-readme-links-release-evidence-index',
      description: 'docs/README.md should link the release-evidence index entrypoint.',
      run: () => /release-evidence\/README\.md/i.test(readme),
      failure: 'docs/README.md is missing the release-evidence index entrypoint.'
    },
    {
      id: 'creator-studio-keeps-image-fidelity-boundary',
      description: 'Live docs should keep generated-pet image quality tied to original-image fidelity rather than provider smoke alone.',
      run: () =>
        /highly consistent with the user's original image/i.test(combined) &&
        /recognizable identity[\s\S]*silhouette[\s\S]*palette[\s\S]*style[\s\S]*important visual traits/i.test(combined) &&
        /Provider smoke[\s\S]*command\/data flow[\s\S]*not final visual fidelity proof/i.test(combined) &&
        /frame\/atlas QA[\s\S]*structural import-readiness[\s\S]*not human visual fidelity proof/i.test(combined),
      failure: 'Live docs no longer keep generated-pet image quality tied to original-image fidelity and manual/future visual acceptance.'
    },
    {
      id: 'handoff-links-release-evidence-index',
      description: 'docs/HANDOFF.md should link the release-evidence index entrypoint.',
      run: () => /release-evidence\/README\.md/i.test(handoff),
      failure: 'docs/HANDOFF.md is missing the release-evidence index entrypoint.'
    },
    {
      id: 'release-evidence-root-index-covers-critical-categories',
      description: 'release-evidence root index should keep critical evidence categories visible.',
      run: () => /macos-release-evidence\/.*windows-smoke\/.*packaged-runtime\/.*signed-release-closure\//is.test(releaseEvidenceReadme),
      failure: 'docs/release-evidence/README.md is missing one or more critical evidence categories from the release-evidence root index.'
    },
    {
      id: 'release-evidence-root-keeps-synthetic-boundary-links',
      description: 'release-evidence root index should keep the synthetic rehearsal entrypoints and their non-substitutive scope explicit.',
      run: () =>
        /tests\/scripts\/mock-agent-awareness-flow\.test\.js/i.test(releaseEvidenceReadme) &&
        /tests\/scripts\/mock-plugin-community-source-flow\.test\.js/i.test(releaseEvidenceReadme) &&
        /tests\/release\/mock-picker-runtime-flow\.test\.js/i.test(releaseEvidenceReadme) &&
        /tests\/release\/mock-packaged-provider-flow\.test\.js/i.test(releaseEvidenceReadme) &&
        /does not replace a real archived Codex session/i.test(releaseEvidenceReadme) &&
        /does not replace a real compatible third-party `plugin\.json` package/i.test(releaseEvidenceReadme) &&
        /does not replace real signed artifacts/i.test(releaseEvidenceReadme) &&
        /does not replace a real configured packaged provider session/i.test(releaseEvidenceReadme),
      failure: 'docs/release-evidence/README.md no longer keeps the synthetic rehearsal entrypoints and their real/manual boundaries explicit.'
    },
    {
      id: 'handoff-keeps-synthetic-boundary-language',
      description: 'HANDOFF should keep synthetic rehearsals clearly separate from real acceptance.',
      run: () =>
        /does not replace real Codex signal collection or human desktop acceptance/i.test(handoff) &&
        /does not replace a real compatible third-party package/i.test(handoff) &&
        /does not replace a real configured packaged provider session/i.test(handoff) &&
        /not real signed or manually observed release evidence/i.test(handoff),
      failure: 'docs/HANDOFF.md no longer keeps synthetic rehearsal boundaries explicit.'
    },
    {
      id: 'testing-strategy-keeps-live-doc-truth-suite',
      description: 'testing-strategy should describe the docs truth suite that now runs under test:tools.',
      run: () =>
        /tests\/docs\/\*\.test\.js/i.test(testingStrategy) &&
        /live-doc truth|live docs truth|archive paths aligned with the current repository facts|older closure snapshots/i.test(testingStrategy),
      failure: 'docs/testing-strategy.md no longer describes the live-doc truth suite that runs under test:tools.'
    },
    {
      id: 'todo-keeps-real-blocker-truth',
      description: 'TODO should keep the remaining blocker language explicit about real/manual-required gaps.',
      run: () => /fresh passing evidence/i.test(todo) &&
        /real signed Windows artifact plus observed smoke evidence/i.test(todo) &&
        /observed packaged-app behavior/i.test(todo) &&
        /actual external compatible package source/i.test(todo) &&
        /real configured packaged provider session/i.test(todo),
      failure: 'docs/TODO.md no longer keeps the current TODO blocker truth explicit about manual-required and real external gaps.'
    },
    {
      id: 'todo-keeps-current-release-closure-paths',
      description: 'TODO should keep the current closure, packaged runtime, Windows smoke, and desktop picker evidence paths explicit.',
      run: () =>
        /docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//i.test(todo) &&
        /docs\/release-evidence\/packaged-runtime\/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact\//i.test(todo) &&
        /docs\/release-evidence\/windows-smoke\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-artifact-archive-rerun\//i.test(todo) &&
        /docs\/release-evidence\/desktop-picker\/2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun\//i.test(todo),
      failure: 'docs/TODO.md no longer keeps the current release closure and supporting evidence paths explicit.'
    },
    {
      id: 'handoff-keeps-real-priority-gaps',
      description: 'HANDOFF current priorities should stay anchored to real/manual-required release and ecosystem gaps.',
      run: () =>
        /Produce passing macOS release evidence/i.test(handoff) &&
        /Collect real signed Windows smoke evidence/i.test(handoff) &&
        /Collect packaged native picker evidence from real app runs/i.test(handoff) &&
        /real compatible package/i.test(handoff),
      failure: 'docs/HANDOFF.md no longer keeps the current priority gaps anchored to real/manual-required work.'
    },
    {
      id: 'todo-architecture-keeps-current-release-blocker-summary',
      description: 'openpet-current-todo-architecture should keep the current closure rerun and blocker wording aligned with the archived truth.',
      run: () =>
        /docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//i.test(todoArchitecture) &&
        /docs\/release-evidence\/packaged-runtime\/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact\//i.test(todoArchitecture) &&
        /macOS codesign\/notarization\/Gatekeeper classify as `fail`/i.test(todoArchitecture) &&
        /Windows smoke remains unsigned\/pending/i.test(todoArchitecture) &&
        /desktop-picker archives remain archived but not signed-ready/i.test(todoArchitecture),
      failure: 'docs/openpet-current-todo-architecture.md no longer keeps the current release blocker summary aligned with the archived closure truth.'
    },
    {
      id: 'maintainer-summaries-keep-real-gap-language',
      description: 'Development and status summaries should keep real/manual-required gap language explicit.',
      run: () =>
        /real passing macOS closure path/i.test(developmentSummary) &&
        /real signed Windows artifacts/i.test(developmentSummary) &&
        /compatible third-party package path/i.test(developmentSummary) &&
        /Real passing macOS evidence must still be archived/i.test(projectStatusReview) &&
        /Real signed Windows smoke evidence must exist/i.test(projectStatusReview) &&
        /Packaged native picker evidence still needs real archived runs/i.test(projectStatusReview) &&
        /compatible third-party package path/i.test(projectStatusReview),
      failure: 'docs/development-summary.md or docs/project-status-review.md no longer keep the current real/manual-required gap language explicit.'
    },
    {
      id: 'project-context-keeps-release-truth-paths',
      description: 'project-context should keep the current packaged runtime and signed release closure archive facts.',
      run: () => /docs\/release-evidence\/packaged-runtime\/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact\/[\s\S]*docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//i.test(projectContext),
      failure: 'docs/project-context.json is missing the current packaged runtime or signed release closure archive facts.'
    },
    {
      id: 'project-status-review-keeps-current-macos-parser-rerun-fact',
      description: 'project-status-review should keep the current macOS parser-rerun archive fact.',
      run: () => /docs\/release-evidence\/macos-release-evidence-archive\/2026-07-06T17-32-13Z-v1\.0\.1-rc\.3-authenticated-artifact-current-parser-rerun\//i.test(projectStatusReview),
      failure: 'Live docs no longer keep the current macOS parser-rerun fact.'
    },
    {
      id: 'project-status-review-keeps-current-public-release-metadata-fact',
      description: 'project-status-review should keep the current public release metadata snapshot fact for unsigned Windows assets.',
      run: () => /docs\/release-evidence\/release-public-assets\/2026-07-06T15-57-51Z-v1\.0\.1-rc\.3-public-release-metadata\.json[\s\S]*unsigned/i.test(projectStatusReview),
      failure: 'Live docs no longer keep the current public release metadata snapshot fact.'
    },
    {
      id: 'release-checklist-keeps-current-macos-top-table-wording',
      description: 'release-checklist should keep the current macOS top-table wording aligned with failing signed readiness truth.',
      run: () => /\| macOS \| Public assets and imported workflow evidence currently fail signed readiness \| macOS-first release track; official artifacts still need passing signed\/notarized evidence \|/i.test(releaseChecklist),
      failure: 'docs/release-checklist.md no longer keeps the current macOS top-table wording.'
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
  const missingFiles = LIVE_DOC_FILES.filter((relativePath) => {
    try {
      return !fs.statSync(path.join(docsRoot, relativePath)).isFile()
    } catch {
      return true
    }
  })
  if (missingFiles.length > 0) {
    return {
      ok: false,
      docsRoot,
      checks: [],
      errors: missingFiles.map((relativePath) => `Missing live doc: ${relativePath}`)
    }
  }

  const projectContext = readProjectContext(docsRoot)
  if (projectContext.error) {
    return {
      ok: false,
      docsRoot,
      checks: [],
      errors: [projectContext.error]
    }
  }

  const checks = createChecks(docsRoot, {
    projectContext: projectContext.source,
    context: projectContext.value
  }).map((check) => ({
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
