const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')

let shouldRestoreScalePreview

test.before(async () => {
  ;({ shouldRestoreScalePreview } = await import(pathToFileURL(path.resolve(__dirname, '../../src/control-center/src/lib/pet-scale-preview.mjs')).href))
})

test('does not restore scale preview when the user never changed the preview scale', () => {
  assert.equal(shouldRestoreScalePreview({ currentScale: 1, originalScale: 1 }), false)
})

test('restores scale preview when the current preview differs from the saved scale', () => {
  assert.equal(shouldRestoreScalePreview({ currentScale: 0.75, originalScale: 1 }), true)
})
