const test = require('node:test')
const assert = require('node:assert/strict')

test('action import service does not load sprite generator on startup-only paths', async () => {
  const servicePath = require.resolve('../../apps/desktop/src/services/action-import-service')
  const generatorPath = require.resolve('../../apps/desktop/src/services/sprite-generator')
  delete require.cache[servicePath]
  delete require.cache[generatorPath]

  const { createActionImportService } = require('../../apps/desktop/src/services/action-import-service')
  assert.equal(require.cache[generatorPath], undefined)

  const service = createActionImportService({
    framesRoot: '/tmp/openpet-lazy-load/flames',
    spritesDir: '/tmp/openpet-lazy-load/sprites',
    configPath: '/tmp/openpet-lazy-load/animations.json'
  })

  await assert.rejects(
    () => service.importActionFrames({ sourceDir: '/tmp/openpet-lazy-load/source', actionId: '../bad' }),
    /Invalid action id/
  )
  assert.equal(require.cache[generatorPath], undefined)
})
