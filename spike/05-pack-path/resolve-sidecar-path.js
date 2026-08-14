// spike/05-pack-path/resolve-sidecar-path.js
const path = require("node:path")

function resolveSidecarEntry(app) {
  const rel = "services/backend/index.js"
  // 打包后 __dirname 位于 asar 内部,getAppPath() 指向 app.asar
  return path.join(app.getAppPath(), rel)
}

function dumpPaths(app) {
  console.log({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    dirname: __dirname,
    resolved: resolveSidecarEntry(app),
  })
}

module.exports = { resolveSidecarEntry, dumpPaths }
