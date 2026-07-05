const os = require('os')
const path = require('path')
const { runJsonCommand } = require('./command-io')
const {
  DEFAULT_PORT,
  installCodexHooks,
  toInstallCommandOutput
} = require('./codex-hook-config')

const resolveCodexHome = (input = {}) => (
  path.resolve(
    input?.paths?.codexHome ||
    input?.codexHome ||
    process.env.OPENPET_CODEX_HOME ||
    path.join(os.homedir(), '.codex')
  )
)

const resolveDataDir = (input = {}) => (
  path.resolve(
    input?.paths?.dataDir ||
    input?.dataDir ||
    process.env.OPENPET_DATA_DIR ||
    path.join(process.cwd(), '.agent-awareness-data')
  )
)

runJsonCommand(async (input) => {
  const result = installCodexHooks({
    codexHome: resolveCodexHome(input),
    dataDir: resolveDataDir(input),
    port: input?.port || DEFAULT_PORT,
    dryRun: input?.dryRun === true
  })
  return toInstallCommandOutput(result)
})
