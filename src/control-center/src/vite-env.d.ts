/// <reference types="vite/client" />

interface OpenPetBackendInfo {
  baseUrl: string
  sessionToken: string
}

interface Window {
  openpetBackend?: {
    getBackend: () => OpenPetBackendInfo | null
    onChanged: (listener: (backend: OpenPetBackendInfo | null) => void) => () => void
    getRuntimeStatus?: () => { supported: boolean; platform: string; active: boolean; helperPid: number }
    onRuntimeStatusChanged?: (listener: (status: { supported: boolean; platform: string; active: boolean; helperPid: number }) => void) => () => void
  }
}
