const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))

test('live docs keep packaged runtime archive truth aligned with release evidence', () => {
	const archiveDir = 'docs/release-evidence/packaged-runtime/2026-10-09T02-18-20-646Z-darwin-arm64'
	const report = readJson(`${archiveDir}/packaged-runtime-smoke-report.json`)
	const evidence = readJson(`${archiveDir}/packaged-runtime-smoke-evidence.json`)
	const pickerReport = readJson('docs/release-evidence/desktop-picker/2026-10-08T21-01-48Z-darwin-arm64/desktop-picker-smoke-report.json')
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')
  const developmentSummary = readText('docs/development-summary.md')
  const projectContextFacts = readJson('docs/project-context.json').currentFacts.join('\n')

	const archivePathPattern = /(?:docs\/|\.\/)release-evidence\/packaged-runtime\/2026-10-09T02-18-20-646Z-darwin-arm64\//i
	const pickerPathPattern = /(?:docs\/|\.\/)release-evidence\/desktop-picker\/2026-10-08T21-01-48Z-darwin-arm64\//i
	const currentPassPattern = /11\/14|11 of 14/i
	const installPendingPattern = /plugin-install-disabled[\s\S]*(?:pending|not run|not installed)/i

  assert.equal(report.platform, 'darwin')
  assert.equal(report.artifact.signed, false)
  assert.equal(report.artifact.signatureStatus, 'Unknown')
	assert.equal(report.linkedEvidence.desktopPickerSmokeReport, '')
	assert.equal(report.linkedEvidence.desktopPickerSmokeRunbook, '')
	assert.equal(pickerReport.platform, report.platform)
	assert.equal(pickerReport.arch, report.arch)

  const checks = Object.fromEntries(report.checks.map((check) => [check.id, check]))
  assert.equal(report.checks.length, 14)
	assert.equal(report.checks.filter((check) => check.status === 'pass').length, 11)
	assert.equal(checks['plugin-picker-evidence-linked'].status, 'pending')
	assert.equal(checks['pet-picker-evidence-linked'].status, 'pending')
	assert.equal(checks['invalid-package-feedback'].status, 'blocked')
	assert.equal(checks['state-after-runtime-smoke'].status, 'pass')
	assert.equal(evidence.state.launch.ok, true)
	assert.equal(evidence.state.renderer.sprite.visible, true)
	assert.equal(evidence.state.renderer.bubbleChat.visible, true)
	assert.equal(evidence.state.packs.filter((pack) => pack.ok).length, 4)
	assert.doesNotMatch(JSON.stringify(evidence), /\/Users\/|\/private\/tmp\/|openpet-runtime-http-picker/)
  const pickerChecks = Object.fromEntries(pickerReport.checks.map((check) => [check.id, check]))
	assert.equal(pickerReport.checks.filter((check) => check.status === 'pass').length, 8)
  assert.equal(pickerChecks['plugin-install-disabled'].status, 'pending')
  assert.equal(pickerChecks['plugin-picker-cancel'].status, 'pass')
  assert.equal(pickerChecks['plugin-picker-zip-review'].status, 'pass')
  assert.equal(pickerChecks['pet-pack-picker-cancel'].status, 'pass')
  assert.equal(pickerChecks['action-frame-picker-cancel'].status, 'pass')
	assert.equal(pickerChecks['invalid-package-feedback'].status, 'pass')

  for (const [name, content] of [
    ['openpet-current-todo-architecture.md', todoArchitecture],
    ['HANDOFF.md', handoff],
    ['project-status-review.md', projectStatusReview],
    ['development-summary.md', developmentSummary],
    ['project-context.json', projectContextFacts]
  ]) {
    assert.match(content, archivePathPattern, `${name} should mention the archived packaged runtime evidence path`)
    assert.match(content, pickerPathPattern, `${name} should mention the paired picker evidence path`)
		assert.match(content, currentPassPattern, `${name} should describe the current passing runtime checks`)
    assert.match(content, installPendingPattern, `${name} should retain the unverified plugin-install-disabled state`)
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
  const notReadyPattern = /not-ready/i
  const historicalPolicyPattern = /historical|previous policy|previous paid-signing policy|old gate/i
  const blockerPattern = /macOS codesign.*fail|Windows smoke remains unsigned|desktop-picker archives remain archived but not signed-ready/i
  const manualRequiredPattern = /self-managed signing|self-signature integrity|Windows self-signed|human review/i

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
    assert.match(content, notReadyPattern, `${name} should preserve the archived closure's not-ready result`)
    assert.match(content, historicalPolicyPattern, `${name} should identify the archived result as historical policy evidence`)
  }

  assert.match(handoff, blockerPattern, 'HANDOFF.md should preserve the concrete release blockers from the archived closure report')
  assert.match(projectStatusReview, manualRequiredPattern, 'project-status-review.md should keep self-managed signing and manual release evidence requirements explicit')
  assert.match(projectContextFacts, blockerPattern, 'project-context.json should preserve the concrete release blockers from the archived closure report')
  assert.match(projectContextFacts, manualRequiredPattern, 'project-context.json should keep self-managed signing and manual release evidence requirements explicit')
})
