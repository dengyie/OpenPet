const test = require('node:test')
const assert = require('node:assert/strict')

const {
  OFFICIAL_FULL_PET_ACTION_IDS,
  FULL_PET_ROW_QUALITY,
  getOfficialFullPetRow
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
const {
  createFullPetRowJobManifest,
  markRunningLeftApprovedMirror,
  normalizeFullPetRowJobManifest
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-jobs')

test('official row contract matches Codex hatch-pet rows and frame counts', () => {
  assert.deepEqual(OFFICIAL_FULL_PET_ACTION_IDS, [
    'idle',
    'running-right',
    'running-left',
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review'
  ])
  assert.equal(getOfficialFullPetRow('idle').frameCount, 6)
  assert.equal(getOfficialFullPetRow('running-right').frameCount, 8)
  assert.equal(getOfficialFullPetRow('running-left').frameCount, 8)
  assert.equal(getOfficialFullPetRow('waving').frameCount, 4)
  assert.equal(getOfficialFullPetRow('jumping').frameCount, 5)
  assert.equal(getOfficialFullPetRow('failed').frameCount, 8)
  assert.equal(getOfficialFullPetRow('waiting').frameCount, 6)
  assert.equal(getOfficialFullPetRow('running').frameCount, 6)
  assert.equal(getOfficialFullPetRow('review').frameCount, 6)
})

test('row job manifest creates one pending job for every official row', () => {
  const manifest = createFullPetRowJobManifest({
    runId: 'run-1',
    baseSourceRelativePath: 'runs/run-1/frames/base/0001.png',
    canonicalReferenceRelativePath: 'runs/run-1/references/canonical-base.png'
  })

  assert.equal(manifest.version, 1)
  assert.equal(manifest.mode, 'official-full-pet')
  assert.equal(manifest.base.sourceRelativePath, 'runs/run-1/frames/base/0001.png')
  assert.deepEqual(manifest.jobs.map((job) => job.actionId), OFFICIAL_FULL_PET_ACTION_IDS)
  for (const job of manifest.jobs) {
    assert.equal(job.status, 'pending')
    assert.equal(job.quality, FULL_PET_ROW_QUALITY.PENDING)
    assert.match(job.promptRelativePath, new RegExp(`runs/run-1/prompts/rows/${job.actionId}\\.txt$`))
    assert.match(job.outputRelativePath, new RegExp(`runs/run-1/rows/${job.actionId}/strip\\.png$`))
    assert.equal(job.frameCount, getOfficialFullPetRow(job.actionId).frameCount)
  }
})

test('only running-left can be marked as an approved mirror of running-right', () => {
  const manifest = createFullPetRowJobManifest({
    runId: 'run-1',
    baseSourceRelativePath: 'runs/run-1/frames/base/0001.png',
    canonicalReferenceRelativePath: 'runs/run-1/references/canonical-base.png'
  })
  const mirrored = markRunningLeftApprovedMirror({
    manifest,
    decisionNote: 'Symmetric markings and prop-free gait preserve identity.'
  })
  const runningLeft = mirrored.jobs.find((job) => job.actionId === 'running-left')
  assert.equal(runningLeft.status, 'derived')
  assert.equal(runningLeft.quality, FULL_PET_ROW_QUALITY.APPROVED_MIRROR)
  assert.deepEqual(runningLeft.derivation, {
    type: 'approved-mirror',
    sourceActionId: 'running-right',
    decisionNote: 'Symmetric markings and prop-free gait preserve identity.'
  })
})

test('manifest normalization rejects non-running-left derivations', () => {
  const manifest = createFullPetRowJobManifest({
    runId: 'run-1',
    baseSourceRelativePath: 'runs/run-1/frames/base/0001.png',
    canonicalReferenceRelativePath: 'runs/run-1/references/canonical-base.png'
  })
  const invalid = {
    ...manifest,
    jobs: manifest.jobs.map((job) => job.actionId === 'waving'
      ? {
          ...job,
          status: 'derived',
          quality: FULL_PET_ROW_QUALITY.APPROVED_MIRROR,
          derivation: { type: 'approved-mirror', sourceActionId: 'running-right', decisionNote: 'bad' }
        }
      : job)
  }
  assert.throws(() => normalizeFullPetRowJobManifest(invalid), /Only running-left may be derived/)
})
