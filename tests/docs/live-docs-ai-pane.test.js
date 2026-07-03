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
    /one `模型 Provider` section opens by default with `聊天模型` \/ `图片模型` capability cards while secondary memory\/persona\/behavior\/chat sections stay collapsed until expanded/i,
    'openpet-current-todo-architecture.md should describe the current AI pane default-open and collapsed-section layout'
  )

  assert.doesNotMatch(
    todoArchitecture,
    /open ahead of secondary AI sections with explicit host-owned trust\/save-test guidance/i,
    'openpet-current-todo-architecture.md should not keep the older AI pane wording once the layout copy changed'
  )
})

test('active TODO doc describes provider presets as templates except for verified OpenPet gateway evidence', () => {
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const developmentSummary = readText('docs/development-summary.md')
  const projectContextFacts = readJson('docs/project-context.json').currentFacts.join('\n')

  for (const [name, content] of [
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['development-summary.md', developmentSummary],
    ['project-context.json', projectContextFacts]
  ]) {
    assert.match(
      content,
      /OpenRouter[\s\S]*Together[\s\S]*(?:endpoint templates|endpoint 模板|模板)/i,
      `${name} should describe common provider presets as templates rather than verified integrations`
    )
    assert.match(
      content,
      /only the OpenPet 8317 gateway preset|the only preset tied|只有.*OpenPet 8317/i,
      `${name} should identify OpenPet 8317 as the preset tied to current archived smoke evidence`
    )
  }
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

test('live docs surface the AI Talk bubble acceptance smoke entrypoint with the right claim boundary', () => {
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const docsReadme = readText('docs/README.md')
  const projectStatusReview = readText('docs/project-status-review.md')
  const smokeEvidence = readJson('docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/ai-talk-local-smoke-result.json')
  const smokeReadme = readText('docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/README.md')

  assert.match(
    docsReadme,
    /2026-06-28-real-provider-chat-acceptance-runbook\.md/i,
    'docs/README.md should index the real-provider Bubble Chat acceptance runbook'
  )
  assert.match(
    docsReadme,
    /ai-talk-local-smoke\//i,
    'docs/README.md should surface ai-talk-local-smoke as a maintained release-evidence class'
  )

  assert.equal(smokeEvidence.ok, true)
  assert.equal(smokeEvidence.config.model, 'gpt-5.5')
  assert.equal(smokeEvidence.bubbleAcceptance.providerLatencyMs, 2141)
  assert.equal(smokeEvidence.bubbleDispatch.petSayReceived, true)
  assert.equal(smokeEvidence.bubbleDispatch.bubbleStateVisible, true)
  assert.equal(smokeEvidence.manualAcceptanceTemplate.requestId, smokeEvidence.bubbleAcceptance.requestId)
  assert.match(smokeReadme, /ttlMs = 9835/i)
  assert.match(smokeReadme, /does not by itself prove/i)

  for (const [name, content] of [
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['development-summary.md', developmentSummary],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview]
  ]) {
    assert.match(
      content,
      /run-ai-talk-local-smoke[\s\S]*bubbleAcceptance[\s\S]*providerLatencyMs[\s\S]*(manualAcceptanceTemplate|ai-talk-local-smoke\/2026-06-28T15-35-59-210Z)/i,
      `${name} should mention the AI Talk Bubble Chat smoke entrypoint and its key acceptance fields`
    )
    assert.match(
      content,
      /does not by itself prove|not full desktop feel by itself|later human desktop validation/i,
      `${name} should keep the human desktop-feel claim boundary explicit for the AI Talk Bubble Chat smoke`
    )
  }
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
