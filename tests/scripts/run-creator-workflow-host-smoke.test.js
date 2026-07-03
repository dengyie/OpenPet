const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const packageJson = require('../../package.json')

const {
  DEFAULT_SCENARIO,
  createScenarioList,
  createSessionPaths,
  defaultAppDataDir,
  defaultUserDataDir,
  parseArgs,
  prepareSeedSettings,
  resolveReferenceImagePath,
  resolveImportedPetRoot,
  verifyNewCharacterScenario,
  runCreatorWorkflowHostSmoke
} = require('../../scripts/run-creator-workflow-host-smoke')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

test('default user data path follows desktop conventions for creator workflow host smoke', () => {
  assert.equal(defaultUserDataDir({ appDataDir: '/Users/mango/Library/Application Support' }), '/Users/mango/Library/Application Support/ibot')
  assert.match(defaultAppDataDir({ platform: 'win32', env: { APPDATA: 'C:\\Users\\mango\\AppData\\Roaming' }, homedir: () => '/Users/mango' }), /AppData/)
})

test('parseArgs accepts creator workflow host smoke options', () => {
  const options = parseArgs([
    '--source-user-data-dir', '/tmp/user-data',
    '--reference-image', '/tmp/reference.png',
    '--output-dir', '/tmp/output',
    '--scenario', 'existing-action',
    '--json'
  ])

  assert.equal(options.sourceUserDataDir, path.resolve('/tmp/user-data'))
  assert.equal(options.referenceImagePath, path.resolve('/tmp/reference.png'))
  assert.equal(options.outputDir, path.resolve('/tmp/output'))
  assert.equal(options.scenario, 'existing-action')
  assert.equal(options.json, true)
})

test('createScenarioList expands both and validates single-scenario runs', () => {
  assert.deepEqual(createScenarioList(DEFAULT_SCENARIO), ['new-character', 'existing-action'])
  assert.deepEqual(createScenarioList('new-character'), ['new-character'])
  assert.throws(() => createScenarioList('unknown'), /--scenario must be both, new-character, or existing-action/)
})

test('createSessionPaths creates deterministic host smoke artifact paths', () => {
  const paths = createSessionPaths({
    outputDir: '/tmp/openpet-creator-workflow-host-smoke',
    now: () => new Date('2026-07-02T12:34:56.789Z')
  })

  assert.equal(paths.sessionId, '2026-07-02T12-34-56-789Z')
  assert.equal(paths.reportPath.endsWith(path.join('2026-07-02T12-34-56-789Z', 'creator-workflow-host-smoke-report.json')), true)
})

test('prepareSeedSettings enables the bundled creator plugin and resets the editable host target', () => {
  const settings = prepareSeedSettings({
    plugins: {
      enabled: {
        'official.basic-behavior': false
      }
    },
    petPacks: {
      activePackId: 'other-pack'
    },
    creator: {
      references: {
        'editable-action-host:legacy-editable-host': {
          assetPath: '/tmp/reference.png'
        }
      }
    }
  })

  assert.equal(settings.plugins.enabled['official.basic-behavior'], false)
  assert.equal(settings.plugins.enabled['openpet.creator-studio'], true)
  assert.equal(settings.petPacks.activePackId, 'legacy-cat')
  assert.deepEqual(settings.creator.references, {})
  assert.equal(settings.localHttp.enabled, false)
})

test('resolveReferenceImagePath prefers explicit and stored references before repo fallback', () => {
  const tempDir = createTempDir('openpet-creator-workflow-reference-')
  const explicitPath = path.join(tempDir, 'explicit.png')
  const storedPath = path.join(tempDir, 'stored.png')
  const fallbackRoot = path.join(tempDir, 'repo-root')
  fs.mkdirSync(path.dirname(path.join(fallbackRoot, 'cat_anime', 'flames', 'bai_no_bg', '01_no_bg.png')), { recursive: true })
  fs.writeFileSync(explicitPath, 'explicit')
  fs.writeFileSync(storedPath, 'stored')
  fs.writeFileSync(path.join(fallbackRoot, 'cat_anime', 'flames', 'bai_no_bg', '01_no_bg.png'), 'fallback')

  assert.equal(resolveReferenceImagePath({
    referenceImagePath: explicitPath,
    sourceSettings: {},
    projectRoot: fallbackRoot
  }), path.resolve(explicitPath))

  assert.equal(resolveReferenceImagePath({
    sourceSettings: {
      creator: {
        references: {
          'editable-action-host:legacy-editable-host': {
            assetPath: storedPath
          }
        }
      }
    },
    projectRoot: fallbackRoot
  }), path.resolve(storedPath))

  assert.equal(resolveReferenceImagePath({
    sourceSettings: {},
    projectRoot: fallbackRoot
  }), path.resolve(path.join(fallbackRoot, 'cat_anime', 'flames', 'bai_no_bg', '01_no_bg.png')))
})

test('package.json exposes a creator workflow host smoke npm entrypoint', () => {
  assert.equal(
    packageJson.scripts['smoke:creator-workflow-host'],
    'node scripts/run-creator-workflow-host-smoke.js'
  )
})

test('verifyNewCharacterScenario resolves imported pack root from isolated userData when activePet is absent', () => {
  const userDataDir = createTempDir('openpet-creator-workflow-new-character-user-data-')
  const packRoot = path.join(userDataDir, 'pet-packs', 'smoke-mango-cat')
  fs.mkdirSync(packRoot, { recursive: true })
  fs.writeFileSync(path.join(packRoot, 'pet.json'), JSON.stringify({ id: 'smoke-mango-cat' }, null, 2))

  assert.equal(resolveImportedPetRoot({
    result: {
      run: {
        activatedPackId: 'smoke-mango-cat'
      },
      activePet: null
    },
    userDataDir
  }), packRoot)

  const verification = verifyNewCharacterScenario({
    result: {
      state: 'completed',
      run: {
        activatedPackId: 'smoke-mango-cat'
      },
      activePet: null
    },
    userDataDir
  })

  assert.equal(verification.ok, true)
  assert.match(verification.message, /smoke-mango-cat/)
  assert.equal(verification.artifactPaths.petRoot, packRoot)
  assert.equal(verification.artifactPaths.petManifestPath, path.join(packRoot, 'pet.json'))
})

test('runCreatorWorkflowHostSmoke writes a structured report with injected scenario runner results', async () => {
  const sourceUserDataDir = createTempDir('openpet-creator-workflow-source-user-data-')
  const outputDir = createTempDir('openpet-creator-workflow-output-')
  const referenceImagePath = path.join(sourceUserDataDir, 'reference.png')
  fs.writeFileSync(referenceImagePath, 'reference')
  fs.writeFileSync(path.join(sourceUserDataDir, 'settings.json'), JSON.stringify({
    models: {
      imageGeneration: {
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-image-2',
        apiKeyRef: 'secret:model.image.openai.apiKey'
      }
    }
  }, null, 2))
  fs.writeFileSync(path.join(sourceUserDataDir, 'secrets.json'), JSON.stringify({
    secrets: {
      'secret:model.image.openai.apiKey': {
        value: 'sk-real-secret-value',
        label: 'Image API Key'
      }
    }
  }, null, 2))

  const report = await runCreatorWorkflowHostSmoke({
    sourceUserDataDir,
    referenceImagePath,
    outputDir,
    scenario: 'both',
    now: () => new Date('2026-07-02T12:34:56.789Z'),
    runScenarioImpl: async ({ scenario, scenarioDir, referenceImagePath: resolvedReferencePath }) => ({
      scenario,
      ok: true,
      startedAt: '2026-07-02T12:34:56.789Z',
      durationMs: 12,
      referenceImagePath: resolvedReferencePath,
      userDataDir: path.join(scenarioDir, 'user-data'),
      workspaceRoot: path.join(scenarioDir, 'workspace'),
      pluginDataDir: path.join(scenarioDir, 'user-data', 'plugins', 'openpet.creator-studio', '.openpet', 'openpet.creator-studio', 'data'),
      providerBefore: { ready: true, code: 'provider_healthy' },
      providerAfter: { ready: true, code: 'provider_healthy' },
      result: {
        ok: true,
        state: 'completed',
        code: 'smoke_completed',
        message: `completed ${scenario}`,
        run: {
          state: 'completed',
          mode: scenario,
          runId: `run-${scenario}`,
          commandId: 'import',
          message: `completed ${scenario}`,
          importedActionId: scenario === 'existing-action' ? 'smoke-wave' : '',
          importedPackId: scenario === 'new-character' ? 'smoke-mango-cat' : '',
          activatedPackId: scenario === 'new-character' ? 'smoke-mango-cat' : ''
        }
      },
      verification: {
        ok: true,
        message: `verified ${scenario}`,
        artifactPaths: {
          output: path.join(scenarioDir, 'artifact.txt')
        }
      },
      conditioningVerification: {
        ok: true,
        message: `conditioning verified ${scenario}`,
        artifactPaths: {
          referenceInput: path.join(scenarioDir, 'run-reference.png')
        }
      },
      runRecordPath: path.join(scenarioDir, 'run.json'),
      runRecord: {
        runId: `run-${scenario}`,
        status: 'approved',
        artifacts: ['generatedImage']
      },
      seededSettingsSummary: {
        activePackId: 'legacy-cat',
        provider: 'openai-compatible',
        model: 'gpt-image-2'
      },
      appLogs: [{ scope: 'creator-workflow', message: 'ok' }],
      pluginLogs: [{ pluginId: 'openpet.creator-studio', message: 'ok' }]
    })
  })

  assert.equal(report.ok, true)
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.evidenceType, 'creator-workflow-host-smoke')
  assert.match(report.claimBoundary, /records evidence that the run-local canonical reference image was sent/i)
  assert.equal(report.scenarios.length, 2)
  assert.equal(report.scenarios[0].verification.ok, true)
  assert.equal(report.scenarios[1].verification.ok, true)
  assert.equal(report.scenarios[0].conditioningVerification.ok, true)
  assert.match(report.scenarios[0].conditioningVerification.message, /conditioning verified/)
  assert.equal(report.scenarios[0].conditioningVerification.artifactPaths.referenceInput, path.join('scenarios', 'new-character', 'run-reference.png'))
  assert.equal(fs.existsSync(report.reportPath), true)
  const persisted = fs.readFileSync(report.reportPath, 'utf-8')
  assert.match(persisted, /creator-workflow-host-smoke/)
  assert.doesNotMatch(persisted, /sk-real-secret-value/)
})
