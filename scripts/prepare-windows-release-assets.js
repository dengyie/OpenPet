const fs = require('fs')
const path = require('path')

const WINDOWS_ARTIFACT_RE = /\.(exe|zip|blockmap)$/i

const hasPlatformToken = (fileName, tokens) => {
  const lowerName = String(fileName || '').toLowerCase()
  return tokens.some((token) => new RegExp(`(^|[-_.\\s])${token}([-_.\\s]|$)`).test(lowerName))
}

const hasMacToken = (fileName) => hasPlatformToken(fileName, ['darwin', 'mac', 'macos'])
const hasWindowsToken = (fileName) => hasPlatformToken(fileName, ['win', 'win32', 'windows'])

const isWindowsArtifact = (fileName) => {
  if (fileName === 'latest.yml') return true
  if (!WINDOWS_ARTIFACT_RE.test(fileName)) return false
  if (/\.exe(?:\.blockmap)?$/i.test(fileName)) return true
  if (hasMacToken(fileName)) return false
  return hasWindowsToken(fileName) || /\.(zip|blockmap)$/i.test(fileName)
}

const hasUnsignedMarker = (fileName) => /(^|[-_.])unsigned([-_.]|$)/i.test(fileName)

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const insertReleaseMarker = (fileName, marker = 'unsigned') => {
  if (!['unsigned', 'self-signed'].includes(marker)) throw new Error('marker must be unsigned or self-signed')
  if (hasUnsignedMarker(fileName) || /(^|[-_.])self-signed([-_.]|$)/i.test(fileName)) return fileName
  if (/\.blockmap$/i.test(fileName)) {
    return fileName.replace(/\.blockmap$/i, `-${marker}.blockmap`)
  }
  return fileName.replace(/(\.[^.]+)$/i, `-${marker}$1`)
}

const renameWindowsReleaseAssets = ({ releaseDir, marker = 'unsigned', dryRun = false } = {}) => {
  if (!releaseDir) throw new Error('releaseDir is required')
  if (!fs.existsSync(releaseDir)) throw new Error(`Release directory not found: ${releaseDir}`)

  const entries = fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isWindowsArtifact)
    .sort((a, b) => a.localeCompare(b))

  const renames = []
  for (const fileName of entries) {
    if (fileName === 'latest.yml') continue
    const nextName = insertReleaseMarker(fileName, marker)
    if (nextName === fileName) continue

    const from = path.join(releaseDir, fileName)
    const to = path.join(releaseDir, nextName)
    if (fs.existsSync(to)) throw new Error(`Cannot rename ${fileName}: ${nextName} already exists`)
    renames.push({ from, to, fromName: fileName, toName: nextName })
  }

  for (const rename of renames) {
    if (!dryRun) fs.renameSync(rename.from, rename.to)
  }

  const feedPath = path.join(releaseDir, 'latest.yml')
  let feedUpdated = false
  if (fs.existsSync(feedPath) && renames.length > 0) {
    let feed = fs.readFileSync(feedPath, 'utf-8')
    const replacements = new Map(renames.map((rename) => [rename.fromName, rename.toName]))
    const namePattern = renames
      .map((rename) => rename.fromName)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|')

    feed = feed.replace(new RegExp(namePattern, 'g'), (match) => replacements.get(match) || match)
    if (!dryRun) fs.writeFileSync(feedPath, feed)
    feedUpdated = true
  }

  return {
    releaseDir,
    renamed: renames.map(({ fromName, toName }) => ({ from: fromName, to: toName })),
    feedUpdated
  }
}

const main = () => {
  const args = process.argv.slice(2)
  const markerIndex = args.indexOf('--self-signed')
  const marker = markerIndex >= 0 ? 'self-signed' : 'unsigned'
  if (markerIndex >= 0) args.splice(markerIndex, 1)
  if (args.some((arg) => arg.startsWith('--'))) throw new Error('Unexpected argument')
  const releaseDir = args[0] || path.join(__dirname, '..', 'release')
  const result = renameWindowsReleaseAssets({ releaseDir, marker })

  if (result.renamed.length === 0) {
    console.log(`No ${marker} Windows release assets needed renaming.`)
    return
  }

  for (const item of result.renamed) {
    console.log(`Renamed ${item.from} -> ${item.to}`)
  }
  if (result.feedUpdated) console.log('Updated latest.yml asset references.')
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

module.exports = {
  insertReleaseMarker,
  renameWindowsReleaseAssets
}
