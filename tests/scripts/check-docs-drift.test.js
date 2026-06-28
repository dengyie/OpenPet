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

test('checkDocsDrift fails when release-evidence archive classes disappear from the docs map', () => {
  const docsRoot = createDocsFixture()
  const readmePath = path.join(docsRoot, 'README.md')
  const readme = fs.readFileSync(readmePath, 'utf-8')
  fs.writeFileSync(
    readmePath,
    readme.replace(/, packaged runtime smoke archives under `packaged-runtime\/`, and release-claim closure archives under `signed-release-closure\/`\./, '.'),
    'utf-8'
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /release-evidence archive classes/i)
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
