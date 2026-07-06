const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')

test('release-evidence root keeps a README entrypoint', () => {
  const readmePath = 'docs/release-evidence/README.md'
  assert.equal(fs.existsSync(path.join(repoRoot, readmePath)), true)
  const readme = readText(readmePath)
  assert.match(readme, /^# /)
  assert.match(readme, /packaged-runtime/i)
  assert.match(readme, /signed-release-closure/i)
  assert.match(readme, /mock-agent-awareness-flow\.test\.js/i)
  assert.match(readme, /mock-plugin-community-source-flow\.test\.js/i)
  assert.match(readme, /mock-picker-runtime-flow\.test\.js/i)
  assert.match(readme, /mock-packaged-provider-flow\.test\.js/i)
  assert.match(readme, /do not|does not|not prove|not by itself/i)
})

test('curated packaged-runtime and desktop-picker evidence directories keep README context', () => {
  const packagedRuntimeDir = 'docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64'
  const packagedRuntimeReadmePath = `${packagedRuntimeDir}/README.md`
  assert.equal(fs.existsSync(path.join(repoRoot, packagedRuntimeReadmePath)), true)
  const packagedRuntimeReadme = readText(packagedRuntimeReadmePath)
  assert.match(packagedRuntimeReadme, /historical/i)
  assert.match(packagedRuntimeReadme, /2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/i)

  const desktopPickerDir = 'docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact'
  const desktopPickerReadmePath = `${desktopPickerDir}/README.md`
  assert.equal(fs.existsSync(path.join(repoRoot, desktopPickerReadmePath)), true)
  const desktopPickerReadme = readText(desktopPickerReadmePath)
  assert.match(desktopPickerReadme, /superseded|intermediate/i)
  assert.match(desktopPickerReadme, /2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun/i)
  assert.match(desktopPickerReadme, /arch=arm64|arm64/i)
})

test('curated community-source evidence directories keep README entrypoints', () => {
  const discoveryDirs = [
    'docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search',
    'docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T10-40-00Z-compatible-source-search',
    'docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T15-46-14Z-openpets-model-divergence-rerun',
    'docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-17-27Z-npm-package-model-rerun',
    'docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-20-00Z-openpets-topic-rerun',
    'docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-45-00Z-github-code-search-rerun'
  ]
  for (const dir of discoveryDirs) {
    const readmePath = `${dir}/README.md`
    assert.equal(fs.existsSync(path.join(repoRoot, readmePath)), true)
    const readme = readText(readmePath)
    assert.match(readme, /README-community-source-discovery\.md/)
    assert.match(readme, /does not prove OpenPet plugin compatibility/i)
  }

  const intakeDirs = [
    'docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official',
    'docs/release-evidence/plugin-community-source-intake-report/2026-07-06T10-20-00Z-openpets-plugin-starter',
    'docs/release-evidence/plugin-community-source-intake-report/2026-07-06T10-30-00Z-opencode-pets'
  ]
  for (const dir of intakeDirs) {
    const readmePath = `${dir}/README.md`
    assert.equal(fs.existsSync(path.join(repoRoot, readmePath)), true)
    const readme = readText(readmePath)
    assert.match(readme, /README-community-intake\.md/)
    assert.match(readme, /does not install, enable, run, sign, publish, or trust/i)
  }

  const invitationDirs = [
    'docs/release-evidence/plugin-community-source-invitation-kit/2026-06-18T23-59-00Z-compatible-author-outreach',
    'docs/release-evidence/plugin-community-source-invitation-kit/2026-07-06T15-46-14Z-openpets-plugin-starter-outreach'
  ]
  for (const dir of invitationDirs) {
    const readmePath = `${dir}/README.md`
    assert.equal(fs.existsSync(path.join(repoRoot, readmePath)), true)
    const readme = readText(readmePath)
    assert.match(readme, /README-community-source-invitation\.md/)
    assert.match(readme, /not-sent|contact state/i)
  }
})

test('top-level release-evidence categories keep README entrypoints', () => {
  const categories = [
    'agent-awareness-local-smoke',
    'ai-provider-smoke',
    'ai-talk-local-smoke',
    'creator-studio-provider-smoke',
    'desktop-picker',
    'macos-release-evidence',
    'macos-release-evidence-archive',
    'packaged-runtime',
    'plugin-author-rehearsal',
    'plugin-cleanup-evidence',
    'plugin-community-source-discovery-report',
    'plugin-community-source-intake-report',
    'plugin-community-source-invitation-kit',
    'plugin-real-world-submission-rehearsal',
    'plugin-remote-source-submission-rehearsal',
    'release-public-assets',
    'signed-release-closure',
    'windows-smoke'
  ]

  for (const category of categories) {
    const readmePath = `docs/release-evidence/${category}/README.md`
    assert.equal(fs.existsSync(path.join(repoRoot, readmePath)), true)
    const readme = readText(readmePath)
    assert.match(readme, /^# /)
    assert.match(readme, /do not|does not|doesn't|not prove|not by itself/i)
  }
})
