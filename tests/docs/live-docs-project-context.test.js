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

test('project-context indexes the archived provider smoke evidence and current smoke TypeScript boundary truthfully', () => {
  const context = readProjectContext()
  const facts = context.currentFacts.join('\n')
  const docsReadme = fs.readFileSync(path.join(repoRoot, 'docs/README.md'), 'utf-8')

  assert.equal(context.updated, '2026-06-28', 'project-context.json should carry the current live-doc update date')
  assert.equal(
    context.branch,
    'main',
    'project-context.json should describe the main-line context for merged live-doc facts'
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
    /run-ai-talk-local-smoke[\s\S]*bubbleAcceptance[\s\S]*providerLatencyMs[\s\S]*manualAcceptanceTemplate/i,
    'project-context.json should describe the AI Talk Bubble Chat smoke entrypoint and acceptance fields'
  )
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
    /release-evidence\/.*ai-provider-smoke\/.*ai-talk-local-smoke\/.*creator-studio-provider-smoke\/.*packaged-runtime\/.*signed-release-closure\//is,
    'docs/README.md should surface provider smoke, AI Talk smoke, and release-truth archives in the release evidence map'
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
    /docs\/release-evidence\/signed-release-closure\/2026-06-16T15-00-00Z\//i,
    'project-context.json should point to the archived signed release closure path'
  )
  assert.match(
    facts,
    /releaseReady is false[\s\S]*official desktop[\s\S]*macOS[\s\S]*Windows[\s\S]*not-ready[\s\S]*missing signed macOS[\s\S]*missing desktop picker evidence[\s\S]*missing signed Windows smoke evidence/i,
    'project-context.json should capture the signed release closure not-ready state and core blockers'
  )
  assert.match(
    facts,
    /Apple signing\/notarization credentials[\s\S]*real Windows signed artifact execution[\s\S]*human evidence review/i,
    'project-context.json should keep the manual-required release prerequisites explicit'
  )
})

test('live docs keep main-line branch metadata aligned with project-context', () => {
  const context = readProjectContext()
  const developmentSummary = fs.readFileSync(path.join(repoRoot, 'docs/development-summary.md'), 'utf-8')
  const handoff = fs.readFileSync(path.join(repoRoot, 'docs/HANDOFF.md'), 'utf-8')
  const projectStatusReview = fs.readFileSync(path.join(repoRoot, 'docs/project-status-review.md'), 'utf-8')

  assert.equal(
    context.branch,
    'main',
    'project-context.json should keep live-doc metadata on the merged main-line baseline'
  )

  for (const [name, content] of [
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(
      content,
      /Branch:\s*`main`/i,
      `${name} should keep the same main-line branch header as project-context.json`
    )
  }
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
