const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')

test('live docs describe non-click trigger proposals as landed host-owned rules', () => {
  const developmentSummary = readText('docs/development-summary.md')
  const handoff = readText('docs/HANDOFF.md')
  const projectStatusReview = readText('docs/project-status-review.md')

  assert.doesNotMatch(
    developmentSummary,
    /still require a full host trigger-rule schema\/editor before they can be applied/i,
    'development-summary.md should not describe random/state/event trigger proposals as unimplemented'
  )
  assert.doesNotMatch(
    handoff,
    /must keep `random`\/`state`\/`event` pending until a host trigger-rule editor\/schema exists/i,
    'HANDOFF.md should not describe random/state/event trigger proposals as pending-only behavior'
  )

  const currentFactPattern = /`random`, `state`, and `event`[^\n]+create(?:s)? active host-owned durable trigger rules/i
  assert.match(
    developmentSummary,
    currentFactPattern,
    'development-summary.md should describe landed host-owned durable trigger rules'
  )
  assert.match(
    handoff,
    currentFactPattern,
    'HANDOFF.md should describe landed host-owned durable trigger rules'
  )

  assert.match(
    projectStatusReview,
    /Actions(?: pane)?(?:[^\n]+)?Trigger Proposal Inbox|trigger proposal inbox/i,
    'project-status-review.md should mention the host review path for Creator Studio trigger proposals'
  )
})
