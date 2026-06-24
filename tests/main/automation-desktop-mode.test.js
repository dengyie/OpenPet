const test = require('node:test')
const assert = require('node:assert/strict')

const {
  applyWorkspaceVisibility,
  createAutomationUserDataDirName,
  getAutomationDesktopProfile,
  shouldSkipDevCleanup
} = require('../../src/main/runtime/automation-desktop-mode')

test('automation desktop profile keeps normal runtime visible on all workspaces by default', () => {
  const profile = getAutomationDesktopProfile({
    env: {},
    appDataPath: '/Users/mango/Library/Application Support'
  })

  assert.equal(profile.enabled, false)
  assert.equal(profile.visibleOnAllWorkspaces, true)
  assert.equal(profile.userDataPath, '')
})

test('automation desktop profile isolates user data and disables all-workspaces visibility', () => {
  const profile = getAutomationDesktopProfile({
    env: {
      OPENPET_AUTOMATION_ISOLATION: '1',
      OPENPET_AUTOMATION_TARGET_DESKTOP: '2'
    },
    appDataPath: '/Users/mango/Library/Application Support'
  })

  assert.equal(profile.enabled, true)
  assert.equal(profile.targetDesktop, 2)
  assert.equal(profile.userDataDirName, 'ibot-automation-desktop-2')
  assert.equal(profile.userDataPath, '/Users/mango/Library/Application Support/ibot-automation-desktop-2')
  assert.equal(profile.visibleOnAllWorkspaces, false)
})

test('applyWorkspaceVisibility disables cross-workspace visibility in automation isolation mode', () => {
  const calls = []
  const result = applyWorkspaceVisibility({
    setVisibleOnAllWorkspaces: (...args) => calls.push(args)
  }, {
    env: {
      OPENPET_AUTOMATION_ISOLATION: '1',
      OPENPET_AUTOMATION_TARGET_DESKTOP: '2'
    }
  })

  assert.equal(result, false)
  assert.deepEqual(calls, [[false]])
})

test('automation helpers mark isolated runs to skip dev cleanup', () => {
  assert.equal(shouldSkipDevCleanup({}), false)
  assert.equal(shouldSkipDevCleanup({ OPENPET_SKIP_DEV_CLEANUP: '1' }), true)
  assert.equal(shouldSkipDevCleanup({ OPENPET_AUTOMATION_ISOLATION: '1' }), true)
  assert.equal(createAutomationUserDataDirName(0), 'ibot-automation-desktop')
})
