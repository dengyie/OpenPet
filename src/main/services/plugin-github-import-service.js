const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { cancelResponseBodyQuietly, readBoundedResponseBuffer } = require('./bounded-response-body')
const zipArchiveUtils = require('./zip-archive-utils')

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024

const createAbortController = () => (typeof AbortController === 'undefined' ? null : new AbortController())

const withTimeout = async (promise, { controller, timeoutMs, message }) => {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message)
      controller?.abort?.(error)
      reject(error)
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
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

const extractArchiveToTemp = ({ archivePath, tempRoot, limits }) => zipArchiveUtils.extractZipToTemp(archivePath, {
  subject: 'Plugin package',
  folderSubject: 'Plugin',
  tempPrefix: 'openpet-github-plugin-extract-',
  tempRoot,
  limits
})

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
  zipLimits = {},
  extractArchive = extractArchiveToTemp
}) => {
  if (!pluginInstallService?.inspectPluginPackage) throw new Error('pluginInstallService.inspectPluginPackage is required')
  if (typeof fetchImpl !== 'function') throw new Error('GitHub repository import is not available')
  const limits = { ...zipArchiveUtils.DEFAULT_ZIP_LIMITS, ...zipLimits }

  const lookupDefaultBranch = async ({ owner, repo }) => {
    const controller = createAbortController()
    const errorMessage = 'Unable to read the repository default branch. Check that the repository exists and is publicly accessible.'
    return withTimeout((async () => {
      const response = await fetchImpl(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller?.signal
      })
      if (!response?.ok) {
        cancelResponseBodyQuietly(response)
        throw new Error(errorMessage)
      }
      const payload = JSON.parse((await readBoundedResponseBuffer(response, {
        maxBytes: 1024 * 1024,
        sizeErrorMessage: 'GitHub repository metadata exceeds the configured byte limit',
        controller
      })).toString('utf8').replace(/^\uFEFF/, ''))
      const defaultBranch = String(payload?.default_branch || '').trim()
      if (!defaultBranch) throw new Error(errorMessage)
      return defaultBranch
    })(), { controller, timeoutMs: archiveTimeoutMs, message: errorMessage })
  }

  const downloadArchive = async ({ owner, repo, defaultBranch }) => {
    const archiveUrl = `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zip/refs/heads/${encodeURIComponent(defaultBranch)}`
    const controller = createAbortController()
    const response = await withTimeout(fetchImpl(archiveUrl, {
      method: 'GET',
      headers: { Accept: 'application/octet-stream' },
      signal: controller?.signal
    }), { controller, timeoutMs: archiveTimeoutMs, message: 'Failed to download the repository source archive' })
    if (!response?.ok) {
      cancelResponseBodyQuietly(response)
      throw new Error('Failed to download the repository source archive')
    }
    const buffer = await withTimeout(readBoundedResponseBuffer(response, {
      maxBytes: maxArchiveBytes,
      sizeErrorMessage: `GitHub repository archive exceeds ${maxArchiveBytes} bytes`,
      controller
    }), {
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
    try {
      const requestedExtractRoot = path.join(downloaded.cleanupPath, 'extract')
      const extractRoot = await extractArchive({
        archivePath: downloaded.archivePath,
        extractRoot: requestedExtractRoot,
        tempRoot: downloaded.cleanupPath,
        limits
      }) || requestedExtractRoot
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
