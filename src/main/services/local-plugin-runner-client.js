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
  let stdout = ''

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

  // silent: true 会把 stdout/stderr 都接成管道。stderr 有消费者，stdout 没有——
  // 插件只要往 stdout 写满管道缓冲区就会永久阻塞在 write 上，命令只能等超时。
  // 这里把 stdout 也读掉（只保留末尾用于诊断），保证子进程永远不会被背压卡死。
  child.stdout?.on('data', (chunk) => {
    stdout = `${stdout}${chunk.toString('utf-8')}`.slice(-4096)
  })

  child.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString('utf-8')}`.slice(-4096)
  })

  const sendSdkFailure = (id, error) => {
    if (!child.connected) return
    child.send({
      type: 'sdk-result',
      id,
      ok: false,
      error: error?.message || 'Plugin SDK call failed'
    })
  }

  child.on('message', (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'ready') {
      // payload/config 必须在进沙箱前过 cloneJsonValue。序列化失败属于调用方错误，
      // 要走 finish 拒绝，而不是让未捕获异常把主进程消息循环打穿。
      let safePayload
      let safeConfig
      try {
        safePayload = cloneJsonValue(payload, 'payload', { allowUndefined: true })
        safeConfig = cloneJsonValue(config, 'config')
      } catch (error) {
        finish(error)
        return
      }
      if (!child.connected) return
      child.send({
        type: 'run',
        mainPath,
        commandId,
        payload: safePayload,
        config: safeConfig
      })
      return
    }
    if (message.type === 'sdk-call') {
      // SDK 返回值同样必须 JSON 化：host 对象一旦经 IPC 进沙箱，插件就能
      // 通过 .constructor.constructor 逃逸。clone 失败时回 ok:false，让
      // 沙箱侧 Promise reject，而不是在 then 回调里裸抛。
      handleLocalPluginSdkCall(sdk, message.operation, message.payload)
        .then((result) => {
          if (!child.connected) return
          try {
            child.send({
              type: 'sdk-result',
              id: message.id,
              ok: true,
              result: cloneJsonValue(result, 'result', { allowUndefined: true })
            })
          } catch (error) {
            sendSdkFailure(message.id, error)
          }
        })
        .catch((error) => sendSdkFailure(message.id, error))
      return
    }
    if (message.type === 'result') {
      if (!message.ok) {
        finish(new Error(message.error || 'Plugin command failed'))
        return
      }
      try {
        finish(null, cloneJsonValue(message.result, 'result', { allowUndefined: true }))
      } catch (error) {
        finish(error)
      }
    }
  })

  child.on('error', (error) => finish(error))
  child.on('exit', (code, signal) => {
    if (settled) return
    const detail = stderr.trim() || stdout.trim() || (signal ? `signal ${signal}` : `exit code ${code}`)
    finish(new Error(`Plugin runner exited before completing command: ${detail}`))
  })
})

module.exports = {
  LOCAL_PLUGIN_COMMAND_TIMEOUT_MS,
  LOCAL_PLUGIN_RUNNER_PATH,
  runLocalPluginCommand
}
