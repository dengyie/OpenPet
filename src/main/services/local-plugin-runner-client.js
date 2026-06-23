const fs = require('fs')
const path = require('path')
const { fork } = require('child_process')
const { cloneJsonValue } = require('./plugin-json-utils')

const LOCAL_PLUGIN_COMMAND_TIMEOUT_MS = 5000
const LOCAL_PLUGIN_RUNNER_PATH = path.join(__dirname, '../plugins/local-plugin-runner.js')

const getRealPath = (targetPath) => fs.realpathSync(targetPath)

const createLocalPluginRunnerEnv = () => {
  const env = {}
  if (process.env.PATH) env.PATH = process.env.PATH
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  if (process.env.WINDIR) env.WINDIR = process.env.WINDIR
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

const createLocalPluginRunnerOptions = (mainPath) => {
  const runnerPath = getRealPath(LOCAL_PLUGIN_RUNNER_PATH)
  const pluginMainPath = getRealPath(mainPath)
  return {
    execPath: process.execPath,
    execArgv: [
      '--permission',
      `--allow-fs-read=${runnerPath}`,
      `--allow-fs-read=${pluginMainPath}`
    ],
    env: createLocalPluginRunnerEnv(),
    serialization: 'json',
    silent: true
  }
}

const handleLocalPluginSdkCall = async (sdk, operation, payload = {}) => {
  if (operation === 'storage:get') return sdk.storage.get(payload.key, payload.fallbackValue)
  if (operation === 'storage:set') return sdk.storage.set(payload.key, payload.value)
  if (operation === 'storage:remove') return sdk.storage.remove(payload.key)
  if (operation === 'storage:clear') return sdk.storage.clear()
  if (operation === 'pet:say') return sdk.pet.say(payload.payload)
  if (operation === 'pet:playAction') return sdk.pet.playAction(payload.payload)
  if (operation === 'pet:setEvent') return sdk.pet.setEvent(payload.payload)
  if (operation === 'ai:chat') return sdk.ai.chat(payload.payload)
  if (operation === 'network:fetch') return sdk.network.fetch(payload.url, payload.options)
  throw new Error(`Unsupported plugin SDK operation: ${operation}`)
}

const runLocalPluginCommand = ({ plugin, sdk, commandId, payload, config, timeoutMs = LOCAL_PLUGIN_COMMAND_TIMEOUT_MS }) => new Promise((resolve, reject) => {
  const mainPath = getRealPath(plugin.mainPath)
  const runnerPath = getRealPath(LOCAL_PLUGIN_RUNNER_PATH)
  const child = fork(runnerPath, [], createLocalPluginRunnerOptions(mainPath))
  let settled = false
  let stderr = ''

  const finish = (error, result) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    child.removeAllListeners()
    if (!child.killed) child.kill()
    if (error) reject(error)
    else resolve(result)
  }

  const timer = setTimeout(() => {
    finish(new Error(`Plugin command timed out after ${timeoutMs}ms`))
  }, timeoutMs)

  child.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString('utf-8')}`.slice(-4096)
  })

  child.on('message', (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'ready') {
      child.send({
        type: 'run',
        mainPath,
        commandId,
        payload: cloneJsonValue(payload, 'payload', { allowUndefined: true }),
        config: cloneJsonValue(config, 'config')
      })
      return
    }
    if (message.type === 'sdk-call') {
      handleLocalPluginSdkCall(sdk, message.operation, message.payload)
        .then((result) => {
          if (child.connected) {
            child.send({ type: 'sdk-result', id: message.id, ok: true, result: cloneJsonValue(result, 'result', { allowUndefined: true }) })
          }
        })
        .catch((error) => {
          if (child.connected) child.send({ type: 'sdk-result', id: message.id, ok: false, error: error.message || 'Plugin SDK call failed' })
        })
      return
    }
    if (message.type === 'result') {
      if (message.ok) finish(null, cloneJsonValue(message.result, 'result', { allowUndefined: true }))
      else finish(new Error(message.error || 'Plugin command failed'))
    }
  })

  child.on('error', (error) => finish(error))
  child.on('exit', (code, signal) => {
    if (settled) return
    const detail = stderr.trim() || (signal ? `signal ${signal}` : `exit code ${code}`)
    finish(new Error(`Plugin runner exited before completing command: ${detail}`))
  })
})

module.exports = {
  LOCAL_PLUGIN_COMMAND_TIMEOUT_MS,
  LOCAL_PLUGIN_RUNNER_PATH,
  runLocalPluginCommand
}
