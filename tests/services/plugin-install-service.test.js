const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const { createPluginInstallService } = require('../../src/main/services/plugin-install-service')

const createSettingsService = (initialSettings = {}) => {
  let current = {
    ...initialSettings,
    plugins: {
      enabled: {},
      config: {},
      storage: {},
      ...(initialSettings.plugins || {})
    }
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const createPluginPackage = ({ root, id = 'focus-timer', version = '1.0.0', permissions = ['pet:say'], network, signature = false } = {}) => {
  const pluginPath = path.join(root || fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-src-')), id)
  fs.mkdirSync(pluginPath, { recursive: true })
  const manifest = {
    id,
    name: 'Focus Timer',
    version,
    main: 'index.js',
    permissions,
    network,
    commands: [{ id: 'start', title: 'Start focus' }]
  }
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(pluginPath, 'index.js'), 'module.exports = function activate() { return {} }\n')
  if (signature) {
    fs.writeFileSync(path.join(pluginPath, 'signature.json'), JSON.stringify({
      algorithm: 'sha256-test',
      signer: 'openpet-labs',
      value: 'local-test-signature',
      manifestSha256: sha256(path.join(pluginPath, 'plugin.json')),
      files: {
        'plugin.json': sha256(path.join(pluginPath, 'plugin.json')),
        'index.js': sha256(path.join(pluginPath, 'index.js'))
      }
    }, null, 2))
  }
  return pluginPath
}

const createExtensionDeclarationPackage = ({
  root,
  id = 'weather-morning-report',
  assetPath = 'assets/email-template.html',
  profile = 'runtime',
  permissions = []
} = {}) => {
  const pluginPath = path.join(root || fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-extension-src-')), id)
  fs.mkdirSync(path.join(pluginPath, 'commands'), { recursive: true })
  fs.mkdirSync(path.join(pluginPath, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(pluginPath, 'commands', 'announce.js'), 'console.log(JSON.stringify({ ok: true }))\n')
  fs.writeFileSync(path.join(pluginPath, 'assets', 'email-template.html'), '<p>Hello</p>\n')
  fs.writeFileSync(path.join(pluginPath, 'config.schema.json'), JSON.stringify({
    title: 'Weather Settings',
    type: 'object',
    properties: {
      city: {
        type: 'string',
        title: 'City',
        default: 'Shanghai'
      }
    }
  }, null, 2))
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id,
    name: 'Weather Morning Report',
    version: '1.0.0',
    profile,
    description: 'Weather reports with a dashboard and pet announcements.',
    permissions,
    config: 'config.schema.json',
    entries: {
      commands: [
        {
          id: 'announce',
          title: 'Announce Weather',
          command: 'node ./commands/announce.js',
          cwd: '.'
        }
      ],
      services: [
        {
          id: 'companion',
          name: 'Weather Companion',
          command: 'npm run service:start',
          cwd: '.',
          health: {
            type: 'http',
            url: 'http://127.0.0.1:8787/health'
          }
        }
      ],
      dashboards: [
        {
          id: 'main',
          title: 'Dashboard',
          url: 'http://127.0.0.1:8787'
        }
      ]
    },
    manifest: {
      dataLocations: [
        {
          path: 'OPENPET_DATA_DIR',
          description: 'Report history.'
        }
      ]
    },
    assets: [assetPath]
  }, null, 2))
  return pluginPath
}

test('plugin install service inspects and installs an unsigned plugin disabled by default', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const settingsService = createSettingsService()
  const service = createPluginInstallService({ settingsService, pluginDir })
  const sourcePath = createPluginPackage()

  const review = service.inspectPluginPackage(sourcePath)

  assert.equal(review.plugin.id, 'focus-timer')
  assert.equal(review.installMode, 'install')
  assert.equal(review.signature.status, 'unsigned')
  assert.deepEqual(review.permissionDiff.permissions.added, ['pet:say'])
  assert.ok(review.packageHash)

  const result = service.installPlugin(review.selectionId)

  assert.deepEqual(result, {
    ok: true,
    pluginId: 'focus-timer',
    installMode: 'install',
    disabled: true
  })
  assert.equal(fs.existsSync(path.join(pluginDir, 'focus-timer', 'plugin.json')), true)
  assert.equal(settingsService.get().plugins.enabled['focus-timer'], false)
  assert.equal(settingsService.get().plugins.installed['focus-timer'].signatureStatus, 'unsigned')
})

test('plugin install service inspects extension declaration packages without legacy main files', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-extensions-'))
  const service = createPluginInstallService({ settingsService: createSettingsService(), pluginDir })

  const review = service.inspectPluginPackage(createExtensionDeclarationPackage())

  assert.equal(review.plugin.id, 'weather-morning-report')
  assert.equal(review.plugin.profile, 'runtime')
  assert.equal(review.plugin.main, '')
  assert.equal(review.plugin.config, 'config.schema.json')
  assert.equal(review.plugin.configSchema, 'config.schema.json')
  assert.deepEqual(review.plugin.permissions, [])
  assert.deepEqual(review.plugin.commands, [{ id: 'announce', title: 'Announce Weather' }])
  assert.deepEqual(review.plugin.entries.commands.map((command) => command.id), ['announce'])
  assert.deepEqual(review.plugin.entries.services.map((serviceEntry) => serviceEntry.id), ['companion'])
  assert.deepEqual(review.plugin.entries.dashboards.map((dashboard) => dashboard.id), ['main'])
  assert.deepEqual(review.plugin.manifest.dataLocations, [
    {
      path: 'OPENPET_DATA_DIR',
      description: 'Report history.'
    }
  ])
  assert.deepEqual(review.plugin.assets, ['assets/email-template.html'])
})

test('plugin install service surfaces creator-tools profile and action permissions in review data', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-creator-extensions-'))
  const service = createPluginInstallService({ settingsService: createSettingsService(), pluginDir })

  const review = service.inspectPluginPackage(createExtensionDeclarationPackage({
    id: 'action-author',
    profile: 'creator-tools',
    permissions: ['actions:read', 'actions:write']
  }))

  assert.equal(review.plugin.profile, 'creator-tools')
  assert.deepEqual(review.plugin.permissions, ['actions:read', 'actions:write'])
  assert.deepEqual(review.permissionDiff.permissions.added, ['actions:read', 'actions:write'])
})

test('plugin install service rejects extension declarations that reference missing assets', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-extensions-'))
  const service = createPluginInstallService({ settingsService: createSettingsService(), pluginDir })

  assert.throws(
    () => service.inspectPluginPackage(createExtensionDeclarationPackage({ assetPath: 'assets/missing.html' })),
    /Plugin asset file does not exist/
  )
})

test('plugin install service verifies local signature hash metadata', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const service = createPluginInstallService({ settingsService: createSettingsService(), pluginDir })

  const review = service.inspectPluginPackage(createPluginPackage({ signature: true }))

  assert.equal(review.signature.status, 'hash-verified')
  assert.equal(review.signature.signer, 'openpet-labs')
  assert.deepEqual(review.signature.errors, [])
})

test('plugin install service does not mark partial signature metadata as verified', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const service = createPluginInstallService({ settingsService: createSettingsService(), pluginDir })
  const sourcePath = createPluginPackage()
  fs.writeFileSync(path.join(sourcePath, 'signature.json'), JSON.stringify({
    algorithm: 'sha256-test',
    signer: 'openpet-labs',
    value: 'local-test-signature',
    files: {
      'plugin.json': sha256(path.join(sourcePath, 'plugin.json'))
    }
  }, null, 2))

  const review = service.inspectPluginPackage(sourcePath)

  assert.equal(review.signature.status, 'present-unverified')
  assert.match(review.signature.errors[0], /does not cover files: index.js/)
  assert.throws(() => service.installPlugin(review.selectionId), /signature hash verification failed/)
})

test('plugin install service updates with permission diff and disables the plugin', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'focus-timer': true },
      storage: { 'focus-timer': { kept: true } }
    }
  })
  const service = createPluginInstallService({ settingsService, pluginDir })
  const firstReview = service.inspectPluginPackage(createPluginPackage({ permissions: ['pet:say'] }))
  service.installPlugin(firstReview.selectionId)

  settingsService.save({
    ...settingsService.get(),
    plugins: {
      ...settingsService.get().plugins,
      enabled: { ...settingsService.get().plugins.enabled, 'focus-timer': true }
    }
  })
  const nextReview = service.inspectPluginPackage(createPluginPackage({
    version: '1.1.0',
    permissions: ['pet:say', 'network'],
    network: { allowlist: ['api.example.com'] }
  }))

  assert.equal(nextReview.installMode, 'update')
  assert.deepEqual(nextReview.permissionDiff.permissions.added, ['network'])
  assert.deepEqual(nextReview.permissionDiff.networkAllowlist.added, ['api.example.com'])
  assert.equal(nextReview.requiresReview, true)

  service.updatePlugin(nextReview.selectionId)

  assert.equal(settingsService.get().plugins.enabled['focus-timer'], false)
  assert.deepEqual(settingsService.get().plugins.storage['focus-timer'], { kept: true })
  assert.equal(JSON.parse(fs.readFileSync(path.join(pluginDir, 'focus-timer', 'plugin.json'), 'utf-8')).version, '1.1.0')
})

test('plugin install service rejects updating from the installed plugin directory itself', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const service = createPluginInstallService({ settingsService: createSettingsService(), pluginDir })
  const firstReview = service.inspectPluginPackage(createPluginPackage())
  service.installPlugin(firstReview.selectionId)

  const installedPath = path.join(pluginDir, 'focus-timer')
  const updateReview = service.inspectPluginPackage(installedPath)

  assert.equal(updateReview.installMode, 'update')
  assert.throws(() => service.updatePlugin(updateReview.selectionId), /source cannot be the installed plugin directory/)
  assert.equal(fs.existsSync(path.join(installedPath, 'plugin.json')), true)
})

test('plugin install service uninstalls one plugin without removing other plugin storage', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'focus-timer': true, other: true },
      config: { 'focus-timer': { minutes: 25 }, other: { ok: true } },
      storage: { 'focus-timer': { draft: true }, other: { keep: true } }
    }
  })
  const service = createPluginInstallService({ settingsService, pluginDir })
  const review = service.inspectPluginPackage(createPluginPackage())
  service.installPlugin(review.selectionId)

  const result = service.uninstallPlugin('focus-timer')

  assert.deepEqual(result, { ok: true, pluginId: 'focus-timer', storageRemoved: false })
  assert.equal(fs.existsSync(path.join(pluginDir, 'focus-timer')), false)
  assert.equal(settingsService.get().plugins.enabled['focus-timer'], undefined)
  assert.equal(settingsService.get().plugins.config['focus-timer'], undefined)
  assert.deepEqual(settingsService.get().plugins.storage.other, { keep: true })
  assert.deepEqual(settingsService.get().plugins.storage['focus-timer'], { draft: true })
})

test('plugin install service can remove target plugin storage during uninstall', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const settingsService = createSettingsService({
    plugins: {
      storage: { 'focus-timer': { draft: true }, other: { keep: true } }
    }
  })
  const service = createPluginInstallService({ settingsService, pluginDir })
  const review = service.inspectPluginPackage(createPluginPackage())
  service.installPlugin(review.selectionId)

  const result = service.uninstallPlugin('focus-timer', { removeStorage: true })

  assert.deepEqual(result, { ok: true, pluginId: 'focus-timer', storageRemoved: true })
  assert.equal(settingsService.get().plugins.storage['focus-timer'], undefined)
  assert.deepEqual(settingsService.get().plugins.storage.other, { keep: true })
})

test('plugin install service accepts legacy .ibot-plugin.zip packages for compatibility', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const zipRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-legacy-plugin-zip-'))
  const sourcePath = createPluginPackage()
  const zipPath = path.join(zipRoot, 'focus-timer.ibot-plugin.zip')
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourcePath })
  const service = createPluginInstallService({ settingsService: createSettingsService(), pluginDir })

  const review = service.inspectPluginPackage(zipPath)

  assert.equal(review.plugin.id, 'focus-timer')
  assert.equal(review.sourceType, 'zip')
  service.clearPendingSelection(review.selectionId)
})

test('plugin install service rejects zip packages with path traversal entries', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-installed-plugins-'))
  const zipRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-zip-'))
  const zipPath = path.join(zipRoot, 'bad.openpet-plugin.zip')
  const evilName = `${path.basename(zipRoot)}-evil.txt`
  fs.writeFileSync(path.join(path.dirname(zipRoot), evilName), 'bad')
  execFileSync('zip', ['-q', zipPath, `../${evilName}`], { cwd: zipRoot })

  const service = createPluginInstallService({ settingsService: createSettingsService(), pluginDir })

  assert.throws(() => service.inspectPluginPackage(zipPath), /unsafe paths/)
})
