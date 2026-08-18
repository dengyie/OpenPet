import {
  settingsEnvelopeSchema,
  settingsPatchRequestSchema,
} from '@openpet/contracts'
import type { z } from 'zod'

import type { ApiClient } from '../../api/client.ts'

export type SettingsSnapshot = z.infer<typeof settingsEnvelopeSchema>
export type SettingsPatch = z.infer<typeof settingsPatchRequestSchema>

export function createSettingsApi(client: ApiClient) {
  return {
    get(): Promise<SettingsSnapshot> {
      return client.request({
        method: 'GET',
        path: '/settings',
        responseSchema: settingsEnvelopeSchema,
      })
    },
    patch(body: SettingsPatch): Promise<SettingsSnapshot> {
      return client.request({
        method: 'PATCH',
        path: '/settings',
        requestSchema: settingsPatchRequestSchema,
        responseSchema: settingsEnvelopeSchema,
        body,
      })
    },
  }
}
