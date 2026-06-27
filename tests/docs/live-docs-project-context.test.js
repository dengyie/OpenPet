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
