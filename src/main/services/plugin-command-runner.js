const { LOCAL_PLUGIN_COMMAND_TIMEOUT_MS } = require('./local-plugin-runner-client')
const { createPluginProcessEnv, parsePluginProcessCommand } = require('./plugin-process-support')

const MAX_PLUGIN_COMMAND_OUTPUT_BYTES = 64 * 1024

const appendLimitedOutput = (current, chunk, maxBytes = MAX_PLUGIN_COMMAND_OUTPUT_BYTES) => {
  const next = `${current}${String(chunk || '')}`
  return next.length > maxBytes ? next.slice(0, maxBytes) : next
}

const parseJsonLine = (line) => {
  try {
    return JSON.parse(line)
  } catch (_) {
    return null
  }
}

const readCommandResult = (stdoutText) => {
  const lines = String(stdoutText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonLine(lines[index])
    if (parsed && typeof parsed === 'object') return parsed
  }
  return null
}

const sanitizePluginCommandText = (value = '') => {
  let sanitized = String(value || '')
  sanitized = sanitized.replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
  sanitized = sanitized.replace(/\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/gi, '[redacted-token]')
  sanitized = sanitized.replace(/\[redacted-token\]\s*[:=]\s*[^\s,，。)]+/gi, '[redacted-token]=[redacted-secret]')
  sanitized = sanitized.replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/\[::1\](?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g, '[redacted-path]')
  sanitized = sanitized.replace(/[A-Za-z]:\\[^\s,，。)]+/g, '[redacted-path]')
  sanitized = sanitized.replace(/\[\[redacted-token\]\]/g, '[redacted-token]')
  return sanitized.trim()
}

const sanitizePluginCommandResultValue = (value, key = '') => {
  if (typeof value === 'string') {
    return /^(error|stderr|stdout)$/i.test(String(key || ''))
      ? sanitizePluginCommandText(value)
      : value
  }
  if (Array.isArray(value)) return value.map((entry) => sanitizePluginCommandResultValue(entry))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    sanitizePluginCommandResultValue(entryValue, entryKey)
  ]))
}

const runPluginCommandEntryProcess = async ({
  plugin,
  commandEntry,
  commandId,
  payload,
  config,
  runtimeKey,
  commandRuntimes,
  commandBridgeRuntimes,
  commandBridgeServer,
  createPluginBridgeRunId,
  createPluginBridgeToken,
  createPluginBridgeKey,
  createPluginBridgeHandlers,
  createPluginCreatorDirs,
  cloneJsonValue,
  resolveCommandCwd,
  spawnCommandProcess,
  stopRuntimeProcessWithFallback,
  resolveStopWaiter,
  appendLog,
  commandProcessTimeoutMs = LOCAL_PLUGIN_COMMAND_TIMEOUT_MS
}) => {
  const pluginId = plugin.manifest.id
  const { file, args } = parsePluginProcessCommand(commandEntry.command)
  const cwd = resolveCommandCwd(plugin.manifest, commandEntry.cwd)
  await commandBridgeServer.ensureStarted()
  const bridgeRunId = createPluginBridgeRunId()
  const bridgeToken = createPluginBridgeToken()
  const bridgeRuntimeKey = createPluginBridgeKey(pluginId, commandId, bridgeRunId)
  const bridgeBaseUrl = commandBridgeServer.createBridgeBaseUrl({ pluginId, commandId, runId: bridgeRunId })
  const creatorDirs = createPluginCreatorDirs(plugin.manifest)
  const commandContext = {
    pluginId,
    commandId,
    payload: cloneJsonValue(payload, 'payload', { allowUndefined: true }),
    config: cloneJsonValue(config, 'config'),
    paths: {
      extensionDir: cwd
    }
  }
  const child = spawnCommandProcess(file, args, {
    cwd,
    detached: false,
    env: {
      ...createPluginProcessEnv(),
      OPENPET_DATA_DIR: creatorDirs.dataDir,
      OPENPET_CACHE_DIR: creatorDirs.cacheDir,
      OPENPET_LOG_DIR: creatorDirs.logDir,
      OPENPET_BRIDGE_URL: bridgeBaseUrl,
      OPENPET_BRIDGE_TOKEN: bridgeToken
    },
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })
  const runtime = {
    pluginId,
    commandId,
    status: 'running',
    pid: Number(child.pid) || 0,
    error: '',
    child,
    stopReason: '',
    stop: null,
    failStop: null,
    stopCompleted: null,
    resolveStopCompleted: null
  }
  commandBridgeRuntimes.set(bridgeRuntimeKey, {
    pluginId,
    commandId,
    runId: bridgeRunId,
    token: bridgeToken,
    status: 'running',
    handlers: createPluginBridgeHandlers(plugin, commandId, bridgeRunId)
  })
  commandRuntimes.set(runtimeKey, runtime)
  let stdoutText = ''
  let stderrText = ''

  return new Promise((resolve, reject) => {
    let settled = false
    const safeKillChild = () => {
      try {
        child.kill?.('SIGTERM')
      } catch (_) {}
    }
    const settle = (callback) => {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      commandRuntimes.delete(runtimeKey)
      commandBridgeRuntimes.delete(bridgeRuntimeKey)
      commandBridgeServer.unrefWhenIdle()
      callback()
    }
    runtime.failStop = (error) => {
      settle(() => {
        resolveStopWaiter(runtime)
        reject(error)
      })
    }
    runtime.stop = ({ reason = 'Command stopped', signal = 'SIGTERM' } = {}) => {
      runtime.status = 'stopping'
      runtime.error = ''
      runtime.stopReason = reason
      stopRuntimeProcessWithFallback(runtime, signal)
      return true
    }
    const timeoutMs = Number.isFinite(Number(commandProcessTimeoutMs))
      ? Math.max(0, Number(commandProcessTimeoutMs))
      : LOCAL_PLUGIN_COMMAND_TIMEOUT_MS
    const timeoutId = timeoutMs > 0
      ? setTimeout(() => {
          settle(() => {
            safeKillChild()
            reject(new Error(`Plugin command timed out after ${timeoutMs}ms`))
          })
        }, timeoutMs)
      : null
    timeoutId?.unref?.()

    child.stdout?.on?.('data', (chunk) => {
      stdoutText = appendLimitedOutput(stdoutText, chunk)
      const message = sanitizePluginCommandText(chunk)
      if (message) appendLog({ pluginId, commandId, level: 'info', message: `Command stdout: ${message}`.slice(0, 500) })
    })
    child.stderr?.on?.('data', (chunk) => {
      stderrText = appendLimitedOutput(stderrText, chunk)
      const message = sanitizePluginCommandText(chunk)
      if (message) appendLog({ pluginId, commandId, level: 'error', message: `Command stderr: ${message}`.slice(0, 500) })
    })
    child.on?.('error', (error) => {
      settle(() => {
        resolveStopWaiter(runtime)
        reject(new Error(sanitizePluginCommandText(error?.message || 'Plugin command failed')))
      })
    })
    child.stdin?.on?.('error', (error) => {
      settle(() => {
        resolveStopWaiter(runtime)
        safeKillChild()
        reject(new Error(sanitizePluginCommandText(error?.message || 'Plugin command stdin failed')))
      })
    })
    child.on?.('exit', (code, signal) => {
      settle(() => {
        resolveStopWaiter(runtime)
        const exitCode = Number.isFinite(Number(code)) ? Number(code) : null
        if (runtime.status === 'stopping') {
          runtime.status = 'failed'
          runtime.error = runtime.stopReason || 'Command stopped'
          appendLog({ pluginId, commandId, level: 'error', message: 'Command stopped' })
          const error = new Error(runtime.error)
          error.openpetLogged = true
          reject(error)
          return
        }
        if (exitCode !== 0 || signal) {
          const parsedResult = readCommandResult(stdoutText)
          const parsedError = parsedResult && typeof parsedResult === 'object' && typeof parsedResult.error === 'string'
            ? sanitizePluginCommandText(parsedResult.error)
            : ''
          const message = parsedError || (signal ? `Plugin command exited with signal ${signal}` : `Plugin command exited with code ${exitCode ?? 'unknown'}`)
          reject(new Error(message))
          return
        }
        const parsedResult = readCommandResult(stdoutText)
        const sanitizedParsedResult = sanitizePluginCommandResultValue(parsedResult)
        resolve({
          ok: true,
          pluginId,
          commandId,
          exitCode,
          ...(sanitizedParsedResult ? { result: sanitizedParsedResult } : {}),
          ...(!sanitizedParsedResult && stdoutText.trim() ? { stdout: sanitizePluginCommandText(stdoutText.trim()) } : {}),
          ...(stderrText.trim() ? { stderr: sanitizePluginCommandText(stderrText.trim()) } : {})
        })
      })
    })

    try {
      child.stdin?.end?.(`${JSON.stringify(commandContext)}\n`)
    } catch (error) {
      settle(() => {
        resolveStopWaiter(runtime)
        safeKillChild()
        reject(error)
      })
    }
  })
}

module.exports = {
  appendLimitedOutput,
  readCommandResult,
  runPluginCommandEntryProcess
}
