const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { spawn } = require('child_process')
const { fileURLToPath } = require('url')
const sharp = require('sharp')

const HELPER_NAME = 'OpenPetSystemCursor'
const DEFAULT_PROTOCOL_TIMEOUT_MS = 4000
const DEFAULT_STOP_TIMEOUT_MS = 1500
const MAX_STDERR_CHARS = 4096

const buildMacosSystemCursorHelper = (options) => (
  require('../../../scripts/build-macos-system-cursor-helper').buildMacosSystemCursorHelper(options)
)

const normalizePositiveNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

const decodeDataUrl = (assetUrl) => {
  const value = String(assetUrl || '')
  if (!value.startsWith('data:')) return null
  const commaIndex = value.indexOf(',')
  if (commaIndex < 0) return null
  const metadata = value.slice(5, commaIndex)
  const payload = value.slice(commaIndex + 1)
  return /(?:^|;)base64(?:;|$)/i.test(metadata)
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf-8')
}

const resolveCursorInput = (cursor) => {
  const assetPath = typeof cursor?.assetPath === 'string' ? cursor.assetPath : ''
  if (assetPath && !assetPath.startsWith('builtin://') && fs.existsSync(assetPath)) return assetPath
  const dataBuffer = decodeDataUrl(cursor?.assetUrl)
  if (dataBuffer) return dataBuffer
  if (typeof cursor?.assetUrl === 'string' && cursor.assetUrl.startsWith('file:')) {
    const filePath = fileURLToPath(cursor.assetUrl)
    if (fs.existsSync(filePath)) return filePath
  }
  throw new Error('Selected cursor asset is unavailable for whole-computer mode')
}

const materializeSystemCursorAsset = async ({ cursor, outputDir }) => {
  if (!cursor?.enabled) throw new Error('A custom cursor must be selected before enabling whole-computer mode')
  const input = resolveCursorInput(cursor)
  if (typeof input === 'string' && path.extname(input).toLowerCase() === '.png') return input

  fs.mkdirSync(outputDir, { recursive: true })
  const hash = crypto.createHash('sha256')
    .update(Buffer.isBuffer(input) ? input : fs.readFileSync(input))
    .digest('hex')
    .slice(0, 24)
  const outputPath = path.join(outputDir, `${hash}.png`)
  if (!fs.existsSync(outputPath)) await sharp(input).png().toFile(outputPath)
  return outputPath
}

const resolveDefaultHelperPath = ({ projectRoot, arch }) => {
  const root = String(projectRoot || '')
  const unpackedRoot = root.includes('app.asar') ? root.replace('app.asar', 'app.asar.unpacked') : root
  return path.join(unpackedRoot, 'build', 'native', arch, HELPER_NAME)
}

const writeJsonAtomic = (targetPath, value) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporaryPath, targetPath)
  fs.chmodSync(targetPath, 0o600)
}

const createSystemCursorService = ({
  platform = process.platform,
  arch = process.arch,
  projectRoot,
  userDataPath,
  appLogService,
  spawnProcess = spawn,
  buildHelper = buildMacosSystemCursorHelper,
  resolveHelperPath = resolveDefaultHelperPath,
  prepareCursorAsset = materializeSystemCursorAsset,
  versionFactory = () => `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
  parentPid = process.pid,
  onUnexpectedExit = () => {},
  protocolTimeoutMs = DEFAULT_PROTOCOL_TIMEOUT_MS,
  stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS
}) => {
  const supported = platform === 'darwin'
  const runtimeDir = path.join(userDataPath || projectRoot || process.cwd(), 'system-cursor-runtime')
  const configPath = path.join(runtimeDir, 'config.json')
  const assetDir = path.join(runtimeDir, 'assets')
  let currentContext = null
  let disposed = false
  let operation = Promise.resolve()
  const expectedChildren = new WeakSet()

  const record = (entry) => {
    try {
      appLogService?.record?.({
        scope: 'system-cursor',
        actor: 'system',
        ...entry
      })
    } catch (_) {
      // Cursor recovery must not depend on logging availability.
    }
  }

  const getStatus = () => ({
    supported,
    platform,
    active: Boolean(currentContext?.child && currentContext.ready),
    helperPid: currentContext?.child && currentContext.ready ? Number(currentContext.child.pid) || 0 : 0
  })

  const settleProtocolWaiters = (context, message) => {
    for (const waiter of [...context.waiters]) {
      if (message?.event === 'error' && (!message.version || message.version === waiter.version)) {
        context.waiters.delete(waiter)
        clearTimeout(waiter.timeoutId)
        waiter.reject(new Error(message.message || 'macOS system cursor helper reported an error'))
        continue
      }
      if (message?.event !== waiter.event || message?.version !== waiter.version) continue
      context.waiters.delete(waiter)
      clearTimeout(waiter.timeoutId)
      waiter.resolve(message)
    }
  }

  const rejectProtocolWaiters = (context, error) => {
    for (const waiter of [...context.waiters]) {
      context.waiters.delete(waiter)
      clearTimeout(waiter.timeoutId)
      waiter.reject(error)
    }
  }

  const waitForProtocol = (context, event, version) => new Promise((resolve, reject) => {
    const waiter = { event, version, resolve, reject, timeoutId: null }
    waiter.timeoutId = setTimeout(() => {
      context.waiters.delete(waiter)
      reject(new Error(`macOS system cursor helper timed out waiting for ${event}`))
    }, protocolTimeoutMs)
    waiter.timeoutId.unref?.()
    context.waiters.add(waiter)
  })

  const attachChild = (nextChild) => {
    let resolveExit
    const context = {
      child: nextChild,
      ready: false,
      stderrTail: '',
      waiters: new Set(),
      exited: false,
      errorRecoveryScheduled: false,
      exitPromise: new Promise((resolve) => { resolveExit = resolve })
    }
    currentContext = context
    const output = readline.createInterface({ input: nextChild.stdout })
    context.output = output
    output.on('line', (line) => {
      let message
      try {
        message = JSON.parse(line)
      } catch (_) {
        record({
          level: 'warn',
          event: 'system-cursor.helper.protocol.invalid',
          message: 'macOS system cursor helper emitted an invalid protocol line'
        })
        return
      }
      settleProtocolWaiters(context, message)
    })
    nextChild.stderr?.on?.('data', (chunk) => {
      context.stderrTail = `${context.stderrTail}${String(chunk || '')}`.slice(-MAX_STDERR_CHARS)
    })
    const reportUnexpected = ({ error = null, code = null, signal = null, cleanupError = null }) => {
      record({
        level: 'error',
        event: 'system-cursor.helper.exited',
        message: 'macOS system cursor helper exited unexpectedly',
        details: {
          code,
          signal: signal || '',
          stderr: context.stderrTail,
          error: error?.message || '',
          cleanupError: cleanupError?.message || ''
        }
      })
      return Promise.resolve()
        .then(() => onUnexpectedExit({ code, signal, stderr: context.stderrTail, error, cleanupError }))
        .catch((fallbackError) => {
          record({
            level: 'error',
            event: 'system-cursor.fallback.failed',
            message: fallbackError?.message || 'Failed to persist cursor fallback after helper exit'
          })
        })
    }
    const settleExit = (code, signal) => {
      if (context.exited) return
      context.exited = true
      resolveExit({ code, signal })
      output.close()
      const wasCurrent = currentContext === context
      const wasReady = context.ready
      const expected = expectedChildren.has(nextChild)
      if (wasCurrent) currentContext = null
      rejectProtocolWaiters(context, new Error(`macOS system cursor helper exited before reporting ready (code ${code ?? 'null'}, signal ${signal || 'none'})`))
      if (!expected && wasReady) reportUnexpected({ code, signal })
    }
    nextChild.once('error', (error) => {
      rejectProtocolWaiters(context, error)
      if (!context.ready || context.exited || context.errorRecoveryScheduled) return
      context.ready = false
      context.errorRecoveryScheduled = true
      const recovery = enqueue(async () => {
        let cleanupError = null
        try {
          await stopContext(context, 'helper-error', { recordDeactivation: false })
        } catch (errorDuringCleanup) {
          cleanupError = errorDuringCleanup
        }
        if (cleanupError) {
          record({
            level: 'error',
            event: 'system-cursor.helper.cleanup.failed',
            message: cleanupError.message || 'Failed to reclaim macOS system cursor helper after an error',
            details: { error: error.message || '', stderr: context.stderrTail }
          })
          throw cleanupError
        }
        await reportUnexpected({ error })
      })
      recovery.catch(() => {})
    })
    nextChild.once('exit', settleExit)
    return context
  }

  const ensureHelper = async () => {
    let helperPath = resolveHelperPath({ projectRoot, arch })
    if (!fs.existsSync(helperPath)) {
      await Promise.resolve(buildHelper({ platform, arch, projectRoot }))
      helperPath = resolveHelperPath({ projectRoot, arch })
    }
    if (!fs.existsSync(helperPath)) throw new Error(`macOS system cursor helper is unavailable: ${helperPath}`)
    fs.accessSync(helperPath, fs.constants.X_OK)
    return helperPath
  }

  const stopContext = async (context, reason, { recordDeactivation = true } = {}) => {
    if (!context || context.exited) return getStatus()
    const targetChild = context.child
    expectedChildren.add(targetChild)
    const waitForExit = async () => {
      let timeoutId
      const stopped = await Promise.race([
        context.exitPromise.then(() => true),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve(false), stopTimeoutMs)
          timeoutId.unref?.()
        })
      ])
      clearTimeout(timeoutId)
      return stopped
    }
    let terminateSent = false
    let terminateError = null
    try {
      terminateSent = targetChild.kill('SIGTERM')
    } catch (error) {
      terminateError = error
    }
    const stopped = await waitForExit()
    if (!stopped) {
      let forceSent = false
      let forceError = null
      try {
        forceSent = targetChild.kill('SIGKILL')
      } catch (error) {
        forceError = error
      }
      const forceStopped = await waitForExit()
      if (!forceStopped) {
        expectedChildren.delete(targetChild)
        if (!forceSent) {
          const stopError = new Error('Failed to force-stop macOS system cursor helper')
          stopError.cause = forceError || terminateError || (!terminateSent ? new Error('SIGTERM was not sent') : undefined)
          throw stopError
        }
        throw new Error('macOS system cursor helper did not exit after force-stop')
      }
    }
    if (currentContext === context) currentContext = null
    if (recordDeactivation) {
      record({
        level: 'info',
        event: 'system-cursor.deactivated',
        message: 'Whole-computer cursor deactivated',
        details: { reason }
      })
    }
    return getStatus()
  }

  const stopChild = async (reason) => stopContext(currentContext, reason)

  const applyInternal = async (cursor) => {
    if (!supported) throw new Error('Whole-computer cursor mode is only supported on macOS')
    if (disposed) throw new Error('System cursor service is disposed')
    const helperPath = await ensureHelper()
    const imagePath = await prepareCursorAsset({ cursor, outputDir: assetDir })
    const version = String(versionFactory())
    const config = {
      version,
      imagePath,
      width: Math.max(1, Math.round(normalizePositiveNumber(cursor.width, 32))),
      height: Math.max(1, Math.round(normalizePositiveNumber(cursor.height, 32))),
      hotspotX: Math.round(normalizePositiveNumber(cursor.hotspotX, 0)),
      hotspotY: Math.round(normalizePositiveNumber(cursor.hotspotY, 0))
    }
    writeJsonAtomic(configPath, config)

    if (currentContext?.child && currentContext.ready) {
      const context = currentContext
      const updatePromise = waitForProtocol(context, 'updated', version)
      if (!context.child.kill('SIGHUP')) {
        rejectProtocolWaiters(context, new Error('Failed to notify macOS system cursor helper about an update'))
        throw new Error('Failed to update whole-computer cursor')
      }
      await updatePromise
      if (currentContext !== context || context.exited) throw new Error('macOS system cursor helper changed during update')
      record({
        level: 'info',
        event: 'system-cursor.updated',
        message: 'Whole-computer cursor updated',
        details: { fileName: cursor.fileName || '', width: config.width, height: config.height }
      })
      return getStatus()
    }

    if (currentContext) await stopContext(currentContext, 'startup-retry', { recordDeactivation: false })

    const nextChild = spawnProcess(helperPath, ['--config', configPath, '--parent-pid', String(parentPid)], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    const context = attachChild(nextChild)
    const readyPromise = waitForProtocol(context, 'ready', version)
    try {
      await readyPromise
      if (currentContext !== context || context.exited) throw new Error('macOS system cursor helper changed during startup')
      context.ready = true
      record({
        level: 'info',
        event: 'system-cursor.activated',
        message: 'Whole-computer cursor activated',
        details: {
          helperPid: Number(nextChild.pid) || 0,
          fileName: cursor.fileName || '',
          width: config.width,
          height: config.height
        }
      })
      return getStatus()
    } catch (error) {
      if (!context.exited) {
        try {
          await stopContext(context, 'startup-failed', { recordDeactivation: false })
        } catch (stopError) {
          error.cleanupError = stopError
        }
      }
      throw error
    }
  }

  const enqueue = (task) => {
    const next = operation.then(task, task)
    operation = next.catch(() => {})
    return next
  }

  const apply = (cursor) => enqueue(() => applyInternal(cursor))

  const stop = (reason = 'scope-change') => enqueue(() => stopChild(reason))

  const sync = (settings = {}) => (
    settings.customCursorScope === 'system' && settings.customCursor?.enabled
      ? apply(settings.customCursor)
      : stop(settings.customCursorScope === 'system' ? 'cursor-unavailable' : 'scope-openpet')
  )

  const dispose = () => enqueue(async () => {
    disposed = true
    return stopChild('app-quit')
  })

  return {
    apply,
    dispose,
    getStatus,
    stop,
    sync
  }
}

module.exports = {
  createSystemCursorService,
  materializeSystemCursorAsset,
  resolveDefaultHelperPath
}
