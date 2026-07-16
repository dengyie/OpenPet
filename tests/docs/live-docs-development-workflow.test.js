const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const workflowPath = path.join(repoRoot, 'docs/development-workflow.md')

test('development workflow provides the canonical maintainer path', () => {
  assert.equal(fs.existsSync(workflowPath), true, 'docs/development-workflow.md must exist')
  const workflow = fs.readFileSync(workflowPath, 'utf-8')

  assert.match(workflow, /isolated worktree/i)
  assert.match(workflow, /PetService.*single source of truth/is)
  assert.match(workflow, /Grade A[\s\S]*Grade B[\s\S]*Grade C/i)
  assert.match(workflow, /npm run check:docs-drift/)
  assert.match(workflow, /npm run test:core:all/)
  assert.match(workflow, /git diff --check/)
  assert.match(workflow, /external evidence|manual-required/i)
})
