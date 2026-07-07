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
  verifyConditioningEvidence,
  verifyNewCharacterScenario,
  verifyScenarioResult,
  approveScenarioReferenceImage,
  runScenarioWorkflow,
  runCreatorWorkflowHostSmoke
} = require('../../scripts/run-creator-workflow-host-smoke')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))
const resolveOutputPath = (outputDir, recordedPath) => (
  path.isAbsolute(recordedPath) ? recordedPath : path.join(outputDir, recordedPath)
)

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
    '--new-character-name', 'Golden Cartoon Cat',
    '--new-character-style-prompt', 'Cartoon golden shaded cat pet.',
    '--existing-action-name', 'golden-wave',
    '--existing-action-prompt', 'Cartoon golden cat waving.',
    '--json'
  ])

  assert.equal(options.sourceUserDataDir, path.resolve('/tmp/user-data'))
  assert.equal(options.referenceImagePath, path.resolve('/tmp/reference.png'))
  assert.equal(options.outputDir, path.resolve('/tmp/output'))
  assert.equal(options.scenario, 'existing-action')
  assert.equal(options.newCharacterName, 'Golden Cartoon Cat')
  assert.equal(options.newCharacterStylePrompt, 'Cartoon golden shaded cat pet.')
  assert.equal(options.existingActionName, 'golden-wave')
  assert.equal(options.existingActionPrompt, 'Cartoon golden cat waving.')
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
  assert.equal(settings.plugins.nativeExecutionApproved['openpet.creator-studio'], true)
  assert.equal(settings.petPacks.activePackId, 'legacy-cat')
  assert.deepEqual(settings.creator.references, {})
  assert.equal(settings.localHttp.enabled, false)
})

test('prepareSeedSettings can override provider timeout for isolated smoke runs', () => {
  const settings = prepareSeedSettings({
    models: {
      imageGeneration: {
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-image-2',
        timeoutMs: 300000
      }
    }
  }, {
    providerTimeoutMs: 600000
  })

  assert.equal(settings.models.imageGeneration.timeoutMs, 600000)
  assert.equal(settings.models.imageGeneration.model, 'gpt-image-2')
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

test('verifyScenarioResult treats new-character preview-ready as a passed official-row gate', () => {
  const verification = verifyScenarioResult({
    scenario: 'new-character',
    result: {
      ok: true,
      state: 'preview-ready',
      code: 'preview_ready',
      run: {
        runId: 'run-preview',
        mode: 'full-pet'
      },
      basicActions: {
        missingRequiredOfficialActionIds: ['idle', 'waving'],
        previewFallbackActionIds: ['idle', 'waving']
      }
    },
    workspaceRoot: '/tmp/workspace',
    userDataDir: '/tmp/user-data',
    runRecord: {
      runId: 'run-preview',
      conditioning: {
        mode: 'image-edit',
        endpoint: '/images/edits',
        referenceImageCount: 1,
        references: [{
          fileName: 'canonical-reference.png',
          relativePath: 'runs/run-preview/inputs/references/canonical-reference.png'
        }]
      }
    }
  })

  assert.equal(verification.ok, true)
  assert.match(verification.message, /Preview-only full-pet output/)
  assert.deepEqual(verification.artifactPaths.referenceInput, 'runs/run-preview/inputs/references/canonical-reference.png')
})

test('approveScenarioReferenceImage returns a workflow token for a reference path', () => {
  const calls = []
  const token = approveScenarioReferenceImage({
    runtime: {
      creatorWorkflowService: {
        approveReferenceSourcePath: (sourcePath) => {
          calls.push(sourcePath)
          return { referenceToken: 'token-reference' }
        }
      }
    },
    referenceImagePath: '/tmp/reference.png'
  })

  assert.equal(token, 'token-reference')
  assert.deepEqual(calls, ['/tmp/reference.png'])
})

test('runScenarioWorkflow approves the reference image but rejects failed provider evidence', async () => {
  const repoRoot = createTempDir('openpet-creator-workflow-repo-')
  const sourceUserDataDir = createTempDir('openpet-creator-workflow-source-user-data-')
  const scenarioDir = createTempDir('openpet-creator-workflow-scenario-')
  const referenceImagePath = path.join(sourceUserDataDir, 'reference.png')
  fs.mkdirSync(path.join(repoRoot, 'cat_anime'), { recursive: true })
  fs.writeFileSync(path.join(sourceUserDataDir, 'settings.json'), JSON.stringify({}, null, 2))
  fs.writeFileSync(path.join(sourceUserDataDir, 'secrets.json'), JSON.stringify({ secrets: {} }, null, 2))
  fs.writeFileSync(referenceImagePath, 'reference')

  const calls = []
  const result = await runScenarioWorkflow({
    scenario: 'new-character',
    scenarioDir,
    repoRoot,
    sourceUserDataDir,
    referenceImagePath,
    newCharacterName: 'Golden Cartoon Cat',
    newCharacterStylePrompt: 'Cartoon golden shaded cat pet.',
    createSmokeRuntimeImpl: ({ userDataDir }) => {
      const pluginDataDir = path.join(userDataDir, 'plugins', 'openpet.creator-studio', '.openpet', 'openpet.creator-studio', 'data')
      return {
        creatorWorkflowService: {
          getState: async () => ({ provider: { ready: true, code: 'provider_healthy' } }),
          approveReferenceSourcePath: (sourcePath) => {
            calls.push(['approve', sourcePath])
            return { referenceToken: 'token-reference' }
          },
          generateNewCharacter: async (payload) => {
            calls.push(['generateNewCharacter', payload])
            const packRoot = path.join(userDataDir, 'pet-packs', 'smoke-mango-cat')
            const runDir = path.join(pluginDataDir, 'runs', 'run-new-character')
            fs.mkdirSync(packRoot, { recursive: true })
            fs.mkdirSync(runDir, { recursive: true })
            fs.writeFileSync(path.join(packRoot, 'pet.json'), JSON.stringify({ id: 'smoke-mango-cat' }, null, 2))
            fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
              runId: 'run-new-character',
              status: 'completed',
              artifacts: {
                generatedImage: {
                  anchorGeneration: {
                    stages: [
                      {
                        stage: 'composite-reference-board',
                        referenceRole: 'canonical-reference',
                        referenceRoles: ['canonical-reference'],
                        outputRelativePath: 'runs/run-new-character/inputs/anchors/composite-reference-board.png'
                      },
                      {
                        stage: 'character-anchor',
                        ok: true,
                        referenceRole: 'composite-reference-board',
                        referenceRoles: ['composite-reference-board'],
                        timeoutMs: 300000,
                        durationMs: 91,
                        model: 'gpt-image-2'
                      }
                    ]
                  },
                  generationStages: [{
                    stage: 'final-image',
                    ok: false,
                    referenceRole: 'action-anchor',
                    referenceRoles: ['action-anchor'],
                    timeoutMs: 300000,
                    durationMs: 300000,
                    model: 'gpt-image-2',
                    error: 'context canceled'
                  }],
                  conditioning: {
                    mode: 'image-edit',
                    endpoint: '/images/edits',
                    referenceImageCount: 1,
                    references: [{
                      fileName: 'reference.png',
                      relativePath: 'runs/run-new-character/inputs/references/canonical-reference.png',
                      metadataRelativePath: 'runs/run-new-character/inputs/references/reference.json',
                      role: 'reference'
                    }]
                  }
                }
              }
            }, null, 2))
            return {
              ok: true,
              state: 'completed',
              run: {
                runId: 'run-new-character',
                activatedPackId: 'smoke-mango-cat'
              }
            }
          }
        },
        pluginService: {
          getPluginCreatorDataDir: () => pluginDataDir,
          stopAllServices: async () => {},
          getLogs: () => []
        },
        appLogService: {
          read: () => []
        }
      }
    }
  })

  assert.equal(result.ok, false)
  assert.match(result.verification.message, /missing required approved idle action/)
  assert.deepEqual(calls[0], ['approve', referenceImagePath])
  assert.equal(calls[1][0], 'generateNewCharacter')
  assert.equal(calls[1][1].characterName, 'Golden Cartoon Cat')
  assert.equal(calls[1][1].stylePrompt, 'Cartoon golden shaded cat pet.')
  assert.equal(calls[1][1].referenceImageToken, 'token-reference')
  assert.equal(calls[1][1].referenceImagePath, undefined)
  assert.deepEqual(result.runRecord.anchorGenerationStages, [
    {
      stage: 'composite-reference-board',
      ok: null,
      referenceRole: 'canonical-reference',
      referenceRoles: ['canonical-reference'],
      timeoutMs: 0,
      durationMs: 0,
      model: '',
      outputRelativePath: 'runs/run-new-character/inputs/anchors/composite-reference-board.png',
      promptRelativePath: '',
      error: ''
    },
    {
      stage: 'character-anchor',
      ok: true,
      referenceRole: 'composite-reference-board',
      referenceRoles: ['composite-reference-board'],
      timeoutMs: 300000,
      durationMs: 91,
      model: 'gpt-image-2',
      outputRelativePath: '',
      promptRelativePath: '',
      error: ''
    }
  ])
  assert.deepEqual(result.runRecord.generationStages, [{
    stage: 'final-image',
    ok: false,
    referenceRole: 'action-anchor',
    referenceRoles: ['action-anchor'],
    timeoutMs: 300000,
    durationMs: 300000,
    model: 'gpt-image-2',
    outputRelativePath: '',
    promptRelativePath: '',
    error: 'context canceled'
  }])
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
        message: `completed ${scenario} with source ${referenceImagePath} and key sk-real-secret-value`,
        run: {
          state: 'completed',
          mode: scenario,
          runId: `run-${scenario}`,
          commandId: 'import',
          message: `completed ${scenario}`,
          importedActionId: scenario === 'existing-action' ? 'smoke-wave' : '',
          importedPackId: scenario === 'new-character' ? 'smoke-mango-cat' : '',
          activatedPackId: scenario === 'new-character' ? 'smoke-mango-cat' : ''
        },
        reference: {
          targetType: 'editable-action-host',
          targetId: 'legacy-editable-host',
          assetPath: path.join(scenarioDir, 'user-data', 'creator-references', 'reference.png'),
          assetUrl: `file://${path.join(scenarioDir, 'user-data', 'creator-references', 'reference.png')}`,
          fileName: 'reference.png',
          width: 512,
          height: 512
        },
        activePet: scenario === 'new-character'
          ? {
              id: 'smoke-mango-cat',
              displayName: 'Smoke Mango Cat',
              rootPath: path.join(scenarioDir, 'user-data', 'pet-packs', 'smoke-mango-cat')
            }
          : null,
        diagnostics: {
          failureReason: `local issue at ${path.join(scenarioDir, 'private.txt')}`
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
      appLogs: [{ scope: 'creator-workflow', message: `ok ${referenceImagePath}` }],
      pluginLogs: [{ pluginId: 'openpet.creator-studio', message: `ok file://${path.join(scenarioDir, 'plugin-log.txt')}` }]
    })
  })

  assert.equal(report.ok, true)
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.evidenceType, 'creator-workflow-host-smoke')
  assert.match(report.claimBoundary, /requires complete provider-generated keyframe sprite-row evidence/i)
  assert.equal(report.scenarios.length, 2)
  assert.equal(report.scenarios[0].verification.ok, true)
  assert.equal(report.scenarios[1].verification.ok, true)
  assert.equal(report.scenarios[0].conditioningVerification.ok, true)
  assert.match(report.scenarios[0].conditioningVerification.message, /conditioning verified/)
  assert.equal(report.scenarios[0].conditioningVerification.artifactPaths.referenceInput, path.join('scenarios', 'new-character', 'run-reference.png'))
  assert.equal(report.scenarios[0].result.reference.assetPath, 'scenarios/new-character/user-data/creator-references/reference.png')
  assert.equal(report.scenarios[0].result.reference.assetUrl, undefined)
  assert.equal(report.scenarios[0].result.activePet.rootPath, 'scenarios/new-character/user-data/pet-packs/smoke-mango-cat')
  assert.equal(report.scenarios[0].result.message.includes('[redacted-path]'), true)
  assert.equal(report.scenarios[0].result.message.includes('sk-real-secret-value'), false)
  assert.equal(report.scenarios[0].result.diagnostics.failureReason.includes('[redacted-path]'), true)
  assert.equal(report.scenarios[0].appLogs[0].message.includes('[redacted-path]'), true)
  assert.equal(report.scenarios[0].pluginLogs[0].message.includes('[redacted-local-url]'), true)
  assert.equal(report.sessionDir, 'creator-workflow-host-smoke/2026-07-02T12-34-56-789Z')
  assert.equal(report.sourceUserDataDir, '[redacted-local-user-data]')
  assert.equal(report.referenceImagePath, 'reference.png')
  assert.equal(fs.existsSync(resolveOutputPath(path.join(outputDir, report.sessionId), report.reportPath)), true)
  const persisted = fs.readFileSync(resolveOutputPath(path.join(outputDir, report.sessionId), report.reportPath), 'utf-8')
  assert.match(persisted, /creator-workflow-host-smoke/)
  assert.doesNotMatch(persisted, /sk-real-secret-value/)
  assert.doesNotMatch(persisted, new RegExp(sourceUserDataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('runCreatorWorkflowHostSmoke redacts top-level sourceUserDataDir even when it is inside the repo root', async () => {
  const outputDir = createTempDir('openpet-creator-workflow-output-repo-')
  const sourceUserDataDir = path.join('/Users/mango/.codex/worktrees/ef96/OpenPet', 'tests', 'fixtures', 'creator-workflow-source-user-data')
  const referenceImagePath = path.join(createTempDir('openpet-creator-workflow-reference-'), 'reference.png')
  fs.writeFileSync(referenceImagePath, 'reference')

  const report = await runCreatorWorkflowHostSmoke({
    sourceUserDataDir,
    referenceImagePath,
    outputDir,
    scenario: 'existing-action',
    now: () => new Date('2026-07-02T12:34:56.789Z'),
    runScenarioImpl: async ({ scenario, scenarioDir, referenceImagePath: resolvedReferencePath }) => ({
      scenario,
      ok: true,
      startedAt: '2026-07-02T12:34:56.789Z',
      durationMs: 12,
      referenceImagePath: resolvedReferencePath,
      userDataDir: path.join(scenarioDir, 'user-data'),
      workspaceRoot: path.join(scenarioDir, 'workspace'),
      pluginDataDir: path.join(scenarioDir, 'plugin-data'),
      providerBefore: { ready: true, code: 'provider_healthy' },
      providerAfter: { ready: true, code: 'provider_healthy' },
      result: { ok: true, state: 'completed', code: 'smoke_completed', message: 'completed existing-action' },
      verification: { ok: true, message: 'verified existing-action', artifactPaths: {} },
      conditioningVerification: { ok: true, message: 'conditioning verified', artifactPaths: {} },
      runRecordPath: path.join(scenarioDir, 'run.json'),
      runRecord: { runId: 'run-existing-action', status: 'approved', artifacts: [] },
      seededSettingsSummary: { activePackId: 'legacy-cat' },
      appLogs: [],
      pluginLogs: []
    })
  })

  assert.equal(report.sourceUserDataDir, '[redacted-local-user-data]')
  const persisted = fs.readFileSync(resolveOutputPath(path.join(outputDir, report.sessionId), report.reportPath), 'utf-8')
  assert.match(persisted, /"\s*sourceUserDataDir": "\[redacted-local-user-data\]"/)
  assert.doesNotMatch(persisted, /tests\/fixtures\/creator-workflow-source-user-data/)
})
