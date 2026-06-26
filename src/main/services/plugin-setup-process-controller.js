const createPluginSetupProcessController = ({
  appendLog = () => {},
  parseCommand,
  resolveCwd,
  createEnv = () => ({}),
  spawnSetupProcess,
  setRuntime,
  attachStopHandler = (runtime) => runtime,
  createRuntimeView = (runtime) => runtime,
  now = () => new Date().toISOString()
} = {}) => {
  if (typeof parseCommand !== 'function') throw new Error('parseCommand is required')
  if (typeof resolveCwd !== 'function') throw new Error('resolveCwd is required')
  if (typeof spawnSetupProcess !== 'function') throw new Error('spawnSetupProcess is required')
  if (typeof setRuntime !== 'function') throw new Error('setRuntime is required')

  const run = ({ pluginId, manifest, setupId, setupEntry }) => {
    const commandId = `setup:${setupId || ''}`
    const { file, args } = parseCommand(setupEntry.command)
    const cwd = resolveCwd(manifest, setupEntry.cwd)
    const child = spawnSetupProcess(file, args, {
      cwd,
      detached: false,
      env: createEnv(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    const runtime = setRuntime(attachStopHandler({
      pluginId,
      setupId,
      status: 'running',
      pid: Number(child.pid) || 0,
      lastRunAt: now(),
      exitCode: null,
      error: '',
      child,
      failStop: null
    }))

    appendLog({ pluginId, commandId, level: 'info', message: 'Setup started' })

    return new Promise((resolve, reject) => {
      let settled = false
      let exitCode = null
      let exitSignal = null
      const settle = (callback) => {
        if (settled) return
        settled = true
        callback()
      }

      runtime.failStop = (error) => {
        settle(() => reject(error))
      }

      child.stdout?.on?.('data', (chunk) => {
        const message = String(chunk || '').trim()
        if (message) appendLog({ pluginId, commandId, level: 'info', message: `Setup stdout: ${message}`.slice(0, 500) })
      })
      child.stderr?.on?.('data', (chunk) => {
        const message = String(chunk || '').trim()
        if (message) appendLog({ pluginId, commandId, level: 'error', message: `Setup stderr: ${message}`.slice(0, 500) })
      })
      child.on?.('error', (error) => {
        settle(() => {
          runtime.status = 'failed'
          runtime.error = error.message || 'Plugin setup failed'
          runtime.exitCode = null
          runtime.lastRunAt = now()
          appendLog({ pluginId, commandId, level: 'error', message: 'Setup failed' })
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
          const stopRequested = runtime.status === 'stopping'
          runtime.status = stopRequested
            ? 'failed'
            : (resolvedExitCode === 0 && !resolvedExitSignal ? 'succeeded' : 'failed')
          runtime.exitCode = resolvedExitCode
          runtime.error = stopRequested
            ? 'Setup stopped'
            : (runtime.status === 'failed' ? (resolvedExitSignal ? `Setup exited with signal ${resolvedExitSignal}` : `Setup exited with code ${resolvedExitCode ?? 'unknown'}`) : '')
          runtime.lastRunAt = now()
          appendLog({
            pluginId,
            commandId,
            level: runtime.status === 'failed' ? 'error' : 'info',
            message: stopRequested ? 'Setup stopped' : (runtime.status === 'failed' ? 'Setup failed' : 'Setup completed')
          })
          resolve({
            ok: true,
            pluginId,
            setupId,
            runtime: createRuntimeView(runtime)
          })
        })
      })
    })
  }

  return {
    run
  }
}

module.exports = {
  createPluginSetupProcessController
}
