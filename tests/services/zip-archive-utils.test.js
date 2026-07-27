/**
 * 共享 zip-archive-utils 回归。
 *
 * 插件安装与宠物包导入都依赖此模块的路径/限制/超时策略；
 * 这里直接锁定核心契约，避免只靠消费方间接覆盖时漏改。
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  DEFAULT_ZIP_LIMITS,
  assertArchiveLimits,
  assertNoSymlinks,
  assertSafeZipEntry,
  extractZipToTemp,
  runArchiveOperation
} = require('../../src/main/services/zip-archive-utils')

const tightLimits = Object.freeze({
  maxEntries: 2,
  maxExpandedBytes: 20,
  maxFileBytes: 12,
  maxCompressionRatio: 5,
  timeoutMs: 50
})

test('DEFAULT_ZIP_LIMITS stay finite and positive', () => {
  assert.ok(DEFAULT_ZIP_LIMITS.maxEntries > 0)
  assert.ok(DEFAULT_ZIP_LIMITS.maxExpandedBytes > 0)
  assert.ok(DEFAULT_ZIP_LIMITS.maxFileBytes > 0)
  assert.ok(DEFAULT_ZIP_LIMITS.maxCompressionRatio > 0)
  assert.ok(DEFAULT_ZIP_LIMITS.timeoutMs > 0)
})

test('assertSafeZipEntry rejects traversal, absolute, and drive-letter paths', () => {
  assert.throws(() => assertSafeZipEntry('../evil.txt'), /unsafe paths/)
  assert.throws(() => assertSafeZipEntry('/etc/passwd'), /unsafe paths/)
  assert.throws(() => assertSafeZipEntry('C:/Windows/system32'), /unsafe paths/)
  assert.throws(() => assertSafeZipEntry('nested/../../escape.txt'), /unsafe paths/)
  assert.doesNotThrow(() => assertSafeZipEntry('plugin.json'))
  assert.doesNotThrow(() => assertSafeZipEntry('assets/icon.png'))
})

test('assertArchiveLimits enforces entry, size, and compression bounds', () => {
  assert.throws(
    () => assertArchiveLimits(
      [
        { name: 'a', uncompressedSize: 1, compressedSize: 1 },
        { name: 'b', uncompressedSize: 1, compressedSize: 1 },
        { name: 'c', uncompressedSize: 1, compressedSize: 1 }
      ],
      tightLimits,
      { subject: 'Plugin package' }
    ),
    /entry count/
  )

  assert.throws(
    () => assertArchiveLimits(
      [{ name: 'large', uncompressedSize: 13, compressedSize: 13 }],
      tightLimits,
      { subject: 'Plugin package' }
    ),
    /single file/
  )

  assert.throws(
    () => assertArchiveLimits(
      [
        { name: 'a', uncompressedSize: 11, compressedSize: 11 },
        { name: 'b', uncompressedSize: 10, compressedSize: 10 }
      ],
      tightLimits,
      { subject: 'Plugin package' }
    ),
    /expanded size/
  )

  assert.throws(
    () => assertArchiveLimits(
      [{ name: 'ratio', uncompressedSize: 12, compressedSize: 1 }],
      tightLimits,
      { subject: 'Plugin package' }
    ),
    /compression ratio/
  )

  assert.throws(
    () => assertArchiveLimits(
      [{ name: '../escape', uncompressedSize: 1, compressedSize: 1 }],
      tightLimits
    ),
    /unsafe paths/
  )

  assert.throws(
    () => assertArchiveLimits(
      [{ name: 'link', uncompressedSize: 1, compressedSize: 1, isLink: true }],
      tightLimits
    ),
    /must not contain links/
  )

  assert.throws(
    () => assertArchiveLimits(
      [{ name: 'secret', uncompressedSize: 1, compressedSize: 1, encrypted: true }],
      tightLimits,
      { subject: 'Plugin package' }
    ),
    /Encrypted plugin package/
  )

  assert.doesNotThrow(() => assertArchiveLimits(
    [{ name: 'ok', uncompressedSize: 4, compressedSize: 2 }],
    tightLimits
  ))
})

test('assertNoSymlinks rejects root and nested symbolic links', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-zip-symlink-'))
  try {
    const target = path.join(dir, 'target.txt')
    fs.writeFileSync(target, 'ok')
    const nested = path.join(dir, 'nested')
    fs.mkdirSync(nested)
    fs.symlinkSync(target, path.join(nested, 'linked.txt'))
    assert.throws(() => assertNoSymlinks(dir), /must not contain symlinks/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('runArchiveOperation aborts hung work and surfaces a timeout error', async () => {
  await assert.rejects(
    runArchiveOperation(
      (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }),
      20,
      { subject: 'Plugin package' }
    ),
    /timed out/
  )
})

test('extractZipToTemp rejects missing archives before staging', async () => {
  await assert.rejects(
    extractZipToTemp(path.join(os.tmpdir(), `missing-${Date.now()}.zip`), {
      subject: 'Plugin package'
    }),
    /does not exist/
  )
})

test('extractZipToTemp cleans staging when extraction fails after inspection', async () => {
  const zipRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-zip-utils-'))
  const zipPath = path.join(zipRoot, 'fixture.zip')
  fs.writeFileSync(zipPath, 'fixture')
  let stagedPath = ''

  await assert.rejects(
    extractZipToTemp(zipPath, {
      subject: 'Plugin package',
      tempPrefix: 'openpet-zip-utils-stage-',
      limits: { ...tightLimits, timeoutMs: 200 },
      inspectArchive: async () => [{ name: 'plugin.json', uncompressedSize: 4, compressedSize: 2 }],
      extractArchive: async ({ destination }) => {
        stagedPath = destination
        fs.mkdirSync(destination, { recursive: true })
        throw new Error('extract boom')
      }
    }),
    /extract boom/
  )

  assert.ok(stagedPath)
  assert.equal(fs.existsSync(stagedPath), false)
})

test('extractZipToTemp returns a populated staging directory on success', async () => {
  const zipRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-zip-utils-ok-'))
  const zipPath = path.join(zipRoot, 'fixture.zip')
  fs.writeFileSync(zipPath, 'fixture')
  let stagedPath = ''

  try {
    stagedPath = await extractZipToTemp(zipPath, {
      subject: 'Plugin package',
      tempPrefix: 'openpet-zip-utils-ok-stage-',
      limits: tightLimits,
      inspectArchive: async () => [{ name: 'plugin.json', uncompressedSize: 4, compressedSize: 2 }],
      extractArchive: async ({ destination }) => {
        fs.mkdirSync(destination, { recursive: true })
        fs.writeFileSync(path.join(destination, 'plugin.json'), '{"id":"demo"}')
      }
    })
    assert.equal(fs.existsSync(path.join(stagedPath, 'plugin.json')), true)
  } finally {
    if (stagedPath) fs.rmSync(stagedPath, { recursive: true, force: true })
    fs.rmSync(zipRoot, { recursive: true, force: true })
  }
})
