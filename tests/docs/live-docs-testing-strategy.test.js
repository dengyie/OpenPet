const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))

test('testing strategy keeps test:tools aligned with the live-doc truth suite', () => {
  const packageJson = readJson('package.json')
  const testingStrategy = readText('docs/testing-strategy.md')

  assert.match(
    packageJson.scripts['test:tools'],
    /tests\/docs\/\*\.test\.js/,
    'package.json should keep docs truth tests inside test:tools'
  )
  assert.match(
    testingStrategy,
    /tests\/docs\/\*\.test\.js/i,
    'docs/testing-strategy.md should describe the docs truth suite under test:tools'
  )
  assert.match(
    testingStrategy,
    /active backlog|archived release blocker wording|smoke evidence entrypoints|current archive paths aligned with the current repository facts|older closure snapshots/i,
    'docs/testing-strategy.md should describe what the docs truth suite protects'
  )
})
