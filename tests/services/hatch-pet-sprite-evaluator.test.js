const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const { getQualityFirstQualityProfile } = require('../../examples/plugins/creator-studio/lib/pet-generation-quality-profile')
const {
  createSpriteEvaluatorRequest,
  evaluateCanonicalComparisonGate,
  validateCanonicalComparisonEvaluation,
  evaluateVisualGate,
  recordSpriteEvaluation,
  validateSpriteEvaluation
} = require('../../src/main/services/hatch-pet-sprite-evaluator')

const REGIONS = [
  { regionId: 'source', role: 'source-identity' },
  { regionId: 'candidate-1', role: 'canonical-candidate' }
]

const canonicalScores = (overrides = {}) => ({
  identity: 96,
  silhouette: 92,
  smallScale: 90,
  completeness: 98,
  style: 92,
  overall: 94,
  ...overrides
})

const canonicalEvaluation = (overrides = {}) => ({
  schemaVersion: 1,
  recommendation: 'pass',
  confidence: 0.95,
  scores: canonicalScores(),
  defects: [],
  ...overrides
})

test('strict evaluator rejects missing, unknown, non-numeric, and out-of-range scores', () => {
  assert.throws(() => validateSpriteEvaluation(canonicalEvaluation({ scores: { ...canonicalScores(), style: undefined } }), { scope: 'canonical', regions: REGIONS }), /scores must contain exactly/)
  assert.throws(() => validateSpriteEvaluation(canonicalEvaluation({ scores: { ...canonicalScores(), invented: 100 } }), { scope: 'canonical', regions: REGIONS }), /scores must contain exactly/)
  assert.throws(() => validateSpriteEvaluation(canonicalEvaluation({ scores: canonicalScores({ identity: '96' }) }), { scope: 'canonical', regions: REGIONS }), /identity must be a number/)
  assert.throws(() => validateSpriteEvaluation(canonicalEvaluation({ scores: canonicalScores({ identity: 101 }) }), { scope: 'canonical', regions: REGIONS }), /identity must be between 0 and 100/)
})

test('strict evaluator rejects unknown fields, defect codes, severities, and board regions', () => {
  assert.throws(() => validateSpriteEvaluation({ ...canonicalEvaluation(), planMutation: true }, { scope: 'canonical', regions: REGIONS }), /must contain exactly/)
  assert.throws(() => validateSpriteEvaluation(canonicalEvaluation({ defects: [{ code: 'invented', severity: 'major', regionId: 'candidate-1' }] }), { scope: 'canonical', regions: REGIONS }), /defect code is invalid/)
  assert.throws(() => validateSpriteEvaluation(canonicalEvaluation({ defects: [{ code: 'identity-drift', severity: 'warning', regionId: 'candidate-1' }] }), { scope: 'canonical', regions: REGIONS }), /defect severity is invalid/)
  assert.throws(() => validateSpriteEvaluation(canonicalEvaluation({ defects: [{ code: 'identity-drift', severity: 'major', regionId: 'missing' }] }), { scope: 'canonical', regions: REGIONS }), /unknown review-board region/)
})

test('code-owned canonical gate ignores a model pass recommendation below threshold', () => {
  const profile = getQualityFirstQualityProfile()
  const evaluation = validateSpriteEvaluation(canonicalEvaluation({ scores: canonicalScores({ identity: 89 }) }), { scope: 'canonical', regions: REGIONS })
  const gate = evaluateVisualGate({ scope: 'canonical', ...evaluation, profile, regions: REGIONS })
  assert.equal(gate.ok, false)
  assert.equal(gate.outcome, 'repair')
  assert.ok(gate.failures.includes('visual-score-identity-below-minimum'))
})

test('model recommendation cannot override a code-computed pass', () => {
  const profile = getQualityFirstQualityProfile()
  const evaluation = validateSpriteEvaluation(canonicalEvaluation({ recommendation: 'reject' }), { scope: 'canonical', regions: REGIONS })
  const gate = evaluateVisualGate({ scope: 'canonical', ...evaluation, profile, regions: REGIONS })
  assert.equal(gate.ok, true)
  assert.equal(gate.outcome, 'pass')
})

test('code-owned gate rejects blocking defects and cannot evaluate low confidence', () => {
  const profile = getQualityFirstQualityProfile()
  const blocking = validateSpriteEvaluation(canonicalEvaluation({ defects: [{ code: 'identity-drift', severity: 'blocking', regionId: 'candidate-1' }] }), { scope: 'canonical', regions: REGIONS })
  assert.equal(evaluateVisualGate({ scope: 'canonical', ...blocking, profile, regions: REGIONS }).outcome, 'reject')
  const uncertain = validateSpriteEvaluation(canonicalEvaluation({ confidence: 0.5 }), { scope: 'canonical', regions: REGIONS })
  const gate = evaluateVisualGate({ scope: 'canonical', ...uncertain, profile, regions: REGIONS })
  assert.equal(gate.ok, false)
  assert.equal(gate.outcome, 'cannot-evaluate')
  assert.ok(gate.failures.includes('visual-confidence-low'))
})

test('scope-specific gates require the exact grounded, airborne, and package dimensions', () => {
  const profile = getQualityFirstQualityProfile()
  for (const [scope, scores, failingDimension] of [
    ['grounded-action', { identity: 95, actionReadability: 95, crossFrame: 95, crossAction: 95, smallScale: 95, style: 95, overall: 95 }, 'actionReadability'],
    ['airborne-action', { identity: 95, actionReadability: 95, crossFrame: 95, crossAction: 95, smallScale: 95, style: 95, overall: 95 }, 'actionReadability'],
    ['final-package', { identity: 95, actionDistinctness: 95, crossAction: 95, smallScale: 95, style: 95, overall: 95 }, 'actionDistinctness']
  ]) {
    const thresholds = scope === 'grounded-action' ? profile.visual.groundedAction : scope === 'airborne-action' ? profile.visual.airborneAction : profile.visual.finalPackage
    const evaluation = validateSpriteEvaluation({ ...canonicalEvaluation(), scores: { ...scores, [failingDimension]: thresholds[failingDimension] - 1 } }, { scope, regions: REGIONS })
    const gate = evaluateVisualGate({ scope, ...evaluation, profile, regions: REGIONS })
    assert.equal(gate.outcome, 'repair')
    assert.ok(gate.failures.includes(`visual-score-${failingDimension}-below-minimum`))
  }
})

test('evaluator request contains one review image and no mutable workflow authority', () => {
  const boardPath = path.join(os.tmpdir(), 'review-board.png')
  fs.writeFileSync(boardPath, Buffer.from('image'))
  const request = createSpriteEvaluatorRequest({
    scope: 'canonical',
    board: { path: boardPath, sha256: 'a'.repeat(64), regions: REGIONS, mimeType: 'image/png' },
    qa: { ok: true, failures: [], metrics: { bodyScaleCv: 0.01 } },
    profile: getQualityFirstQualityProfile()
  })
  const serialized = JSON.stringify(request)
  assert.equal(request.tool.function.name, 'hatch_pet_sprite_evaluation')
  assert.equal(request.messages[1].content.filter((part) => part.type === 'image_url').length, 1)
  assert.equal(serialized.includes(boardPath), false)
  assert.equal(serialized.includes('approve'), false)
  assert.equal(serialized.includes('activate'), false)
})

test('evaluation evidence is atomically stored under dataDir with a relative path', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-sprite-evaluation-'))
  const relativePath = recordSpriteEvaluation({
    dataDir,
    runId: 'run-1',
    scope: 'canonical',
    evaluation: { ...canonicalEvaluation(), absolutePath: '/Users/private/secret.png', token: 'sk-secret' }
  })
  assert.equal(relativePath, 'runs/run-1/evaluations/canonical.json')
  assert.equal(fs.existsSync(path.join(dataDir, relativePath)), true)
  assert.equal(fs.readdirSync(path.dirname(path.join(dataDir, relativePath))).some((name) => name.includes('.tmp-')), false)
  assert.equal(fs.readFileSync(path.join(dataDir, relativePath), 'utf8').includes(dataDir), false)
  assert.equal(fs.readFileSync(path.join(dataDir, relativePath), 'utf8').includes('absolutePath'), false)
  assert.equal(fs.readFileSync(path.join(dataDir, relativePath), 'utf8').includes('sk-secret'), false)
  assert.throws(() => recordSpriteEvaluation({ dataDir, runId: '../escape', scope: 'canonical', evaluation: canonicalEvaluation() }), /runId is invalid/)
})

test('evaluation evidence uses board-bound ids so candidates never overwrite each other', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-sprite-evaluation-candidates-'))
  const first = recordSpriteEvaluation({ dataDir, runId: 'run-1', scope: 'grounded-action', evidenceId: 'a'.repeat(64), evaluation: canonicalEvaluation() })
  const second = recordSpriteEvaluation({ dataDir, runId: 'run-1', scope: 'grounded-action', evidenceId: 'b'.repeat(64), evaluation: canonicalEvaluation() })
  assert.notEqual(first, second)
  assert.equal(fs.existsSync(path.join(dataDir, first)), true)
  assert.equal(fs.existsSync(path.join(dataDir, second)), true)
})

test('canonical comparison validates one score record per candidate region and gates each candidate', () => {
  const regions = [
    ...REGIONS,
    { regionId: 'candidate-2', role: 'canonical-candidate' },
    { regionId: 'candidate-3', role: 'canonical-candidate' }
  ]
  const evaluation = validateCanonicalComparisonEvaluation({
    schemaVersion: 1,
    recommendation: 'pass',
    candidates: regions.slice(1).map((region, index) => ({
      candidateId: region.regionId,
      confidence: 0.95,
      scores: canonicalScores({ overall: index === 1 ? 80 : 94 }),
      defects: []
    }))
  }, { regions })
  const result = evaluateCanonicalComparisonGate({ evaluation, profile: getQualityFirstQualityProfile(), regions })
  assert.equal(result.ok, false)
  assert.equal(result.candidateGates['candidate-1'].ok, true)
  assert.equal(result.candidateGates['candidate-2'].ok, false)
  assert.ok(result.candidateGates['candidate-2'].failures.includes('visual-score-overall-below-minimum'))
  assert.throws(() => validateCanonicalComparisonEvaluation({
    schemaVersion: 1,
    recommendation: 'pass',
    candidates: [
      { ...evaluation.candidates[0], candidateId: 'unknown' },
      evaluation.candidates[1],
      evaluation.candidates[2]
    ]
  }, { regions }), /unknown canonical candidate region/)
})
