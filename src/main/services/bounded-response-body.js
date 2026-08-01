const toBuffer = (value) => {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  return Buffer.from(String(value ?? ''))
}

const getDeclaredContentLength = (response) => {
  const rawValue = String(response?.headers?.get?.('content-length') || '').trim()
  if (!/^\d+$/.test(rawValue)) return null
  const value = Number(rawValue)
  return Number.isSafeInteger(value) ? value : null
}

const abortRequest = (controller, reason) => {
  if (!controller || controller.signal?.aborted) return
  try {
    controller.abort(reason)
  } catch (_) {
    controller.abort()
  }
}

const cancelQuietly = (operation) => {
  try {
    Promise.resolve(operation()).catch(() => {})
  } catch (_) {}
}

const cancelResponseBodyQuietly = async (response) => {
  try {
    await response?.body?.cancel?.()
  } catch (_) {}
}

const awaitWithAbort = async (operation, controller) => {
  const signal = controller?.signal
  const pendingOperation = Promise.resolve(operation)
  if (!signal) return await pendingOperation
  if (signal.aborted) {
    pendingOperation.catch(() => {})
    throw signal.reason || new Error('Response body read aborted')
  }
  let abortHandler
  const aborted = new Promise((_, reject) => {
    abortHandler = () => reject(signal.reason || new Error('Response body read aborted'))
    signal.addEventListener('abort', abortHandler, { once: true })
  })
  try {
    return await Promise.race([pendingOperation, aborted])
  } finally {
    signal.removeEventListener('abort', abortHandler)
  }
}

const createResponseBodyTooLargeError = (message) => {
  const error = new Error(message)
  error.code = 'RESPONSE_BODY_TOO_LARGE'
  return error
}

const readBoundedResponseBuffer = async (response, {
  maxBytes,
  sizeErrorMessage = `Response body exceeds ${maxBytes} bytes`,
  controller = null
} = {}) => {
  const limit = Number(maxBytes)
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError('maxBytes must be a non-negative safe integer')

  const createSizeError = () => createResponseBodyTooLargeError(sizeErrorMessage)
  let cancelActiveBody = (reason) => response?.body?.cancel?.(reason)
  const cancelOnAbort = () => queueMicrotask(() => {
    cancelQuietly(() => cancelActiveBody(controller?.signal?.reason))
  })
  const removeAbortListener = () => controller?.signal?.removeEventListener?.('abort', cancelOnAbort)
  if (controller?.signal?.aborted) cancelOnAbort()
  else controller?.signal?.addEventListener?.('abort', cancelOnAbort, { once: true })
  if (controller?.signal?.aborted) {
    removeAbortListener()
    throw controller.signal.reason || new Error('Response body read aborted')
  }
  const rejectOversized = (cancel) => {
    const error = createSizeError()
    cancelQuietly(() => cancel(error))
    abortRequest(controller, error)
    throw error
  }

  const declaredLength = getDeclaredContentLength(response)
  if (declaredLength !== null && declaredLength > limit) {
    removeAbortListener()
    rejectOversized(() => response?.body?.cancel?.())
  }

  const body = response?.body
  if (typeof body?.getReader === 'function') {
    const reader = body.getReader()
    cancelActiveBody = (reason) => reader.cancel(reason)
    const chunks = []
    let totalBytes = 0
    let complete = false
    try {
      while (true) {
        const { done, value } = await awaitWithAbort(reader.read(), controller)
        if (done) {
          complete = true
          break
        }
        const chunk = toBuffer(value)
        totalBytes += chunk.byteLength
        if (totalBytes > limit) rejectOversized(() => reader.cancel(createSizeError()))
        chunks.push(chunk)
      }
      return Buffer.concat(chunks, totalBytes)
    } finally {
      if (!complete) cancelQuietly(() => reader.cancel())
      reader.releaseLock?.()
      removeAbortListener()
    }
  }

  const iterator = body?.[Symbol.asyncIterator]?.()
  if (iterator) {
    cancelActiveBody = () => iterator.return?.()
    const chunks = []
    let totalBytes = 0
    let complete = false
    try {
      while (true) {
        const { done, value } = await awaitWithAbort(iterator.next(), controller)
        if (done) {
          complete = true
          break
        }
        const chunk = toBuffer(value)
        totalBytes += chunk.byteLength
        if (totalBytes > limit) rejectOversized(() => iterator.return?.())
        chunks.push(chunk)
      }
      return Buffer.concat(chunks, totalBytes)
    } finally {
      if (!complete) cancelQuietly(() => iterator.return?.())
      removeAbortListener()
    }
  }

  try {
    // Response-like test doubles often expose parsed JSON but cannot emulate
    // arrayBuffer() for object payloads. Real fetch Responses take the body
    // stream path above, so this fallback remains bounded and mock-compatible.
    if (!body && typeof response?.json === 'function') {
      const value = await awaitWithAbort(response.json(), controller)
      const buffer = Buffer.from(JSON.stringify(value) ?? '', 'utf8')
      if (buffer.byteLength > limit) rejectOversized((reason) => response?.body?.cancel?.(reason))
      return buffer
    }

    if (typeof response?.arrayBuffer === 'function') {
      const buffer = Buffer.from(await awaitWithAbort(response.arrayBuffer(), controller))
      if (buffer.byteLength > limit) rejectOversized((reason) => response?.body?.cancel?.(reason))
      return buffer
    }

    if (typeof response?.text === 'function') {
      const buffer = Buffer.from(await awaitWithAbort(response.text(), controller), 'utf8')
      if (buffer.byteLength > limit) rejectOversized((reason) => response?.body?.cancel?.(reason))
      return buffer
    }

    const error = new Error('Response body cannot be read with an enforceable byte limit')
    error.code = 'RESPONSE_BODY_NOT_READABLE'
    abortRequest(controller, error)
    throw error
  } finally {
    removeAbortListener()
  }
}

module.exports = {
  cancelResponseBodyQuietly,
  createResponseBodyTooLargeError,
  getDeclaredContentLength,
  readBoundedResponseBuffer
}
