const DEFAULT_TIMEOUT_MS = 8000

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

const normalizeGithubPublish = (publish) => {
  const entries = Array.isArray(publish) ? publish : [publish]
  const github = entries.find((entry) => entry?.provider === 'github' && entry.owner && entry.repo)
  if (!github) return null
  return {
    provider: 'github',
    owner: String(github.owner),
    repo: String(github.repo),
    channel: String(github.channel || 'latest'),
    url: `https://github.com/${github.owner}/${github.repo}/releases`
  }
}

const createAbortController = () => {
  if (typeof AbortController === 'undefined') return null
  return new AbortController()
}

const createTimeoutError = () => {
  const error = new Error('Update check timed out.')
  error.name = 'AbortError'
  return error
}

const withTimeout = async (promise, controller, timeoutMs) => {
  let timer = null
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller?.abort()
      reject(createTimeoutError())
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

const hasPlatformToken = (assetName, tokens) => {
  const lowerName = String(assetName || '').toLowerCase()
  return tokens.some((token) => new RegExp(`(^|[-_.\\s])${token}([-_.\\s]|$)`, 'i').test(lowerName))
}

const inferAssetPlatform = (assetName) => {
  if (hasPlatformToken(assetName, ['darwin', 'mac', 'macos'])) return 'darwin'
  if (hasPlatformToken(assetName, ['win', 'win32', 'windows'])) return 'win32'
  return ''
}

const isInstallAssetForPlatform = (assetName, platform) => {
  if (/\.blockmap$/i.test(assetName) || /^latest(?:-mac)?\.ya?ml$/i.test(assetName)) return false

  const assetPlatform = inferAssetPlatform(assetName)
  if (platform === 'darwin') {
    if (assetPlatform && assetPlatform !== 'darwin') return false
    return /\.dmg$/i.test(assetName) || /\.zip$/i.test(assetName)
  }
  if (platform === 'win32') {
    if (assetPlatform && assetPlatform !== 'win32') return false
    return /\.exe$/i.test(assetName) || /\.zip$/i.test(assetName)
  }

  return !assetPlatform && /\.zip$/i.test(assetName)
}

const selectInstallAssets = (assets = [], platform = process.platform) => assets
  .filter((asset) => typeof asset?.name === 'string' && typeof asset?.browser_download_url === 'string')
  .filter((asset) => isInstallAssetForPlatform(asset.name, platform))
  .map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
    size: Number(asset.size || 0)
  }))

const createAboutService = ({ app, packageJson, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, platform = process.platform, arch = process.arch } = {}) => {
  if (!app) throw new Error('app is required')
  const pkg = packageJson || {}
  const publish = normalizeGithubPublish(pkg.build?.publish)

  const getInfo = () => ({
    name: pkg.name || app.getName?.() || 'openpet',
    productName: pkg.build?.productName || app.getName?.() || pkg.name || 'OpenPet',
    version: app.getVersion?.() || pkg.version || '0.0.0',
    packaged: Boolean(app.isPackaged),
    platform,
    arch,
    update: publish
      ? {
          configured: true,
          provider: publish.provider,
          owner: publish.owner,
          repo: publish.repo,
          channel: publish.channel,
          url: publish.url
        }
      : {
          configured: false,
          provider: '',
          channel: '',
          url: ''
        }
  })

  const checkForUpdates = async () => {
    const info = getInfo()
    if (!publish) {
      return {
        status: 'not-configured',
        configured: false,
        currentVersion: info.version,
        latestVersion: '',
        updateAvailable: false,
        checkedAt: new Date().toISOString(),
        message: 'Update feed is not configured.'
      }
    }
    if (typeof fetchImpl !== 'function') {
      return {
        status: 'unavailable',
        configured: true,
        currentVersion: info.version,
        latestVersion: '',
        updateAvailable: false,
        checkedAt: new Date().toISOString(),
        message: 'Network fetch is not available in this runtime.'
      }
    }

    const controller = createAbortController()
    const url = `https://api.github.com/repos/${encodeURIComponent(publish.owner)}/${encodeURIComponent(publish.repo)}/releases/latest`
    const checkedAt = new Date().toISOString()
    try {
      const response = await withTimeout(fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `${pkg.name || 'openpet'}-update-check`
        },
        signal: controller?.signal
      }), controller, timeoutMs)

      if (!response?.ok) {
        return {
          status: 'error',
          configured: true,
          currentVersion: info.version,
          latestVersion: '',
          updateAvailable: false,
          checkedAt,
          message: `Update check failed with HTTP ${response?.status || 'unknown'}.`
        }
      }

      const release = await response.json()
      const latestVersion = String(release?.tag_name || release?.name || '').replace(/^v/i, '')
      const updateAvailable = latestVersion ? compareVersions(latestVersion, info.version) > 0 : false
      return {
        status: 'ok',
        configured: true,
        currentVersion: info.version,
        latestVersion,
        updateAvailable,
        prerelease: Boolean(release?.prerelease),
        releaseUrl: typeof release?.html_url === 'string' ? release.html_url : publish.url,
        assets: selectInstallAssets(release?.assets, platform),
        checkedAt,
        message: updateAvailable ? 'A newer version is available.' : 'You are on the latest version.'
      }
    } catch (error) {
      return {
        status: error?.name === 'AbortError' ? 'timeout' : 'error',
        configured: true,
        currentVersion: info.version,
        latestVersion: '',
        updateAvailable: false,
        checkedAt,
        message: error?.name === 'AbortError' ? 'Update check timed out.' : (error?.message || 'Update check failed.')
      }
    }
  }

  return {
    getInfo,
    checkForUpdates
  }
}

module.exports = { createAboutService, compareVersions, normalizeGithubPublish }
