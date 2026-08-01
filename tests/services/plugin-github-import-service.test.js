const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createPluginGithubImportService } = require('../../src/main/services/plugin-github-import-service')

const createResponse = (body, { ok = true, status = 200, headers = {} } = {}) => ({
  ok,
  status,
  headers: {
    get: (name) => {
      const key = String(name || '').toLowerCase()
      return headers[key] || ''
    }
  },
  json: async () => body,
  arrayBuffer: async () => Buffer.isBuffer(body) ? body : Buffer.from(body)
})

const createStreamingResponse = (chunks, { headers = {} } = {}) => {
  let index = 0
  let canceled = false
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) => headers[String(name || '').toLowerCase()] || ''
    },
    body: {
      getReader: () => ({
        read: async () => index < chunks.length
          ? { done: false, value: chunks[index++] }
          : { done: true, value: undefined },
        cancel: async () => { canceled = true },
        releaseLock: () => {}
      })
    },
    arrayBuffer: async () => { throw new Error('streaming responses must not be fully buffered') },
    wasCanceled: () => canceled
  }
}

const createRepositoryRoot = ({ withPluginManifest = true } = {}) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-github-plugin-root-'))
  const repoRoot = path.join(tempRoot, 'demo-plugin-main')
  fs.mkdirSync(repoRoot, { recursive: true })
  if (withPluginManifest) {
    fs.writeFileSync(path.join(repoRoot, 'plugin.json'), JSON.stringify({
      id: 'demo-plugin',
      name: 'Demo Plugin',
      version: '1.0.0',
      main: 'index.js',
      permissions: ['pet:say'],
      commands: [{ id: 'hello', title: 'Say hello' }]
    }, null, 2))
    fs.writeFileSync(path.join(repoRoot, 'index.js'), 'module.exports = function activate() { return {} }\n')
  }
  return { tempRoot, repoRoot }
}

test('github plugin import service rejects non-homepage github urls', async () => {
  const service = createPluginGithubImportService({
    pluginInstallService: { inspectPluginPackage: () => ({}) },
    fetchImpl: async () => { throw new Error('not used') }
  })

  await assert.rejects(
    () => service.inspectRepositoryUrl('https://github.com/user/repo/tree/main'),
    /GitHub repository homepage URL/
  )
})

test('github plugin import service downloads default branch archive and inspects repository root', async () => {
  const { tempRoot, repoRoot } = createRepositoryRoot()
  const calls = []
  const responses = [
    createResponse({ default_branch: 'main' }),
    createResponse(Buffer.from('fake-zip'), {
      headers: {
        'content-length': String(Buffer.byteLength('fake-zip')),
        'content-type': 'application/zip'
      }
    })
  ]

  const service = createPluginGithubImportService({
    pluginInstallService: {
      inspectPluginPackage: (targetPath, options) => {
        calls.push(targetPath)
        calls.push(options)
        return {
          selectionId: 'selection-1',
          installMode: 'install',
          existingVersion: '',
          riskLevel: 'review',
          plugin: { id: 'demo-plugin', name: 'Demo Plugin', version: '1.0.0', permissions: [], commands: [], entries: { commands: [], services: [], dashboards: [] } },
          permissionDiff: { permissions: { added: [], removed: [], unchanged: [] }, networkAllowlist: { added: [], removed: [], unchanged: [] } },
          signature: { label: 'Unsigned plugin', errors: [] },
          blockStatus: { blocked: false, reasons: [] },
          packageHash: 'abc',
          fileCount: 2,
          byteSize: 20
        }
      }
    },
    fetchImpl: async (url) => responses.shift() || (() => { throw new Error(`unexpected url ${url}`) })(),
    extractArchive: ({ archivePath, extractRoot }) => {
      assert.equal(fs.existsSync(archivePath), true)
      fs.mkdirSync(extractRoot, { recursive: true })
      fs.cpSync(tempRoot, extractRoot, { recursive: true })
      return extractRoot
    }
  })

  const review = await service.inspectRepositoryUrl('https://github.com/openpet/demo-plugin')

  assert.equal(review.plugin.id, 'demo-plugin')
  assert.equal(calls.length, 2)
  assert.equal(path.basename(calls[0]), 'demo-plugin-main')
  assert.equal(fs.existsSync(path.join(calls[0], 'plugin.json')), true)
  assert.equal(calls[1].sourceType, 'github')
  assert.equal(typeof calls[1].cleanupPath, 'string')
  assert.equal(calls[1].cleanupPath.length > 0, true)
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

test('github plugin import service fails when repository root does not contain plugin.json', async () => {
  const { tempRoot } = createRepositoryRoot({ withPluginManifest: false })
  const service = createPluginGithubImportService({
    pluginInstallService: { inspectPluginPackage: () => ({}) },
    fetchImpl: async (url) => (
      String(url).includes('/repos/')
        ? createResponse({ default_branch: 'main' })
        : createResponse(Buffer.from('fake-zip'), { headers: { 'content-length': String(Buffer.byteLength('fake-zip')) } })
    ),
    extractArchive: ({ extractRoot }) => {
      fs.mkdirSync(extractRoot, { recursive: true })
      fs.cpSync(tempRoot, extractRoot, { recursive: true })
      return extractRoot
    }
  })

  await assert.rejects(
    () => service.inspectRepositoryUrl('https://github.com/openpet/demo-plugin'),
    /plugin\.json must exist at the repository root/
  )

  fs.rmSync(tempRoot, { recursive: true, force: true })
})

test('github plugin import service surfaces repository lookup failures', async () => {
  const service = createPluginGithubImportService({
    pluginInstallService: { inspectPluginPackage: () => ({}) },
    fetchImpl: async () => createResponse({}, { ok: false, status: 404 })
  })

  await assert.rejects(
    () => service.inspectRepositoryUrl('https://github.com/openpet/missing-plugin'),
    /default branch/
  )
})

test('github plugin import service times out and cancels a stalled repository metadata body', async () => {
  let canceled = false
  const metadataResponse = {
    ok: true,
    status: 200,
    headers: { get: () => '' },
    body: {
      getReader: () => ({
        read: () => new Promise(() => {}),
        cancel: async () => { canceled = true },
        releaseLock: () => {}
      })
    }
  }
  const service = createPluginGithubImportService({
    pluginInstallService: { inspectPluginPackage: () => ({}) },
    fetchImpl: async () => metadataResponse,
    archiveTimeoutMs: 20
  })

  const outcome = await Promise.race([
    service.inspectRepositoryUrl('https://github.com/openpet/stalled-plugin')
      .then(() => ({ status: 'resolved' }), (error) => ({ status: 'rejected', error })),
    new Promise((resolve) => setTimeout(() => resolve({ status: 'pending' }), 120))
  ])

  assert.equal(outcome.status, 'rejected')
  assert.equal(
    outcome.error.message,
    'Unable to read the repository default branch. Check that the repository exists and is publicly accessible.'
  )
  assert.equal(canceled, true)
})

test('github plugin import service cancels an unbounded archive stream as soon as it exceeds the byte limit', async () => {
  const archiveResponse = createStreamingResponse([
    Buffer.alloc(4, 1),
    Buffer.alloc(5, 2)
  ])
  const service = createPluginGithubImportService({
    pluginInstallService: { inspectPluginPackage: () => ({}) },
    fetchImpl: async (url) => String(url).includes('/repos/')
      ? createResponse({ default_branch: 'main' })
      : archiveResponse,
    maxArchiveBytes: 8
  })

  await assert.rejects(
    () => service.inspectRepositoryUrl('https://github.com/openpet/oversized-plugin'),
    /exceeds 8 bytes/
  )
  assert.equal(archiveResponse.wasCanceled(), true)
})

test('github plugin import service accepts a streaming archive exactly at the byte limit', async () => {
  const { tempRoot } = createRepositoryRoot()
  const archiveResponse = createStreamingResponse([
    Buffer.alloc(4, 1),
    Buffer.alloc(4, 2)
  ])
  const service = createPluginGithubImportService({
    pluginInstallService: {
      inspectPluginPackage: () => ({ plugin: { id: 'demo-plugin' } })
    },
    fetchImpl: async (url) => String(url).includes('/repos/')
      ? createResponse({ default_branch: 'main' })
      : archiveResponse,
    maxArchiveBytes: 8,
    extractArchive: async ({ extractRoot }) => {
      extractRoot ||= fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-github-test-extract-'))
      fs.mkdirSync(extractRoot, { recursive: true })
      fs.cpSync(tempRoot, extractRoot, { recursive: true })
      return extractRoot
    }
  })

  const review = await service.inspectRepositoryUrl('https://github.com/openpet/bounded-plugin')

  assert.equal(review.plugin.id, 'demo-plugin')
  assert.equal(archiveResponse.wasCanceled(), false)
  fs.rmSync(tempRoot, { recursive: true, force: true })
})
