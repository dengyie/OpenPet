// spike/03-frontend-gate/run.js
// 运行:ELECTRON_RUN_AS_NODE=1 npx electron spike/03-frontend-gate/run.js
//
// 验 F11:后端未就绪时,前端并发发出的请求必须排队后冲刷,而不是报错。
// 这是每次冷启动都必经的路径,不是边缘情况。
import http from "node:http"
import assert from "node:assert/strict"
import { createTransport } from "./transport.js"

// 与 transport.js 保持一致
const MAX_QUEUE = 50
const MAX_WAIT_MS = 10_000
const BOOT_DELAY_MS = 3_000

function createFakeShell() {
  let backend = null
  const listeners = []
  return {
    getBackend: () => backend,
    onBackendChanged: (fn) => listeners.push(fn),
    setBackend: (next) => {
      backend = next
      for (const fn of listeners) fn(next)
    },
  }
}

async function startBackend(label) {
  const hits = []
  const server = http.createServer((req, res) => {
    hits.push(req.url)
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ ok: true, from: label }))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  return {
    hits,
    close: () => new Promise((resolve) => server.close(resolve)),
    backend: {
      baseUrl: `http://127.0.0.1:${port}`,
      sessionToken: `spike-token-${label}`,
    },
  }
}

const results = []

async function run(name, fn) {
  const startedAt = Date.now()
  try {
    await fn()
    results.push({ ok: true, name, ms: Date.now() - startedAt, note: "" })
  } catch (err) {
    results.push({
      ok: false,
      name,
      ms: Date.now() - startedAt,
      note: String(err?.message || err),
    })
  }
}

// 1. 后端延迟 3 秒启动,期间并发 5 个 GET → 5 个全部 200,无一抛错
await run("延迟启动期间的并发请求全部成功", async () => {
  const shell = createFakeShell()
  const request = createTransport(shell)
  const inflight = [1, 2, 3, 4, 5].map((i) => request(`/api/v1/ping?i=${i}`))

  const server = await startBackend("first")
  setTimeout(() => shell.setBackend(server.backend), BOOT_DELAY_MS)

  const responses = await Promise.all(inflight)
  assert.equal(responses.length, 5)
  for (const res of responses) assert.equal(res.status, 200)
  assert.equal(server.hits.length, 5, "后端收到的请求数应为 5")
  await server.close()
})

// 2. 后端永不启动 → 10 秒后全部以 BACKEND_UNAVAILABLE 拒绝,且不泄漏未结算的 Promise
await run("后端永不启动时排队请求被清算", async () => {
  const shell = createFakeShell()
  const request = createTransport(shell)
  const inflight = [1, 2, 3].map((i) => request(`/api/v1/ping?i=${i}`))

  const outcome = await Promise.race([
    Promise.allSettled(inflight).then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("leaked"), MAX_WAIT_MS + 1_000)),
  ])
  assert.equal(outcome, "settled", `排队的 Promise 在 ${MAX_WAIT_MS} ms 后仍未结算(泄漏)`)

  for (const item of await Promise.allSettled(inflight)) {
    assert.equal(item.status, "rejected")
    assert.match(String(item.reason?.message), /BACKEND_UNAVAILABLE/)
  }
})

// 3. 排队期间发出 60 个请求 → 前 50 入队,后 10 立即拒绝
await run("排队上限 50 生效", async () => {
  const shell = createFakeShell()
  const request = createTransport(shell)
  const inflight = Array.from({ length: 60 }, (_, i) => request(`/api/v1/ping?i=${i}`))

  // 立即拒绝的那 10 个,此刻应该已经结算
  for (const item of await Promise.allSettled(inflight.slice(MAX_QUEUE))) {
    assert.equal(item.status, "rejected")
    assert.match(String(item.reason?.message), /BACKEND_UNAVAILABLE/)
  }

  const server = await startBackend("cap")
  shell.setBackend(server.backend)
  const queued = await Promise.all(inflight.slice(0, MAX_QUEUE))
  assert.equal(queued.length, MAX_QUEUE)
  assert.equal(server.hits.length, MAX_QUEUE, `后端应收到 ${MAX_QUEUE} 个请求`)
  await server.close()
})

// 4. 后端换端口 → 新请求打到新 baseUrl,旧 baseUrl 零请求
await run("换端口后旧 baseUrl 零请求", async () => {
  const shell = createFakeShell()
  const request = createTransport(shell)

  const first = await startBackend("first")
  shell.setBackend(first.backend)
  const before = await request("/api/v1/ping?phase=before")
  assert.equal(before.status, 200)
  assert.equal(first.hits.length, 1)

  const second = await startBackend("second")
  shell.setBackend(second.backend)
  const hitsBefore = first.hits.length

  await Promise.all([
    request("/api/v1/ping?phase=after-1"),
    request("/api/v1/ping?phase=after-2"),
  ])
  assert.equal(second.hits.length, 2, "新后端应收到 2 个请求")
  assert.equal(first.hits.length, hitsBefore, "旧后端在换端口后应零请求")

  await first.close()
  await second.close()
})

console.log("\n=== spike 03 结果 ===")
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name} (${r.ms}ms)${r.note ? " — " + r.note : ""}`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)

if (failed.length > 0) {
  console.log(
    "提示:第 2 条预期会红 —— transport.js 只在新请求进来时判超时,已入队的 Promise 不会被清算。修复归属 05 篇 §2.2。",
  )
  process.exit(1)
}
