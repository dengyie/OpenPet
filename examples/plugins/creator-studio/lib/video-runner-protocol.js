const crypto = require('node:crypto')

const { createProviderVideoTask } = require('./provider-video-task')

const RUNNER_REQUEST_SCHEMA_VERSION = 1
const RUNNER_RESPONSE_SCHEMA_VERSION = 1
const RUNNER_REQUEST_TYPE = 'openpet-video-runner-request-v1'
const RUNNER_RESPONSE_TYPE = 'openpet-video-runner-response-v1'
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/
const SAFE_RELATIVE_PATH = /^(?!\/)(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/
const SHA256 = /^[a-f0-9]{64}$/i

const runnerProtocolError = (message) => Object.assign(new Error(`Invalid video runner protocol message: ${message}`), {
  code: 'video_runner_protocol_invalid'
})

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('\n') !== expected.slice().sort().join('\n')) {
    throw runnerProtocolError(`${label} fields are invalid`)
  }
}

const safeId = (value, label) => {
  const normalized = String(value || '').trim()
  if (!SAFE_ID.test(normalized)) throw runnerProtocolError(`${label} is invalid`)
  return normalized
}

const relativePath = (value, label) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (!SAFE_RELATIVE_PATH.test(normalized) || normalized.split('/').includes('..')) throw runnerProtocolError(`${label} is invalid`)
  return normalized
}

const sha256 = (value, label) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA256.test(normalized)) throw runnerProtocolError(`${label} must be a sha256`)
  return normalized
}

const createVideoRunnerRequest = ({ requestId, runId, providerTask, input } = {}) => {
  const normalizedRequestId = safeId(requestId, 'requestId')
  const normalizedRunId = safeId(runId, 'runId')
  const task = createProviderVideoTask(providerTask)
  exactKeys(input, ['canonicalSha256', 'canonicalRelativePath', 'motionDriverRelativePath'], 'input')
  const canonicalSha256 = sha256(input.canonicalSha256, 'input.canonicalSha256')
  const canonicalRelativePath = relativePath(input.canonicalRelativePath, 'input.canonicalRelativePath')
  const motionDriverRelativePath = relativePath(input.motionDriverRelativePath, 'input.motionDriverRelativePath')
  const payload = {
    schemaVersion: RUNNER_REQUEST_SCHEMA_VERSION,
    messageType: RUNNER_REQUEST_TYPE,
    requestId: normalizedRequestId,
    runId: normalizedRunId,
    providerTask: task,
    input: { canonicalSha256, canonicalRelativePath, motionDriverRelativePath }
  }
  return deepFreeze({
    ...payload,
    requestSha256: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  })
}

const createVideoRunnerResponse = ({ request, status, rawVideo, error } = {}) => {
  if (!request || request.messageType !== RUNNER_REQUEST_TYPE) throw runnerProtocolError('request is invalid')
  const requestPayload = {
    schemaVersion: request.schemaVersion,
    messageType: request.messageType,
    requestId: request.requestId,
    runId: request.runId,
    providerTask: request.providerTask,
    input: request.input
  }
  const expectedRequestSha256 = crypto.createHash('sha256').update(JSON.stringify(requestPayload)).digest('hex')
  if (request.requestSha256 !== expectedRequestSha256) throw runnerProtocolError('requestSha256 does not match request payload')
  const normalizedStatus = String(status || '')
  if (!['succeeded', 'failed', 'canceled'].includes(normalizedStatus)) throw runnerProtocolError('status is invalid')
  const response = {
    schemaVersion: RUNNER_RESPONSE_SCHEMA_VERSION,
    messageType: RUNNER_RESPONSE_TYPE,
    requestId: request.requestId,
    runId: request.runId,
    requestSha256: sha256(request.requestSha256, 'requestSha256'),
    status: normalizedStatus
  }
  if (normalizedStatus === 'succeeded') {
    exactKeys(rawVideo, ['relativePath', 'sha256', 'mimeType'], 'rawVideo')
    const mimeType = String(rawVideo.mimeType || '')
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeType)) throw runnerProtocolError('rawVideo.mimeType is invalid')
    response.rawVideo = {
      relativePath: relativePath(rawVideo.relativePath, 'rawVideo.relativePath'),
      sha256: sha256(rawVideo.sha256, 'rawVideo.sha256'),
      mimeType
    }
  } else {
    if (rawVideo !== undefined) throw runnerProtocolError('failed runner response must not include rawVideo')
    if (!error || typeof error !== 'object' || Array.isArray(error)) throw runnerProtocolError('runner error is required')
    exactKeys(error, ['code', 'retryable'], 'error')
    if (!SAFE_ID.test(String(error.code || ''))) throw runnerProtocolError('error.code is invalid')
    if (typeof error.retryable !== 'boolean') throw runnerProtocolError('error.retryable is invalid')
    response.error = { code: String(error.code), retryable: error.retryable }
  }
  return deepFreeze(response)
}

module.exports = {
  RUNNER_REQUEST_TYPE,
  RUNNER_RESPONSE_TYPE,
  createVideoRunnerRequest,
  createVideoRunnerResponse,
  runnerProtocolError
}
