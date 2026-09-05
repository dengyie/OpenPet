import { z } from 'zod'
import type { Job } from '@openpet/contracts'

import { backendClient } from '../../api/backend-client.ts'
import { controlCenterAPI } from '../../api/control-center-api.ts'
import type { ApiClient } from '../../api/client.ts'
import type {
  CatalogBlocklistEntry,
  CatalogBlocklistResult,
  CatalogDemoApi,
  CatalogInstallRequest,
  CatalogInstallResult,
  CatalogInstallSelection,
  CatalogState,
} from '../../../../shared/openpet-contracts.ts'

const blocklistSchema = z.object({
  pluginIds: z.array(z.string()),
  packIds: z.array(z.string()),
  sha256: z.array(z.string()),
})
const reviewStateSchema = z.object({ blocked: z.boolean(), reasons: z.array(z.string()) })
const pluginEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  author: z.string().optional(),
  description: z.string().optional(),
  openpetApiVersion: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  downloadable: z.boolean().optional(),
  installed: z.boolean().optional(),
  installedVersion: z.string().optional(),
  updateAvailable: z.boolean().optional(),
  sha256: z.string().optional(),
  reportUrl: z.string().optional(),
  blockStatus: reviewStateSchema.optional(),
}).passthrough()
const petPackEntrySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  version: z.string(),
  author: z.string().optional(),
  description: z.string().optional(),
  previewImage: z.string().optional(),
  actionCount: z.number().optional(),
  downloadable: z.boolean().optional(),
  installed: z.boolean().optional(),
  installedVersion: z.string().optional(),
  updateAvailable: z.boolean().optional(),
  sha256: z.string().optional(),
  reportUrl: z.string().optional(),
  blockStatus: reviewStateSchema.optional(),
}).passthrough()
const catalogStateSchema = z.object({
  schemaVersion: z.number(),
  updatedAt: z.string(),
  feedbackUrl: z.string(),
  localBlocklist: blocklistSchema,
  catalogBlocklist: blocklistSchema,
  blocklist: blocklistSchema,
  plugins: z.array(pluginEntrySchema),
  petPacks: z.array(petPackEntrySchema),
})
const prepareRequestSchema = z.object({
  kind: z.enum(['plugin', 'pet-pack']),
  itemId: z.string().min(1),
}).strict()
const selectionRequestSchema = z.object({ selectionId: z.string().min(1) }).strict()
const blocklistEntrySchema = z.object({
  type: z.enum(['pluginId', 'packId', 'sha256']),
  value: z.string().min(1),
}).strict()
const installSelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('plugin'),
    itemId: z.string(),
    selectionId: z.string().min(1),
    sourcePackageHash: z.string(),
    pluginReview: z.unknown(),
  }).passthrough(),
  z.object({
    kind: z.literal('pet-pack'),
    itemId: z.string(),
    selectionId: z.string().min(1),
    sourcePackageHash: z.string(),
    petPackReview: z.unknown(),
  }).passthrough(),
])
const okSchema = z.object({ ok: z.boolean() }).passthrough()
const blocklistResultSchema = z.object({ catalog: catalogStateSchema, blocklist: blocklistSchema })
const installJobSchema = z.object({ jobId: z.string().min(1) })
const installResultSchema = z.object({
  ok: z.boolean(),
  kind: z.enum(['plugin', 'pet-pack']).optional(),
  itemId: z.string().optional(),
  catalog: catalogStateSchema,
}).passthrough()

export type CatalogInstallStart = { jobId: string } | { result: CatalogInstallResult }
export type CatalogInstallJobResolution =
  | { kind: 'pending' }
  | { kind: 'succeeded'; result: CatalogInstallResult }
  | { kind: 'failed'; message: string }

export function createCatalogHttpApi(client: ApiClient = backendClient) {
  return {
    list(): Promise<CatalogState> {
      return client.request({ method: 'GET', path: '/catalog', responseSchema: catalogStateSchema }) as Promise<CatalogState>
    },
    prepare(body: CatalogInstallRequest): Promise<CatalogInstallSelection> {
      return client.request({
        method: 'POST',
        path: '/catalog/prepare',
        requestSchema: prepareRequestSchema,
        body,
        responseSchema: installSelectionSchema,
        timeoutMs: 60_000,
        retry: false,
      }) as Promise<CatalogInstallSelection>
    },
    install(selectionId: string): Promise<{ jobId: string }> {
      return client.request({
        method: 'POST',
        path: '/catalog/install',
        requestSchema: selectionRequestSchema,
        body: { selectionId },
        responseSchema: installJobSchema,
        job: true,
        retry: false,
      })
    },
    clearSelection(selectionId: string): Promise<{ ok: boolean }> {
      return client.request({
        method: 'POST',
        path: '/catalog/clear-selection',
        requestSchema: selectionRequestSchema,
        body: { selectionId },
        responseSchema: okSchema,
        retry: false,
      })
    },
    addBlocklistEntry(body: CatalogBlocklistEntry): Promise<CatalogBlocklistResult> {
      return client.request({
        method: 'POST',
        path: '/catalog/blocklist',
        requestSchema: blocklistEntrySchema,
        body,
        responseSchema: blocklistResultSchema,
        retry: false,
      }) as Promise<CatalogBlocklistResult>
    },
    removeBlocklistEntry(entry: CatalogBlocklistEntry): Promise<CatalogBlocklistResult> {
      const path = `/catalog/blocklist/${encodeURIComponent(entry.value)}?type=${encodeURIComponent(entry.type)}`
      return client.request({ method: 'DELETE', path, responseSchema: blocklistResultSchema, retry: false }) as Promise<CatalogBlocklistResult>
    },
  }
}

export function resolveCatalogInstallJob(job: Job | null): CatalogInstallJobResolution {
  if (!job || job.status === 'queued' || job.status === 'running') return { kind: 'pending' }
  if (job.status === 'succeeded') {
    const parsed = installResultSchema.safeParse(job.result)
    return parsed.success
      ? { kind: 'succeeded', result: parsed.data as CatalogInstallResult }
      : { kind: 'failed', message: 'Catalog install returned an invalid result.' }
  }
  if (job.status === 'failed') return { kind: 'failed', message: job.error?.message || 'Catalog install failed.' }
  if (job.status === 'canceled') return { kind: 'failed', message: 'Catalog install was canceled.' }
  return { kind: 'failed', message: job.error?.message || 'Catalog install was interrupted.' }
}

export function shouldUseCatalogDemoApi(isDevelopment: boolean, hasBackendBridge: boolean): boolean {
  return isDevelopment && !hasBackendBridge
}

const httpApi = createCatalogHttpApi()
const demoApi = controlCenterAPI as unknown as CatalogDemoApi
const useDemoApi = () => shouldUseCatalogDemoApi(
  import.meta.env?.DEV === true,
  Boolean((globalThis as { openpetBackend?: unknown }).openpetBackend),
)

export const catalogApi = {
  list: (): Promise<CatalogState> => useDemoApi() ? demoApi.getCatalog() : httpApi.list(),
  prepare: (request: CatalogInstallRequest): Promise<CatalogInstallSelection> => useDemoApi()
    ? demoApi.prepareCatalogInstall(request)
    : httpApi.prepare(request),
  install: async (selectionId: string): Promise<CatalogInstallStart> => useDemoApi()
    ? { result: await demoApi.installCatalogSelection(selectionId) }
    : httpApi.install(selectionId),
  clearSelection: (selectionId: string) => useDemoApi()
    ? demoApi.clearCatalogSelection(selectionId)
    : httpApi.clearSelection(selectionId),
  addBlocklistEntry: (entry: CatalogBlocklistEntry) => useDemoApi()
    ? demoApi.addCatalogBlocklistEntry(entry)
    : httpApi.addBlocklistEntry(entry),
  removeBlocklistEntry: (entry: CatalogBlocklistEntry) => useDemoApi()
    ? demoApi.removeCatalogBlocklistEntry(entry)
    : httpApi.removeBlocklistEntry(entry),
}
