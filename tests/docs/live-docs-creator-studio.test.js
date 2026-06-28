const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))
const fileExists = (relativePath) => fs.existsSync(path.join(repoRoot, relativePath))
const readPngDimensions = (relativePath) => {
  const buffer = fs.readFileSync(path.join(repoRoot, relativePath))
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

test('live docs describe real-atlas full-pet packaging as landed Creator Studio behavior', () => {
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')

  assert.match(
    todoArchitecture,
    /provider-backed full-pet runs now package a real generated atlas/i,
    'openpet-current-todo-architecture.md should list real-atlas full-pet packaging as a landed fact'
  )
  assert.doesNotMatch(
    todoArchitecture,
    /Creator Studio Real Atlas Packaging\s+-\s+User value: imported provider-generated pets use the real generated sprite instead of a placeholder atlas/i,
    'openpet-current-todo-architecture.md should not keep real-atlas packaging as the next recommended milestone once it has landed'
  )

  const currentRealAtlasPattern = /real generated atlas|real-atlas packaging|source-image-validation\.json|atlas-validation\.json/i
  assert.match(
    developmentSummary,
    currentRealAtlasPattern,
    'development-summary.md should mention the landed real-atlas QA/import path'
  )
  assert.match(
    handoff,
    currentRealAtlasPattern,
    'HANDOFF.md should preserve the landed real-atlas QA/import path'
  )
  assert.match(
    projectStatusReview,
    currentRealAtlasPattern,
    'project-status-review.md should mention the landed real-atlas packaging and QA evidence path'
  )
})

test('live docs mention the AI provider smoke CLI as the current verification entrypoint', () => {
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')

  const smokePattern = /npm run smoke:ai-provider/i
  assert.match(
    developmentSummary,
    smokePattern,
    'development-summary.md should mention the AI provider smoke CLI'
  )
  assert.match(
    handoff,
    smokePattern,
    'HANDOFF.md should mention the AI provider smoke CLI'
  )
  assert.match(
    projectStatusReview,
    smokePattern,
    'project-status-review.md should mention the AI provider smoke CLI'
  )
})

test('live docs mention the Creator Studio provider smoke CLI as the current host-side verification entrypoint', () => {
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')

  const smokePattern = /npm run smoke:creator-studio-provider/i
  for (const [name, content] of [
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(
      content,
      smokePattern,
      `${name} should mention the Creator Studio provider smoke CLI`
    )
  }
})

test('active Creator Studio docs mention the creator-studio provider smoke entrypoint truthfully', () => {
  const todoSpec = readText('docs/superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md')
  const todoPlan = readText('docs/superpowers/plans/2026-06-20-creator-studio-todo-development.md')

  for (const [name, content] of [
    ['creator studio todo spec', todoSpec],
    ['creator studio todo plan', todoPlan]
  ]) {
    assert.match(
      content,
      /npm run smoke:creator-studio-provider/i,
      `${name} should mention the dedicated Creator Studio provider smoke command`
    )
    assert.match(
      content,
      /technical generation chain|visual quality readiness|host-owned model bridge/i,
      `${name} should preserve the boundary that this smoke validates the technical chain rather than final asset quality`
    )
  }
})

test('live docs mention archived real Creator Studio provider smoke evidence and its claim boundary', () => {
  const evidenceDir = 'docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z'
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')
  const evidenceReadme = readText(`${evidenceDir}/README.md`)
  const evidenceReportRaw = readText(`${evidenceDir}/creator-studio-provider-smoke-result.json`)
  const evidenceReport = readJson(`${evidenceDir}/creator-studio-provider-smoke-result.json`)
  const evidenceLogs = readText(`${evidenceDir}/logs/openpet-app.jsonl`)
  const evidenceQaRaw = readText(`${evidenceDir}/qa/action-frame-validation.json`)

  const archivePathPattern = /docs\/release-evidence\/creator-studio-provider-smoke\/2026-06-28T14-06-27-403Z\//i
  const timeoutPattern = /420000ms|420000ms timeout override/i
  const claimBoundaryPattern = /not a production asset-quality approval|human review of generated image quality|human review of the generated image and contact sheet/i
  const sensitiveEvidencePattern = /sk-[A-Za-z0-9_-]+|Authorization|Bearer|\/Users\/mango|\.codex\/worktrees|release\/creator-studio-provider-smoke/i

  for (const [name, content] of [
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(
      content,
      archivePathPattern,
      `${name} should mention the archived real Creator Studio provider smoke evidence path`
    )
  }

  assert.match(evidenceReadme, /265s|265004ms/i, 'evidence README should record the long-running provider duration')
  assert.match(evidenceReadme, timeoutPattern, 'evidence README should record the timeout override used for the successful smoke run')
  assert.match(evidenceReadme, /1254x1254/i, 'evidence README should record the archived source PNG dimensions')
  assert.match(evidenceReadme, claimBoundaryPattern, 'evidence README should keep the asset-quality claim boundary explicit')
  assert.doesNotMatch(
    [evidenceReadme, evidenceReportRaw, evidenceLogs, evidenceQaRaw].join('\n'),
    sensitiveEvidencePattern,
    'text evidence should not archive raw secrets or local worktree paths'
  )
  assert.equal(evidenceReport.ok, true, 'evidence report should record a successful smoke run')
  assert.equal(evidenceReport.config.model, 'gpt-image-2', 'evidence report should record the verified image model')
  assert.equal(evidenceReport.generationConstraints.width, 512, 'evidence report should record the verified width')
  assert.equal(evidenceReport.generationConstraints.height, 512, 'evidence report should record the verified height')
  assert.equal(evidenceReport.generationConstraints.timeoutOverrideMs, 420000, 'evidence report should record the temporary timeout override')
  assert.equal(evidenceReport.actionFrames.warningCount, 0, 'evidence report should preserve action-frame QA warnings')
  assert.deepEqual(
    readPngDimensions(`${evidenceDir}/frames/base/0001.png`),
    { width: 1254, height: 1254 },
    'source image artifact dimensions should be recorded separately from requested constraints'
  )
  assert.equal(fileExists(`${evidenceDir}/frames/base/0001.png`), true, 'source image artifact should be archived')
  assert.equal(fileExists(`${evidenceDir}/qa/action-frame-contact-sheet.png`), true, 'contact-sheet artifact should be archived')
  assert.equal(fileExists(`${evidenceDir}/qa/action-frame-validation.json`), true, 'action-frame QA JSON should be archived')
  assert.equal(fileExists(`${evidenceDir}/logs/openpet-app.jsonl`), true, 'redacted image-generation logs should be archived')
})
test('live docs describe Creator Studio imported follow-up routing by outcome', () => {
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')

  const successPattern = /imported action(?: success)?(?: follow-up)?(?: now)? (?:routes?|sends?|points?)(?: reviewers?| review follow-up| the next review step)? to `?(?:Actions -> )?Trigger Proposal Inbox`?|submit(?:s)? (?:their )?trigger proposal(?:s)? into the (?:Actions )?`?Trigger Proposal Inbox`?/i
  const failurePattern = /import(?: handoff)? failure|failed import handoff|Control Center -> Plugins/i
  const petPattern = /imported pet|Import Approved Pet|OpenPet/i

  for (const [name, content] of [
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(
      content,
      successPattern,
      `${name} should mention imported action success follow-up routing to Trigger Proposal Inbox`
    )
    assert.match(
      content,
      failurePattern,
      `${name} should mention imported action handoff failure follow-up routing to Control Center -> Plugins`
    )
    assert.match(
      content,
      petPattern,
      `${name} should mention imported pet follow-up routing to OpenPet`
    )
  }
})

test('live docs describe phase-aware imported review surfaces for Creator Studio', () => {
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')

  const phaseAwarePattern = /imported review (?:guidance|surfaces?)|phase-aware imported review|approval-only QA|pre-import QA|repair controls?|retry generation cues?/i

  for (const [name, content] of [
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(
      content,
      phaseAwarePattern,
      `${name} should mention that imported Creator Studio review surfaces no longer mix pre-import QA, repair, or retry cues`
    )
  }
})

test('active Creator Studio planning docs do not keep landed dashboard/review coverage as remaining work', () => {
  const todoSpec = readText('docs/superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md')
  const todoPlan = readText('docs/superpowers/plans/2026-06-20-creator-studio-todo-development.md')

  assert.match(
    todoSpec,
    /playback preview and timing diagnostics|playback review/i,
    'creator studio todo spec should mention the landed playback/timing review surface'
  )
  assert.match(
    todoSpec,
    /npm run smoke:ai-provider/i,
    'creator studio todo spec should mention the landed repeatable provider smoke guidance'
  )
  assert.match(
    todoSpec,
    /dashboard-browser|browser regressions|Plugins-pane smoke coverage/i,
    'creator studio todo spec should mention the landed browser and Plugins-pane coverage'
  )
  assert.doesNotMatch(
    todoSpec,
    /Turn the command-level task flow into a dashboard-first wizard/i,
    'creator studio todo spec should not keep the dashboard-first wizard as remaining work once it has landed'
  )
  assert.doesNotMatch(
    todoSpec,
    /Add explicit retry\/recover flows for failed cloud\/local generation/i,
    'creator studio todo spec should not keep retry/recover as remaining work once it has landed'
  )
  assert.doesNotMatch(
    todoSpec,
    /Surface prompt-builder provenance in the dashboard/i,
    'creator studio todo spec should not keep prompt provenance as remaining work once it has landed'
  )
  assert.doesNotMatch(
    todoSpec,
    /Add stronger review artifacts beyond contact sheets, such as playback previews or timing diagnostics/i,
    'creator studio todo spec should not keep playback/timing review as remaining work once it has landed'
  )
  assert.doesNotMatch(
    todoSpec,
    /Add realistic smoke guidance for configured host image Provider generation/i,
    'creator studio todo spec should not keep provider smoke guidance as remaining work once it has landed'
  )

  assert.match(
    todoPlan,
    /playback preview and timing diagnostics/i,
    'creator studio todo plan status update should mention the landed playback/timing review surface'
  )
  assert.match(
    todoPlan,
    /npm run smoke:ai-provider/i,
    'creator studio todo plan status update should mention the landed repeatable provider smoke guidance'
  )
  assert.match(
    todoPlan,
    /Control Center Plugins-pane smoke coverage|dashboard-browser/i,
    'creator studio todo plan status update should mention the landed Creator Studio coverage'
  )
  assert.doesNotMatch(
    todoPlan,
    /Add Electron\/Control Center E2E coverage for the Creator Studio plugin entry and dashboard click flow/i,
    'creator studio todo plan should not keep the already-landed Creator Studio E2E coverage as remaining work'
  )
})

test('active Creator Studio planning docs describe packaged evidence and packaged fixture UI E2E as landed', () => {
  const todoSpec = readText('docs/superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md')
  const todoPlan = readText('docs/superpowers/plans/2026-06-20-creator-studio-todo-development.md')

  for (const [name, content] of [
    ['creator studio todo spec', todoSpec],
    ['creator studio todo plan', todoPlan]
  ]) {
    assert.match(
      content,
      /run-packaged-creator-studio-evidence|packaged Creator Studio evidence|packaged creator studio evidence/i,
      `${name} should mention the landed packaged Creator Studio evidence tooling`
    )
    assert.match(
      content,
      /run-packaged-creator-studio-ui-e2e|packaged Creator Studio fixture UI E2E|packaged fixture UI E2E/i,
      `${name} should mention the landed packaged Creator Studio fixture UI E2E tooling`
    )
  }
})

test('active Creator Studio docs explain dual-layer mode as the next slice and packaged provider smoke as follow-up work', () => {
  const todoSpec = readText('docs/superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md')
  const todoPlan = readText('docs/superpowers/plans/2026-06-20-creator-studio-todo-development.md')

  for (const [name, content] of [
    ['creator studio todo spec', todoSpec],
    ['creator studio todo plan', todoPlan]
  ]) {
    assert.match(
      content,
      /双层|dual-layer|生成并导入|generate-and-import/i,
      `${name} should describe the dual-layer default flow direction`
    )
    assert.match(
      content,
      /host-owned .*生成并导入|host-owned .*default path|default path.*provider|provider-first/i,
      `${name} should describe the host-owned provider-first main path`
    )
    assert.match(
      content,
      /dashboard .*advanced|advanced details|manual step-by-step|details\/manual/i,
      `${name} should keep the dashboard positioned as the advanced/details path`
    )
    assert.match(
      content,
      /packaged\s*\+\s*provider|provider-backed packaged smoke|follow-up slice|follow-up work/i,
      `${name} should keep provider-backed packaged smoke as later follow-up work`
    )
    assert.match(
      content,
      /does not interrupt the user|without mid-run interruption|without mid-run questioning/i,
      `${name} should document the no-interruption rule for the default flow`
    )
    assert.match(
      content,
      /main process|host runtime owns|renderer only|not only in transient renderer state/i,
      `${name} should describe host-owned orchestration as a runtime-owned flow rather than a renderer-only sequence`
    )
  }
})
