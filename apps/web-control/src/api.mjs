export function createWebApi({ fetchImpl = globalThis.fetch } = {}) {
  let token = ''

  const request = async (path, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
    if (token) headers.set('authorization', `Bearer ${token}`)
    const response = await fetchImpl(path, { ...init, headers })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `请求失败 (${response.status})`)
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
      if (!response.ok) throw new Error(payload?.error || '登录失败')
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
    job: (jobId) => request(`/api/v1/jobs/${encodeURIComponent(jobId)}`),
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
