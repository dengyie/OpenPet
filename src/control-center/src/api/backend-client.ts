import { createApiClient } from './client.ts'
import { createHttpTransport } from './transport.ts'

type BackendBridge = {
  getBackend: () => { baseUrl: string; sessionToken: string } | null
  onChanged?: (listener: (backend: { baseUrl: string; sessionToken: string } | null) => void) => () => void
}

function getBridge(): BackendBridge | null {
  return (globalThis as { openpetBackend?: BackendBridge }).openpetBackend || null
}

let fetchImpl: typeof fetch | undefined
let backendOverride: (() => { baseUrl: string; sessionToken: string } | null) | undefined
const backendListeners = new Set<(backend: { baseUrl: string; sessionToken: string } | null) => void>()
const fetcher: typeof fetch = (...args) => (fetchImpl || globalThis.fetch)(...args)
const currentBackend = () => backendOverride ? backendOverride() : (getBridge()?.getBackend?.() || null)

export const backendTransport = createHttpTransport({
  getBackend: currentBackend,
  onBackendChanged: (listener) => {
    backendListeners.add(listener)
    const unsubscribe = getBridge()?.onChanged?.(listener)
    return () => {
      backendListeners.delete(listener)
      unsubscribe?.()
    }
  },
  fetchImpl: fetcher,
})

export const backendClient = createApiClient(backendTransport)

export function configureBackendClient(options: { fetchImpl?: typeof fetch; getBackend?: () => { baseUrl: string; sessionToken: string } | null } = {}) {
  fetchImpl = options.fetchImpl
  backendOverride = options.getBackend
  const backend = currentBackend()
  for (const listener of backendListeners) listener(backend)
}
