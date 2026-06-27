const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')

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
