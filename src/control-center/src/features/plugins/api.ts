import { z } from 'zod'
import { backendClient } from '../../api/backend-client.ts'
import type { ApiClient } from '../../api/client.ts'
import type { JsonObject } from '../../../../shared/openpet-contracts'

export type PluginJobCreated = { jobId: string }
export type PluginHttpApi = ReturnType<typeof createPluginHttpApi>

const jsonObject = z.record(z.string(), z.unknown())
const pluginJob = z.object({ jobId: z.string().min(1) })

export function isBackendUnavailableBeforeDispatch(error: unknown): boolean {
  const failure = error as { code?: unknown; dispatched?: unknown } | null
  return failure?.code === 'BACKEND_UNAVAILABLE' && failure.dispatched === false
}

export function shouldUseImmediatePluginCommandFallback(isDevelopment: boolean, hasBackendBridge: boolean): boolean {
  return isDevelopment && !hasBackendBridge
}

export function createPluginHttpApi(client: ApiClient = backendClient) {
  const anyResponse = z.unknown()
  const request = (method: string, path: string, body?: JsonObject): Promise<any> => body === undefined
    ? client.request({ method, path, responseSchema: anyResponse, retry: method === 'GET' })
    : client.request({ method, path, requestSchema: jsonObject, body, responseSchema: anyResponse, retry: method === 'GET' })
  return {
    list: async () => {
      const result = await request('GET', '/plugins')
      return Array.isArray(result) ? result : (result?.items || [])
    },
    detail: (pluginId: string) => request('GET', `/plugins/${encodeURIComponent(pluginId)}`),
    enable: (pluginId: string, enabled: boolean) => request('POST', `/plugins/${encodeURIComponent(pluginId)}/enable`, { enabled }),
    nativeApproval: (pluginId: string, approved: boolean) => request('POST', `/plugins/${encodeURIComponent(pluginId)}/native-approval`, { approved }),
    start: (pluginId: string) => request('POST', `/plugins/${encodeURIComponent(pluginId)}/start`, {}),
    stop: (pluginId: string) => request('POST', `/plugins/${encodeURIComponent(pluginId)}/stop`, {}),
    restart: (pluginId: string) => request('POST', `/plugins/${encodeURIComponent(pluginId)}/restart`, {}),
    status: (pluginId: string) => request('GET', `/plugins/${encodeURIComponent(pluginId)}/status`),
    logs: (pluginId: string, query: Record<string, unknown> = {}) => {
      const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]))
      return request('GET', `/plugins/${encodeURIComponent(pluginId)}/logs${params.size ? `?${params}` : ''}`)
    },
    clearLogsFor: (pluginId: string) => request('DELETE', `/plugins/${encodeURIComponent(pluginId)}/logs`),
    clearSelection: (selectionId: string) => request('POST', '/plugins/install?operation=clear-selection', { selectionId }),
    exportLogsHttp: (query: Record<string, unknown> = {}) => {
      const params = new URLSearchParams({ operation: 'export', ...Object.fromEntries(Object.entries(query).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])) })
      return request('GET', `/plugins/${encodeURIComponent(String(query.pluginId || ''))}/logs?${params}`)
    },
    permissions: (pluginId: string) => request('GET', `/plugins/${encodeURIComponent(pluginId)}/permissions`),
    setPermissions: (pluginId: string, permissions: string[]) => request('PUT', `/plugins/${encodeURIComponent(pluginId)}/permissions`, { permissions }),
    config: (pluginId: string) => request('GET', `/plugins/${encodeURIComponent(pluginId)}/config`),
    setConfig: (pluginId: string, config: JsonObject) => request('PUT', `/plugins/${encodeURIComponent(pluginId)}/config`, config),
    install: (selectionId: string) => request('POST', '/plugins/install', { selectionId }),
    installGithub: (repositoryUrl: string) => request('POST', '/plugins/install/github', { repositoryUrl }),
    inspectGithub: (repositoryUrl: string) => request('POST', '/plugins/validate', { repositoryUrl }),
    uninstall: (pluginId: string, removeStorage = false) => request('DELETE', `/plugins/${encodeURIComponent(pluginId)}?removeStorage=${removeStorage}`),
    validate: (path: string) => request('POST', '/plugins/validate', { path }),
    syncBundled: () => request('POST', '/plugins/sync-bundled', {}),
    setup: (pluginId: string, setupId: string) => request('POST', `/plugins/${encodeURIComponent(pluginId)}/commands/${encodeURIComponent(setupId)}?operation=setup`, {}),
    service: (pluginId: string, serviceId: string, operation: 'start' | 'stop' | 'health') => operation === 'health'
      ? request('POST', `/plugins/${encodeURIComponent(pluginId)}/start?operation=health`, { serviceId })
      : request('POST', `/plugins/${encodeURIComponent(pluginId)}/${operation}`, { serviceId }),
    servicePolicy: (pluginId: string, serviceId: string, policy: JsonObject) => request('PUT', `/plugins/${encodeURIComponent(pluginId)}/config?operation=health-policy`, { serviceId, policy }),
    storage: (pluginId: string) => request('POST', `/plugins/${encodeURIComponent(pluginId)}/enable?operation=storage-clear`, {}),
    creatorFlow: (prompt: string) => request('POST', '/plugins/openpet.creator-studio/commands/default-flow?operation=creator-default-flow', { prompt }),
    imSecret: (operation: 'state' | 'save' | 'clear', token?: string) => operation === 'state'
      ? request('GET', '/plugins/openpet.im-gateway/config?operation=secret-state')
      : request('PUT', `/plugins/openpet.im-gateway/config?operation=secret-${operation}`, token ? { token } : {}),
    update: (selectionId: string) => request('POST', '/plugins/install', { selectionId, update: true }),
    exportLogs: async (query: Record<string, unknown> = {}) => {
      const plugins = await (async () => {
        const result = await request('GET', '/plugins')
        return Array.isArray(result) ? result : (result?.items || [])
      })()
      const entries = (await Promise.all(plugins.map((plugin: { id?: string }) => plugin.id ?
        request('GET', `/plugins/${encodeURIComponent(plugin.id)}/logs`) : []))).flatMap((result: any) => result?.items || result?.entries || [])
      if (String(query.format || 'json').toLowerCase() === 'csv') {
        return ['id,pluginId,level,message,at', ...entries.map((entry: any) => [entry.id, entry.pluginId, entry.level, entry.message, entry.at].map((value) => JSON.stringify(value ?? '')).join(','))].join('\n')
      }
      return JSON.stringify(entries)
    },
    clearLogs: async () => {
      const result = await request('GET', '/plugins')
      const plugins = Array.isArray(result) ? result : (result?.items || [])
      return Promise.all(plugins.filter((plugin: { id?: string }) => plugin.id).map((plugin: { id: string }) => request('DELETE', `/plugins/${encodeURIComponent(plugin.id)}/logs`)))
    },
    async command(pluginId: string, command: string, args: JsonObject = {}): Promise<PluginJobCreated> {
      return client.request({ method: 'POST', path: `/plugins/${encodeURIComponent(pluginId)}/commands/${encodeURIComponent(command)}`, requestSchema: jsonObject, body: args, responseSchema: pluginJob, job: true, retry: false })
    },
  }
}

export const pluginHttpApi = createPluginHttpApi()
