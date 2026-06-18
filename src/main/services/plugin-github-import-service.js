const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024

const createAbortController = () => (typeof AbortController === 'undefined' ? null : new AbortController())

const withTimeout = async (promise, { controller, timeoutMs, message }) => {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort?.()
      reject(new Error(message))
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

const readResponseBuffer = async (response, maxBytes) => {
  const contentLength = Number(response.headers?.get?.('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`GitHub repository archive exceeds ${maxBytes} bytes`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > maxBytes) throw new Error(`GitHub repository archive exceeds ${maxBytes} bytes`)
  return buffer
}

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const validateRepositoryUrl = (repositoryUrl) => {
  let parsed
  try {
    parsed = new URL(String(repositoryUrl || '').trim())
  } catch (_) {
    throw new Error('Please enter a GitHub repository homepage URL')
  }

  const pathname = parsed.pathname.endsWith('/')
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname
  const segments = pathname.split('/').filter(Boolean)

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.search ||
    parsed.hash ||
    segments.length !== 2
  ) {
    throw new Error('Please enter a GitHub repository homepage URL')
  }

  return {
    owner: segments[0],
    repo: segments[1],
    repositoryUrl: `https://github.com/${segments[0]}/${segments[1]}`
  }
}

const extractArchiveToTemp = ({ archivePath, extractRoot }) => {
  execFileSync('unzip', ['-qq', archivePath, '-d', extractRoot])
  return extractRoot
}

const findRepositoryRoot = (extractRoot) => {
  const candidates = fs.readdirSync(extractRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(extractRoot, entry.name))

  if (candidates.length !== 1) {
    throw new Error('Failed to locate the repository root in the downloaded archive')
  }

  const repositoryRoot = candidates[0]
  if (!fs.existsSync(path.join(repositoryRoot, 'plugin.json'))) {
    throw new Error('This GitHub repository is not supported yet. plugin.json must exist at the repository root.')
  }
  return repositoryRoot
}

const createPluginGithubImportService = ({
  pluginInstallService,
  fetchImpl = globalThis.fetch,
  tempRoot = os.tmpdir(),
  archiveTimeoutMs = 15000,
  maxArchiveBytes = MAX_ARCHIVE_BYTES,
  extractArchive = extractArchiveToTemp
}) => {
  if (!pluginInstallService?.inspectPluginPackage) throw new Error('pluginInstallService.inspectPluginPackage is required')
  if (typeof fetchImpl !== 'function') throw new Error('GitHub repository import is not available')

  const lookupDefaultBranch = async ({ owner, repo }) => {
    const controller = createAbortController()
    const response = await withTimeout(fetchImpl(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller?.signal
    }), { controller, timeoutMs: archiveTimeoutMs, message: 'Unable to read the repository default branch. Check that the repository exists and is publicly accessible.' })
    if (!response?.ok) {
      throw new Error('Unable to read the repository default branch. Check that the repository exists and is publicly accessible.')
    }
    const payload = await response.json()
    const defaultBranch = String(payload?.default_branch || '').trim()
    if (!defaultBranch) {
      throw new Error('Unable to read the repository default branch. Check that the repository exists and is publicly accessible.')
    }
    return defaultBranch
  }

  const downloadArchive = async ({ owner, repo, defaultBranch }) => {
    const archiveUrl = `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zip/refs/heads/${encodeURIComponent(defaultBranch)}`
    const controller = createAbortController()
    const response = await withTimeout(fetchImpl(archiveUrl, {
      method: 'GET',
      headers: { Accept: 'application/octet-stream' },
      signal: controller?.signal
    }), { controller, timeoutMs: archiveTimeoutMs, message: 'Failed to download the repository source archive' })
    if (!response?.ok) throw new Error('Failed to download the repository source archive')
    const buffer = await withTimeout(readResponseBuffer(response, maxArchiveBytes), {
      controller,
      timeoutMs: archiveTimeoutMs,
      message: 'Failed to download the repository source archive'
    })

    const downloadDir = fs.mkdtempSync(path.join(tempRoot, 'openpet-github-plugin-import-'))
    const archivePath = path.join(downloadDir, 'repository.zip')
    fs.writeFileSync(archivePath, buffer)
    return {
      archivePath,
      archiveUrl,
      archiveSha256: hashBuffer(buffer),
      cleanupPath: downloadDir
    }
  }

  const inspectRepositoryUrl = async (repositoryUrl) => {
    const { owner, repo } = validateRepositoryUrl(repositoryUrl)
    const defaultBranch = await lookupDefaultBranch({ owner, repo })
    const downloaded = await downloadArchive({ owner, repo, defaultBranch })
    const extractRoot = path.join(downloaded.cleanupPath, 'extract')

    try {
      extractArchive({ archivePath: downloaded.archivePath, extractRoot })
      const repositoryRoot = findRepositoryRoot(extractRoot)
      return pluginInstallService.inspectPluginPackage(repositoryRoot, {
        sourceType: 'github',
        cleanupPath: downloaded.cleanupPath
      })
    } catch (error) {
      fs.rmSync(downloaded.cleanupPath, { recursive: true, force: true })
      throw error
    }
  }

  return {
    inspectRepositoryUrl,
    validateRepositoryUrl
  }
}

module.exports = {
  createPluginGithubImportService,
  validateRepositoryUrl
}
