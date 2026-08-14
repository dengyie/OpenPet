// spike/01-fork-sidecar/sidecar.js
console.log("versions.node     =", process.versions.node)
console.log("versions.electron =", process.versions.electron)
console.log("execPath          =", process.execPath)
console.log("has process.send  =", typeof process.send === "function")

process.send?.({ v: 1, id: "s1", at: Date.now(), body: { type: "ready", pid: process.pid } })

process.on("message", (msg) => {
  console.log("[sidecar] recv", msg)
  if (msg?.v !== 1) process.exit(78) // 版本不兼容(ADR-011)
  process.exit(0)
})
