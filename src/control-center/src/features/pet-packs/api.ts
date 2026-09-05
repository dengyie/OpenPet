import { z } from 'zod'
import { EVENT_PET_PACK_ACTIVATED, type Job } from '@openpet/contracts'

import { backendClient } from '../../api/backend-client.ts'
import type { ApiClient } from '../../api/client.ts'
import { controlCenterAPI } from '../../api/control-center-api.ts'
import type {
  PetPackExportResult,
  PetPackMutationResult,
  PetPacksViewState
} from '../../../../shared/openpet-contracts.ts'

const blockStatusSchema = z.object({
  blocked: z.boolean(),
  reasons: z.array(z.string()),
})

const petPackSummarySchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  version: z.string(),
  source: z.string(),
  rootPath: z.string(),
  active: z.boolean().optional(),
  installedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  packageHash: z.string().optional(),
  sourcePackageHash: z.string().optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
  actionCount: z.number().int().nonnegative().optional(),
  defaultAction: z.string().optional(),
  clickAction: z.string().optional(),
  previewSprite: z.string().optional(),
  previewAction: z.record(z.string(), z.unknown()).nullable().optional(),
  valid: z.boolean().optional(),
  error: z.string().optional(),
  blockStatus: blockStatusSchema.optional(),
  conflict: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

const petPacksSchema = z.object({
  activePackId: z.string(),
  packs: z.array(petPackSummarySchema),
})

const actionsSchema = z.object({
  defaultAction: z.string(),
  clickAction: z.string(),
  actions: z.array(z.record(z.string(), z.unknown())),
  triggerRules: z.array(z.unknown()).optional(),
  triggerProposalInbox: z.array(z.unknown()).optional(),
}).passthrough()

const mutationSchema = z.object({
  pack: petPackSummarySchema.optional(),
  activePackId: z.string().optional(),
  petPacks: petPacksSchema,
  animations: actionsSchema.optional(),
}).passthrough()

const exportResultSchema = z.union([
  z.object({ canceled: z.literal(true) }),
  z.object({
    canceled: z.literal(false).optional(),
    packId: z.string().min(1),
    fileName: z.string().min(1),
    outputPath: z.string().optional(),
    sha256: z.string().optional(),
    byteSize: z.number().int().nonnegative().optional(),
  }).passthrough(),
])

const jobStartSchema = z.object({ jobId: z.string().min(1) })
const emptyRequestSchema = z.object({}).strict()
const importRequestSchema = z.object({ selectionId: z.string().min(1) }).strict()
const clearRequestSchema = z.object({
  operation: z.literal('clear-selection'),
  selectionId: z.string().min(1),
}).strict()

export type PetPackJobKind = 'import' | 'export'
export type PetPackJobStart<T> = { jobId: string } | { result: T }
export type PetPackJobResolution =
  | { kind: 'pending' }
  | { kind: 'succeeded'; result: PetPackMutationResult | PetPackExportResult }
  | { kind: 'failed'; message: string }

export function nextPetPackActivationEventId(
  event: { lastEventId: string | null; lastEventName: string | null },
  lastHandledEventId: string | null,
): string | null {
  if (event.lastEventName !== EVENT_PET_PACK_ACTIVATED) return null
  if (!event.lastEventId || event.lastEventId === lastHandledEventId) return null
  return event.lastEventId
}

export function createPetPackHttpApi(client: ApiClient = backendClient) {
  return {
    list(): Promise<PetPacksViewState> {
      return client.request({ method: 'GET', path: '/pet-packs', responseSchema: petPacksSchema }) as Promise<PetPacksViewState>
    },
    clearSelection(selectionId: string): Promise<{ ok: boolean }> {
      return client.request({
        method: 'POST',
        path: '/pet-packs/validate',
        requestSchema: clearRequestSchema,
        body: { operation: 'clear-selection', selectionId },
        responseSchema: z.object({ ok: z.boolean() }),
        retry: false,
      })
    },
    import(selectionId: string): Promise<{ jobId: string }> {
      return client.request({
        method: 'POST',
        path: '/pet-packs/import',
        requestSchema: importRequestSchema,
        body: { selectionId },
        responseSchema: jobStartSchema,
        job: true,
        retry: false,
      })
    },
    export(packId: string): Promise<{ jobId: string }> {
      return client.request({
        method: 'POST',
        path: `/pet-packs/${encodeURIComponent(packId)}/export`,
        requestSchema: emptyRequestSchema,
        body: {},
        responseSchema: jobStartSchema,
        job: true,
        retry: false,
      })
    },
    activate(packId: string): Promise<PetPackMutationResult> {
      return client.request({
        method: 'POST',
        path: `/pet-packs/${encodeURIComponent(packId)}/activate`,
        requestSchema: emptyRequestSchema,
        body: {},
        responseSchema: mutationSchema,
        retry: false,
      }) as Promise<PetPackMutationResult>
    },
    remove(packId: string): Promise<PetPackMutationResult> {
      return client.request({
        method: 'DELETE',
        path: `/pet-packs/${encodeURIComponent(packId)}`,
        responseSchema: mutationSchema,
        retry: false,
      }) as Promise<PetPackMutationResult>
    },
  }
}

export function resolvePetPackJob(job: Job | null, expectedKind: PetPackJobKind): PetPackJobResolution {
  if (!job || job.status === 'queued' || job.status === 'running') return { kind: 'pending' }
  if (job.status === 'succeeded') {
    const parsed = expectedKind === 'import'
      ? mutationSchema.safeParse(job.result)
      : exportResultSchema.safeParse(job.result)
    return parsed.success
      ? { kind: 'succeeded', result: parsed.data as PetPackMutationResult | PetPackExportResult }
      : { kind: 'failed', message: `Pet pack ${expectedKind} returned an invalid result.` }
  }
  if (job.status === 'failed') return { kind: 'failed', message: job.error?.message || `Pet pack ${expectedKind} failed.` }
  if (job.status === 'canceled') return { kind: 'failed', message: `Pet pack ${expectedKind} was canceled.` }
  return { kind: 'failed', message: job.error?.message || `Pet pack ${expectedKind} was interrupted.` }
}

const httpApi = createPetPackHttpApi()
const useDemoApi = () => import.meta.env?.DEV === true && !Boolean((globalThis as { openpetBackend?: unknown }).openpetBackend)

export const petPackApi = {
  inspect: () => controlCenterAPI.inspectPetPackDirectory(),
  list: (): Promise<PetPacksViewState> => useDemoApi() ? controlCenterAPI.listPetPacks() : httpApi.list(),
  clearSelection: (selectionId: string) => useDemoApi()
    ? controlCenterAPI.clearPetPackSelection(selectionId)
    : httpApi.clearSelection(selectionId),
  import: async (selectionId: string): Promise<PetPackJobStart<PetPackMutationResult>> => useDemoApi()
    ? { result: await controlCenterAPI.importPetPack(selectionId) }
    : httpApi.import(selectionId),
  export: async (packId: string): Promise<PetPackJobStart<PetPackExportResult>> => useDemoApi()
    ? { result: await controlCenterAPI.exportPetPack(packId) }
    : httpApi.export(packId),
  activate: (packId: string): Promise<PetPackMutationResult> => useDemoApi()
    ? controlCenterAPI.setActivePetPack(packId)
    : httpApi.activate(packId),
  remove: (packId: string): Promise<PetPackMutationResult> => useDemoApi()
    ? controlCenterAPI.removePetPack(packId)
    : httpApi.remove(packId),
}
