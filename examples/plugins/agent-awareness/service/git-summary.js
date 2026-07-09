const childProcess = require('child_process')
const crypto = require('crypto')
const path = require('path')

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex')

const sanitizeText = (value, maxLength = 120) => String(value || '')
  .replace(/\bhttps?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s)]*)?/gi, '[local-url]')
  .replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s)]*)?/gi, '[local-url]')
  .replace(/\[::1\](?::\d+)?(?:\/[^\s)]*)?/gi, '[local-url]')
  .replace(/\bhttps?:\/\/[^\s)]+/gi, '[url]')
  .replace(/\bfile:\/\/[^\s)]+/gi, '[path]')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
  .replace(/(?:\/Users\/|\/private\/|\/tmp\/|\/var\/folders\/|[A-Za-z]:\\)[^\s)]+/g, '[path]')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength)

const toProjectLabel = (rawPath) => {
  const normalized = String(rawPath || '').trim()
  if (!normalized) return ''
  const baseName = sanitizeText(path.basename(normalized), 80) || 'project'
  const hash = sha256(`openpet-agent-project\0${normalized}`).slice(0, 6)
  return `${baseName} #${hash}`
}

const toBoundedInteger = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.min(9999, Math.round(numeric))
}

const normalizeGitSummary = (value = {}) => {
  const source = value?.git && typeof value.git === 'object' ? value.git : value
  if (!source || typeof source !== 'object') return null

  const branch = sanitizeText(source.branch || source.ref || '', 80)
  const dirtyCount = toBoundedInteger(source.dirtyCount ?? source.dirty_count)
  const ahead = toBoundedInteger(source.ahead)
  const behind = toBoundedInteger(source.behind)
  const repository = sanitizeText(source.repository || source.project || source.projectLabel || '', 96)
  const hasDirty = typeof source.dirty === 'boolean'
  const dirty = hasDirty ? source.dirty : dirtyCount > 0

  const normalized = {
    branch,
    dirty,
    dirtyCount,
    ahead,
    behind,
    repository
  }

  return branch || dirty || dirtyCount > 0 || ahead > 0 || behind > 0
    ? normalized
    : null
}

const runGit = ({ cwd, args, spawnSync = childProcess.spawnSync }) => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1500
  })
  if (result.status !== 0) return ''
  return String(result.stdout || '').trim()
}

const parseAheadBehind = (statusHeader = '') => ({
  ahead: toBoundedInteger((statusHeader.match(/ahead\s+(\d+)/i) || [])[1]),
  behind: toBoundedInteger((statusHeader.match(/behind\s+(\d+)/i) || [])[1])
})

const readGitSummary = ({ cwd, spawnSync = childProcess.spawnSync } = {}) => {
  const workingDir = String(cwd || '').trim()
  if (!workingDir) return null
  const inside = runGit({ cwd: workingDir, args: ['rev-parse', '--is-inside-work-tree'], spawnSync })
  if (inside !== 'true') return null

  const branch = runGit({ cwd: workingDir, args: ['branch', '--show-current'], spawnSync }) ||
    runGit({ cwd: workingDir, args: ['rev-parse', '--short', 'HEAD'], spawnSync })
  const root = runGit({ cwd: workingDir, args: ['rev-parse', '--show-toplevel'], spawnSync })
  const statusLines = runGit({ cwd: workingDir, args: ['status', '--porcelain=v1', '--branch'], spawnSync })
    .split(/\r?\n/)
    .filter(Boolean)
  const header = statusLines.find((line) => line.startsWith('##')) || ''
  const dirtyCount = statusLines.filter((line) => !line.startsWith('##')).length
  const remote = parseAheadBehind(header)

  return normalizeGitSummary({
    branch,
    dirty: dirtyCount > 0,
    dirtyCount,
    ahead: remote.ahead,
    behind: remote.behind,
    repository: toProjectLabel(root || workingDir)
  })
}

module.exports = {
  normalizeGitSummary,
  readGitSummary
}
