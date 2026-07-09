const fs = require('fs')
const path = require('path')
const { runJsonCommand } = require('./command-io')
const { DEFAULT_PORT, PLAN_FILE, TOKEN_FILE, getDataDir } = require('./codex-hook-plan')
const { readHookMode } = require('../lib/hook-mode')

const CHECK_VALUE_LABELS = {
  'data-dir': 'plugin-data-dir',
  'polling-sessions-dir': 'codex:sessions',
  'polling-archived-sessions-dir': 'codex:archived_sessions',
  'hook-plan': PLAN_FILE,
  'auth-file': 'plugin-auth-file'
}

const sanitizeDoctorText = (value = '') => String(value || '')
  .replace(/\bhttps?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi, '[local-url]')
  .replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s]*)?/gi, '[local-url]')
  .replace(/\[::1\](?::\d+)?(?:\/[^\s]*)?/gi, '[local-url]')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-key]')
  .replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g, '[path]')
  .replace(/[A-Za-z]:\\[^\s,，。)]+/g, '[path]')
  .trim()

const checkServiceHealth = async (port) => {
  const target = `http://127.0.0.1:${Number(port) || DEFAULT_PORT}/health`
  try {
    const response = await fetch(target, { headers: { 'Cache-Control': 'no-store' } })
    const body = await response.json().catch(() => ({}))
    return {
      ok: response.ok,
      url: target,
      statusCode: response.status,
      body
    }
  } catch (error) {
    return {
      ok: false,
      url: target,
      statusCode: null,
      error: error?.message || 'Health request failed'
    }
  }
}

const readDiagnostics = (serviceHealth = {}) => {
  const body = serviceHealth.body || {}
  if (body.diagnostics && typeof body.diagnostics === 'object') return body.diagnostics
  const sessions = body.sessions || {}
  const codexPoller = body.codexPoller || {}
  return {
    sessionCount: Number(sessions.sessions) || 0,
    activeSessionCount: Number(codexPoller.activeSessionCount || body.diagnostics?.activeSessionCount) || 0,
    totalEvents: Number(sessions.totalEvents) || 0,
    seenCount: Number(codexPoller.seenCount) || 0,
    ignoredContentRecordCount: Number(codexPoller.ignoredContentRecordCount || body.diagnostics?.ignoredContentRecordCount) || 0,
    ignoredMetadataRecordCount: Number(codexPoller.ignoredMetadataRecordCount || body.diagnostics?.ignoredMetadataRecordCount) || 0,
    unknownRecordCount: Number(codexPoller.unknownRecordCount) || 0,
    malformedRecordCount: Number(codexPoller.malformedRecordCount) || 0,
    unsupportedLifecycleRecordCount: Number(codexPoller.unsupportedLifecycleRecordCount || body.diagnostics?.unsupportedLifecycleRecordCount) || 0,
    lastEventAt: String(codexPoller.lastEventAt || body.diagnostics?.lastEventAt || sessions.lastEventAt || ''),
    lastScanAt: String(codexPoller.lastScanAt || ''),
    lastError: String(codexPoller.lastError || '')
  }
}

const toSafeCheckValue = (checkId, fallback = '') => CHECK_VALUE_LABELS[checkId] || fallback

const sanitizeDoctorValue = (value) => {
  if (typeof value === 'string') return sanitizeDoctorText(value)
  if (Array.isArray(value)) return value.map(sanitizeDoctorValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, sanitizeDoctorValue(entryValue)]))
}

const toDoctorServiceHealthOutput = (serviceHealth = {}) => sanitizeDoctorValue({
  ok: serviceHealth.ok === true,
  url: String(serviceHealth.url || ''),
  statusCode: Number.isFinite(Number(serviceHealth.statusCode)) ? Number(serviceHealth.statusCode) : null,
  ...(typeof serviceHealth.error === 'string' && serviceHealth.error ? { error: serviceHealth.error } : {})
})

const redactDoctorOutput = (body = {}) => ({
  ...body,
  diagnostics: sanitizeDoctorValue(body.diagnostics || {}),
  serviceHealth: toDoctorServiceHealthOutput(body.serviceHealth || {}),
  checks: Array.isArray(body.checks)
    ? body.checks.map((check) => ({
        ...check,
        value: toSafeCheckValue(check.id, typeof check.value === 'string' ? check.value : '')
      }))
    : []
})

if (require.main === module) {
  runJsonCommand(async (input) => {
    const dataDir = getDataDir(input)
    const port = input?.port || DEFAULT_PORT
    const nativeExecutionApproved = typeof input?.runtime?.nativeExecutionApproved === 'boolean'
      ? input.runtime.nativeExecutionApproved
      : null
    const codexHome = path.resolve(input?.codexHome || process.env.CODEX_HOME || path.join(require('os').homedir(), '.codex'))
    const sessionsDir = path.join(codexHome, 'sessions')
    const archivedSessionsDir = path.join(codexHome, 'archived_sessions')
    const tokenPath = path.join(dataDir, TOKEN_FILE)
    const planPath = path.join(dataDir, PLAN_FILE)
    const serviceHealth = await checkServiceHealth(port)
    const diagnostics = readDiagnostics(serviceHealth)
    const checks = [
      { id: 'data-dir', ok: fs.existsSync(dataDir), value: dataDir },
      { id: 'polling-sessions-dir', ok: fs.existsSync(sessionsDir), value: sessionsDir },
      { id: 'polling-archived-sessions-dir', ok: fs.existsSync(archivedSessionsDir), value: archivedSessionsDir },
      { id: 'hook-plan', ok: fs.existsSync(planPath), value: planPath },
      { id: 'auth-file', ok: fs.existsSync(tokenPath), value: tokenPath },
      {
        id: 'native-execution-approval',
        ok: nativeExecutionApproved === true,
        value: nativeExecutionApproved === true
          ? 'approved'
          : (nativeExecutionApproved === false ? 'not-approved' : 'host-managed-unknown')
      },
      { id: 'service-health', ok: serviceHealth.ok, value: serviceHealth.url }
    ]
    return redactDoctorOutput({
      ok: true,
      healthy: checks.every((check) => check.id === 'native-execution-approval' ? true : check.ok),
      checks,
      diagnostics,
      serviceHealth,
      hookMode: readHookMode(dataDir),
      nativeExecutionApproved
    })
  })
}

module.exports = {
  checkServiceHealth,
  redactDoctorOutput,
  readDiagnostics,
  toDoctorServiceHealthOutput
}
