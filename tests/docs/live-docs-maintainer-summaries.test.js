const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))

test('maintainer summary docs keep current real/manual-required gaps explicit', () => {
  const handoff = readText('docs/HANDOFF.md')
  const developmentSummary = readText('docs/development-summary.md')
  const projectStatusReview = readText('docs/project-status-review.md')
  const closure = readJson(
    'docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/signed-release-closure-report.json'
  )

  assert.equal(closure.releaseReady, false)
  assert.equal(closure.claims.officialDesktopRelease.status, 'not-ready')
  assert.equal(closure.claims.macos.status, 'not-ready')
  assert.equal(closure.claims.windows.status, 'not-ready')

  assert.match(
    handoff,
    /Produce passing macOS release evidence[\s\S]*Collect real signed Windows smoke evidence[\s\S]*Collect packaged native picker evidence from real app runs[\s\S]*real compatible package/i,
    'HANDOFF.md should keep current priorities anchored to the remaining real/manual-required gaps'
  )

  assert.match(
    developmentSummary,
    /real passing macOS closure path[\s\S]*real signed Windows artifacts[\s\S]*Packaged native picker evidence still needs real archived runs[\s\S]*compatible third-party package path/i,
    'development-summary.md should keep the open engineering themes grounded in remaining real/manual-required gaps'
  )

  assert.match(
    projectStatusReview,
    /Real passing macOS evidence must still be archived[\s\S]*Real signed Windows smoke evidence must exist[\s\S]*Packaged native picker evidence still needs real archived runs[\s\S]*compatible third-party package path/i,
    'project-status-review.md should keep the main remaining gaps grounded in remaining real/manual-required gaps'
  )
})

test('maintainer summary docs keep synthetic rehearsal boundaries explicit', () => {
  const handoff = readText('docs/HANDOFF.md')
  const releaseEvidenceReadme = readText('docs/release-evidence/README.md')

  for (const [name, content] of [
    ['HANDOFF.md', handoff],
    ['release-evidence/README.md', releaseEvidenceReadme]
  ]) {
    assert.match(
      content,
      /does not replace real Codex signal collection or human desktop acceptance|does not replace a real archived Codex session/i,
      `${name} should keep agent-awareness synthetic coverage separate from real acceptance`
    )
    assert.match(
      content,
      /does not replace a real compatible third-party `plugin\.json` package|does not replace a real compatible third-party package/i,
      `${name} should keep community-source synthetic coverage separate from real external package proof`
    )
    assert.match(
      content,
      /does not replace a real configured packaged provider session/i,
      `${name} should keep packaged-provider synthetic coverage separate from a real configured provider session`
    )
  }

  assert.match(
    handoff,
    /not real signed or manually observed release evidence/i,
    'HANDOFF.md should keep release synthetic coverage separate from real signed or manually observed evidence'
  )
  assert.match(
    releaseEvidenceReadme,
    /does not replace real signed artifacts[\s\S]*manual release review/i,
    'release-evidence/README.md should keep release synthetic coverage separate from real signed artifacts and manual review'
  )
})

test('release entry docs keep current not-ready release truth explicit', () => {
  const docsReadme = readText('docs/README.md')
  const releaseChecklist = readText('docs/release-checklist.md')
  const packagedRuntime = readJson(
    'docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json'
  )

  assert.equal(packagedRuntime.artifact.signed, false)

  assert.match(
    docsReadme,
    /\| Release evidence index \| \[`release-evidence\/README\.md`\]\(\.\/release-evidence\/README\.md\) \|/i,
    'docs/README.md should keep the release-evidence index in the current-docs entry table'
  )

  assert.match(
    releaseChecklist,
    /Current public macOS caution:[\s\S]*failing signed readiness/i,
    'release-checklist.md should keep the current failing macOS release-truth caution explicit'
  )
  assert.match(
    releaseChecklist,
    /Current packaged-runtime caution:[\s\S]*artifact\.signed=false[\s\S]*keeps every runtime check pending/i,
    'release-checklist.md should keep the current packaged-runtime caution explicit'
  )
  assert.match(
    releaseChecklist,
    /\| macOS \| Public assets and imported workflow evidence currently fail signed readiness \| macOS-first release track; official artifacts still need passing signed\/notarized evidence \|/i,
    'release-checklist.md should keep the macOS top-table wording aligned with the current not-ready truth'
  )
  assert.match(
    releaseChecklist,
    /\| Windows \| [\s\S]*Do not publish as supported until the Windows checklist passes \|/i,
    'release-checklist.md should keep Windows support wording conservative until the checklist passes'
  )
})
