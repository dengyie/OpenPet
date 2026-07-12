const test = require('node:test')
const assert = require('node:assert/strict')

test('external cursor fallback preserves unrelated unsaved pet settings', async () => {
  const { mergeExternalCursorSettings } = await import('../../src/control-center/src/lib/pet-settings-cursor-state.mjs')
  const draft = {
    scale: 1.6,
    grounded: true,
    selectedCursorId: 'old',
    customCursors: [{ id: 'old' }],
    customCursor: { enabled: true, fileName: 'old.png' },
    customCursorScope: 'system',
    systemCursorStatus: { supported: true, platform: 'darwin', active: true, helperPid: 77 }
  }
  const external = {
    scale: 1,
    grounded: false,
    selectedCursorId: 'old',
    customCursors: [{ id: 'old' }],
    customCursor: { enabled: true, fileName: 'old.png' },
    customCursorScope: 'openpet',
    systemCursorStatus: { supported: true, platform: 'darwin', active: false, helperPid: 0 }
  }

  const merged = mergeExternalCursorSettings(draft, external)

  assert.equal(merged.scale, 1.6)
  assert.equal(merged.grounded, true)
  assert.equal(merged.customCursorScope, 'openpet')
  assert.equal(merged.systemCursorStatus.active, false)
})

test('failed immediate cursor mutation restores cursor fields without discarding newer drafts', async () => {
  const { resolvePersistedCursorMutation } = await import('../../src/control-center/src/lib/pet-settings-cursor-state.mjs')
  const previous = { scale: 1, selectedCursorId: 'old', customCursorScope: 'openpet' }
  const optimistic = { scale: 1, selectedCursorId: 'new', customCursorScope: 'system' }
  const current = { ...optimistic, scale: 1.5 }

  assert.deepEqual(resolvePersistedCursorMutation({ previous, optimistic, current, saved: null }), {
    scale: 1.5,
    selectedCursorId: 'old',
    customCursorScope: 'openpet'
  })
})

test('failed immediate cursor mutation does not overwrite a newer external cursor fallback', async () => {
  const { resolvePersistedCursorMutation } = await import('../../src/control-center/src/lib/pet-settings-cursor-state.mjs')
  const previous = { selectedCursorId: 'old', customCursorScope: 'system' }
  const optimistic = { selectedCursorId: 'new', customCursorScope: 'system' }
  const fallback = { selectedCursorId: 'new', customCursorScope: 'openpet' }

  assert.equal(resolvePersistedCursorMutation({ previous, optimistic, current: fallback, saved: null }), fallback)
})

test('successful immediate cursor mutation only reconciles cursor-owned fields', async () => {
  const { resolvePersistedCursorMutation } = await import('../../src/control-center/src/lib/pet-settings-cursor-state.mjs')
  const previous = { selectedCursorId: 'old', customCursorScope: 'openpet' }
  const optimistic = { selectedCursorId: 'new', customCursorScope: 'system' }
  const current = { ...optimistic, scale: 1.6, grounded: true }
  const saved = { selectedCursorId: 'saved', customCursorScope: 'system', scale: 1, grounded: false }

  assert.deepEqual(resolvePersistedCursorMutation({ previous, optimistic, current, saved }), {
    selectedCursorId: 'saved',
    customCursorScope: 'system',
    scale: 1.6,
    grounded: true
  })
})

test('successful immediate cursor mutation does not overwrite a newer cursor choice or fallback', async () => {
  const { resolvePersistedCursorMutation } = await import('../../src/control-center/src/lib/pet-settings-cursor-state.mjs')
  const previous = { selectedCursorId: 'old', customCursorScope: 'openpet' }
  const optimistic = { selectedCursorId: 'cursor-a', customCursorScope: 'system' }
  const current = { selectedCursorId: 'cursor-b', customCursorScope: 'openpet', scale: 1.6 }
  const saved = { selectedCursorId: 'cursor-a', customCursorScope: 'system', scale: 1 }

  assert.equal(resolvePersistedCursorMutation({ previous, optimistic, current, saved }), current)
})
