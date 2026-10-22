const IMAGE_CANDIDATE_SESSION_KEY = 'openpet.creator.image-candidates.v1'

function sessionStorageOrNull() {
  try { return globalThis.sessionStorage || null } catch { return null }
}

function isImageCandidateJobId(value) {
  return typeof value === 'string' && /^image-generate:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function isCandidatePathForJob(value, jobId) {
  if (typeof value !== 'string' || !jobId) return false
  const prefix = `creator-web/runs/${jobId}/`
  return value.startsWith(prefix) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(?:png|jpe?g|webp)$/i.test(value.slice(prefix.length))
}

export function saveImageCandidateSession(value, storage = sessionStorageOrNull()) {
  if (!storage || !isImageCandidateJobId(value?.jobId) || typeof value?.prompt !== 'string' || value.prompt.length > 8000) return false
  const selectedRelativePath = value.selectedRelativePath || ''
  if (selectedRelativePath && !isCandidatePathForJob(selectedRelativePath, value.jobId)) return false
  try {
    storage.setItem(IMAGE_CANDIDATE_SESSION_KEY, JSON.stringify({
      jobId: value.jobId,
      prompt: value.prompt,
      selectedRelativePath
    }))
    return true
  } catch {
    return false
  }
}

export function readImageCandidateSession(storage = sessionStorageOrNull()) {
  if (!storage) return null
  try {
    const value = JSON.parse(storage.getItem(IMAGE_CANDIDATE_SESSION_KEY) || 'null')
    if (!isImageCandidateJobId(value?.jobId) || typeof value?.prompt !== 'string' || value.prompt.length > 8000) return null
    const selectedRelativePath = value.selectedRelativePath || ''
    if (selectedRelativePath && !isCandidatePathForJob(selectedRelativePath, value.jobId)) return null
    return { jobId: value.jobId, prompt: value.prompt, selectedRelativePath }
  } catch {
    return null
  }
}

export function clearImageCandidateSession(storage = sessionStorageOrNull()) {
  try { storage?.removeItem(IMAGE_CANDIDATE_SESSION_KEY) } catch {}
}

/**
 * @param {{ generateImage: (request: any) => Promise<{ jobId: string }>, sessionRevision?: () => number }} api
 * @param {any} request
 * @param {{ storage?: Storage | null, isCurrent?: () => boolean }} [options]
 */
export async function submitImageCandidateJob(api, request, { storage = sessionStorageOrNull(), isCurrent = () => true } = {}) {
  const sessionRevision = api.sessionRevision?.()
  const job = await api.generateImage(request)
  if (!isCurrent() || (sessionRevision !== undefined && api.sessionRevision() !== sessionRevision)) return null
  saveImageCandidateSession({ jobId: job.jobId, prompt: request.prompt, selectedRelativePath: '' }, storage)
  return job
}

export async function loadGeneratedImageCandidates(api, job) {
  if (job?.kind !== 'image.generate' || job.status !== 'succeeded') return []
  const prefix = `creator-web/runs/${job.jobId}/`
  const outputs = Array.isArray(job.result?.outputs) ? job.result.outputs.slice(0, 3) : []
  const loaded = await Promise.all(outputs.map(async (output) => {
    const relativePath = output?.dataRelativePath
    const sha256 = String(output?.sha256 || '').toLowerCase()
    if (!isCandidatePathForJob(relativePath, job.jobId) || !relativePath.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(sha256)) return null
    try {
      const preview = await api.imagePreview(relativePath)
      if (typeof preview?.previewDataUrl !== 'string') return null
      return { relativePath, sha256, previewDataUrl: preview.previewDataUrl }
    } catch {
      return null
    }
  }))
  return loaded.filter((candidate) => candidate !== null)
}

export async function restoreGeneratedImageCandidates(api, jobId) {
  const job = await api.job(jobId)
  return { job, candidates: await loadGeneratedImageCandidates(api, job) }
}

export function normalizeCreatorRun(raw, fallbackDiagnostics = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const nested = raw.state && typeof raw.state === 'object' && !Array.isArray(raw.state) ? raw.state : {}
  const diagnostics = raw.diagnostics || nested.diagnostics || fallbackDiagnostics || null
  const progress = diagnostics?.progress || nested.progress || raw.progress || null
  const qualityFirst = progress?.qualityFirst || nested.qualityFirst || raw.qualityFirst || null
  return {
    ...nested,
    ...raw,
    runId: String(raw.runId || nested.runId || raw.id || '').trim(),
    workflowState: typeof raw.state === 'string'
      ? raw.state
      : String(raw.workflowState || nested.status || raw.status || nested.backendStatus?.state || '').trim(),
    diagnostics,
    progress,
    qualityFirst
  }
}

export function createWebApi({ fetchImpl = globalThis.fetch, candidateSessionStorage = sessionStorageOrNull() } = {}) {
  let token = ''
  let sessionRevision = 0

  const errorMessage = (payload, status) => {
    const message = payload?.error?.message || payload?.error
    if (message === 'Backend session is offline') return '桌面 Shell 尚未连接。请在 OpenPet 桌面端连接远程 Backend，再刷新此页。'
    if (message === 'web control is not configured') return '网页控制尚未配置，请联系管理员。'
    return message || `请求失败 (${status})`
  }

  const request = async (path, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
    if (token) headers.set('authorization', `Bearer ${token}`)
    const response = await fetchImpl(path, { ...init, headers })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(errorMessage(payload, response.status))
    return payload?.data ?? payload
  }

  return {
    hasToken: () => token.length > 0,
    sessionRevision: () => sessionRevision,
    async login(password) {
      const response = await fetchImpl('/__openpet/web/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(errorMessage(payload, response.status))
      if (typeof payload?.data?.token !== 'string' || !payload.data.token) throw new Error('Web 登录响应缺少令牌')
      token = payload.data.token
      sessionRevision += 1
      return payload.data
    },
    async logout() {
      const logoutToken = token
      token = ''
      sessionRevision += 1
      clearImageCandidateSession(candidateSessionStorage)
      try {
        const headers = new Headers({ accept: 'application/json' })
        if (logoutToken) headers.set('authorization', `Bearer ${logoutToken}`)
        await fetchImpl('/__openpet/web/logout', { method: 'POST', headers })
      } catch {}
    },
    request,
    health: () => request('/api/v1/health'),
    creatorState: () => request('/api/v1/creator/state'),
    uploadReference: (body) => request('/api/v1/creator/references/upload', { method: 'POST', body: JSON.stringify(body) }),
    generate: (body) => request('/api/v1/creator/characters/generate', { method: 'POST', body: JSON.stringify(body) }),
    generateImage: (body) => request('/api/v1/ai/images/web-generate', { method: 'POST', body: JSON.stringify(body) }),
    job: (jobId) => request(`/api/v1/jobs/${encodeURIComponent(jobId)}`),
    imagePreview: (relativePath) => {
      const query = new URLSearchParams({ relativePath })
      return request(`/api/v1/ai/images/preview?${query.toString()}`)
    },
    assetPreview: (runId, relativePath) => {
      const query = new URLSearchParams({ runId, relativePath })
      return request(`/api/v1/creator/assets/preview?${query.toString()}`)
    },
    approveIdentity: (runId, body) => request(`/api/v1/creator/runs/${encodeURIComponent(runId)}/accept-identity`, { method: 'POST', body: JSON.stringify(body) }),
    retryIdentity: (runId) => request(`/api/v1/creator/runs/${encodeURIComponent(runId)}/retry-identity`, { method: 'POST', body: '{}' }),
    retryAction: (runId, actionId) => request(`/api/v1/creator/runs/${encodeURIComponent(runId)}/retry-action`, { method: 'POST', body: JSON.stringify({ actionId }) }),
    approveActionCandidate: (runId, body) => request(`/api/v1/creator/runs/${encodeURIComponent(runId)}/accept-action-candidate`, { method: 'POST', body: JSON.stringify(body) }),
    importActions: (runId) => request(`/api/v1/creator/runs/${encodeURIComponent(runId)}/import-actions`, { method: 'POST', body: JSON.stringify({ activate: true }) }),
    exportRecovery: (runId) => request('/api/v1/creator/export', { method: 'POST', body: JSON.stringify({ runId }) })
  }
}
