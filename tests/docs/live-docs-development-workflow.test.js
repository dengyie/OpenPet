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

test('documented Node.js floor matches the package engine contract', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'))
  const packageLock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf-8'))
  const workflow = fs.readFileSync(workflowPath, 'utf-8')
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf-8')
  const readmeZh = fs.readFileSync(path.join(repoRoot, 'README.zh-CN.md'), 'utf-8')

  assert.equal(packageJson.engines?.node, '>=22.12.0')
  assert.equal(packageLock.packages[''].engines?.node, packageJson.engines.node)
  assert.match(workflow, /Node\.js 22\.12\.0 or newer/)
  assert.match(readme, /Node\.js 22\.12\.0 or newer/)
  assert.match(readmeZh, /Node\.js 22\.12\.0 或更新版本/)
})
