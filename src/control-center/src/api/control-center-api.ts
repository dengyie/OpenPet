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

// Demo backend gate: the demo API is a full in-memory fake of every Control
// Center IPC call. It exists so `npm run dev:control-center` can render panes in
// a plain browser. In a packaged app the preload bridge is always injected, so
// reaching the fallback means the bridge failed to load — and silently serving
// fabricated settings, pet packs and provider health there is worse than failing:
// the user would be editing state that never reaches the main process. Gate it
// on import.meta.env.DEV. The check is written inline (not behind a helper) so
// Vite's constant folding can prove the branch dead in a production build and
// tree-shake the ~4.8k-line demo module out of the bundle entirely.
// The `?.` matters outside Vite: under plain `node --test` there is no bundler to
// define import.meta.env, so a bare `.DEV` read throws TypeError instead of the
// bridge error the callers expect. Vite still folds the optional form (verified:
// the demo chunk stays out of the production bundle).
const createBridgeUnavailableError = () => new Error(
  'Control Center bridge is unavailable: the preload API was not injected'
)

const getDemoApi = async (): Promise<ControlCenterApi> => {
  if (!import.meta.env?.DEV) throw createBridgeUnavailableError()
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
        // Subscribing has no caller to reject to, so a gated fallback simply
        // never delivers events rather than throwing into an unhandled rejection.
        void getDemoApi().then((api) => {
          if (!active) return
          unsubscribe = api.onSettingsChanged(listener)
        }).catch(() => {})
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
