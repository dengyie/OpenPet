// spike/01-fork-sidecar/shell.js
// 运行:npx electron spike/01-fork-sidecar/shell.js
const path = require("node:path")
const { fork } = require("node:child_process")
const { app, safeStorage } = require("electron")

app.whenReady().then(() => {
  // 顺带把第 4 条的 Shell 侧结论一起取到
  console.log("[shell] isEncryptionAvailable =", safeStorage.isEncryptionAvailable())

  const t0 = Date.now()
  const child = fork(path.join(__dirname, "sidecar.js"), [], {
    // 关键 1:让 Electron 二进制以纯 Node 模式运行
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    // 关键 2:stdio 第四位必须是 "ipc",否则 child.send 不存在
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    // 关键 3:后续要传 Buffer/Date,需要结构化克隆
    serialization: "advanced",
  })

  child.stdout.on("data", (b) => console.log("[sidecar]", String(b).trim()))
  child.stderr.on("data", (b) => console.error("[sidecar:err]", String(b).trim()))

  child.on("message", (msg) => {
    console.log(`[shell] recv +${Date.now() - t0}ms`, msg)
    if (msg?.body?.type === "ready") {
      // 验 ADR-011 的 v:1 信封能双向走通
      child.send({ v: 1, id: "1", at: Date.now(), body: { type: "init" } })
    }
  })

  child.on("exit", (code, signal) => {
    console.log("[shell] exit", { code, signal })
    app.quit()
  })

  setTimeout(() => {
    console.error("FAIL: 10 秒内没收到 ready")
    process.exit(1)
  }, 10_000)
})
