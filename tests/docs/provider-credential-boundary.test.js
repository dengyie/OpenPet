const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')

const readDoc = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')

test('live docs keep the extension-owned provider credential boundary explicit', () => {
  const architecture = readDoc('docs/openpet-current-todo-architecture.md')
  const development = readDoc('docs/plugin-development.md')
  const ecosystem = readDoc('docs/plugin-ecosystem-rules.md')
  const playbook = readDoc('docs/plugin-submission-workflow-playbook.md')
  const handoff = readDoc('docs/HANDOFF.md')
  const summary = readDoc('docs/development-summary.md')

  assert.match(architecture, /Document plugin-managed provider credentials as unsupported.*Completed in current branch/i)
  assert.match(development, /ordinary extensions must not expect OpenPet to hand over saved chat\/image provider API keys/i)
  assert.match(ecosystem, /must not hand ordinary extensions saved chat\/image API keys/i)
  assert.match(playbook, /do not present saved OpenPet chat\/image provider credentials as something an ordinary extension can read or reuse/i)
  assert.match(handoff, /Ordinary extensions must not expect OpenPet-managed chat\/image provider API keys/i)
  assert.match(summary, /Ordinary extensions still do not receive those saved provider credentials/i)
})
