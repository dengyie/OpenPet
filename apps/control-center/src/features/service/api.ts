import * as v from '../../../../desktop/src/shared/browser-validation.ts'
import { backendClient } from '../../api/backend-client.ts'
import { controlCenterAPI } from '../../api/control-center-api.ts'
import type { ApiClient } from '../../api/client.ts'
import type {
  ControlCenterApi,
  PaginatedLogsViewState,
  ServiceLogEntry,
  ServiceLogPageRequest,
  ServiceStatusViewState
} from '@openpet/shared/src/openpet-contracts.ts'

const jsonObject = v.record(v.string(), v.unknown())
const serviceStatus = v.custom<ServiceStatusViewState>((value): value is ServiceStatusViewState => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
const serviceLogEntry = v.object({
  id: v.string(),
  timestamp: v.string(),
  method: v.string(),
  path: v.string(),
  statusCode: v.number(),
  authorized: v.boolean(),
  remoteAddress: v.string(),
  error: v.string(),
})
const serviceLogs = v.object({
  entries: v.array(serviceLogEntry),
  page: v.number(),
  pageSize: v.number(),
  total: v.number(),
  totalPages: v.number(),
})

export function createServiceHttpApi(client: ApiClient = backendClient) {
  const send = <T>(method: string, path: string, responseSchema: v.GenericSchema<unknown, T>, body?: unknown) => body === undefined
    ? client.request({ method, path, responseSchema, retry: method === 'GET' })
    : client.request({ method, path, requestSchema: jsonObject, body: body as Record<string, unknown>, responseSchema, retry: false })

  return {
    getStatus: () => send('GET', '/service/status', serviceStatus),
    getLogs: (filters: ServiceLogPageRequest = {}) => {
      const params = new URLSearchParams(Object.entries(filters)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]))
      return send('GET', `/service/logs${params.size ? `?${params}` : ''}`, serviceLogs)
    },
    saveConfig: (config: Partial<ServiceStatusViewState['config']>) => send('PUT', '/service/config', serviceStatus, config),
    rotateToken: () => send('POST', '/service/token/rotate', serviceStatus, {}),
    revokeMcpSessions: () => send('POST', '/service/token/revoke-sessions', serviceStatus, {}),
    clearLogs: () => send('DELETE', '/service/logs', v.array(serviceLogEntry)),
    exportLogs: (filters: ServiceLogPageRequest = {}) => {
      const params = new URLSearchParams({
        operation: 'export',
        ...Object.fromEntries(Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]))
      })
      return send('GET', `/service/logs?${params}`, v.string())
    },
  }
}

const httpApi = createServiceHttpApi()
const useDemoApi = () => import.meta.env?.DEV === true && !Boolean((globalThis as { openpetBackend?: unknown }).openpetBackend)

export const serviceHttpApi = {
  getServiceStatus: () => useDemoApi() ? controlCenterAPI.getServiceStatus() : httpApi.getStatus(),
  getServiceLogs: (filters?: ServiceLogPageRequest) => useDemoApi() ? controlCenterAPI.getServiceLogs(filters) : httpApi.getLogs(filters),
  saveServiceConfig: (config: Partial<ServiceStatusViewState['config']>) => useDemoApi() ? controlCenterAPI.saveServiceConfig(config) : httpApi.saveConfig(config),
  rotateServiceToken: () => useDemoApi() ? controlCenterAPI.rotateServiceToken() : httpApi.rotateToken(),
  revokeMcpSessions: () => useDemoApi() ? controlCenterAPI.revokeMcpSessions() : httpApi.revokeMcpSessions(),
  clearServiceLogs: () => useDemoApi() ? controlCenterAPI.clearServiceLogs() : httpApi.clearLogs(),
  exportServiceLogs: (filters?: ServiceLogPageRequest) => useDemoApi() ? controlCenterAPI.exportServiceLogs(filters) : httpApi.exportLogs(filters),
} satisfies Pick<ControlCenterApi, 'getServiceStatus' | 'getServiceLogs' | 'saveServiceConfig' | 'rotateServiceToken' | 'revokeMcpSessions' | 'clearServiceLogs' | 'exportServiceLogs'>

