const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))

test('active TODO keeps the current release-evidence blocker truth aligned with archived closure evidence', () => {
  const todo = readText('docs/TODO.md')
  const todoArchitecture = readText('docs/openpet-current-todo-architecture.md')
  const closure = readJson(
    'docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/signed-release-closure-report.json'
  )

  assert.equal(closure.releaseReady, false)
  assert.equal(closure.manifest.releaseReady, false)
  assert.equal(closure.claims.officialDesktopRelease.status, 'not-ready')
  assert.equal(closure.claims.macos.status, 'not-ready')
  assert.equal(closure.claims.windows.status, 'not-ready')
  assert.match(
    JSON.stringify(closure.claims.officialDesktopRelease.blockers),
    /macOS codesign evidence status is fail|Windows smoke evidence: artifact\.signed must be true|Archive manifest releaseReady is false/i
  )

  assert.match(
    todo,
    /docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//i,
    'docs/TODO.md should point to the current signed release closure rerun'
  )
  assert.match(
    todo,
    /docs\/release-evidence\/packaged-runtime\/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact\//i,
    'docs/TODO.md should point to the current packaged runtime pending report'
  )
  assert.match(
    todo,
    /docs\/release-evidence\/windows-smoke\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-artifact-archive-rerun\//i,
    'docs/TODO.md should point to the current Windows smoke archive rerun'
  )
  assert.match(
    todo,
    /docs\/release-evidence\/desktop-picker\/2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun\//i,
    'docs/TODO.md should point to the current Windows desktop-picker archive rerun'
  )
  assert.match(
    todo,
    /`codesign`\/`spctl` fail[\s\S]*code has no resources but signature indicates they must be present[\s\S]*classifies codesign\/Gatekeeper\/notarization as `fail`/i,
    'docs/TODO.md should keep the current macOS negative signing truth explicit'
  )
  assert.match(
    todo,
    /artifact\.signed=false[\s\S]*archived-but-not-ready Windows smoke and desktop-picker manifests[\s\S]*fresh passing evidence/i,
    'docs/TODO.md should keep the current packaged runtime and closure blocker chain explicit'
  )

  assert.match(
    todoArchitecture,
    /docs\/release-evidence\/signed-release-closure\/2026-07-06T16-46-49Z-v1\.0\.1-rc\.3-authenticated-closure-archive-rerun\//i,
    'docs/openpet-current-todo-architecture.md should point to the current signed release closure rerun'
  )
  assert.match(
    todoArchitecture,
    /docs\/release-evidence\/packaged-runtime\/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact\//i,
    'docs/openpet-current-todo-architecture.md should point to the current packaged runtime pending report'
  )
  assert.match(
    todoArchitecture,
    /macOS codesign\/notarization\/Gatekeeper classify as `fail`[\s\S]*Windows smoke remains unsigned\/pending[\s\S]*desktop-picker archives remain archived but not signed-ready/i,
    'docs/openpet-current-todo-architecture.md should summarize the current release blockers from the archived closure truth'
  )
})

test('active TODO keeps community-source and packaged-provider gaps explicit as real external or packaged-session work', () => {
  const todo = readText('docs/TODO.md')

  assert.match(
    todo,
    /docs\/release-evidence\/plugin-community-source-discovery-report\/2026-07-06T15-46-14Z-openpets-model-divergence-rerun\//i,
    'docs/TODO.md should point to the latest GitHub-topic community-source rerun'
  )
  assert.match(
    todo,
    /docs\/release-evidence\/plugin-community-source-discovery-report\/2026-07-06T16-17-27Z-npm-package-model-rerun\//i,
    'docs/TODO.md should point to the latest npm-package community-source rerun'
  )
  assert.match(
    todo,
    /docs\/release-evidence\/plugin-community-source-discovery-report\/2026-07-06T16-45-00Z-github-code-search-rerun\//i,
    'docs/TODO.md should point to the latest GitHub code-search community-source rerun'
  )
  assert.match(
    todo,
    /actual external compatible package source[\s\S]*tests\/scripts\/mock-plugin-community-source-flow\.test\.js/i,
    'docs/TODO.md should keep the community-source gap explicit while linking the synthetic rehearsal coverage'
  )
  assert.match(
    todo,
    /tests\/release\/mock-packaged-provider-flow\.test\.js[\s\S]*real configured packaged provider session|real configured packaged provider session[\s\S]*tests\/release\/mock-packaged-provider-flow\.test\.js/i,
    'docs/TODO.md should keep the packaged provider gap explicit while linking the synthetic rehearsal coverage'
  )
})
