const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { LIVE_DOC_FILES, parseArgs, checkDocsDrift } = require('../../scripts/check-docs-drift')

const repoDocsRoot = path.resolve(__dirname, '../../docs')

const createDocsFixture = () => {
  const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-docs-drift-'))
  for (const relativePath of LIVE_DOC_FILES) {
    fs.copyFileSync(path.join(repoDocsRoot, relativePath), path.join(docsRoot, relativePath))
  }
  return docsRoot
}

test('parseArgs accepts docs drift checker options', () => {
  const parsed = parseArgs(['--docs-root', '/tmp/openpet-docs', '--json'])
  assert.equal(parsed.docsRoot, path.resolve('/tmp/openpet-docs'))
  assert.equal(parsed.json, true)
})

test('checkDocsDrift passes for the current live docs baseline', () => {
  const result = checkDocsDrift({ docsRoot: repoDocsRoot })

  assert.equal(result.ok, true)
  assert.equal(result.errors.length, 0)
  assert.equal(result.checks.every((check) => check.ok), true)
})

test('checkDocsDrift fails when stale save-and-test wording returns', () => {
  const docsRoot = createDocsFixture()
  fs.appendFileSync(path.join(docsRoot, 'development-summary.md'), '\nlegacy save-and-test wording\n')

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /save-and-test/i)
})

test('checkDocsDrift fails when agent-awareness bundled plugin baseline disappears', () => {
  const docsRoot = createDocsFixture()
  for (const relativePath of LIVE_DOC_FILES) {
    const filePath = path.join(docsRoot, relativePath)
    const content = fs.readFileSync(filePath, 'utf-8')
    fs.writeFileSync(
      filePath,
      content
        .replace(/openpet\.agent-awareness/gi, 'openpet.agent')
        .replace(/native execution approval/gi, 'manual review gate')
        .replace(/X active\s*·\s*Y sessions\s*·\s*Z events/gi, 'activity summary')
        .replace(/run-agent-awareness-local-smoke/gi, 'run-agent-smoke')
        .replace(/update-agent-awareness-local-smoke-report/gi, 'update-agent-smoke-report')
        .replace(/update-ai-talk-local-smoke-report/gi, 'update-ai-talk-report')
        .replace(/manualAcceptanceTemplate/gi, 'acceptanceTemplate')
        .replace(/codex-hook-plan/gi, 'hook-plan')
        .replace(/\bdoctor\b/gi, 'diagnostics'),
      'utf-8'
    )
  }

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /openpet\.agent-awareness/i)
  assert.match(result.errors.join('\n'), /native execution approval/i)
  assert.match(result.errors.join('\n'), /health-note summary/i)
  assert.match(result.errors.join('\n'), /doctor and codex-hook-plan/i)
  assert.match(result.errors.join('\n'), /real-session smoke/i)
  assert.match(result.errors.join('\n'), /manual acceptance update command/i)
  assert.match(result.errors.join('\n'), /AI Talk manual acceptance update command/i)
})

test('checkDocsDrift fails when docs map stops indexing the agent-awareness canonical docs', () => {
  const docsRoot = createDocsFixture()
  const readmePath = path.join(docsRoot, 'README.md')
  const readme = fs.readFileSync(readmePath, 'utf-8')
  fs.writeFileSync(
    readmePath,
    readme.replace(
      /\| Agent awareness and ClaudePet-inspired development route \| \[`agent-awareness-development-design\.md`\]\(\.\/agent-awareness-development-design\.md\), \[`\.\.\/examples\/plugins\/agent-awareness\/README\.md`\]\(\.\.\/examples\/plugins\/agent-awareness\/README\.md\), \[`superpowers\/specs\/2026-07-03-agent-awareness-real-codex-acceptance-runbook\.md`\]\(\.\/superpowers\/specs\/2026-07-03-agent-awareness-real-codex-acceptance-runbook\.md\) \|/,
      '| Agent awareness and ClaudePet-inspired development route | documentation pending |'
    ),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /agent-awareness design|plugin README/i)
})

test('checkDocsDrift fails when release-evidence archive classes disappear from the docs map', () => {
  const docsRoot = createDocsFixture()
  const readmePath = path.join(docsRoot, 'README.md')
  const readme = fs.readFileSync(readmePath, 'utf-8')
  fs.writeFileSync(
    readmePath,
    readme.replace(/, `agent-awareness-local-smoke\/`, and `creator-studio-provider-smoke\/`/, ', `creator-studio-provider-smoke/`'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /release-evidence archive classes/i)
})

test('checkDocsDrift fails when AI pane timeout and saved-config honesty baselines disappear', () => {
  const docsRoot = createDocsFixture()
  for (const relativePath of LIVE_DOC_FILES) {
    const filePath = path.join(docsRoot, relativePath)
    const content = fs.readFileSync(filePath, 'utf-8')
    fs.writeFileSync(
      filePath,
      content
        .replace(/model discovery timeout/gi, 'discovery failure')
        .replace(/模型探测超时/gi, '探测失败')
        .replace(/unsaved/gi, 'draft')
        .replace(/未保存/gi, '草稿')
        .replace(/saved config/gi, 'stored values')
        .replace(/已保存配置/gi, '存储值'),
      'utf-8'
    )
  }

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /model discovery timeout/i)
  assert.match(result.errors.join('\n'), /saved config when drafts are unsaved/i)
})

test('checkDocsDrift fails when active TODO recommendations reopen closed milestones', () => {
  const docsRoot = createDocsFixture()
  const todoPath = path.join(docsRoot, 'openpet-current-todo-architecture.md')
  const todo = fs.readFileSync(todoPath, 'utf-8')
  fs.writeFileSync(
    todoPath,
    todo.replace(/TypeScript Adapter Boundary Migration/g, 'Creator Studio Review Surface Polish'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /closed milestone|local\/manual-required split/i)
})

test('cli prints JSON and exits non-zero for drift failures', () => {
  const docsRoot = createDocsFixture()
  fs.appendFileSync(path.join(docsRoot, 'HANDOFF.md'), '\nBranch: `codex/dev`\n')
  const scriptPath = path.resolve(__dirname, '../../scripts/check-docs-drift.js')
  const result = spawnSync(process.execPath, [scriptPath, '--docs-root', docsRoot, '--json'], { encoding: 'utf-8' })

  assert.equal(result.status, 1)
  const output = JSON.parse(result.stdout)
  assert.equal(output.ok, false)
  assert.match(output.errors.join('\n'), /codex\/dev/i)
})
