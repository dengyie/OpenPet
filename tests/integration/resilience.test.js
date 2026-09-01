"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { fork, spawn } = require("node:child_process")
const { once } = require("node:events")
const { test } = require("node:test")
const { inspectProcessIdentity, createDefaultSidecarPidLedger } = require("../../apps/desktop/src/sidecar/orphan-cleanup.js")

const ROOT = path.resolve(__dirname, "../..")
const BACKEND = path.join(ROOT, "services/backend/index.js")

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t33-")) }
function approvePlugin(dir) {
  fs.mkdirSync(path.join(dir, "backend"), { recursive: true })
  fs.writeFileSync(path.join(dir, "backend/settings.json"), JSON.stringify({
    version: 1, values: { plugins: { enabled: { "resilience-test": true }, nativeExecutionApproved: { "resilience-test": true } } },
  }))
}
function writePlugin(dir, timeoutMs) {
  const pluginDir = path.join(dir, "plugins/resilience-test")
  fs.mkdirSync(pluginDir, { recursive: true })
  fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify({
    id: "resilience-test", name: "Resilience Test", version: "1.0.0", permissions: [],
    entries: { commands: [{ id: "hang", title: "Hang", command: "node ./hang.js", cwd: ".", timeoutMs }] },
  }))
  fs.writeFileSync(path.join(pluginDir, "hang.js"), "setInterval(() => {}, 1000)\n")
  approvePlugin(dir)
}

async function startBackend(userDataDir) {
  const child = fork(BACKEND, [], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe", "ipc"] })
  let stderr = ""
  child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("backend ready timeout")), 15000)
    child.on("message", (message) => {
      if (message?.body?.type === "ready") { clearTimeout(timer); resolve(message.body) }
      if (message?.body?.type === "degraded") reject(new Error(JSON.stringify(message.body)))
    })
    child.once("error", reject)
    child.once("exit", (code, signal) => reject(new Error(`backend exited ${code}/${signal}: ${stderr}`)))
  })
  child.send({ v: 1, id: `init-${process.pid}-${Date.now()}`, at: Date.now(), body: { type: "init", userDataDir, secrets: {}, legacyToken: null } })
  const info = await ready
  return { child, info, baseUrl: `http://127.0.0.1:${info.port}/api/v1`, token: info.sessionToken }
}

async function api(backend, route, init = {}) {
  const response = await fetch(`${backend.baseUrl}${route}`, { ...init, headers: { authorization: `Bearer ${backend.token}`, ...(init.headers || {}) } })
  const body = await response.json()
  return { response, body }
}
async function waitForJob(backend, jobId, predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    const { body } = await api(backend, `/jobs/${encodeURIComponent(jobId)}`)
    last = body.data
    if (predicate(last)) return last
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`job ${jobId} did not reach expected state: ${JSON.stringify(last)}`)
}
async function stop(child, signal = "SIGTERM") {
  if (child.exitCode !== null) return
  child.kill(signal)
  await once(child, "exit")
}

test("real backend restart interrupts a running job and exposes retryability", async () => {
  const dir = tempDir(); writePlugin(dir, 0)
  let first, second
  try {
    first = await startBackend(dir)
    assert.equal((await api(first, "/plugins/resilience-test/start", { method: "POST" })).response.status, 200)
    const submitted = await api(first, "/plugins/resilience-test/commands/hang", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })
    assert.equal(submitted.response.status, 202)
    const jobId = submitted.body.data.jobId
    await waitForJob(first, jobId, (job) => job.status === "running")
    await stop(first, "SIGKILL")
    second = await startBackend(dir)
    const job = await waitForJob(second, jobId, (value) => value.status === "interrupted")
    assert.equal(job.error.code, "BACKEND_RESTARTED")
    assert.equal(job.canRetry, true)
    assert.equal(job.attempt, 1)
  } finally {
    if (first) await stop(first).catch(() => {})
    if (second) await stop(second).catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("real plugin command timeout fails the job with provider timeout", async () => {
  const dir = tempDir(); writePlugin(dir, 100)
  let backend
  try {
    backend = await startBackend(dir)
    assert.equal((await api(backend, "/plugins/resilience-test/start", { method: "POST" })).response.status, 200)
    const submitted = await api(backend, "/plugins/resilience-test/commands/hang", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })
    assert.equal(submitted.response.status, 202)
    const job = await waitForJob(backend, submitted.body.data.jobId, (value) => value.status === "failed")
    assert.equal(job.error.code, "PROVIDER_TIMEOUT")
    assert.equal(job.error.retryable, true)
  } finally {
    if (backend) await stop(backend).catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("real orphan process is killed and ledger is emptied on startup sweep", async () => {
  const dir = tempDir()
  const orphan = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  try {
    let identity = null
    for (let attempt = 0; attempt < 20 && !identity; attempt += 1) {
      identity = inspectProcessIdentity(orphan.pid)
      if (!identity) await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.ok(identity)
    const ledger = createDefaultSidecarPidLedger({ app: { getPath: () => dir } })
    ledger.register(orphan.pid, identity)
    const result = ledger.sweep()
    assert.equal(result.killed, 1)
    await once(orphan, "exit")
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "backend/pids.json"), "utf8")), { processes: [] })
  } finally {
    if (orphan.exitCode === null) orphan.kill("SIGKILL")
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
