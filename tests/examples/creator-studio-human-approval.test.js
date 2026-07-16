const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeHumanApproval
} = require('../../examples/plugins/creator-studio/lib/human-approval')

const assertHumanApprovalRequired = (value) => {
  assert.throws(
    () => normalizeHumanApproval(value),
    (error) => error?.code === 'human_approval_required' && /explicit human approval evidence/i.test(error.message)
  )
}

test('creator studio rejects missing human approval evidence', () => {
  assertHumanApprovalRequired(undefined)
})

test('creator studio rejects explicit non-approval evidence', () => {
  assertHumanApprovalRequired({
    approved: false,
    source: 'control-center',
    approvedAt: '2026-07-17T00:00:00.000Z',
    evidenceVersion: 1
  })
})

test('creator studio rejects malformed human approval evidence', () => {
  assertHumanApprovalRequired({
    approved: true,
    source: 'untrusted-client',
    approvedAt: 'not-a-timestamp',
    evidenceVersion: 2
  })
})

test('creator studio accepts bounded explicit human approval evidence', () => {
  assert.deepEqual(normalizeHumanApproval({
    approved: true,
    source: 'control-center',
    approvedAt: '2026-07-17T00:00:00.000Z',
    evidenceVersion: 1
  }), {
    approved: true,
    source: 'control-center',
    approvedAt: '2026-07-17T00:00:00.000Z',
    evidenceVersion: 1
  })
})
