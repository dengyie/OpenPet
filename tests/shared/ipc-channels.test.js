const test = require('node:test')
const assert = require('node:assert/strict')

const { IPC } = require('../../src/shared/ipc-channels')

test('shared IPC contract exports stable frozen channel names', () => {
  assert.equal(IPC.PET_PACKS_SET_ACTIVE, 'pet-packs:set-active')
  assert.equal(IPC.CATALOG_INSTALL_SELECTION, 'catalog:install-selection')
  assert.equal(IPC.SETTINGS_OPEN, 'settings:open')
  assert.equal(Object.isFrozen(IPC), true)
})
