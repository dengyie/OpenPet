import { z } from 'zod'
import type { Job } from '@openpet/contracts'

import { backendClient } from '../../api/backend-client.ts'
import type { ApiClient } from '../../api/client.ts'
import { cloneAboutInfo, cloneUpdateCheck, defaultAboutInfo, defaultUpdateCheck } from '../../lib/defaults.ts'
import type { AboutInfoViewState, UpdateCheckViewState } from '../../../../shared/openpet-contracts.ts'

const updateSourceSchema = z.object({
  configured: z.boolean(),
  provider: z.string(),
  owner: z.string().optional(),
  repo: z.string().optional(),
  channel: z.string(),
  url: z.string(),
})

const aboutInfoSchema = z.object({
  name: z.string(),
  productName: z.string(),
  version: z.string(),
  packaged: z.boolean(),
  platform: z.string(),
  arch: z.string(),
  update: updateSourceSchema,
})

const updateAssetSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.number().nonnegative(),
  contentType: z.string(),
})

const updateCheckSchema = z.object({
  status: z.string().min(1),
  configured: z.boolean(),
  currentVersion: z.string(),
  latestVersion: z.string(),
  updateAvailable: z.boolean(),
  prerelease: z.boolean(),
  releaseUrl: z.string(),
  assets: z.array(updateAssetSchema),
  checkedAt: z.string(),
  message: z.string(),
})

const emptyRequestSchema = z.object({}).strict()
const updateJobSchema = z.object({ jobId: z.string().min(1) })

export type AboutUpdateStart = { jobId: string } | { result: UpdateCheckViewState }
export type AboutUpdateJobResolution =
  | { kind: 'pending' }
  | { kind: 'succeeded'; result: UpdateCheckViewState }
  | { kind: 'failed'; message: string }

export function createAboutHttpApi(client: ApiClient = backendClient) {
  return {
    info(): Promise<AboutInfoViewState> {
      return client.request({
        method: 'GET',
        path: '/about',
        responseSchema: aboutInfoSchema,
      })
    },
    checkUpdates(): Promise<{ jobId: string }> {
      return client.request({
        method: 'POST',
        path: '/about/check-updates',
        requestSchema: emptyRequestSchema,
        body: {},
        responseSchema: updateJobSchema,
        job: true,
        retry: false,
      })
    },
  }
}

export function resolveAboutUpdateJob(job: Job | null): AboutUpdateJobResolution {
  if (!job || job.status === 'queued' || job.status === 'running') return { kind: 'pending' }
  if (job.status === 'succeeded') {
    const parsed = updateCheckSchema.safeParse(job.result)
    return parsed.success
      ? { kind: 'succeeded', result: parsed.data }
      : { kind: 'failed', message: 'Update check returned an invalid result.' }
  }
  if (job.status === 'failed') {
    return { kind: 'failed', message: job.error?.message || 'Update check failed.' }
  }
  if (job.status === 'canceled') {
    return { kind: 'failed', message: 'Update check was canceled.' }
  }
  return { kind: 'failed', message: job.error?.message || 'Update check was interrupted.' }
}

export function shouldUseAboutDemoApi(isDevelopment: boolean, hasBackendBridge: boolean): boolean {
  return isDevelopment && !hasBackendBridge
}

const httpApi = createAboutHttpApi()
const useDemoApi = () => shouldUseAboutDemoApi(
  import.meta.env?.DEV === true,
  Boolean((globalThis as { openpetBackend?: unknown }).openpetBackend),
)

export const aboutApi: {
  info: () => Promise<AboutInfoViewState>
  checkUpdates: () => Promise<AboutUpdateStart>
} = {
  info: async () => useDemoApi() ? cloneAboutInfo(defaultAboutInfo) : httpApi.info(),
  checkUpdates: async () => useDemoApi()
    ? {
        result: cloneUpdateCheck({
          ...defaultUpdateCheck,
          status: 'not-configured',
          message: 'Update feed is not configured.',
        }),
      }
    : httpApi.checkUpdates(),
}
