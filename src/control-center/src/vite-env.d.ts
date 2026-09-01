/// <reference types="vite/client" />

interface OpenPetBackendInfo {
  baseUrl: string
  sessionToken: string
}

interface Window {
  openpetBackend?: {
    getBackend: () => OpenPetBackendInfo | null
    onChanged: (listener: (backend: OpenPetBackendInfo | null) => void) => () => void
  }
}
