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
