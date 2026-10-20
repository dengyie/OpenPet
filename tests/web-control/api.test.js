const test = require('node:test')
const assert = require('node:assert/strict')

const apiModule = import('../../apps/web-control/src/api.mjs')

const jsonResponse = (data, status = 200) => new Response(JSON.stringify({ ok: status < 400, data, ...(status >= 400 ? { error: 'rejected' } : {}) }), {
  status,
  headers: { 'content-type': 'application/json' }
})

test('web API keeps its login token in memory and sends it only to authenticated endpoints', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url === '/__openpet/web/login') return jsonResponse({ token: 'memory-only-token' })
    if (url === '/__openpet/web/logout') return jsonResponse({})
    return jsonResponse({ status: 'ok' })
  }
  const { createWebApi } = await apiModule
  const api = createWebApi({ fetchImpl })

  assert.equal(api.hasToken(), false)
  await api.login('web-password')
  assert.equal(api.hasToken(), true)
  await api.health()
  assert.equal(calls[0].options.headers.authorization, undefined)
  assert.equal(calls[1].options.headers.get('authorization'), 'Bearer memory-only-token')
  await api.logout()
  assert.equal(api.hasToken(), false)
  await api.health()
  assert.equal(calls[3].options.headers.has('authorization'), false)
})

test('web API explains when its desktop Backend session is offline', async () => {
  const { createWebApi } = await apiModule
  const api = createWebApi({
    fetchImpl: async (url) => url === '/__openpet/web/login'
      ? jsonResponse({ token: 'memory-only-token' })
      : new Response(JSON.stringify({ ok: false, error: 'Backend session is offline' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      })
  })

  await api.login('web-password')
  await assert.rejects(api.health(), /桌面 Shell 尚未连接/)
})

test('web API encodes Creator asset preview parameters and hash-bound approval inputs', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    return jsonResponse({ jobId: 'creator.workflow:1' }, 202)
  }
  const { createWebApi } = await apiModule
  const api = createWebApi({ fetchImpl })
  await api.assetPreview('run one', 'runs/run one/candidates/front.png')
  await api.approveIdentity('run one', { candidateId: 'canonical-1', sha256: 'a'.repeat(64) })

  const previewUrl = new URL(calls[0].url, 'https://openpet.mesh')
  assert.equal(previewUrl.searchParams.get('runId'), 'run one')
  assert.equal(previewUrl.searchParams.get('relativePath'), 'runs/run one/candidates/front.png')
  assert.deepEqual(JSON.parse(calls[1].options.body), { candidateId: 'canonical-1', sha256: 'a'.repeat(64) })
})

test('web API exposes hash-bound action decisions and retry controls', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    return jsonResponse({ jobId: 'creator.workflow:2' }, 202)
  }
  const { createWebApi } = await apiModule
  const api = createWebApi({ fetchImpl })
  await api.retryIdentity('run one')
  await api.retryAction('run one', 'running-right')
  await api.approveActionCandidate('run one', {
    actionId: 'idle', candidateId: 'candidate-2', sha256: 'b'.repeat(64), qualityOverride: true,
    acknowledgedWarningCodes: ['action_candidate_diversity_insufficient']
  })
  assert.match(calls[0].url, /\/retry-identity$/)
  assert.deepEqual(JSON.parse(calls[0].options.body), {})
  assert.match(calls[1].url, /\/retry-action$/)
  assert.deepEqual(JSON.parse(calls[1].options.body), { actionId: 'running-right' })
  assert.match(calls[2].url, /\/accept-action-candidate$/)
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    actionId: 'idle', candidateId: 'candidate-2', sha256: 'b'.repeat(64), qualityOverride: true,
    acknowledgedWarningCodes: ['action_candidate_diversity_insufficient']
  })
})

test('web API submits image generation and previews a generated output', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    return url.includes('/preview')
      ? jsonResponse({ previewDataUrl: 'data:image/png;base64,AA==' })
      : jsonResponse({ jobId: 'image-generate:1' }, 202)
  }
  const { createWebApi } = await apiModule
  const api = createWebApi({ fetchImpl })
  await api.generateImage({ prompt: 'a small fox', candidateCount: 3 })
  await api.imagePreview('creator-web/runs/image-generate:1/0001.png')
  assert.equal(calls[0].url, '/api/v1/ai/images/web-generate')
  assert.deepEqual(JSON.parse(calls[0].options.body), { prompt: 'a small fox', candidateCount: 3 })
  const previewUrl = new URL(calls[1].url, 'https://openpet.mesh')
  assert.equal(previewUrl.searchParams.get('relativePath'), 'creator-web/runs/image-generate:1/0001.png')
})

test('web API continues Creator generation from a Backend artifact without uploading its image bytes', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    return jsonResponse({ jobId: 'creator.character:1' }, 202)
  }
  const { createWebApi } = await apiModule
  const api = createWebApi({ fetchImpl })
  const generatedImage = { relativePath: 'creator-web/runs/image-generate:1/0001.png', sha256: 'a'.repeat(64) }
  await api.generate({ backend: 'web', characterName: 'Mango Fox', stylePrompt: 'orange fox', generatedImage })
  assert.equal(calls[0].url, '/api/v1/creator/characters/generate')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    backend: 'web', characterName: 'Mango Fox', stylePrompt: 'orange fox', generatedImage
  })
})

test('Creator run normalization supports flat Shell views and nested Backend publicRun state', async () => {
  const { normalizeCreatorRun } = await apiModule
  const qualityFirst = { phase: 'awaiting_identity_review', identityReview: { status: 'pending', candidates: [{ candidateId: 'canonical-1' }] } }
  const backend = normalizeCreatorRun({
    id: 'run-backend',
    status: 'awaiting_identity_review',
    state: { runId: 'run-backend', status: 'awaiting_identity_review', creatorExecution: 'backend' }
  }, { progress: { qualityFirst } })
  assert.equal(backend.runId, 'run-backend')
  assert.equal(backend.workflowState, 'awaiting_identity_review')
  assert.equal(backend.creatorExecution, 'backend')
  assert.equal(backend.qualityFirst, qualityFirst)

  const desktop = normalizeCreatorRun({ runId: 'run-desktop', state: 'review-required', diagnostics: { progress: { qualityFirst } } })
  assert.equal(desktop.runId, 'run-desktop')
  assert.equal(desktop.workflowState, 'review-required')
  assert.equal(desktop.qualityFirst, qualityFirst)
})
