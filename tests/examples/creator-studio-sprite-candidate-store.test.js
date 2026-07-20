const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  archiveCandidateRevision,
  selectBestPassingCandidate,
  writeCandidateRecord
} = require('../../examples/plugins/creator-studio/lib/sprite-candidate-store')

const createDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-candidate-store-'))
const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

test('candidate store writes atomic hash-verified relative asset records', () => {
  const dataDir = createDataDir()
  const assetPath = path.join(dataDir, 'runs', 'run-1', 'raw.png')
  fs.mkdirSync(path.dirname(assetPath), { recursive: true })
  fs.writeFileSync(assetPath, Buffer.from('paid-provider-output'))
  const record = writeCandidateRecord({
    dataDir,
    runId: 'run-1',
    scope: 'action-waving',
    candidate: {
      candidateId: 'candidate-1',
      attemptKind: 'initial',
      dispatchIndex: 1,
      provider: 'openai-compatible',
      model: 'image-model',
      artifacts: [{ role: 'raw-sheet', path: assetPath, sha256: sha256(assetPath) }],
      qa: { ok: false, failures: ['cell-edge-contact'] },
      gate: { ok: false, outcome: 'repair', failures: ['visual-score-overall-below-minimum'] },
      ignoredSecret: 'sk-private'
    }
  })

  assert.equal(record.relativePath, 'runs/run-1/candidates/action-waving/candidate-1/candidate.json')
  assert.equal(record.candidate.artifacts[0].relativePath, 'runs/run-1/raw.png')
  assert.equal(record.candidate.gate.outcome, 'repair')
  const stored = fs.readFileSync(path.join(dataDir, record.relativePath), 'utf8')
  assert.equal(stored.includes(dataDir), false)
  assert.equal(stored.includes('sk-private'), false)
  assert.equal(fs.readdirSync(path.dirname(path.join(dataDir, record.relativePath))).some((name) => name.includes('.tmp-')), false)
})

test('candidate store rejects escaping assets and hash mismatches', () => {
  const dataDir = createDataDir()
  const outside = path.join(os.tmpdir(), `outside-${Date.now()}.png`)
  fs.writeFileSync(outside, 'outside')
  assert.throws(() => writeCandidateRecord({
    dataDir,
    runId: 'run-1',
    scope: 'action-idle',
    candidate: { candidateId: 'candidate-1', artifacts: [{ role: 'raw-sheet', path: outside, sha256: sha256(outside) }] }
  }), /escaped.*data directory/i)

  const inside = path.join(dataDir, 'inside.png')
  fs.writeFileSync(inside, 'inside')
  assert.throws(() => writeCandidateRecord({
    dataDir,
    runId: 'run-1',
    scope: 'action-idle',
    candidate: { candidateId: 'candidate-1', artifacts: [{ role: 'raw-sheet', path: inside, sha256: '0'.repeat(64) }] }
  }), /hash mismatch/i)
})

test('candidate archive atomically preserves an entire scope revision', () => {
  const dataDir = createDataDir()
  const assetPath = path.join(dataDir, 'asset.png')
  fs.writeFileSync(assetPath, 'asset')
  writeCandidateRecord({
    dataDir,
    runId: 'run-archive',
    scope: 'action-idle',
    candidate: { candidateId: 'candidate-1', artifacts: [{ role: 'raw-sheet', path: assetPath, sha256: sha256(assetPath) }] }
  })
  const archived = archiveCandidateRevision({
    dataDir,
    runId: 'run-archive',
    scope: 'action-idle',
    reason: 'manual-repair',
    now: () => '2026-07-20T10:20:30.000Z'
  })
  assert.match(archived, /^runs\/run-archive\/candidate-archives\/action-idle\//)
  assert.equal(fs.existsSync(path.join(dataDir, archived, 'candidate-1', 'candidate.json')), true)
  assert.equal(fs.existsSync(path.join(dataDir, 'runs/run-archive/candidates/action-idle')), false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, archived, 'archive.json'), 'utf8')).reason, 'manual-repair')
})

test('candidate selection uses visual score then identity distance and stable id', () => {
  const selected = selectBestPassingCandidate({
    candidates: [
      { candidateId: 'c', qa: { ok: true }, gate: { ok: true }, evaluation: { scores: { overall: 92 } }, identityDistance: 0.2 },
      { candidateId: 'b', qa: { ok: true }, gate: { ok: true }, evaluation: { scores: { overall: 94 } }, identityDistance: 0.3 },
      { candidateId: 'a', qa: { ok: true }, gate: { ok: true }, evaluation: { scores: { overall: 94 } }, identityDistance: 0.1 },
      { candidateId: 'rejected', qa: { ok: false }, gate: { ok: true }, evaluation: { scores: { overall: 100 } }, identityDistance: 0 }
    ]
  })
  assert.equal(selected.candidateId, 'a')
})
