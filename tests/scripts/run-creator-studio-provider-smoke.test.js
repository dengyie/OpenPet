const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const packageJson = require('../../package.json')

const {
  DEFAULT_ACTION_ID,
  DEFAULT_ACTION_NAME,
  createSessionPaths,
  defaultAppDataDir,
  defaultUserDataDir,
  parseArgs,
  runCreatorStudioProviderSmoke
} = require('../../scripts/run-creator-studio-provider-smoke')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

test('default user data path follows desktop conventions for creator studio smoke', () => {
  assert.equal(defaultUserDataDir({ appDataDir: '/Users/mango/Library/Application Support' }), '/Users/mango/Library/Application Support/ibot')
  assert.match(defaultAppDataDir({ platform: 'win32', env: { APPDATA: 'C:\\Users\\mango\\AppData\\Roaming' }, homedir: () => '/Users/mango' }), /AppData/)
})

test('parseArgs accepts creator studio smoke options and normalizes legacy backend labels', () => {
  const options = parseArgs([
    '--prompt', '给当前宠物做一个挥手动作',
    '--user-data-dir', '/tmp/user-data',
    '--output-dir', '/tmp/output',
    '--backend', 'cloud',
    '--action-id', 'wave',
    '--action-name', '挥手',
    '--frame-count', '12',
    '--width', '768',
    '--height', '512',
    '--timeout-ms', '180000',
    '--skip-health-check',
    '--log-limit', '9'
  ])

  assert.equal(options.prompt, '给当前宠物做一个挥手动作')
  assert.equal(options.userDataDir, path.resolve('/tmp/user-data'))
  assert.equal(options.outputDir, path.resolve('/tmp/output'))
  assert.equal(options.backend, 'provider')
  assert.equal(options.actionId, 'wave')
  assert.equal(options.actionName, '挥手')
  assert.equal(options.frameCount, 12)
  assert.equal(options.width, 768)
  assert.equal(options.height, 512)
  assert.equal(options.timeoutMs, 180000)
  assert.equal(options.skipHealthCheck, true)
  assert.equal(options.logLimit, 9)
})

test('createSessionPaths creates deterministic creator studio smoke artifact paths', () => {
  const paths = createSessionPaths({
    outputDir: '/tmp/openpet-creator-studio-smoke',
    now: () => new Date('2026-06-28T12:34:56.789Z')
  })

  assert.equal(paths.sessionId, '2026-06-28T12-34-56-789Z')
  assert.equal(paths.resultPath.endsWith(path.join('2026-06-28T12-34-56-789Z', 'creator-studio-provider-smoke-result.json')), true)
  assert.equal(paths.qaDir.endsWith(path.join('2026-06-28T12-34-56-789Z', 'qa')), true)
})

test('package.json exposes a creator studio provider smoke npm entrypoint', () => {
  assert.equal(
    packageJson.scripts['smoke:creator-studio-provider'],
    'node scripts/run-creator-studio-provider-smoke.js'
  )
})

test('runCreatorStudioProviderSmoke writes a sanitized success report using injected host services', async () => {
  const userDataDir = createTempDir('openpet-creator-smoke-user-data-')
  const outputDir = createTempDir('openpet-creator-smoke-output-')
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    models: {
      imageGeneration: {
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-image-2',
        apiKeyRef: 'secret:model.image.openpet.apiKey',
        timeoutMs: 30000,
        maxConcurrentJobs: 1
      }
    }
  }, null, 2))
  fs.writeFileSync(path.join(userDataDir, 'secrets.json'), JSON.stringify({
    secrets: {
      'secret:model.image.openpet.apiKey': {
        value: 'sk-real-secret-value',
        label: 'Image API Key',
        updatedAt: '2026-06-28T12:00:00.000Z'
      }
    }
  }, null, 2))

  const result = await runCreatorStudioProviderSmoke({
    prompt: '给当前宠物加一个挥手动作 sk-real-secret-value http://127.0.0.1:8317/v1',
    userDataDir,
    outputDir,
    width: 768,
    height: 512,
    timeoutMs: 180000,
    now: () => new Date('2026-06-28T12:34:56.789Z'),
    createSecretServiceImpl: () => ({
      getSecretValue: () => 'sk-real-secret-value'
    }),
    createImageGenerationModelServiceImpl: ({ appLogService, settingsService }) => {
      const timeoutSeen = settingsService.get().models.imageGeneration.timeoutMs
      return {
        getConfig: () => ({
          provider: 'openai-compatible',
          baseUrl: 'http://127.0.0.1:8317/v1',
          model: 'gpt-image-2',
          hasApiKey: true,
          timeoutMs: timeoutSeen,
          maxConcurrentJobs: 1
        }),
        checkHealth: async () => {
          appLogService.record({
            scope: 'image-generation',
            level: 'info',
            event: 'imageGeneration.health.completed',
            message: 'Image Provider health check completed',
            details: { requestId: 'health-1', status: 200 }
          })
          return {
            ok: true,
            code: 'provider_healthy',
            message: 'Image Provider is reachable',
            modelsProbe: 'available',
            availableModels: ['gpt-image-2'],
            currentModelDiscovered: true
          }
        },
        generateImage: async ({ prompt, output, constraints }) => {
          assert.match(prompt, /Action Requirements/)
          assert.equal(output.dataRelativeDir, path.join('frames', 'base'))
          assert.equal(constraints.transparent, true)
          assert.equal(constraints.width, 768)
          assert.equal(constraints.height, 512)
          appLogService.record({
            scope: 'image-generation',
            level: 'info',
            event: 'imageGeneration.generate.completed',
            message: 'Image generation completed',
            details: { requestId: 'gen-1', outputs: 1 }
          })
          return {
            requestId: 'gen-1',
            provider: 'openai-compatible',
            model: 'gpt-image-2',
            generatedAt: '2026-06-28T12:34:57.000Z',
            outputs: [{
              dataRelativePath: 'frames/base/0001.png',
              mimeType: 'image/png',
              sha256: 'abc123'
            }],
            usage: {
              estimatedCostUsd: 0.12
            }
          }
        }
      }
    },
    buildActionFramesFromGeneratedImageImpl: async ({ dataDir, action, outputFramesDir, qaDir }) => {
      assert.equal(path.resolve(dataDir).startsWith(path.resolve(outputDir)), true)
      fs.mkdirSync(outputFramesDir, { recursive: true })
      fs.mkdirSync(qaDir, { recursive: true })
      const qaPath = path.join(qaDir, 'action-frame-qa.json')
      const contactSheetPath = path.join(qaDir, 'action-frame-contact-sheet.png')
      fs.writeFileSync(contactSheetPath, 'png')
      fs.writeFileSync(qaPath, JSON.stringify({
        ok: true,
        warnings: [],
        frames: Array.from({ length: action.frameCount }, (_entry, index) => ({
          fileName: `${String(index + 1).padStart(4, '0')}.png`,
          visiblePixels: 100 + index
        }))
      }, null, 2))
      return {
        actionId: action.actionId,
        frameCount: action.frameCount,
        frameWidth: 192,
        frameHeight: 208,
        framesDir: outputFramesDir,
        qaPath,
        contactSheetPath
      }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.schemaVersion, 1)
  assert.equal(result.evidenceType, 'creator-studio-provider-smoke')
  assert.match(result.claimBoundary, /provider-path validation only/i)
  assert.equal(result.config.provider, 'openai-compatible')
  assert.equal(result.config.model, 'gpt-image-2')
  assert.equal(result.healthCheck.ok, true)
  assert.equal(result.generation.ok, true)
  assert.equal(result.generation.requestId, 'gen-1')
  assert.equal(result.generation.outputCount, 1)
  assert.equal(result.action.actionId, DEFAULT_ACTION_ID)
  assert.equal(result.action.name, DEFAULT_ACTION_NAME)
  assert.deepEqual(result.generationConstraints, {
    width: 768,
    height: 512,
    transparent: true,
    timeoutOverrideMs: 180000
  })
  assert.equal(result.config.timeoutMs, 180000)
  assert.equal(result.actionFrames.ok, true)
  assert.equal(result.actionFrames.frameCount, 16)
  assert.equal(result.actionFrames.visibleFrameCount, 16)
  assert.equal(result.actionFrames.qaPath, 'qa/action-frame-qa.json')
  assert.equal(result.actionFrames.contactSheetPath, 'qa/action-frame-contact-sheet.png')
  assert.equal(result.logs.length >= 2, true)
  assert.equal(result.logs.every((entry) => entry.scope === 'image-generation'), true)
  assert.doesNotMatch(result.promptBuilder.promptPreview, /sk-real-secret-value/)
  assert.doesNotMatch(result.promptBuilder.promptPreview, /127\.0\.0\.1:8317/)
  assert.equal(fs.existsSync(result.resultPath), true)
  const persisted = fs.readFileSync(result.resultPath, 'utf-8')
  assert.doesNotMatch(persisted, /sk-real-secret-value/)
  const persistedSettings = JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf-8'))
  assert.equal(persistedSettings.models.imageGeneration.timeoutMs, 30000)
})

test('runCreatorStudioProviderSmoke fails honestly when the saved image provider API key is missing', async () => {
  const userDataDir = createTempDir('openpet-creator-smoke-missing-key-')
  const outputDir = createTempDir('openpet-creator-smoke-missing-key-output-')
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    models: {
      imageGeneration: {
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-image-2',
        apiKeyRef: 'secret:model.image.openpet.apiKey'
      }
    }
  }, null, 2))
  fs.writeFileSync(path.join(userDataDir, 'secrets.json'), JSON.stringify({ secrets: {} }, null, 2))

  const result = await runCreatorStudioProviderSmoke({
    prompt: '验证缺失 key 的失败路径',
    userDataDir,
    outputDir
  })

  assert.equal(result.ok, false)
  assert.equal(result.schemaVersion, 1)
  assert.equal(result.evidenceType, 'creator-studio-provider-smoke')
  assert.match(result.claimBoundary, /provider-path validation only/i)
  assert.equal(result.healthCheck.skipped, false)
  assert.equal(result.healthCheck.ok, false)
  assert.match(result.healthCheck.message, /API key is missing/i)
  assert.match(result.error.message, /API key is missing/i)
  assert.equal(result.generation.ok, false)
  assert.equal(fs.existsSync(result.resultPath), true)
})
