// spike/02-port-ready/sidecar-http.js
const http = require("node:http")
const crypto = require("node:crypto")

const t0 = Number(process.env.OPENPET_T0 || Date.now())
const token = crypto.randomBytes(32).toString("hex")
console.log(`[sidecar] 首行执行 +${Date.now() - t0}ms`)

const server = http.createServer((req, res) => {
  const expected = `Bearer ${token}`
  const got = req.headers.authorization || ""
  // 与 local-http-service.js 一致:常量时间比较
  const ok =
    got.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  res.writeHead(ok ? 200 : 401, { "content-type": "application/json" })
  res.end(JSON.stringify({ ok, meta: { elapsedMs: Date.now() - t0 } }))
})

// 0 = 内核分配空闲端口;只绑回环
server.listen(0, "127.0.0.1", () => {
  const { port } = server.address()
  console.log(`[sidecar] listen ok +${Date.now() - t0}ms port=${port}`)
  process.send?.({
    v: 1,
    id: "r1",
    at: Date.now(),
    body: { type: "ready", port, apiVersion: 1, pid: process.pid, sessionToken: token },
  })
})
