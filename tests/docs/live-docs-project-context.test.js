const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readProjectContext = () => {
  const raw = fs.readFileSync(path.join(repoRoot, 'docs/project-context.json'), 'utf-8')
  return JSON.parse(raw)
}

test('project-context describes the current AI provider save/test split truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')

  assert.match(
    facts,
    /separate active saved config from renderer drafts, support separate save and test connection actions/i,
    'project-context.json should describe chat provider save and test as separate actions'
  )

  assert.doesNotMatch(
    facts,
    /save-and-test connection checks/i,
    'project-context.json should not keep the older save-and-test wording once save and test are separate'
  )
})

test('project-context describes the current Creator Studio image provider boundary truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')

  assert.match(
    facts,
    /one OpenAI-compatible image Provider contract|unified OpenAI-compatible provider settings/i,
    'project-context.json should describe the unified image Provider contract'
  )

  assert.doesNotMatch(
    facts,
    /fixture\/provider generation selection/i,
    'project-context.json should not describe the older fixture/provider selection model as current host settings'
  )
})

test('project-context describes the current Creator Studio review and trigger handoff truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')

  assert.match(
    facts,
    /real generated atlas|source-image-validation\.json|atlas-validation\.json/i,
    'project-context.json should mention the landed real-atlas QA path'
  )

  assert.match(
    facts,
    /Trigger Proposal Inbox|trigger proposal inbox/i,
    'project-context.json should mention the host review inbox for Creator Studio trigger proposals'
  )
})

test('project-context points to the canonical single-reference pet generation contract', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')

  assert.match(facts, /docs\/pet-character-generation\.md/i)
  assert.match(facts, /one image attachment/i)
  assert.match(facts, /running-left/i)
  assert.match(facts, /approved-mirror/i)
})

test('project-context indexes the archived provider smoke evidence and current smoke TypeScript boundary truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')
  const docsReadme = fs.readFileSync(path.join(repoRoot, 'docs/README.md'), 'utf-8')
  const agentAwarenessEvidence = JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        'docs/release-evidence/agent-awareness-local-smoke/2026-07-03T16-04-08-824Z/agent-awareness-local-smoke-result.json'
      ),
      'utf-8'
    )
  )

  assert.match(
    context.updated,
    /^\d{4}-\d{2}-\d{2}$/,
    'project-context.json should carry its own ISO update date'
  )
  assert.equal(
    context.branch,
    'main',
    'project-context.json should describe the canonical integration branch'
  )

  assert.match(
    facts,
    /docs\/release-evidence\/ai-provider-smoke\/2026-06-28T11-08-10Z-openpet-gateway\//i,
    'project-context.json should point to the archived AI provider smoke evidence path'
  )
  assert.match(
    facts,
    /gpt-5\.5[\s\S]*gpt-image-2[\s\S]*image generation remained intentionally opt-in and was skipped/i,
    'project-context.json should capture the verified AI provider smoke facts and claim boundary'
  )
  assert.match(
    facts,
    /docs\/release-evidence\/creator-studio-provider-smoke\/2026-06-28T14-06-27-403Z\//i,
    'project-context.json should point to the archived Creator Studio provider smoke evidence path'
  )
  assert.match(
    facts,
    /265s[\s\S]*420000ms timeout override[\s\S]*not production asset-quality approval/i,
    'project-context.json should capture the Creator Studio provider smoke duration, timeout override, and claim boundary'
  )
  assert.match(
    facts,
    /AI provider smoke report contracts[\s\S]*Creator Studio provider smoke report contracts/i,
    'project-context.json should include the current smoke report TypeScript contracts in the migration baseline'
  )
  assert.match(
    facts,
    /docs\/release-evidence\/creator-workflow-host-smoke\/2026-07-04T21-38-29-834Z-dev8-acceptance\/[\s\S]*docs\/release-evidence\/creator-workflow-host-smoke\/2026-07-04T21-56-30-104Z-main-acceptance\/[\s\S]*\/images\/edits[\s\S]*codex\/dev8[\s\S]*clean main acceptance worktree/i,
    'project-context.json should point to both archived Creator Workflow host smoke evidence paths and the current main-acceptance truth'
  )
  assert.match(
    facts,
    /run-ai-talk-local-smoke[\s\S]*bubbleAcceptance[\s\S]*providerLatencyMs[\s\S]*manualAcceptanceTemplate/i,
    'project-context.json should describe the AI Talk Bubble Chat smoke entrypoint and acceptance fields'
  )
  assert.match(
    facts,
    /run-agent-awareness-local-smoke[\s\S]*manualAcceptanceTemplate[\s\S]*docs\/release-evidence\/agent-awareness-local-smoke\/2026-07-03T16-04-08-824Z\/[\s\S]*unknownRecordCount 0[\s\S]*unsupportedLifecycleRecordCount 0/i,
    'project-context.json should describe the agent-awareness smoke entrypoint and archived evidence path'
  )
  assert.equal(agentAwarenessEvidence.sessionDir, 'agent-awareness-local-smoke/2026-07-03T16-04-08-824Z')
  assert.equal(agentAwarenessEvidence.pluginDataDir, 'plugin-data')
  assert.equal(agentAwarenessEvidence.resultPath, 'agent-awareness-local-smoke-result.json')
  assert.equal(agentAwarenessEvidence.healthUrl, '[local-url]')
  assert.equal(agentAwarenessEvidence.hookPlan?.serviceUrl, '[local-url]')
  assert.match(
    facts,
    /docs\/release-evidence\/ai-talk-local-smoke\/2026-06-28T15-35-59-210Z\/[\s\S]*providerLatencyMs was 2141[\s\S]*bubbleDispatch\.petSayReceived was true[\s\S]*bubbleDispatch\.bubbleStateVisible was true/i,
    'project-context.json should point to the archived AI Talk Bubble Chat smoke evidence path and key verified telemetry'
  )
  assert.match(
    facts,
    /does not by itself prove[\s\S]*transparent popup placement|does not by itself prove[\s\S]*full human acceptance/i,
    'project-context.json should keep the AI Talk Bubble Chat smoke claim boundary explicit'
  )

  assert.match(
    docsReadme,
    /release-evidence\/.*ai-provider-smoke\/.*ai-talk-local-smoke\/.*agent-awareness-local-smoke\/.*creator-studio-provider-smoke\/.*creator-workflow-host-smoke\/.*packaged-runtime\/.*signed-release-closure\//is,
    'docs/README.md should surface provider smoke, AI Talk smoke, and release-truth archives in the release evidence map'
  )
})

test('project-context validation commands include the Creator Workflow host smoke entrypoint', () => {
  const context = readProjectContext()

  assert.equal(
    context.validation.commands.includes('npm run smoke:creator-workflow-host -- --reference-image <file>'),
    true,
    'project-context.json should list the Creator Workflow host smoke command in validation.commands'
  )
})

test('project-context validation commands include the AI Talk Bubble Chat smoke entrypoint', () => {
  const context = readProjectContext()

  assert.equal(
    context.validation.commands.includes('npm run run-ai-talk-local-smoke -- --message <text>'),
    true,
    'project-context.json should list the AI Talk Bubble Chat smoke command in validation.commands'
  )
})

test('project-context validation commands include the AI Talk manual acceptance updater', () => {
  const context = readProjectContext()

  assert.equal(
    context.validation.commands.includes('npm run update-ai-talk-local-smoke-report -- <report.json> ...'),
    true,
    'project-context.json should list the AI Talk manual acceptance updater in validation.commands'
  )
})

test('project-context validation commands include the agent-awareness real-session smoke entrypoint', () => {
  const context = readProjectContext()

  assert.equal(
    context.validation.commands.includes('npm run run-agent-awareness-local-smoke -- --codex-home <dir>'),
    true,
    'project-context.json should list the agent-awareness real-session smoke command in validation.commands'
  )
})

test('project-context validation commands include the agent-awareness smoke archive helper', () => {
  const context = readProjectContext()

  assert.equal(
    context.validation.commands.includes('npm run create-agent-awareness-local-smoke-archive -- --session-dir <dir>'),
    true,
    'project-context.json should list the agent-awareness smoke archive command in validation.commands'
  )
})

test('project-context validation commands include the agent-awareness manual acceptance updater', () => {
  const context = readProjectContext()

  assert.equal(
    context.validation.commands.includes('npm run update-agent-awareness-local-smoke-report -- <report.json> ...'),
    true,
    'project-context.json should list the agent-awareness manual acceptance updater in validation.commands'
  )
})

test('live docs describe the typed plugin view payload boundary truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')
  const todoArchitecture = fs.readFileSync(path.join(repoRoot, 'docs/openpet-current-todo-architecture.md'), 'utf-8')
  const developmentSummary = fs.readFileSync(path.join(repoRoot, 'docs/development-summary.md'), 'utf-8')
  const handoff = fs.readFileSync(path.join(repoRoot, 'docs/HANDOFF.md'), 'utf-8')
  const projectStatusReview = fs.readFileSync(path.join(repoRoot, 'docs/project-status-review.md'), 'utf-8')

  for (const [name, content] of [
    ['project-context.json', facts],
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(
      content,
      /typed plugin view config schema\/storage\/signature payloads/i,
      `${name} should include the typed plugin view payload boundary in the TypeScript baseline`
    )
    assert.match(
      content,
      /action-frame `?inspectionResult`? payloads/i,
      `${name} should include the typed action-frame inspectionResult payload boundary in the TypeScript baseline`
    )
    assert.match(
      content,
      /pet-pack mutation view payloads/i,
      `${name} should include the typed pet-pack mutation view payload boundary in the TypeScript baseline`
    )
  }

  assert.match(
    todoArchitecture,
    /Plugin list and plugin mutation payloads[\s\S]*config schema fields[\s\S]*storage stats[\s\S]*signature status/i,
    'openpet-current-todo-architecture.md should record the landed plugin view payload normalization'
  )
  assert.match(
    todoArchitecture,
    /plugin view config\/storage\/signature slice[\s\S]*complete/i,
    'openpet-current-todo-architecture.md should not make this completed plugin view slice the next adapter target again'
  )
  assert.match(
    todoArchitecture,
    /action-frame `inspectionResult` slice[\s\S]*complete/i,
    'openpet-current-todo-architecture.md should not make this completed action-frame inspectionResult slice the next adapter target again'
  )
  assert.match(
    todoArchitecture,
    /pet-pack mutation view slice[\s\S]*complete/i,
    'openpet-current-todo-architecture.md should not make this completed pet-pack mutation slice the next adapter target again'
  )
})

test('project-context indexes archived release-truth evidence and blockers truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')

  assert.match(
    facts,
    /docs\/release-evidence\/packaged-runtime\/2026-06-16T14-52-13-074Z-darwin-arm64\//i,
    'project-context.json should point to the archived packaged runtime evidence path'
  )
  assert.match(
    facts,
    /unsigned macOS packaged runtime launched[\s\S]*plugin-picker-evidence-linked[\s\S]*pending[\s\S]*invalid-package-feedback[\s\S]*blocked/i,
    'project-context.json should capture the packaged runtime archive truth and remaining picker blockers'
  )
  assert.match(
    facts,
    /docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//i,
    'project-context.json should point to the archived signed release closure path'
  )
  assert.match(
    facts,
    /releaseReady is false[\s\S]*macOS codesign\/notarization\/Gatekeeper now classify as fail[\s\S]*Windows smoke remains unsigned\/pending[\s\S]*desktop-picker archives remain archived but not signed-ready/i,
    'project-context.json should capture the signed release closure not-ready state and core blockers'
  )
  assert.match(
    facts,
    /Apple signing\/notarization credentials[\s\S]*real Windows signed artifact execution[\s\S]*human evidence review/i,
    'project-context.json should keep the manual-required release prerequisites explicit'
  )
})

test('live docs keep branch metadata aligned with project-context', () => {
  const context = readProjectContext()
  const developmentSummary = fs.readFileSync(path.join(repoRoot, 'docs/development-summary.md'), 'utf-8')
  const handoff = fs.readFileSync(path.join(repoRoot, 'docs/HANDOFF.md'), 'utf-8')
  const projectStatusReview = fs.readFileSync(path.join(repoRoot, 'docs/project-status-review.md'), 'utf-8')

  assert.equal(
    context.branch,
    'main',
    'project-context.json should keep live-doc metadata on canonical main'
  )

  for (const [name, content] of [
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(content, /Branch:\s*\x60main\x60/i, `${name} should identify canonical main`)
    assert.doesNotMatch(content, /Branch:\s*\x60(?:codex\/|dev\d*\b)/i)
  }
})

test('live docs describe the bundled agent-awareness baseline truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')
  const docsReadme = fs.readFileSync(path.join(repoRoot, 'docs/README.md'), 'utf-8')
  const agentAwarenessDesign = fs.readFileSync(path.join(repoRoot, 'docs/agent-awareness-development-design.md'), 'utf-8')
  const developmentSummary = fs.readFileSync(path.join(repoRoot, 'docs/development-summary.md'), 'utf-8')
  const handoff = fs.readFileSync(path.join(repoRoot, 'docs/HANDOFF.md'), 'utf-8')
  const projectStatusReview = fs.readFileSync(path.join(repoRoot, 'docs/project-status-review.md'), 'utf-8')
  const todoArchitecture = fs.readFileSync(path.join(repoRoot, 'docs/openpet-current-todo-architecture.md'), 'utf-8')
  const combinedLiveDocs = [agentAwarenessDesign, developmentSummary, handoff, projectStatusReview, todoArchitecture].join('\n')

  assert.match(
    facts,
    /openpet\.agent-awareness[\s\S]*enabled by default[\s\S]*explicit user start[\s\S]*native execution approval/i,
    'project-context.json should describe the bundled agent-awareness enablement and approval boundary'
  )
  assert.match(
    facts,
    /hashes session ids[\s\S]*reduces project paths to basename plus short hash[\s\S]*doctor\/codex-hook-plan/i,
    'project-context.json should describe the bundled agent-awareness privacy and command boundaries'
  )
  assert.match(
    docsReadme,
    /agent-awareness-development-design\.md[\s\S]*examples\/plugins\/agent-awareness\/README\.md/i,
    'docs/README.md should index the agent-awareness design doc and plugin README as the canonical entrypoint'
  )

  assert.match(
    combinedLiveDocs,
    /openpet\.agent-awareness[\s\S]*stopped-by-default|enabled-by-default but stopped-by-default/i,
    'live docs should describe the bundled agent-awareness runtime default state'
  )
  assert.match(
    combinedLiveDocs,
    /native execution approval/i,
    'live docs should describe native execution approval for agent-awareness'
  )
  assert.match(
    combinedLiveDocs,
    /X active . Y sessions . Z events|X active · Y sessions · Z events/i,
    'live docs should describe the compact agent-awareness health summary contract'
  )
  assert.match(
    combinedLiveDocs,
    /doctor[\s\S]*codex-hook-plan/i,
    'live docs should mention the current agent-awareness command surface'
  )
  assert.match(
    combinedLiveDocs,
    /run-agent-awareness-local-smoke[\s\S]*manualAcceptanceTemplate/i,
    'live docs should mention the agent-awareness real-session smoke entrypoint and its human-review boundary'
  )
})

test('docs README routes current truth to live docs and treats history as audit records', () => {
  const docsReadme = fs.readFileSync(path.join(repoRoot, 'docs/README.md'), 'utf-8')

  assert.match(
    docsReadme,
    /Where should I read next\?/i,
    'docs/README.md should introduce itself as the navigation hub'
  )
  assert.match(
    docsReadme,
    /Use the live docs above for current truth/i,
    'docs/README.md should route current facts to live docs'
  )
  assert.match(
    docsReadme,
    /Phase, review, and old Superpowers plan\/spec files are audit records/i,
    'docs/README.md should demote historical phase, review, and old plan/spec docs to audit records'
  )
  assert.match(
    docsReadme,
    /\| Agent Awareness current program \|[\s\S]*agent-awareness-development-design\.md[\s\S]*examples\/plugins\/agent-awareness\/README\.md[\s\S]*2026-07-03-agent-awareness-real-codex-acceptance-runbook\.md/i,
    'docs/README.md should keep one current Agent Awareness program row with the design, plugin README, and active runbook'
  )
})

test('live docs describe the current plugin host bridge generation boundary truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')
  const todoArchitecture = fs.readFileSync(path.join(repoRoot, 'docs/openpet-current-todo-architecture.md'), 'utf-8')
  const developmentSummary = fs.readFileSync(path.join(repoRoot, 'docs/development-summary.md'), 'utf-8')
  const handoff = fs.readFileSync(path.join(repoRoot, 'docs/HANDOFF.md'), 'utf-8')
  const projectStatusReview = fs.readFileSync(path.join(repoRoot, 'docs/project-status-review.md'), 'utf-8')
  const combinedLiveDocs = [developmentSummary, handoff, projectStatusReview].join('\n')

  assert.match(
    facts,
    /trigger-proposals:write[\s\S]*model:image-generate|model:image-generate[\s\S]*trigger-proposals:write/i,
    'project-context.json should mention the landed trigger-proposals:write and model:image-generate bridge permissions'
  )
  assert.match(
    facts,
    /plugin-managed provider credentials.*unsupported|unsupported.*plugin-managed provider credentials/i,
    'project-context.json should describe plugin-managed provider credentials as unsupported for host-managed generation'
  )

  assert.match(
    combinedLiveDocs,
    /plugin-managed provider credentials.*unsupported|unsupported.*plugin-managed provider credentials/i,
    'live docs should describe plugin-managed provider credentials as unsupported for host-managed generation'
  )
  assert.match(
    combinedLiveDocs,
    /trigger-proposals:write[\s\S]*model:image-generate|model:image-generate[\s\S]*trigger-proposals:write/i,
    'live docs should mention the current trigger-proposals:write and model:image-generate bridge permission boundary'
  )

  assert.doesNotMatch(
    todoArchitecture,
    /Keep bridge route docs synchronized with actual route coverage and permission names\./i,
    'openpet-current-todo-architecture.md should not keep bridge route documentation sync as an open P1 item once docs and tests have landed'
  )
  assert.doesNotMatch(
    todoArchitecture,
    /Document plugin-managed provider credentials as unsupported unless a future explicit trust model is designed\./i,
    'openpet-current-todo-architecture.md should not keep unsupported provider credential wording as an open P1 item once live docs already state it'
  )
})

test('active TODO recommended milestones do not point at already-closed work', () => {
  const todoArchitecture = fs.readFileSync(path.join(repoRoot, 'docs/openpet-current-todo-architecture.md'), 'utf-8')
  const recommendedSection = todoArchitecture.split('## Recommended Next Milestone Options')[1] || ''

  assert.match(
    recommendedSection,
    /TypeScript Adapter Boundary Migration/i,
    'recommended next milestones should include a locally actionable P1 boundary-migration option'
  )
  assert.match(
    recommendedSection,
    /Release Evidence Closure[\s\S]*mostly Manual-required/i,
    'recommended next milestones should preserve release evidence as mostly Manual-required'
  )
  assert.match(
    recommendedSection,
    /Plugin Host Bridge Drift Guard/i,
    'recommended next milestones should keep plugin bridge changes behind drift-guard work'
  )
  assert.doesNotMatch(
    recommendedSection,
    /Creator Studio Review Surface Polish/i,
    'Creator Studio review surface polish should not remain a recommended next milestone after reviewSnapshot landed'
  )
  assert.doesNotMatch(
    recommendedSection,
    /AI Provider Verification Closure/i,
    'AI Provider verification closure should not remain a recommended next milestone after provider smoke evidence landed'
  )
})
