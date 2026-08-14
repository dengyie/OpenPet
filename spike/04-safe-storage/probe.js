// spike/04-safe-storage/probe.js —— 在 sidecar 环境里跑
let result
try {
  const electron = require("electron")
  result = {
    requireOk: true,
    typeofExport: typeof electron,
    hasSafeStorage: Boolean(electron?.safeStorage),
    isEncryptionAvailable: electron?.safeStorage?.isEncryptionAvailable?.() ?? null,
  }
} catch (err) {
  result = { requireOk: false, error: String(err?.message || err) }
}
console.log("SAFE_STORAGE_PROBE", JSON.stringify(result, null, 2))
