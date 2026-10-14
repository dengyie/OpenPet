"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const ROOT = path.resolve(__dirname, "../..")
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8")

// Business-facing AI IPC was removed after the Backend HTTP/SSE cutover.
// Native Hatch and image configuration capabilities remain tracked separately
// in the channel-retirement ledger.
const RETIRED_AI_CHANNELS = [
  ["AI_GET_CONFIG", "getAiConfig"],
  ["AI_SAVE_CONFIG", "saveAiConfig"],
  ["AI_SAVE_API_KEY", "saveAiApiKey"],
  ["AI_SAVE_VISION_API_KEY", "saveAiVisionApiKey"],
  ["AI_CLEAR_VISION_API_KEY", "clearAiVisionApiKey"],
  ["AI_TEST_CONNECTION", "testAiConnection"],
  ["AI_DISCOVER_MODELS", "discoverAiModels"],
  ["AI_DISCOVER_VISION_MODELS", "discoverAiVisionModels"],
  ["AI_GET_PERSONA_PROFILE", "getAiPersonaProfile"],
  ["AI_GENERATE_PERSONA_DRAFT", "generateAiPersonaDraft"],
  ["AI_SAVE_PERSONA_OVERRIDE", "saveAiPersonaOverride"],
  ["AI_GET_MEMORY_PROFILE", "getAiMemoryProfile"],
  ["AI_DELETE_MEMORY", "deleteAiMemory"],
  ["AI_CLEAR_PET_PACK_MEMORIES", "clearAiPetPackMemories"],
  ["AI_TALK_GET_TRACE_SUMMARY", "getAiTalkTraceSummary"],
  ["AI_TALK_EXPORT_TRACE", "exportAiTalkTrace"],
  ["AI_GET_CONVERSATION", "getAiConversation"],
  ["AI_CHAT", "chat"],
  ["AI_EXPORT_TRACE_DIAGNOSTICS", "exportAiTalkTraceDiagnostics"],
  ["AI_BEHAVIOR_GET", "getAiBehavior"],
  ["AI_BEHAVIOR_SAVE", "saveAiBehavior"],
  ["AI_BEHAVIOR_DRY_RUN", "dryRunAiBehavior"],
  ["AI_BEHAVIOR_REPLAY_DECISION", "replayAiBehaviorDecision"],
  ["AI_BEHAVIOR_EXPORT_DIAGNOSTICS", "exportAiBehaviorDiagnostics"],
  ["AI_BEHAVIOR_CLEAR_DECISIONS", "clearAiBehaviorDecisions"],
]

test("retired AI business IPC stays absent after the Backend cutover", () => {
  const shared = read("apps/desktop/src/shared/ipc-channels.ts")
  const preload = read("apps/desktop/control-center-preload.js")
  const registrar = read("apps/desktop/src/ipc/register-ai-ipc.js")

  for (const [constant, exposedMethod] of RETIRED_AI_CHANNELS) {
    assert.doesNotMatch(shared, new RegExp(`\\b${constant}:`), `${constant} must stay retired`)
    assert.doesNotMatch(preload, new RegExp(`\\b${constant}:`), `${constant} must stay retired in preload`)
    assert.doesNotMatch(preload, new RegExp(`^\\s*${exposedMethod}\\s*:`, "m"), `${exposedMethod} must stay retired`)
    assert.doesNotMatch(registrar, new RegExp(`IPC\\.${constant}\\b`), `${constant} must not be registered`)
  }

  assert.match(preload, /getImageGenerationConfig:.*IPC\.IMAGE_GENERATION_GET_CONFIG/)
  assert.match(preload, /getHatchPetAgentRunStatus:.*IPC\.HATCH_PET_AGENT_GET_RUN_STATUS/)
})

test("AI Control Center callers use HTTP facade; native chat window IPC is the only exception", () => {
  const hook = read("apps/control-center/src/hooks/useAiPane.ts")
  const talkApi = read("apps/control-center/src/features/ai/talk-api.ts")
  const legacyApiMethods = new Set(RETIRED_AI_CHANNELS.map(([, method]) => method))
  const calls = [...hook.matchAll(/\bapi\.([A-Za-z0-9_]+)\s*\(/g)].map((match) => match[1])
  const unexpected = calls.filter((method) => legacyApiMethods.has(method))
  assert.deepEqual(unexpected, [], `AI pane still calls migrated preload methods: ${unexpected.join(", ")}`)
  assert.match(hook, /import \{ aiTalkApi \} from .*features\/ai\/talk-api/)
  assert.match(talkApi, /export const aiTalkApi/)
  assert.match(hook, /api\.getPetChatState\(/)
  assert.match(hook, /api\.openPetChatWindow\(/)
  assert.match(hook, /api\.openPetBubbleChat\(/)
  assert.doesNotMatch(talkApi, /controlCenterAPI\.?(?:getAi|saveAi|chat|dryRunAiBehavior)/)
})

test("AI IPC tests cover only retained host capabilities after business IPC retirement", () => {
  const ipcTests = read("tests/main/ipc-plugin-install.test.js") + read("tests/main/ipc-registration-groups.test.js")
  assert.doesNotMatch(ipcTests, /AI_CHAT|AI_BEHAVIOR_GET/)
  assert.match(ipcTests, /HATCH_PET_AGENT_CHECK_CAPABILITY/)
  assert.match(ipcTests, /IMAGE_GENERATION_GET_CONFIG/)
})
