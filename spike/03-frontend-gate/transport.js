// spike/03-frontend-gate/transport.js
const MAX_QUEUE = 50
const MAX_WAIT_MS = 10_000

export function createTransport(shell) {
  let backend = shell.getBackend() // 可能为 null
  let queue = []
  let firstQueuedAt = 0

  shell.onBackendChanged((next) => {
    backend = next
    const pending = queue
    queue = []
    for (const item of pending) item.run(backend).then(item.resolve, item.reject)
  })

  return function request(pathname, init) {
    if (backend) return send(backend, pathname, init)
    if (queue.length === 0) firstQueuedAt = Date.now()
    if (queue.length >= MAX_QUEUE || Date.now() - firstQueuedAt > MAX_WAIT_MS) {
      return Promise.reject(new Error("BACKEND_UNAVAILABLE"))
    }
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject, run: (b) => send(b, pathname, init) })
    })
  }
}

function send(backend, pathname, init = {}) {
  return fetch(`${backend.baseUrl}${pathname}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${backend.sessionToken}` },
  })
}
