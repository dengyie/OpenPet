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
    fs.mkdirSync(path.dirname(path.join(docsRoot, relativePath)), { recursive: true })
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
      /\| Agent Awareness current program \| .* \|/,
      '| Agent Awareness current program | documentation pending |'
    ),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /agent-awareness design|plugin README/i)
})

test('checkDocsDrift fails when docs map stops routing current truth to live docs', () => {
  const docsRoot = createDocsFixture()
  const readmePath = path.join(docsRoot, 'README.md')
  const readme = fs.readFileSync(readmePath, 'utf-8')
  fs.writeFileSync(
    readmePath,
    readme
      .replace(/It answers: Where should I read next\?\n\n/, '')
      .replace(/Use the live docs above for current truth\.[\s\S]*?active runbooks\.\n\n/, ''),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /current truth|audit records/i)
})

test('checkDocsDrift fails when docs map stops linking the release-evidence index', () => {
  const docsRoot = createDocsFixture()
  const readmePath = path.join(docsRoot, 'README.md')
  const readme = fs.readFileSync(readmePath, 'utf-8')
  fs.writeFileSync(
    readmePath,
    readme.replace(/\| Release evidence index \| .* \|/, '| Release evidence index | pending |'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /release-evidence index/i)
})

test('checkDocsDrift fails when handoff stops linking the release-evidence index', () => {
  const docsRoot = createDocsFixture()
  const handoffPath = path.join(docsRoot, 'HANDOFF.md')
  const handoff = fs.readFileSync(handoffPath, 'utf-8')
  fs.writeFileSync(
    handoffPath,
    handoff
      .replace(/\[`release-evidence\/README\.md`\]\(\.\/release-evidence\/README\.md\)/g, '`release-evidence/README.md`')
      .replace(/release-evidence\/README\.md/g, 'release-evidence/index.md'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /handoff|release-evidence index/i)
})

test('checkDocsDrift fails when the release-evidence root index drops current critical categories', () => {
  const docsRoot = createDocsFixture()
  const releaseEvidenceReadmePath = path.join(docsRoot, 'release-evidence/README.md')
  const releaseEvidenceReadme = fs.readFileSync(releaseEvidenceReadmePath, 'utf-8')
  fs.writeFileSync(
    releaseEvidenceReadmePath,
    releaseEvidenceReadme
      .replace(/\n- Packaged runtime evidence: .*$/m, '')
      .replace(/\n- Signed release closure audits: .*$/m, ''),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /release-evidence root index|critical evidence categories/i)
})

test('checkDocsDrift fails when the release-evidence root index stops naming synthetic rehearsal boundaries', () => {
  const docsRoot = createDocsFixture()
  const releaseEvidenceReadmePath = path.join(docsRoot, 'release-evidence/README.md')
  const releaseEvidenceReadme = fs.readFileSync(releaseEvidenceReadmePath, 'utf-8')
  fs.writeFileSync(
    releaseEvidenceReadmePath,
    releaseEvidenceReadme
      .replace(/\n## Synthetic Coverage Boundaries[\s\S]*?(?=\n## Reading Rules)/, '\n'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /synthetic rehearsal entrypoints|real\/manual boundaries/i)
})

test('checkDocsDrift fails when handoff stops separating synthetic rehearsals from real acceptance', () => {
  const docsRoot = createDocsFixture()
  const handoffPath = path.join(docsRoot, 'HANDOFF.md')
  const handoff = fs.readFileSync(handoffPath, 'utf-8')
  fs.writeFileSync(
    handoffPath,
    handoff
      .replace(/does not replace real Codex signal collection or human desktop acceptance/g, 'already proves real desktop acceptance')
      .replace(/does not replace a real compatible third-party package/g, 'already proves compatible package readiness')
      .replace(/does not replace a real configured packaged provider session/g, 'already proves packaged provider readiness')
      .replace(/not real signed or manually observed release evidence/g, 'already proves signed release evidence'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /synthetic rehearsal boundaries/i)
})

test('checkDocsDrift fails when generated pet image fidelity boundary disappears', () => {
  const docsRoot = createDocsFixture()
  for (const relativePath of LIVE_DOC_FILES) {
    const filePath = path.join(docsRoot, relativePath)
    const content = fs.readFileSync(filePath, 'utf-8')
    fs.writeFileSync(
      filePath,
      content
        .replace(/highly consistent with the user's original image/gi, 'good enough for a pet pack')
        .replace(/recognizable identity/gi, 'general identity')
        .replace(/silhouette/gi, 'outline')
        .replace(/palette/gi, 'colors')
        .replace(/style/gi, 'look')
        .replace(/important visual traits/gi, 'visual features')
        .replace(/not final visual fidelity proof/gi, 'final visual fidelity proof')
        .replace(/not human visual fidelity proof/gi, 'human visual fidelity proof'),
      'utf-8'
    )
  }

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /generated-pet image quality|original-image fidelity/i)
})

test('checkDocsDrift fails when testing-strategy stops describing the live-doc truth suite', () => {
  const docsRoot = createDocsFixture()
  const testingStrategyPath = path.join(docsRoot, 'testing-strategy.md')
  const testingStrategy = fs.readFileSync(testingStrategyPath, 'utf-8')
  fs.writeFileSync(
    testingStrategyPath,
    testingStrategy
      .replace(/\n- `tests\/docs\/\*\.test\.js`: .*?(?=\n- `tests\/scripts\/mock-agent-awareness-flow\.test\.js`)/s, '\n')
      .replace(/maintenance CLIs, or live\s+documentation truth surfaces/i, 'maintenance CLIs'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /testing-strategy|live-doc truth suite/i)
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

test('checkDocsDrift fails when active TODO blocker truth is rewritten as already closed by synthetic coverage', () => {
  const docsRoot = createDocsFixture()
  const todoPath = path.join(docsRoot, 'TODO.md')
  fs.copyFileSync(path.join(repoDocsRoot, 'TODO.md'), todoPath)
  const todo = fs.readFileSync(todoPath, 'utf-8')
  fs.writeFileSync(
    todoPath,
    todo
      .replace(/fixed or republished macOS assets plus fresh passing evidence/g, 'synthetic picker/runtime coverage is sufficient for release wording')
      .replace(/real signed Windows artifact plus observed smoke evidence/g, 'synthetic smoke evidence closes Windows support wording')
      .replace(/observed packaged-app behavior/g, 'synthetic picker\\/runtime wiring already closes this gap')
      .replace(/actual external compatible package source/g, 'synthetic compatible flow coverage already closes this gap')
      .replace(/real configured packaged provider session/g, 'synthetic packaged provider coverage already closes this gap'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /TODO blocker truth|manual-required|real external/i)
})

test('checkDocsDrift fails when active TODO loses the current release closure evidence paths', () => {
  const docsRoot = createDocsFixture()
  const todoPath = path.join(docsRoot, 'TODO.md')
  const todo = fs.readFileSync(todoPath, 'utf-8')
  fs.writeFileSync(
    todoPath,
    todo
      .replace(/docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//g, 'docs/release-evidence/signed-release-closure/outdated-current-closure/')
      .replace(/docs\/release-evidence\/packaged-runtime\/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact\//g, 'docs/release-evidence/packaged-runtime/outdated-current-runtime/')
      .replace(/docs\/release-evidence\/windows-smoke\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-artifact-archive-rerun\//g, 'docs/release-evidence/windows-smoke/outdated-current-archive/')
      .replace(/docs\/release-evidence\/desktop-picker\/2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun\//g, 'docs/release-evidence/desktop-picker/outdated-current-archive/'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /release closure and supporting evidence paths/i)
})

test('checkDocsDrift fails when handoff current priorities drift away from the remaining real/manual-required gaps', () => {
  const docsRoot = createDocsFixture()
  const handoffPath = path.join(docsRoot, 'HANDOFF.md')
  const handoff = fs.readFileSync(handoffPath, 'utf-8')
  fs.writeFileSync(
    handoffPath,
    handoff
      .replace(/Produce passing macOS release evidence/g, 'Document the existing macOS tooling')
      .replace(/Collect real signed Windows smoke evidence/g, 'Keep the Windows automation around')
      .replace(/Collect packaged native picker evidence from real app runs/g, 'Keep packaged picker tooling documented')
      .replace(/real compatible package/g, 'community momentum'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /priority gaps anchored to real\/manual-required work/i)
})

test('checkDocsDrift fails when public release metadata drops out of the docs map', () => {
  const docsRoot = createDocsFixture()
  const readmePath = path.join(docsRoot, 'README.md')
  const readme = fs.readFileSync(readmePath, 'utf-8')
  fs.writeFileSync(
    readmePath,
    readme.replace(/, public release metadata snapshots under `release-public-assets\/`/, ''),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /release-evidence archive classes/i)
})

test('checkDocsDrift fails when release checklist drifts back to optimistic macOS top-table wording', () => {
  const docsRoot = createDocsFixture()
  const checklistPath = path.join(docsRoot, 'release-checklist.md')
  const checklist = fs.readFileSync(checklistPath, 'utf-8')
  fs.writeFileSync(
    checklistPath,
    checklist.replace(
      /\| macOS \| .* \|/,
      '| macOS | Baseline implemented with evidence capture tooling and workflow artifact upload | Release candidate path exists; official artifacts should be signed/notarized and archived with passing evidence |'
    ),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /release checklist|macOS top-table wording/i)
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

test('checkDocsDrift fails when openpet-current-todo-architecture loses the current release blocker summary', () => {
  const docsRoot = createDocsFixture()
  const todoPath = path.join(docsRoot, 'openpet-current-todo-architecture.md')
  const todo = fs.readFileSync(todoPath, 'utf-8')
  fs.writeFileSync(
    todoPath,
    todo
      .replace(/docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//g, 'docs/release-evidence/signed-release-closure/outdated-current-closure/')
      .replace(/docs\/release-evidence\/packaged-runtime\/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact\//g, 'docs/release-evidence/packaged-runtime/outdated-current-runtime/')
      .replace(/macOS codesign\/notarization\/Gatekeeper classify as `fail`/g, 'macOS release evidence still needs review')
      .replace(/Windows smoke remains unsigned\/pending/g, 'Windows support needs future work')
      .replace(/desktop-picker archives remain archived but not signed-ready/g, 'desktop picker evidence still needs more detail'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /current release blocker summary aligned with the archived closure truth/i)
})

test('checkDocsDrift fails when maintainer summaries drift away from real/manual-required gap language', () => {
  const docsRoot = createDocsFixture()
  const developmentSummaryPath = path.join(docsRoot, 'development-summary.md')
  const developmentSummary = fs.readFileSync(developmentSummaryPath, 'utf-8')
  fs.writeFileSync(
    developmentSummaryPath,
    developmentSummary
      .replace(/real passing macOS closure path/g, 'release tooling')
      .replace(/real signed Windows artifacts/g, 'Windows support work')
      .replace(/compatible third-party package path/g, 'ecosystem progress'),
    'utf-8'
  )

  const projectStatusReviewPath = path.join(docsRoot, 'project-status-review.md')
  const projectStatusReview = fs.readFileSync(projectStatusReviewPath, 'utf-8')
  fs.writeFileSync(
    projectStatusReviewPath,
    projectStatusReview
      .replace(/Real passing macOS evidence must still be archived/g, 'macOS is on the right path')
      .replace(/Real signed Windows smoke evidence must exist/g, 'Windows needs follow-up')
      .replace(/Packaged native picker evidence still needs real archived runs/g, 'Picker coverage continues to improve')
      .replace(/compatible third-party package path/g, 'ecosystem fit'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /real\/manual-required gap language explicit/i)
})

test('checkDocsDrift fails when the agent-awareness mock rehearsal baseline disappears', () => {
  const docsRoot = createDocsFixture()
  const handoffPath = path.join(docsRoot, 'HANDOFF.md')
  const handoff = fs.readFileSync(handoffPath, 'utf-8')
  fs.writeFileSync(
    handoffPath,
    handoff.replace(/tests\/scripts\/mock-agent-awareness-flow\.test\.js/g, 'tests/scripts/agent-awareness-flow.test.js'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /mock rehearsal/i)
})

test('checkDocsDrift fails when the community-source mock rehearsal baseline disappears', () => {
  const docsRoot = createDocsFixture()
  const handoffPath = path.join(docsRoot, 'HANDOFF.md')
  const handoff = fs.readFileSync(handoffPath, 'utf-8')
  fs.writeFileSync(
    handoffPath,
    handoff.replace(/tests\/scripts\/mock-plugin-community-source-flow\.test\.js/g, 'tests/scripts/plugin-community-source-flow.test.js'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /community-source mock rehearsal/i)
})

test('checkDocsDrift fails when the packaged-provider mock rehearsal baseline disappears', () => {
  const docsRoot = createDocsFixture()
  const handoffPath = path.join(docsRoot, 'HANDOFF.md')
  const handoff = fs.readFileSync(handoffPath, 'utf-8')
  fs.writeFileSync(
    handoffPath,
    handoff.replace(/tests\/release\/mock-packaged-provider-flow\.test\.js/g, 'tests/release/packaged-provider-flow.test.js'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /packaged-provider mock rehearsal/i)
})

test('checkDocsDrift fails when the picker-runtime mock rehearsal baseline disappears', () => {
  const docsRoot = createDocsFixture()
  const handoffPath = path.join(docsRoot, 'HANDOFF.md')
  const handoff = fs.readFileSync(handoffPath, 'utf-8')
  fs.writeFileSync(
    handoffPath,
    handoff.replace(/tests\/release\/mock-picker-runtime-flow\.test\.js/g, 'tests/release/picker-runtime-flow.test.js'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /picker-runtime mock rehearsal/i)
})

test('checkDocsDrift fails when live docs lose the current macOS parser-rerun fact', () => {
  const docsRoot = createDocsFixture()
  const reviewPath = path.join(docsRoot, 'project-status-review.md')
  const review = fs.readFileSync(reviewPath, 'utf-8')
  fs.writeFileSync(
    reviewPath,
    review.replace(
      /docs\/release-evidence\/macos-release-evidence-archive\/2026-07-06T17-32-13Z-v1\.0\.1-rc\.3-authenticated-artifact-current-parser-rerun\//g,
      'docs/release-evidence/macos-release-evidence-archive/outdated-current-parser-rerun/'
    ),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /current macOS parser-rerun fact/i)
})

test('checkDocsDrift fails when live docs lose the current public release metadata snapshot fact', () => {
  const docsRoot = createDocsFixture()
  const reviewPath = path.join(docsRoot, 'project-status-review.md')
  const review = fs.readFileSync(reviewPath, 'utf-8')
  fs.writeFileSync(
    reviewPath,
    review.replace(
      /docs\/release-evidence\/release-public-assets\/2026-07-06T15-57-51Z-v1\.0\.1-rc\.3-public-release-metadata\.json/g,
      'docs/release-evidence/release-public-assets/outdated-public-release-metadata.json'
    ),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /public release metadata snapshot fact/i)
})

test('checkDocsDrift fails when project-context loses the current release-truth archive facts', () => {
  const docsRoot = createDocsFixture()
  const contextPath = path.join(docsRoot, 'project-context.json')
  const context = fs.readFileSync(contextPath, 'utf-8')
  fs.writeFileSync(
    contextPath,
    context.replace(
      /docs\/release-evidence\/packaged-runtime\/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact\//g,
      'docs/release-evidence/packaged-runtime/outdated-current-report/'
    ),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /signed release closure archive facts/i)
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
