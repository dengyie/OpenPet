const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { assertFullPetQaPassed } = require('../../examples/plugins/creator-studio/lib/full-pet-qa')

const makeQaFixture = ({ atlasQa }) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-full-pet-qa-'))
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'outputs')
  const qaDir = path.join(dataDir, 'runs', 'run-1', 'qa')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  const spritesheet = path.join(outputDir, 'spritesheet.webp')
  const petJson = path.join(outputDir, 'pet.json')
  const qa = path.join(qaDir, 'atlas-validation.json')
  const sourceImageQa = path.join(qaDir, 'source-image-validation.json')
  fs.writeFileSync(spritesheet, 'placeholder')
  fs.writeFileSync(petJson, '{}')
  fs.writeFileSync(qa, `${JSON.stringify({
    ok: true,
    width: 1536,
    height: 1872,
    visiblePixels: 1000,
    ...atlasQa
  }, null, 2)}\n`)
  fs.writeFileSync(sourceImageQa, `${JSON.stringify({
    ok: true,
    sourceRelativePath: 'runs/run-1/frames/base/0001.png',
    width: 1024,
    height: 1024,
    visiblePixels: 1000
  }, null, 2)}\n`)
  return {
    dataDir,
    artifacts: {
      spritesheet,
      petJson,
      qa,
      sourceImageQa
    }
  }
}

test('full-pet qa rejects missing required real basic actions when coverage is present', () => {
  const fixture = makeQaFixture({
    atlasQa: {
      basicActions: {
        requiredRealActionIds: ['idle', 'waving'],
        realActionIds: ['idle'],
        fallbackActionIds: ['waving'],
        missingRequiredActionIds: ['waving'],
        rows: []
      }
    }
  })

  assert.throws(
    () => assertFullPetQaPassed({ ...fixture, operation: 'import' }),
    /Full-pet QA missing required real basic actions before import: waving/
  )
})

test('full-pet qa accepts complete required real basic action coverage', () => {
  const fixture = makeQaFixture({
    atlasQa: {
      basicActions: {
        requiredRealActionIds: ['idle', 'waving'],
        realActionIds: ['idle', 'waving'],
        fallbackActionIds: [],
        missingRequiredActionIds: [],
        rows: []
      }
    }
  })

  const result = assertFullPetQaPassed({ ...fixture, operation: 'import' })
  assert.equal(result.atlasQa.basicActions.realActionIds.includes('waving'), true)
})
