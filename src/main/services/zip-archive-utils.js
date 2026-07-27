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
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

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

const inspectZipArchive = async ({ zipPath, timeoutMs, signal, subject = 'Archive' }) => {
  const options = { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, signal }
  const [{ stdout: namesOutput }, { stdout: verboseOutput }] = await Promise.all([
    execFileAsync('unzip', ['-Z1', zipPath], options),
    execFileAsync('unzip', ['-Z', '-v', zipPath], options)
  ])
  const names = namesOutput.split(/\r?\n/).filter(Boolean)
  const blocks = verboseOutput.split(/Central directory entry #\d+:/).slice(1)
  if (blocks.length !== names.length) throw new Error(`${subject} metadata is inconsistent`)
  return names.map((name, index) => {
    const block = blocks[index]
    const compressedSize = Number(block.match(/^\s*compressed size:\s+(\d+) bytes/m)?.[1])
    const uncompressedSize = Number(block.match(/^\s*uncompressed size:\s+(\d+) bytes/m)?.[1])
    const unixAttributes = block.match(/^\s*Unix file attributes \([^)]*\):\s*(.+)$/m)?.[1] || ''
    return {
      name,
      compressedSize,
      uncompressedSize,
      isLink: unixAttributes.trim().startsWith('l'),
      encrypted: !/^\s*file security status:\s+not encrypted$/m.test(block)
    }
  })
}

const extractZipArchive = async ({ zipPath, destination, timeoutMs, signal }) => {
  await execFileAsync('unzip', ['-qq', zipPath, '-d', destination], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    signal
  })
}

const assertArchiveLimits = (entries, limits, { subject = 'Archive' } = {}) => {
  if (entries.length > limits.maxEntries) throw new Error(`${subject} exceeds ZIP entry count limit`)
  let expandedBytes = 0
  for (const entry of entries) {
    assertSafeZipEntry(entry.name, { subject })
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
      controller.abort()
      reject(new Error(`${subject} extraction timed out`))
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
  limits = DEFAULT_ZIP_LIMITS,
  inspectArchive = inspectZipArchive,
  extractArchive = extractZipArchive
} = {}) => {
  if (!fs.existsSync(zipPath)) throw new Error(`${subject} does not exist`)
  const entries = await runArchiveOperation(
    (signal) => inspectArchive({ zipPath, timeoutMs: limits.timeoutMs, signal, subject }),
    limits.timeoutMs,
    { subject }
  )
  assertArchiveLimits(entries, limits, { subject })
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix))
  try {
    await runArchiveOperation(
      (signal) => extractArchive({ zipPath, destination: tempRoot, timeoutMs: limits.timeoutMs, signal }),
      limits.timeoutMs,
      { subject }
    )
    assertNoSymlinks(tempRoot, { subject: folderSubject })
    return tempRoot
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
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
  runArchiveOperation
}
