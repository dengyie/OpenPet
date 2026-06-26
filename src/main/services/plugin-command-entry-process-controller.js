const { LOCAL_PLUGIN_COMMAND_TIMEOUT_MS } = require('./local-plugin-runner-client')

const createPluginCommandEntryProcessController = ({
  appendLog = () => {},
  appendLimitedOutput = (text, chunk) => `${text || ''}${String(chunk || '')}`,
  cloneJsonValue = (value) => value,
  createBridgeRun,
  deleteBridgeRun = () => {},
  createBridgeHandlers,
  ensureCreatorDirs,
  createEnv = () => ({}),
  parseCommand,
  resolveCwd,
  spawnCommandProcess,
  setRuntime,
  deleteRuntime = () => {},
  attachStopHandler = (runtime) => runtime,
  readCommandResult = () => null,
  commandProcessTimeoutMs = LOCAL_PLUGIN_COMMAND_TIMEOUT_MS,
  fallbackTimeoutMs = LOCAL_PLUGIN_COMMAND_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) => {
  if (typeof createBridgeRun !== 'function') throw new Error('createBridgeRun is required')
  if (typeof createBridgeHandlers !== 'function') throw new Error('createBridgeHandlers is required')
  if (typeof ensureCreatorDirs !== 'function') throw new Error('ensureCreatorDirs is required')
  if (typeof parseCommand !== 'function') throw new Error('parseCommand is required')
  if (typeof resolveCwd !== 'function') throw new Error('resolveCwd is required')
  if (typeof spawnCommandProcess !== 'function') throw new Error('spawnCommandProcess is required')
  if (typeof setRuntime !== 'function') throw new Error('setRuntime is required')

  const run = async ({ plugin, commandEntry, commandId, payload, config }) => {
    const pluginId = plugin.manifest.id
    const { file, args } = parseCommand(commandEntry.command)
    const cwd = resolveCwd(plugin.manifest, commandEntry.cwd)
    const bridgeRun = await createBridgeRun({
      pluginId,
      commandId,
      handlers: createBridgeHandlers(plugin, commandId)
    })
    const creatorDirs = ensureCreatorDirs(plugin.manifest)
    const commandContext = {
      pluginId,
      commandId,
      payload: cloneJsonValue(payload, 'payload', { allowUndefined: true }),
      config: cloneJsonValue(config, 'config'),
      paths: {
        extensionDir: cwd
      }
    }

    let child
    try {
      child = spawnCommandProcess(file, args, {
        cwd,
        detached: false,
        env: {
          ...createEnv(),
          OPENPET_DATA_DIR: creatorDirs.dataDir,
          OPENPET_CACHE_DIR: creatorDirs.cacheDir,
          OPENPET_LOG_DIR: creatorDirs.logDir,
          OPENPET_BRIDGE_URL: bridgeRun.baseUrl,
          OPENPET_BRIDGE_TOKEN: bridgeRun.token
        },
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
    } catch (error) {
      deleteBridgeRun(pluginId, commandId, bridgeRun.runId)
      throw error
    }

    const runtime = setRuntime(attachStopHandler({
      pluginId,
      commandId,
      status: 'running',
      pid: Number(child.pid) || 0,
      error: '',
      child,
      stopReason: '',
      stop: null,
      failStop: null
    }))

    let stdoutText = ''
    let stderrText = ''

    return new Promise((resolve, reject) => {
      let settled = false
      let timeoutId = null
      let exitCode = null
      let exitSignal = null

      const safeKillChild = () => {
        try {
          child.kill?.('SIGTERM')
        } catch (_) {}
      }

      const settle = (callback) => {
        if (settled) return
        settled = true
        if (timeoutId) clearTimer(timeoutId)
        deleteRuntime(pluginId, commandId)
        deleteBridgeRun(pluginId, commandId, bridgeRun.runId)
        callback()
      }

      runtime.failStop = (error) => {
        settle(() => reject(error))
      }

      const timeoutMs = Number.isFinite(Number(commandProcessTimeoutMs))
        ? Math.max(0, Number(commandProcessTimeoutMs))
        : fallbackTimeoutMs
      timeoutId = timeoutMs > 0
        ? setTimer(() => {
            settle(() => {
              safeKillChild()
              reject(new Error(`Plugin command timed out after ${timeoutMs}ms`))
            })
          }, timeoutMs)
        : null
      timeoutId?.unref?.()

      child.stdout?.on?.('data', (chunk) => {
        stdoutText = appendLimitedOutput(stdoutText, chunk)
        const message = String(chunk || '').trim()
        if (message) appendLog({ pluginId, commandId, level: 'info', message: `Command stdout: ${message}`.slice(0, 500) })
      })

      child.stderr?.on?.('data', (chunk) => {
        stderrText = appendLimitedOutput(stderrText, chunk)
        const message = String(chunk || '').trim()
        if (message) appendLog({ pluginId, commandId, level: 'error', message: `Command stderr: ${message}`.slice(0, 500) })
      })

      child.on?.('error', (error) => {
        settle(() => reject(error))
      })

      child.stdin?.on?.('error', (error) => {
        settle(() => {
          safeKillChild()
          reject(error)
        })
      })

      child.on?.('exit', (code, signal) => {
        exitCode = Number.isFinite(Number(code)) ? Number(code) : null
        exitSignal = signal || ''
      })

      child.on?.('close', (code, signal) => {
        settle(() => {
          const resolvedExitCode = Number.isFinite(Number(code)) ? Number(code) : exitCode
          const resolvedExitSignal = signal || exitSignal || ''
          if (runtime.status === 'stopping') {
            runtime.status = 'failed'
            runtime.error = runtime.stopReason || 'Command stopped'
            appendLog({ pluginId, commandId, level: 'error', message: 'Command stopped' })
            const error = new Error(runtime.error)
            error.openpetLogged = true
            reject(error)
            return
          }

          if (resolvedExitCode !== 0 || resolvedExitSignal) {
            const parsedResult = readCommandResult(stdoutText)
            const parsedError = parsedResult && typeof parsedResult === 'object' && typeof parsedResult.error === 'string'
              ? parsedResult.error.trim()
              : ''
            const message = parsedError || (resolvedExitSignal ? `Plugin command exited with signal ${resolvedExitSignal}` : `Plugin command exited with code ${resolvedExitCode ?? 'unknown'}`)
            reject(new Error(message))
            return
          }

          const parsedResult = readCommandResult(stdoutText)
          resolve({
            ok: true,
            pluginId,
            commandId,
            exitCode: resolvedExitCode,
            ...(parsedResult ? { result: parsedResult } : {}),
            ...(!parsedResult && stdoutText.trim() ? { stdout: stdoutText.trim() } : {}),
            ...(stderrText.trim() ? { stderr: stderrText.trim() } : {})
          })
        })
      })

      try {
        child.stdin?.end?.(`${JSON.stringify(commandContext)}\n`)
      } catch (error) {
        settle(() => {
          safeKillChild()
          reject(error)
        })
      }
    })
  }

  return {
    run
  }
}

module.exports = {
  createPluginCommandEntryProcessController
}
