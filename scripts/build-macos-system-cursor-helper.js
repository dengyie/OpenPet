const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const HELPER_NAME = 'OpenPetSystemCursor'

const resolveSwiftTarget = (arch) => {
  if (arch === 'arm64') return 'arm64-apple-macos12.0'
  if (arch === 'x64') return 'x86_64-apple-macos12.0'
  throw new Error(`Unsupported macOS helper architecture: ${arch}`)
}

const buildMacosSystemCursorHelper = ({
  platform = process.platform,
  arch = process.arch,
  projectRoot = path.resolve(__dirname, '..'),
  execFileSyncImpl = execFileSync
} = {}) => {
  if (platform !== 'darwin') {
    return { built: false, skipped: true, reason: 'unsupported-platform' }
  }

  const sourcePath = path.join(projectRoot, 'native', 'macos-system-cursor', `${HELPER_NAME}.swift`)
  if (!fs.existsSync(sourcePath)) throw new Error(`macOS system cursor helper source is missing: ${sourcePath}`)

  const outputDir = path.join(projectRoot, 'build', 'native', arch)
  const outputPath = path.join(outputDir, HELPER_NAME)
  fs.mkdirSync(outputDir, { recursive: true })

  const sourceModifiedAt = fs.statSync(sourcePath).mtimeMs
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).mtimeMs >= sourceModifiedAt) {
    fs.chmodSync(outputPath, 0o755)
    return { built: false, skipped: true, reason: 'up-to-date', outputPath }
  }

  execFileSyncImpl('xcrun', [
    'swiftc',
    sourcePath,
    '-o', outputPath,
    '-target', resolveSwiftTarget(arch),
    '-framework', 'AppKit',
    '-framework', 'CoreGraphics',
    '-O'
  ], {
    cwd: projectRoot,
    stdio: 'inherit'
  })
  fs.chmodSync(outputPath, 0o755)
  return { built: true, skipped: false, outputPath }
}

const buildMacosSystemCursorHelpers = (options = {}) => {
  const platform = options.platform || process.platform
  if (platform !== 'darwin') {
    return [buildMacosSystemCursorHelper({ ...options, platform })]
  }
  return ['arm64', 'x64'].map((arch) => buildMacosSystemCursorHelper({
    ...options,
    platform,
    arch
  }))
}

if (require.main === module) {
  try {
    const results = buildMacosSystemCursorHelpers()
    const result = results[0]
    if (result.reason === 'unsupported-platform') {
      console.log('OpenPet system cursor helper: skipped on non-macOS host')
    } else {
      for (const entry of results) {
        const state = entry.reason === 'up-to-date' ? 'up to date' : 'built'
        console.log(`OpenPet system cursor helper: ${state} at ${entry.outputPath}`)
      }
    }
  } catch (error) {
    console.error(`OpenPet system cursor helper build failed: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {
  HELPER_NAME,
  buildMacosSystemCursorHelper,
  buildMacosSystemCursorHelpers,
  resolveSwiftTarget
}
