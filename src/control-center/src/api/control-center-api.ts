import type { ControlCenterApi, ControlCenterSettings } from '../../../shared/openpet-contracts.ts'

declare global {
  interface Window {
    controlCenterAPI?: ControlCenterApi
  }
}

const demoActivePetPackChangedEvent = 'openpet:active-pet-pack-changed'

let demoApiPromise: Promise<ControlCenterApi> | null = null

const getInjectedApi = () => (
  typeof window !== 'undefined' ? window.controlCenterAPI : undefined
)

const getDemoApi = async () => {
  if (!demoApiPromise) {
    demoApiPromise = import('./demo-control-center-api.ts')
      .then((module) => module.demoControlCenterAPI)
  }
  return demoApiPromise
}

const callAsyncFallback = async (methodName: keyof ControlCenterApi, args: unknown[]) => {
  const api = getInjectedApi() || await getDemoApi()
  const method = api[methodName]
  if (typeof method !== 'function') {
    throw new Error(`Control Center API method is unavailable: ${String(methodName)}`)
  }
  return (method as (...methodArgs: unknown[]) => unknown).apply(api, args)
}

const createLazyControlCenterApi = (): ControlCenterApi => new Proxy({}, {
  get(_target, property) {
    if (property === 'then') return undefined
    if (property === 'toJSON') return undefined
    if (typeof property !== 'string') return undefined

    const injectedApi = getInjectedApi()
    if (injectedApi) return injectedApi[property as keyof ControlCenterApi]

    if (property === 'previewScale' || property === 'close') {
      return (...args: unknown[]) => {
        void callAsyncFallback(property as keyof ControlCenterApi, args)
      }
    }

    if (property === 'onActivePetPackChanged') {
      return (listener: (event: unknown) => void) => {
        if (typeof window === 'undefined') return () => {}
        const handleActivePetPackChanged = (event: Event) => {
          listener((event as CustomEvent).detail)
        }
        window.addEventListener(demoActivePetPackChangedEvent, handleActivePetPackChanged)
        return () => window.removeEventListener(demoActivePetPackChangedEvent, handleActivePetPackChanged)
      }
    }

    if (property === 'onSettingsChanged') {
      return (listener: (settings: ControlCenterSettings) => void) => {
        let active = true
        let unsubscribe = () => {}
        void getDemoApi().then((api) => {
          if (!active) return
          unsubscribe = api.onSettingsChanged(listener)
        })
        return () => {
          active = false
          unsubscribe()
        }
      }
    }

    return (...args: unknown[]) => callAsyncFallback(property as keyof ControlCenterApi, args)
  }
}) as ControlCenterApi

export const controlCenterAPI: ControlCenterApi = createLazyControlCenterApi()
