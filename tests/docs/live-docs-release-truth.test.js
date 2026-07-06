const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))

test('live docs keep packaged runtime archive truth aligned with release evidence', () => {
  const archiveDir = 'docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64'
  const report = readJson(`${archiveDir}/packaged-runtime-smoke-report.json`)
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')
  const developmentSummary = readText('docs/development-summary.md')
  const projectContextFacts = readJson('docs/project-context.json').currentFacts.join('\n')

  const archivePathPattern = /docs\/release-evidence\/packaged-runtime\/2026-06-16T14-52-13-074Z-darwin-arm64\//i
  const pickerLinkPattern = /plugin-picker-evidence-linked[\s\S]*pending|pet-picker-evidence-linked[\s\S]*pending|pending picker-link checks|reviewed desktop picker smoke report has been linked|desktop picker smoke report is linked/i
  const invalidPackagePattern = /invalid-package-feedback[\s\S]*blocked|blocked[\s\S]*invalid-package-feedback/i

  assert.equal(report.platform, 'darwin')
  assert.equal(report.artifact.signed, false)
  assert.equal(report.artifact.signatureStatus, 'Unknown')
  assert.equal(report.linkedEvidence.desktopPickerSmokeReport, '')
  assert.equal(report.linkedEvidence.desktopPickerSmokeRunbook, '')

  const checks = Object.fromEntries(report.checks.map((check) => [check.id, check]))
  assert.equal(checks['packaged-launch'].status, 'pass')
  assert.equal(checks['transparent-background'].status, 'pass')
  assert.equal(checks['plugin-picker-evidence-linked'].status, 'pending')
  assert.equal(checks['pet-picker-evidence-linked'].status, 'pending')
  assert.equal(checks['invalid-package-feedback'].status, 'blocked')

  for (const [name, content] of [
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview],
    ['development-summary.md', developmentSummary],
    ['project-context.json', projectContextFacts]
  ]) {
    assert.match(content, archivePathPattern, `${name} should mention the archived packaged runtime evidence path`)
    assert.match(content, pickerLinkPattern, `${name} should describe the pending picker-link release blockers`)
    assert.match(content, invalidPackagePattern, `${name} should describe the blocked invalid-package-feedback release blocker`)
  }
})

test('live docs keep signed release closure truth aligned with archived not-ready claims', () => {
  const archiveDir = 'docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun'
  const report = readJson(`${archiveDir}/signed-release-closure-report.json`)
  const handoff = readText('docs/HANDOFF.md')
  const developmentSummary = readText('docs/development-summary.md')
  const projectStatusReview = readText('docs/project-status-review.md')
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const projectContextFacts = readJson('docs/project-context.json').currentFacts.join('\n')

  const archivePathPattern = /docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//i
  const notReadyPattern = /official desktop[\s\S]*not-ready|macOS[\s\S]*not-ready|Windows[\s\S]*not-ready/i
  const blockerPattern = /macOS codesign.*fail|Windows smoke remains unsigned|desktop-picker archives remain archived but not signed-ready/i
  const manualRequiredPattern = /Apple signing|notarization|Windows signed artifact|human review/i

  assert.equal(report.releaseReady, false)
  assert.equal(report.manifest.ok, false)
  assert.equal(report.manifest.releaseReady, false)
  assert.equal(report.claims.officialDesktopRelease.status, 'not-ready')
  assert.equal(report.claims.macos.status, 'not-ready')
  assert.equal(report.claims.windows.status, 'not-ready')
  assert.match(
    JSON.stringify(report.claims.officialDesktopRelease.blockers),
    /Archive manifest releaseReady is false|macOS codesign evidence status is fail|Windows smoke evidence: artifact\.signed must be true/i
  )
  assert.match(
    JSON.stringify(report.claims.windows.blockers),
    /Windows smoke archive evidence: windowsSmokeArchiveManifest is not valid|Windows desktop picker archive evidence: desktopPickerArchiveManifest is not valid/i
  )

  for (const [name, content] of [
    ['HANDOFF.md', handoff],
    ['development-summary.md', developmentSummary],
    ['project-status-review.md', projectStatusReview],
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['project-context.json', projectContextFacts]
  ]) {
    assert.match(content, archivePathPattern, `${name} should mention the archived signed release closure path`)
    assert.match(content, notReadyPattern, `${name} should keep official release claims in a not-ready state`)
  }

  assert.match(handoff, blockerPattern, 'HANDOFF.md should preserve the concrete release blockers from the archived closure report')
  assert.match(projectStatusReview, manualRequiredPattern, 'project-status-review.md should keep manual-required release prerequisites explicit')
  assert.match(projectContextFacts, blockerPattern, 'project-context.json should preserve the concrete release blockers from the archived closure report')
  assert.match(projectContextFacts, manualRequiredPattern, 'project-context.json should keep manual-required release prerequisites explicit')
})
