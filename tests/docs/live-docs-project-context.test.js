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
    docsReadme,
    /release-evidence\/.*ai-provider-smoke\/.*creator-studio-provider-smoke\//is,
    'docs/README.md should surface provider smoke archives in the release evidence map'
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
