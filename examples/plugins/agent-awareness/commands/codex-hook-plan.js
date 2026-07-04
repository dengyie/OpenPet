const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { runJsonCommand } = require('./command-io')

const DEFAULT_PORT = 8795
const TOKEN_FILE = 'agent-awareness-token.txt'
const PLAN_FILE = 'codex-hook-plan.md'

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const getDataDir = (input = {}) => {
  const explicit = input?.paths?.dataDir || process.env.OPENPET_DATA_DIR
  return path.resolve(explicit || path.join(process.cwd(), '.agent-awareness-data'))
}

const toCommandOutput = (result = {}) => ({
  ok: result.ok === true,
  serviceUrl: String(result.serviceUrl || ''),
  authFile: 'plugin-auth-file',
  instructionsFile: PLAN_FILE,
  externalWrites: result.externalWrites === true,
  dataDirConfigured: true
})

const ensureToken = ({ dataDir }) => {
  const tokenPath = path.join(dataDir, TOKEN_FILE)
  if (fs.existsSync(tokenPath)) {
    return {
      tokenPath,
      token: fs.readFileSync(tokenPath, 'utf-8').trim()
    }
  }
  const token = crypto.randomBytes(24).toString('base64url')
  fs.writeFileSync(tokenPath, `${token}\n`)
  return { tokenPath, token }
}

const writeCodexHookPlan = ({ dataDir, port = DEFAULT_PORT } = {}) => {
  ensureDirectory(dataDir)
  const { tokenPath } = ensureToken({ dataDir })
  const instructionsPath = path.join(dataDir, PLAN_FILE)
  const serviceUrl = `http://127.0.0.1:${Number(port) || DEFAULT_PORT}/api/events`
  const content = [
    '# Codex Hook Plan',
    '',
    'This file is a review-only plan. The Agent Awareness MVP does not modify `~/.codex` automatically.',
    '',
    'Future hook-enhanced mode would send bounded JSON events to:',
    '',
    `- ${serviceUrl}`,
    `- Authorization: Bearer <contents of ${TOKEN_FILE} in the plugin data dir>`,
    '',
    'The bundled MVP plugin currently prefers zero-config polling and keeps hook installation as a follow-up milestone.'
  ].join('\n')
  fs.writeFileSync(instructionsPath, `${content}\n`)
  return {
    ok: true,
    serviceUrl,
    tokenPath,
    instructionsPath,
    externalWrites: false
  }
}

if (require.main === module) {
  runJsonCommand(async (input) => {
    const dataDir = getDataDir(input)
    return toCommandOutput(writeCodexHookPlan({
      dataDir,
      port: input?.port
    }))
  })
}

module.exports = {
  DEFAULT_PORT,
  PLAN_FILE,
  TOKEN_FILE,
  getDataDir,
  toCommandOutput,
  writeCodexHookPlan
}
