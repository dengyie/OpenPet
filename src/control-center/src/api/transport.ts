export const MAX_QUEUE = 50
export const MAX_WAIT_MS = 10_000

export type BackendInfo = {
  baseUrl: string
  sessionToken: string
}

export type RequestInput = string | ({
  path?: string
  pathname?: string
  url?: string
  init?: RequestInit
} & RequestInit)

export type SseEvent = {
  topic: string
  [key: string]: unknown
}

export type IpcInvoke = (input: RequestInput) => unknown | Promise<unknown>
export type Unsubscribe = () => void

export type Transport = {
  request<T>(input: RequestInput): Promise<T>
  stream(topic: string, onEvent: (event: SseEvent) => void): Unsubscribe
  readonly state: "pending" | "ready" | "unavailable"
}

export class TransportError extends Error {
  readonly code: string
  readonly dispatched: boolean

  constructor(error: unknown, dispatched: boolean) {
    super(error instanceof Error ? error.message : "BACKEND_UNAVAILABLE", { cause: error })
    this.name = "TransportError"
    this.code = typeof (error as { code?: unknown } | null)?.code === "string"
      ? (error as { code: string }).code
      : "BACKEND_UNAVAILABLE"
    this.dispatched = dispatched
  }
}

type TimerHandle = ReturnType<typeof setTimeout>
type BackendChanged = (listener: (backend: BackendInfo | null) => void) => Unsubscribe | void

type TransportOptions = {
  getBackend: () => BackendInfo | null
  onBackendChanged?: BackendChanged
  fetchImpl?: typeof fetch
  // These seams are only for deterministic tests; production uses the platform globals.
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

type QueuedRequest = {
  input: RequestInput
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

function unavailableError() {
  return new TransportError(new Error("BACKEND_UNAVAILABLE"), false)
}

function requestPath(input: RequestInput) {
  if (typeof input === "string") return input
  const path = input.path ?? input.pathname ?? input.url
  if (typeof path !== "string" || path.length === 0) {
    throw new TypeError("Transport request requires a path")
  }
  return path
}

function requestInit(input: RequestInput): RequestInit {
  if (typeof input === "string") return {}
  const { path: _path, pathname: _pathname, url: _url, init, ...rest } = input
  return { ...rest, ...(init ?? {}) }
}

function createQueueTransport(
  getBackend: () => BackendInfo | null,
  onBackendChanged: BackendChanged | undefined,
  options: Pick<TransportOptions, "setTimeout" | "clearTimeout">,
  send: (backend: BackendInfo, input: RequestInput) => Promise<unknown>,
): Transport {
  const schedule = options.setTimeout ?? setTimeout
  const cancel = options.clearTimeout ?? clearTimeout
  let backend = getBackend()
  let mode: Transport["state"] = backend ? "ready" : "pending"
  let queue: QueuedRequest[] = []
  let timeoutTimer: TimerHandle | null = null

  const clearQueueTimer = () => {
    if (timeoutTimer === null) return
    cancel(timeoutTimer)
    timeoutTimer = null
  }

  const rejectQueue = () => {
    clearQueueTimer()
    const pending = queue
    queue = []
    mode = "unavailable"
    const error = unavailableError()
    for (const item of pending) item.reject(error)
  }

  const startQueueTimer = () => {
    if (timeoutTimer !== null) return
    timeoutTimer = schedule(rejectQueue, MAX_WAIT_MS)
  }

  const flush = (next: BackendInfo) => {
    clearQueueTimer()
    const pending = queue
    queue = []
    mode = "ready"
    // The loop starts requests FIFO while allowing their responses to settle independently.
    for (const item of pending) {
      send(next, item.input).then(item.resolve, item.reject)
    }
  }

  const changed = (next: BackendInfo | null) => {
    backend = next
    if (next) {
      flush(next)
      return
    }
    if (mode !== "unavailable") mode = "pending"
  }

  onBackendChanged?.(changed)

  const request = <T>(input: RequestInput) => {
    const current = getBackend()
    if (current !== backend) changed(current)
    if (backend) return send(backend, input) as Promise<T>
    if (mode === "unavailable") return Promise.reject(unavailableError())
    if (queue.length >= MAX_QUEUE) queue.shift()?.reject(unavailableError())

    const promise = new Promise<T>((resolve, reject) => {
      queue.push({ input, resolve: resolve as (value: unknown) => void, reject })
    })
    startQueueTimer()
    return promise
  }

  const stream = (_topic: string, _onEvent: (event: SseEvent) => void) => {
    // SSE connection ownership belongs to T22; transport only preserves the common surface.
    return () => {}
  }

  return {
    request,
    stream,
    get state() {
      return mode
    },
  }
}

async function sendHttp(backend: BackendInfo, input: RequestInput, fetchImpl: typeof fetch = fetch) {
  const path = requestPath(input)
  const init = requestInit(input)
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${backend.sessionToken}`)
  try {
    return await fetchImpl(`${backend.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/g, "")}`, {
      ...init,
      headers,
    })
  } catch (error) {
    throw new TransportError(error, true)
  }
}

export function createHttpTransport(opts: TransportOptions): Transport {
  return createQueueTransport(
    opts.getBackend,
    opts.onBackendChanged,
    opts,
    (backend, input) => sendHttp(backend, input, opts.fetchImpl),
  )
}

export function createMockTransport(opts: { handlers?: unknown[] } = {}): Transport {
  const handlers = opts.handlers ?? []
  const send = async (_backend: BackendInfo, input: RequestInput) => {
    const handler = handlers.find((candidate) => typeof candidate === "function") as
      | ((request: RequestInput) => unknown)
      | undefined
    return handler ? handler(input) : input
  }
  return createQueueTransport(() => ({ baseUrl: "mock:", sessionToken: "" }), undefined, {}, send)
}

export function createIpcTransport(opts: { invoke: IpcInvoke }): Transport {
  const send = async (_backend: BackendInfo, input: RequestInput) => opts.invoke(input)
  return createQueueTransport(() => ({ baseUrl: "ipc:", sessionToken: "" }), undefined, {}, send)
}
