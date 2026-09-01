import { useEffect, useState } from 'react'
import { queryClient } from '../app/queryClient.ts'
import {
  EVENT_TOPIC,
  EVENT_NAMES,
  SSE_RECONNECT_AFTER_SILENCE_MS,
  SSE_RECONNECT_BACKOFF_MS,
  SSE_TOPICS,
  type EventName,
  type SseTopic,
} from '@openpet/contracts'

export type SseState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'unavailable'
export type SseEvent = { id: string | null; event: string; topic: SseTopic; data: unknown }
export type BackendInfo = { baseUrl: string; sessionToken: string }
export type SseRuntime = {
  getBackend: () => BackendInfo | null
  fetchImpl?: typeof fetch
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

type BackendBridge = {
  getBackend: () => BackendInfo | null
  onChanged?: (listener: (backend: BackendInfo | null) => void) => () => void
}

function backendBridge(): BackendBridge | null {
  return (globalThis as { openpetBackend?: BackendBridge }).openpetBackend || null
}

const defaultRuntime: SseRuntime = {
  getBackend: () => {
    const backend = backendBridge()?.getBackend?.() || null
    return backend?.baseUrl && backend.sessionToken ? backend : null
  },
}

function uniqueTopics(topics: string[]): SseTopic[] {
  const allowed = new Set<string>(SSE_TOPICS)
  return Array.from(new Set([...topics, 'system'])).filter((topic): topic is SseTopic => allowed.has(topic))
}

function parseData(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return raw }
}

function parseFrame(lines: string[]): SseEvent | null {
  let id: string | null = null
  let event = 'message'
  const data: string[] = []
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'id') id = value
    if (field === 'event') event = value
    if (field === 'data') data.push(value)
  }
  if (data.length === 0 || event === 'message') return null
  const known = (EVENT_NAMES as readonly string[]).includes(event)
  const topic = known ? EVENT_TOPIC[event as EventName] : (parseData(data.join('\n')) as { topic?: SseTopic })?.topic
  if (!(SSE_TOPICS as readonly string[]).includes(topic as string)) return null
  return { id, event, topic: topic as SseTopic, data: parseData(data.join('\n')) }
}

class SseManager {
  private runtime: SseRuntime = defaultRuntime
  private listeners = new Map<number, { topics: SseTopic[]; onEvent: (event: SseEvent) => void; onState: (state: SseState) => void }>()
  private nextListener = 1
  private state: SseState = 'idle'
  private lastEventId: string | null = null
  private running = false
  private controller: AbortController | null = null
  private retryIndex = 0

  constructor() {
    backendBridge()?.onChanged?.(() => {
      this.controller?.abort()
      if (this.listeners.size > 0 && !this.running) void this.run()
    })
  }

  configure(runtime: Partial<SseRuntime>) { this.runtime = { ...this.runtime, ...runtime } }
  snapshot() { return { state: this.state, lastEventId: this.lastEventId } }

  subscribe(topics: string[], onEvent: (event: SseEvent) => void, onState: (state: SseState) => void) {
    const id = this.nextListener++
    this.listeners.set(id, { topics: uniqueTopics(topics), onEvent, onState })
    onState(this.state)
    if (!this.running) void this.run()
    return () => {
      this.listeners.delete(id)
      if (this.listeners.size === 0) this.stop()
    }
  }

  private notifyState(state: SseState) {
    this.state = state
    for (const listener of this.listeners.values()) listener.onState(state)
  }

  private requestedTopics() {
    return uniqueTopics(Array.from(this.listeners.values()).flatMap((listener) => listener.topics))
  }

  private async delay(ms: number) {
    await new Promise<void>((resolve) => (this.runtime.setTimeout ?? setTimeout)(resolve, ms))
  }

  private async run() {
    if (this.running) return
    this.running = true
    try {
      while (this.listeners.size > 0) {
        const backend = this.runtime.getBackend()
        if (!backend) {
          this.notifyState('unavailable')
          await this.delay(SSE_RECONNECT_BACKOFF_MS[Math.min(this.retryIndex, SSE_RECONNECT_BACKOFF_MS.length - 1)] ?? 10_000)
          this.retryIndex = Math.min(this.retryIndex + 1, SSE_RECONNECT_BACKOFF_MS.length - 1)
          continue
        }
        this.notifyState(this.retryIndex ? 'reconnecting' : 'connecting')
        this.controller = new AbortController()
        const fetcher = this.runtime.fetchImpl ?? globalThis.fetch
        const topics = this.requestedTopics().join(',')
        const url = `${backend.baseUrl.replace(/\/$/, '')}/events?topics=${encodeURIComponent(topics)}`
        const headers = new Headers({ authorization: `Bearer ${backend.sessionToken}`, accept: 'text/event-stream' })
        if (this.lastEventId) headers.set('last-event-id', this.lastEventId)
        let silenceTimer: ReturnType<typeof setTimeout> | null = null
        const armSilence = () => {
          if (silenceTimer) (this.runtime.clearTimeout ?? clearTimeout)(silenceTimer)
          silenceTimer = (this.runtime.setTimeout ?? setTimeout)(() => this.controller?.abort(), SSE_RECONNECT_AFTER_SILENCE_MS)
        }
        try {
          const response = await fetcher(url, { headers, signal: this.controller.signal })
          if (!response.ok || !response.body) throw new Error(`SSE HTTP ${response.status}`)
          this.retryIndex = 0
          this.notifyState('open')
          armSilence()
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (this.listeners.size > 0) {
            const { done, value } = await reader.read()
            if (done) break
            armSilence()
            buffer += decoder.decode(value, { stream: true })
            const frames = buffer.split(/\r?\n\r?\n/)
            buffer = frames.pop() ?? ''
            for (const frame of frames) {
              const parsed = parseFrame(frame.split(/\r?\n/))
              if (parsed) this.dispatch(parsed)
            }
          }
        } catch {
          if (this.listeners.size > 0) {
            const delayMs = SSE_RECONNECT_BACKOFF_MS[Math.min(this.retryIndex, SSE_RECONNECT_BACKOFF_MS.length - 1)] ?? 10_000
            this.retryIndex = Math.min(this.retryIndex + 1, SSE_RECONNECT_BACKOFF_MS.length - 1)
            this.notifyState('reconnecting')
            await this.delay(delayMs)
          }
        } finally {
          if (silenceTimer) (this.runtime.clearTimeout ?? clearTimeout)(silenceTimer)
          this.controller = null
        }
      }
    } finally {
      this.running = false
      this.notifyState('idle')
    }
  }

  private dispatch(event: SseEvent) {
    if (event.id) this.lastEventId = event.id
    if (event.event === 'system.events-dropped') void queryClient.invalidateQueries()
    else void queryClient.invalidateQueries({ queryKey: [event.topic] })
    for (const listener of this.listeners.values()) {
      if (event.topic === 'system' || listener.topics.includes(event.topic)) listener.onEvent(event)
    }
  }

  async request(path: string, init: RequestInit = {}) {
    const backend = this.runtime.getBackend()
    if (!backend) throw Object.assign(new Error('BACKEND_UNAVAILABLE'), { code: 'BACKEND_UNAVAILABLE' })
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${backend.sessionToken}`)
    const response = await (this.runtime.fetchImpl ?? globalThis.fetch)(`${backend.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, { ...init, headers })
    if (!response.ok) {
      let payload: unknown = null
      try { payload = await response.json() } catch { /* preserve status when body is not JSON */ }
      const errorPayload = payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error?: { code?: string; message?: string } }).error
        : undefined
      const code = errorPayload?.code
      const message = errorPayload?.message || `Backend request failed: ${response.status}`
      const error = Object.assign(new Error(message), { code, status: response.status })
      throw error
    }
    return response.json()
  }

  stop() { this.controller?.abort(); this.running = false; this.notifyState('idle') }
}

export const sseManager = new SseManager()
export const configureSse = (runtime: Partial<SseRuntime>) => sseManager.configure(runtime)
export const requestBackend = (path: string, init?: RequestInit) => sseManager.request(path, init)

export function useSse(topics: string[]): { state: SseState; lastEventId: string | null } {
  const [snapshot, setSnapshot] = useState(sseManager.snapshot())
  useEffect(() => sseManager.subscribe(topics, (event) => setSnapshot((current) => ({ ...current, lastEventId: event.id ?? current.lastEventId })), (state) => setSnapshot((current) => ({ ...current, state }))), [topics.join(',')])
  return snapshot
}
