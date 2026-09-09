/**
 * 共享 ZIP 加固模块 —— 插件包与宠物包导入共用的解压安全策略。
 *
 * 统一覆盖：路径穿越、绝对路径、Windows 盘符、软链接条目、加密条目、
 * zip 炸弹（条目数 / 展开体积 / 单文件体积 / 压缩比）与解压超时。
 * 各服务通过 subject 参数保持自己的错误文案（"Plugin package ..." / "Pet pack package ..."）。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Transform } = require('stream')
const { pipeline } = require('stream/promises')
const yauzl = require('yauzl')
const yazl = require('yazl')

const SAFE_ZIP_ENTRY_PATTERN = /^[^/\\\0][^\\\0]*$/

const DEFAULT_ZIP_LIMITS = Object.freeze({
  maxEntries: 1000,
  maxExpandedBytes: 100 * 1024 * 1024,
  maxFileBytes: 25 * 1024 * 1024,
  maxCompressionRatio: 100,
  timeoutMs: 15000
})

const assertSafeZipEntry = (entryName, { subject = 'Archive' } = {}) => {
  if (
    !SAFE_ZIP_ENTRY_PATTERN.test(entryName) ||
    path.isAbsolute(entryName) ||
    /^[a-zA-Z]:[\\/]/.test(entryName) ||
    entryName.split('/').includes('..')
  ) {
    throw new Error(`${subject} contains unsafe paths`)
  }
}

const assertNoSymlinks = (rootPath, { subject = 'Archive' } = {}) => {
  if (fs.lstatSync(rootPath).isSymbolicLink()) {
    throw new Error(`${subject} folders must not contain symlinks`)
  }

  const walk = (currentPath) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      const stats = fs.lstatSync(entryPath)
      if (stats.isSymbolicLink()) throw new Error(`${subject} folders must not contain symlinks`)
      if (stats.isDirectory()) walk(entryPath)
    }
  }
  walk(rootPath)
}

const getUnixFileType = (entry) => {
  const platform = (Number(entry.versionMadeBy) >>> 8) & 0xff
  if (platform !== 3) return 0
  return (Number(entry.externalFileAttributes) >>> 16) & 0o170000
}

const isUnsupportedLinkEntry = (entry) => {
  const fileType = getUnixFileType(entry)
  return fileType !== 0 && fileType !== 0o040000 && fileType !== 0o100000
}

const closeZipQuietly = (zipFile) => {
  try {
    zipFile?.close?.()
  } catch (_) {}
}

const normalizeZipError = (error, subject) => {
  if (/invalid relative path|absolute path|backslash/i.test(String(error?.message || ''))) {
    return new Error(`${subject} contains unsafe paths`)
  }
  return error
}

const openZipArchive = (zipPath) => yauzl.openPromise(zipPath, {
  autoClose: false,
  decodeStrings: true,
  strictFileNames: true,
  validateEntrySizes: true
})

const inspectZipArchive = async ({ zipPath, signal, subject = 'Archive', limits = null }) => {
  if (signal?.aborted) throw signal.reason || new Error(`${subject} inspection aborted`)
  const zipFile = await openZipArchive(zipPath)
  const abort = () => closeZipQuietly(zipFile)
  signal?.addEventListener?.('abort', abort, { once: true })
  const entries = []
  try {
    for await (const entry of zipFile.eachEntry()) {
      if (signal?.aborted) throw signal.reason || new Error(`${subject} inspection aborted`)
      entries.push({
        name: entry.fileName,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        isLink: isUnsupportedLinkEntry(entry),
        encrypted: entry.isEncrypted()
      })
      if (limits?.maxEntries && entries.length > limits.maxEntries) {
        throw new Error(`${subject} exceeds ZIP entry count limit`)
      }
    }
    return entries
  } catch (error) {
    throw normalizeZipError(error, subject)
  } finally {
    signal?.removeEventListener?.('abort', abort)
    closeZipQuietly(zipFile)
  }
}

const resolveEntryDestination = (destination, entryName, subject = 'Archive') => {
  assertSafeZipEntry(entryName, { subject })
  const root = path.resolve(destination)
  const targetPath = path.resolve(root, ...entryName.split('/'))
  const relative = path.relative(root, targetPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${subject} contains unsafe paths`)
  }
  return targetPath
}

const extractZipArchive = async ({
  zipPath,
  destination,
  signal,
  subject = 'Archive',
  limits = DEFAULT_ZIP_LIMITS
}) => {
  if (signal?.aborted) throw signal.reason || new Error(`${subject} extraction aborted`)
  const zipFile = await openZipArchive(zipPath)
  let activeStream = null
  const abort = () => {
    activeStream?.destroy?.(signal.reason)
    closeZipQuietly(zipFile)
  }
  signal?.addEventListener?.('abort', abort, { once: true })
  const extractedPaths = new Set()
  let expandedBytes = 0
  try {
    for await (const entry of zipFile.eachEntry()) {
      if (signal?.aborted) throw signal.reason || new Error(`${subject} extraction aborted`)
      const entryName = entry.fileName
      const targetPath = resolveEntryDestination(destination, entryName, subject)
      const normalizedTarget = process.platform === 'win32' ? targetPath.toLowerCase() : targetPath
      if (extractedPaths.has(normalizedTarget)) throw new Error(`${subject} contains duplicate paths`)
      extractedPaths.add(normalizedTarget)
      if (entry.isEncrypted()) throw new Error(`Encrypted ${subject.toLowerCase()}s are not supported`)
      if (isUnsupportedLinkEntry(entry)) throw new Error(`${subject} must not contain links`)
      assertArchiveLimits([{
        name: entryName,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        isLink: false,
        encrypted: false
      }], { ...limits, maxEntries: 1, maxExpandedBytes: limits.maxFileBytes }, { subject })
      if (entryName.endsWith('/')) {
        fs.mkdirSync(targetPath, { recursive: true })
        continue
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      activeStream = await zipFile.openReadStreamPromise(entry)
      let fileBytes = 0
      const limiter = new Transform({
        transform (chunk, encoding, callback) {
          fileBytes += chunk.byteLength
          expandedBytes += chunk.byteLength
          if (fileBytes > limits.maxFileBytes) return callback(new Error(`${subject} exceeds ZIP single file size limit`))
          if (expandedBytes > limits.maxExpandedBytes) return callback(new Error(`${subject} exceeds ZIP expanded size limit`))
          callback(null, chunk)
        }
      })
      await pipeline(activeStream, limiter, fs.createWriteStream(targetPath, { flags: 'wx' }), { signal })
      activeStream = null
    }
  } catch (error) {
    throw normalizeZipError(error, subject)
  } finally {
    activeStream?.destroy?.()
    signal?.removeEventListener?.('abort', abort)
    closeZipQuietly(zipFile)
  }
}

const assertArchiveLimits = (entries, limits, { subject = 'Archive' } = {}) => {
  if (entries.length > limits.maxEntries) throw new Error(`${subject} exceeds ZIP entry count limit`)
  let expandedBytes = 0
  const normalizedNames = new Set()
  for (const entry of entries) {
    assertSafeZipEntry(entry.name, { subject })
    const normalizedName = process.platform === 'win32' ? entry.name.toLowerCase() : entry.name
    if (normalizedNames.has(normalizedName)) throw new Error(`${subject} contains duplicate paths`)
    normalizedNames.add(normalizedName)
    if (entry.isLink) throw new Error(`${subject} must not contain links`)
    if (entry.encrypted) throw new Error(`Encrypted ${subject.toLowerCase()}s are not supported`)
    if (!Number.isFinite(entry.uncompressedSize) || !Number.isFinite(entry.compressedSize)) {
      throw new Error(`${subject} metadata is invalid`)
    }
    if (entry.uncompressedSize > limits.maxFileBytes) throw new Error(`${subject} exceeds ZIP single file size limit`)
    expandedBytes += entry.uncompressedSize
    if (expandedBytes > limits.maxExpandedBytes) throw new Error(`${subject} exceeds ZIP expanded size limit`)
    const ratio = entry.compressedSize > 0 ? entry.uncompressedSize / entry.compressedSize : (entry.uncompressedSize > 0 ? Infinity : 1)
    if (ratio > limits.maxCompressionRatio) throw new Error(`${subject} exceeds ZIP compression ratio limit`)
  }
}

const runArchiveOperation = async (operation, timeoutMs, { subject = 'Archive' } = {}) => {
  const controller = new AbortController()
  let timeoutId
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${subject} extraction timed out`)
      controller.abort(error)
      reject(error)
    }, timeoutMs)
    timeoutId.unref?.()
  })
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

const extractZipToTemp = async (zipPath, {
  subject = 'Archive',
  folderSubject = subject,
  tempPrefix = 'openpet-archive-',
  tempRoot = os.tmpdir(),
  limits = DEFAULT_ZIP_LIMITS,
  inspectArchive = inspectZipArchive,
  extractArchive = extractZipArchive
} = {}) => {
  if (!fs.existsSync(zipPath)) throw new Error(`${subject} does not exist`)
  const entries = await runArchiveOperation(
    (signal) => inspectArchive({ zipPath, timeoutMs: limits.timeoutMs, signal, subject, limits }),
    limits.timeoutMs,
    { subject }
  )
  assertArchiveLimits(entries, limits, { subject })
  const stagingPath = fs.mkdtempSync(path.join(tempRoot, tempPrefix))
  try {
    await runArchiveOperation(
      (signal) => extractArchive({ zipPath, destination: stagingPath, timeoutMs: limits.timeoutMs, signal, subject, limits }),
      limits.timeoutMs,
      { subject }
    )
    assertNoSymlinks(stagingPath, { subject: folderSubject })
    return stagingPath
  } catch (error) {
    fs.rmSync(stagingPath, { recursive: true, force: true })
    throw error
  }
}

const listDirectoryEntries = (rootPath, currentPath = rootPath, entries = []) => {
  for (const dirent of fs.readdirSync(currentPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(currentPath, dirent.name)
    const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/')
    const stats = fs.lstatSync(absolutePath)
    if (stats.isSymbolicLink()) throw new Error('Archive source folders must not contain symlinks')
    if (stats.isDirectory()) {
      entries.push({ absolutePath, relativePath: `${relativePath}/`, directory: true, stats })
      listDirectoryEntries(rootPath, absolutePath, entries)
    } else if (stats.isFile()) {
      entries.push({ absolutePath, relativePath, directory: false, stats })
    } else {
      throw new Error('Archive source folders must contain only regular files and directories')
    }
  }
  return entries
}

const writeZipFromDirectory = async (sourceDir, outputPath) => {
  const zipFile = new yazl.ZipFile()
  fs.rmSync(outputPath, { force: true })
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  for (const entry of listDirectoryEntries(sourceDir)) {
    if (entry.directory) {
      zipFile.addEmptyDirectory(entry.relativePath, { mtime: entry.stats.mtime, mode: entry.stats.mode })
    } else {
      zipFile.addFile(entry.absolutePath, entry.relativePath, { mtime: entry.stats.mtime, mode: entry.stats.mode })
    }
  }
  const output = fs.createWriteStream(outputPath, { flags: 'wx' })
  try {
    const completed = pipeline(zipFile.outputStream, output)
    zipFile.end()
    await completed
  } catch (error) {
    fs.rmSync(outputPath, { force: true })
    throw error
  }
}

module.exports = {
  DEFAULT_ZIP_LIMITS,
  SAFE_ZIP_ENTRY_PATTERN,
  assertArchiveLimits,
  assertNoSymlinks,
  assertSafeZipEntry,
  extractZipArchive,
  extractZipToTemp,
  inspectZipArchive,
  runArchiveOperation,
  writeZipFromDirectory
}
