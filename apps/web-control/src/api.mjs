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

export function createWebApi({ fetchImpl = globalThis.fetch } = {}) {
  let token = ''

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
      return payload.data
    },
    async logout() {
      try { await request('/__openpet/web/logout', { method: 'POST' }) } catch {}
      token = ''
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
