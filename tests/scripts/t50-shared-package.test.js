const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.resolve(__dirname, '../../')
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))

test('T50 shared workspace package owns the canonical contracts and browser helpers', () => {
  const sharedPackage = readJson('packages/shared/package.json')
  assert.equal(sharedPackage.name, '@openpet/shared')
  for (const file of [
    'packages/shared/src/openpet-contracts.ts',
    'packages/shared/src/cursor-library.ts',
    'packages/shared/src/cursor-library.js',
    'packages/shared/src/cursor-style.js',
    'packages/shared/src/pet-hitbox.js'
  ]) assert.equal(fs.existsSync(path.join(root, file)), true, file)
})

test('T50 desktop shared entries are thin compatibility wrappers', () => {
  const contract = fs.readFileSync(path.join(root, 'apps/desktop/src/shared/openpet-contracts.ts'), 'utf8')
  const cursor = fs.readFileSync(path.join(root, 'apps/desktop/src/shared/cursor-library.ts'), 'utf8')
  assert.match(contract, /@openpet\/shared/)
  assert.match(cursor, /@openpet\/shared/)
  assert.ok(contract.length < 300)
  assert.ok(cursor.length < 300)
})

test('T50 packaged renderer loads browser helpers from the shared package', () => {
  const html = fs.readFileSync(path.join(root, 'apps/desktop/index.html'), 'utf8')
  assert.match(html, /packages\/shared\/src\/cursor-style\.js/)
  assert.match(html, /packages\/shared\/src\/pet-hitbox\.js/)
})
