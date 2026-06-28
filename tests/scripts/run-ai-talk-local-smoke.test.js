const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createSessionPaths,
  createSmokeSettingsSnapshot,
  defaultAppDataDir,
  defaultUserDataDir,
  parseArgs,
  sanitizeArchiveSummary,
  runAiTalkLocalSmoke
} = require('../../scripts/run-ai-talk-local-smoke')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

test('default user data path follows desktop conventions', () => {
  assert.equal(defaultUserDataDir({ appDataDir: '/Users/mango/Library/Application Support' }), '/Users/mango/Library/Application Support/ibot')
  assert.match(defaultAppDataDir({ platform: 'win32', env: { APPDATA: 'C:\\Users\\mango\\AppData\\Roaming' }, homedir: () => '/Users/mango' }), /AppData/)
})

test('createSmokeSettingsSnapshot preserves ai and pet-pack defaults', () => {
  const snapshot = createSmokeSettingsSnapshot({
    ai: { enabled: true, model: 'gpt-5.5', memory: { enabled: true } },
    petPacks: { activePackId: 'mochi-cat' }
  })

  assert.equal(snapshot.ai.enabled, true)
  assert.equal(snapshot.ai.model, 'gpt-5.5')
  assert.equal(snapshot.ai.memory.enabled, true)
  assert.equal(snapshot.petPacks.activePackId, 'mochi-cat')
  assert.deepEqual(snapshot.ecosystem.blocklist.pluginIds, [])
})

test('parseArgs accepts message, output dir, skip flag and log limit', () => {
  const options = parseArgs([
    '--message', 'hello',
    '--user-data-dir', '/tmp/user-data',
    '--output-dir', '/tmp/output',
    '--skip-connection-test',
    '--log-limit', '12'
  ])

  assert.equal(options.message, 'hello')
  assert.equal(options.userDataDir, path.resolve('/tmp/user-data'))
  assert.equal(options.outputDir, path.resolve('/tmp/output'))
  assert.equal(options.skipConnectionTest, true)
  assert.equal(options.logLimit, 12)
})

test('createSessionPaths creates deterministic artifact paths', () => {
  const paths = createSessionPaths({
    outputDir: '/tmp/openpet-smoke',
    now: () => new Date('2026-06-28T12:34:56.789Z')
  })

  assert.equal(paths.sessionId, '2026-06-28T12-34-56-789Z')
  assert.equal(paths.resultPath.endsWith(path.join('2026-06-28T12-34-56-789Z', 'ai-talk-local-smoke-result.json')), true)
  assert.equal(paths.aiTalkStorePath.endsWith(path.join('2026-06-28T12-34-56-789Z', 'ai-talk-store.json')), true)
})

test('sanitizeArchiveSummary redacts local absolute paths for persisted evidence', () => {
  const sanitized = sanitizeArchiveSummary({
    userDataDir: '/Users/mango/Library/Application Support/ibot',
    sessionDir: '/repo/tmp/real-provider-chat-acceptance/2026-06-28T12-34-56-789Z',
    liveAiTalkStorePath: '/Users/mango/Library/Application Support/ibot/ai-talk-store.json',
    tempAiTalkStorePath: '/repo/tmp/real-provider-chat-acceptance/2026-06-28T12-34-56-789Z/ai-talk-store.json',
    logPath: '/repo/tmp/real-provider-chat-acceptance/2026-06-28T12-34-56-789Z/logs/openpet-app.jsonl',
    resultPath: '/repo/tmp/real-provider-chat-acceptance/2026-06-28T12-34-56-789Z/ai-talk-local-smoke-result.json'
  }, { projectRoot: '/repo' })

  assert.equal(sanitized.userDataDir, '[redacted-local-user-data]')
  assert.equal(sanitized.liveAiTalkStorePath, '[redacted-local-user-data]/ai-talk-store.json')
  assert.equal(sanitized.sessionDir, 'tmp/real-provider-chat-acceptance/2026-06-28T12-34-56-789Z')
  assert.equal(sanitized.tempAiTalkStorePath, 'tmp/real-provider-chat-acceptance/2026-06-28T12-34-56-789Z/ai-talk-store.json')
  assert.equal(sanitized.logPath, 'tmp/real-provider-chat-acceptance/2026-06-28T12-34-56-789Z/logs/openpet-app.jsonl')
  assert.equal(sanitized.resultPath, 'tmp/real-provider-chat-acceptance/2026-06-28T12-34-56-789Z/ai-talk-local-smoke-result.json')
})

test('runAiTalkLocalSmoke writes a redacted smoke summary using injected host services', async () => {
  const userDataDir = createTempDir('openpet-ai-talk-user-data-')
  const outputDir = createTempDir('openpet-ai-talk-output-')
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-5.5'
    },
    petPacks: {
      activePackId: 'legacy-cat',
      installed: {}
    }
  }, null, 2))
  fs.writeFileSync(path.join(userDataDir, 'secrets.json'), JSON.stringify({
    secrets: {
      'ai.default': {
        label: 'AI API Key',
        value: 'sk-test-secret',
        updatedAt: '2026-06-28T12:00:00.000Z'
      }
    }
  }, null, 2))

  const result = await runAiTalkLocalSmoke({
    message: '用一句话回复烟测完成',
    userDataDir,
    outputDir,
    now: () => new Date('2026-06-28T12:34:56.789Z'),
    createSecretServiceImpl: () => ({
      getSecretValue: () => 'sk-test-secret'
    }),
    createAiServiceImpl: ({ appLogService }) => ({
      getConfig: () => ({
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5',
        hasApiKey: true
      }),
      testConnection: async () => {
        appLogService.record({
          scope: 'ai-settings',
          level: 'info',
          event: 'ai.settings.connection-test.completed',
          message: 'AI provider connection test completed',
          details: { elapsedMs: 10 }
        })
        return {
          ok: true,
          code: 'ok',
          message: 'AI provider connection test succeeded',
          elapsedMs: 10,
          reply: 'ok'
        }
      }
    }),
    createAiTalkStoreImpl: () => ({}),
    createPetUtteranceLogServiceImpl: () => ({}),
    createPetPackServiceImpl: () => ({
      getActivePetPack: () => ({
        manifest: {
          id: 'legacy-cat',
          displayName: 'Legacy Cat'
        }
      })
    }),
    createAiTalkServiceImpl: ({ appLogService }) => ({
      chat: async ({ requestId }) => {
        assert.match(requestId, /^chat-/)
        appLogService.record({
          scope: 'ai-talk',
          level: 'info',
          event: 'ai-talk.chat.completed',
          message: 'AI talk chat completed',
          details: { replyChars: 4 }
        })
        return {
          requestId,
          conversationId: 'control-center:legacy-cat:main',
          reply: '烟测完成',
          bubbleSegments: ['烟测完成'],
          messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '烟测完成' }],
          behaviorIntent: { intent: 'comfort', actionId: 'idle' },
          providerLatencyMs: 820
        }
      },
      flushMemoryJobs: async () => {},
      getTraceExport: () => ({
        petPackId: 'legacy-cat',
        traces: [{
          id: 'trace-1',
          type: 'ai-talk-chat',
          success: true,
          provider: 'openai-compatible',
          model: 'gpt-5.5',
          requestId: 'chat-from-trace',
          messagesCount: 3,
          memoryContextCount: 0,
          recentPetActivityCount: 0,
          replyChars: 4,
          bubbleSegmentCount: 1,
          errorCode: ''
        }]
      })
    })
  })

  assert.equal(result.ok, true)
  assert.equal(result.connectionTest.ok, true)
  assert.equal(result.chat.ok, true)
  assert.equal(result.chat.replyPreview, '烟测完成')
  assert.equal(result.bubbleDispatch.attempted, true)
  assert.match(result.bubbleDispatch.requestId, /^chat-/)
  assert.equal(result.bubbleDispatch.petSayReceived, true)
  assert.equal(result.bubbleDispatch.bubbleStateVisible, true)
  assert.equal(result.bubbleDispatch.petSaySource, 'ai')
  assert.equal(result.bubbleDispatch.petSaySourceSurface, 'local-smoke')
  assert.equal(result.bubbleDispatch.dialogueCount >= 1, true)
  assert.equal(result.bubbleDispatch.correlatedLogCount >= 2, true)
  assert.equal(result.bubbleDispatch.correlatedLogEvents.includes('pet-bubble-chat.message.displayed'), true)
  assert.equal(result.bubbleDispatch.correlatedLogEvents.includes('pet.say.ingress'), true)
  assert.equal(result.bubbleDispatch.correlatedSourceSurfaces.includes('local-smoke'), true)
  assert.equal(result.bubbleAcceptance.providerLatencyMs, 820)
  assert.match(result.bubbleAcceptance.requestId, /^chat-/)
  assert.equal(result.bubbleAcceptance.bubbleSegmentCount, 1)
  assert.deepEqual(result.manualAcceptanceTemplate, {
    bubbleVisibleLongEnough: null,
    inputUsable: null,
    desktopFeelNotes: '',
    requestId: result.bubbleAcceptance.requestId
  })
  assert.equal(result.traces.length, 1)
  assert.equal(result.traces[0].requestId, 'chat-from-trace')
  assert.equal(result.traceRequestIds.includes('chat-from-trace'), true)
  assert.equal(result.bubbleDispatch.requestId, result.bubbleAcceptance.requestId)
  assert.equal(result.logs.some((entry) => entry.scope === 'ai-talk'), true)
  assert.equal(result.logs.some((entry) => entry.scope === 'pet-bubble-chat'), true)
  assert.equal(fs.existsSync(result.resultPath), true)
  const persisted = JSON.parse(fs.readFileSync(result.resultPath, 'utf-8'))
  assert.equal(persisted.chat.replyPreview, '烟测完成')
  assert.equal(persisted.bubbleDispatch.requestId, result.bubbleDispatch.requestId)
  assert.equal(persisted.bubbleDispatch.petSayReceived, true)
  assert.equal(persisted.bubbleDispatch.bubbleStateVisible, true)
  assert.equal(persisted.bubbleAcceptance.providerLatencyMs, 820)
  assert.equal(persisted.manualAcceptanceTemplate.requestId, persisted.bubbleAcceptance.requestId)
  assert.equal(persisted.userDataDir, '[redacted-local-user-data]')
  assert.equal(persisted.liveAiTalkStorePath, '[redacted-local-user-data]/ai-talk-store.json')
  assert.match(persisted.sessionDir, /openpet-ai-talk-output-/)
  assert.doesNotMatch(JSON.stringify(persisted), /Library\/Application Support\/ibot/)
})
