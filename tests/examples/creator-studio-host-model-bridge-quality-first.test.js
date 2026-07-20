const test = require('node:test')
const assert = require('node:assert/strict')

const {
  generateCanonicalCandidatePool,
  generateSelectedFullPetAction,
  createQualityFirstRecoveryBundle
} = require('../../examples/plugins/creator-studio/lib/host-model-bridge')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('host canonical pool keeps paid duplicates and obtains three distinct candidates within four dispatches', async () => {
  const hashes = ['a'.repeat(64), 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
  const persisted = []
  const pool = await generateCanonicalCandidatePool({
    generateCandidate: async ({ candidateId, dispatchIndex }) => ({ candidateId, sha256: hashes[dispatchIndex - 1], eligible: true }),
    persistCandidate: (candidate) => persisted.push(candidate)
  })
  assert.equal(pool.dispatchCount, 4)
  assert.equal(pool.distinctEligibleCount, 3)
  assert.equal(pool.candidates[1].eligible, false)
  assert.ok(pool.candidates[1].failureCodes.includes('canonical-candidate-duplicate'))
  assert.equal(persisted.length, 4)
})

test('host canonical pool rejects perceptual duplicates even when encoded hashes differ', async () => {
  const candidates = [
    { sha256: 'a'.repeat(64), descriptors: { perceptualHash: '0000000000000000', identityDescriptor: [0, 0], alphaMaskDescriptor: [0, 0] } },
    { sha256: 'b'.repeat(64), descriptors: { perceptualHash: '0000000000000001', identityDescriptor: [0.01, 0.01], alphaMaskDescriptor: [0.01, 0.01] } },
    { sha256: 'c'.repeat(64), descriptors: { perceptualHash: 'ffffffffffffffff', identityDescriptor: [1, 1], alphaMaskDescriptor: [1, 1] } },
    { sha256: 'd'.repeat(64), descriptors: { perceptualHash: '0f0f0f0f0f0f0f0f', identityDescriptor: [0.5, 0.5], alphaMaskDescriptor: [0.5, 0.5] } }
  ]
  const pool = await generateCanonicalCandidatePool({
    generateCandidate: async ({ candidateId, dispatchIndex }) => ({ candidateId, eligible: true, ...candidates[dispatchIndex - 1] })
  })
  assert.equal(pool.dispatchCount, 4)
  assert.equal(pool.distinctEligibleCount, 3)
  assert.equal(pool.candidates[1].eligible, false)
  assert.equal(pool.candidates[1].duplicateOfCandidateId, 'canonical-1')
})

test('host selected action delegates to the bounded quality-first runner', async () => {
  const generated = [
    { candidateId: 'one', descriptors: { perceptualHash: '0000', identityDescriptor: [0], alphaMaskDescriptor: [0] } },
    { candidateId: 'two', descriptors: { perceptualHash: 'ffff', identityDescriptor: [1], alphaMaskDescriptor: [1] } }
  ]
  const result = await generateSelectedFullPetAction({
    context: { actionId: 'idle' },
    reserveCreativeDispatch: () => {},
    generateCandidate: async () => generated.shift(),
    processCandidate: async (candidate) => ({ ...candidate, qa: { ok: true, failures: [] } }),
    evaluateCandidate: async () => ({ evaluation: { scores: { overall: 95 } }, gate: { ok: true, outcome: 'pass', failures: [] } })
  })
  assert.equal(result.ok, true)
  assert.ok(['one', 'two'].includes(result.selectedCandidateId))
})

test('quality-first recovery bundle retains every run asset with relative paths and hashes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-quality-first-recovery-'))
  const runId = 'run-recovery'
  const runDir = path.join(dataDir, 'runs', runId)
  fs.mkdirSync(path.join(runDir, 'candidates', 'idle'), { recursive: true })
  fs.mkdirSync(path.join(runDir, 'prompts'), { recursive: true })
  fs.writeFileSync(path.join(runDir, 'candidates', 'idle', 'raw.png'), 'raw')
  fs.writeFileSync(path.join(runDir, 'prompts', 'idle.txt'), 'visible prompt')
  const bundle = await createQualityFirstRecoveryBundle({
    dataDir,
    run: { runId, qualityFirst: { planHash: 'p'.repeat(64) } },
    actionResults: { idle: { ok: false, failureCode: 'idle_generation_failed' } },
    reason: 'idle_generation_failed'
  })
  assert.equal(bundle.relativePath, `runs/${runId}/recovery/recovery.json`)
  assert.match(bundle.sha256, /^[a-f0-9]{64}$/)
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, bundle.relativePath), 'utf8'))
  assert.equal(manifest.reason, 'idle_generation_failed')
  assert.ok(manifest.files.some((file) => file.relativePath.endsWith('/candidates/idle/raw.png')))
  assert.ok(manifest.files.some((file) => file.relativePath.endsWith('/prompts/idle.txt')))
  assert.doesNotMatch(JSON.stringify(manifest), /\/Users\/|\/tmp\//)
})
