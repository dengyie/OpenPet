const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))

test('active TODO doc describes the current AI pane layout truthfully', () => {
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')

  assert.match(
    todoArchitecture,
    /`聊天 Provider`\s*\/\s*`图片 Provider` open by default while secondary memory\/persona\/behavior\/chat sections stay collapsed until expanded/i,
    'openpet-current-todo-architecture.md should describe the current AI pane default-open and collapsed-section layout'
  )

  assert.doesNotMatch(
    todoArchitecture,
    /open ahead of secondary AI sections with explicit host-owned trust\/save-test guidance/i,
    'openpet-current-todo-architecture.md should not keep the older AI pane wording once the layout copy changed'
  )
})

test('active TODO doc describes the AI provider smoke evidence entrypoint truthfully', () => {
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')

  assert.match(
    todoArchitecture,
    /npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>/i,
    'openpet-current-todo-architecture.md should document the repeatable AI provider smoke command'
  )

  assert.match(
    todoArchitecture,
    /keeps image generation opt-in|image generation opt-in/i,
    'openpet-current-todo-architecture.md should keep real image generation behind an explicit opt-in boundary'
  )

  assert.match(
    todoArchitecture,
    /without raw API keys|without exposing API keys/i,
    'openpet-current-todo-architecture.md should describe the sanitized API key boundary'
  )
})

test('active TODO doc links archived OpenPet gateway provider smoke evidence truthfully', () => {
  const evidencePath = 'docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/ai-provider-smoke-report.json'
  const readmePath = 'docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/README.md'
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const evidence = readJson(evidencePath)
  const readme = readText(readmePath)
  const checks = Object.fromEntries(evidence.checks.map((check) => [check.id, check]))

  assert.match(
    todoArchitecture,
    /docs\/release-evidence\/ai-provider-smoke\/2026-06-28T11-08-10Z-openpet-gateway\//,
    'openpet-current-todo-architecture.md should link the archived OpenPet gateway smoke evidence'
  )
  assert.equal(evidence.baseUrl, 'http://127.0.0.1:8317/v1')
  assert.equal(evidence.chatModel, 'gpt-5.5')
  assert.equal(evidence.imageModel, 'gpt-image-2')
  assert.equal(checks.models.status, 'pass')
  assert.equal(checks.models.containsChatModel, true)
  assert.equal(checks.models.containsImageModel, true)
  assert.equal(checks['chat-completions'].status, 'pass')
  assert.equal(checks['image-generations'].status, 'skipped')
  assert.equal(evidence.secret.apiKeyPreview, 'redacted')
  assert.doesNotMatch(JSON.stringify(evidence), /sk-[A-Za-z0-9_-]{8,}/)
  assert.match(readme, /does not prove image generation output quality/i)
})

test('live docs link archived OpenPet gateway provider smoke evidence with the right claim boundary', () => {
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')

  const archivePathPattern = /docs\/release-evidence\/ai-provider-smoke\/2026-06-28T11-08-10Z-openpet-gateway\//i
  const verifiedFactsPattern = /gpt-5\.5[\s\S]*gpt-image-2[\s\S]*(?:chat completion smoke|chat smoke)[\s\S]*(?:intentionally opt-in and was skipped|intentionally skipped)/i
  const claimBoundaryPattern = /does not prove image generation output quality|not of image output quality|not prove.*asset readiness/i

  for (const [name, content] of [
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(content, archivePathPattern, `${name} should mention the archived AI provider smoke evidence path`)
    assert.match(content, verifiedFactsPattern, `${name} should mention the verified AI provider smoke facts`)
    assert.match(content, claimBoundaryPattern, `${name} should keep the AI provider smoke claim boundary explicit`)
  }
})
