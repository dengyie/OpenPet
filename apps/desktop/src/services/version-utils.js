const parseVersion = (version) => String(version || '')
  .trim()
  .replace(/^v/i, '')
  .split(/[.-]/)
  .slice(0, 3)
  .map((part) => {
    const value = Number.parseInt(part, 10)
    return Number.isFinite(value) ? value : 0
  })

const compareVersions = (left, right) => {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return 1
    if ((a[index] || 0) < (b[index] || 0)) return -1
  }
  return 0
}

module.exports = { compareVersions }
