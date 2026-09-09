const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/

const uniqueSorted = (values = []) => [...new Set(values)].sort()

const normalizeIdList = (values = []) => uniqueSorted(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter((value) => SAFE_ID_PATTERN.test(value))
)

const normalizeSha256List = (values = []) => uniqueSorted(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => SHA256_PATTERN.test(value))
)

const normalizeBlocklist = (blocklist = {}) => ({
  pluginIds: normalizeIdList(blocklist.pluginIds),
  packIds: normalizeIdList(blocklist.packIds),
  sha256: normalizeSha256List(blocklist.sha256)
})

const mergeBlocklists = (...blocklists) => normalizeBlocklist(blocklists.reduce((merged, blocklist) => {
  const normalized = normalizeBlocklist(blocklist)
  return {
    pluginIds: [...(merged.pluginIds || []), ...normalized.pluginIds],
    packIds: [...(merged.packIds || []), ...normalized.packIds],
    sha256: [...(merged.sha256 || []), ...normalized.sha256]
  }
}, {}))

const getBlockStatus = ({ kind, id, sha256, sourceSha256, packageHash } = {}, blocklist = {}) => {
  const normalized = normalizeBlocklist(blocklist)
  const reasons = []
  const normalizedId = String(id || '').trim()
  const hashCandidates = uniqueSorted([sha256, sourceSha256, packageHash]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => SHA256_PATTERN.test(value)))

  if (kind === 'plugin' && normalized.pluginIds.includes(normalizedId)) {
    reasons.push(`pluginId:${normalizedId}`)
  }
  if (kind === 'pet-pack' && normalized.packIds.includes(normalizedId)) {
    reasons.push(`packId:${normalizedId}`)
  }
  for (const normalizedHash of hashCandidates) {
    if (normalized.sha256.includes(normalizedHash)) {
      reasons.push(`sha256:${normalizedHash}`)
    }
  }

  return {
    blocked: reasons.length > 0,
    reasons
  }
}

const assertNotBlocked = (candidate, blocklist) => {
  const status = getBlockStatus(candidate, blocklist)
  if (status.blocked) {
    throw new Error(`Ecosystem item is blocked: ${status.reasons.join(', ')}`)
  }
  return status
}

module.exports = {
  SHA256_PATTERN,
  getBlockStatus,
  assertNotBlocked,
  mergeBlocklists,
  normalizeBlocklist
}
