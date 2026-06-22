# AI Provider Settings UX Design

> Date: 2026-06-22
> Status: implemented
> Owner surface: Control Center AI pane + main-process AI services
> Priority: P1

## 1. Background

OpenPet now supports pet conversation through the Control Center AI pane. The current runtime boundary is sound:

- non-secret AI config lives in `settings.json`;
- API keys are stored through `SecretService` in the main process;
- renderer and plugins only receive redacted config views such as `hasApiKey`;
- provider calls go through `AiService`;
- pet-pack persona and history go through `AiTalkService`;
- recent diagnostics now record `ai-chat.ipc.*`, `ai-talk.chat.*`, and `ai.provider.request.*` events without logging prompts or API keys.

The remaining user problem is configuration confidence. The AI pane has editable fields for provider, base URL, model, system prompt, and API key, but users cannot clearly tell:

- whether the values they typed are only local drafts or already active;
- whether the API key was saved successfully;
- whether the Test button uses saved values or current unsaved input;
- which base URL/model/key combination is being tested;
- how to recover when a chat send fails because the provider config is wrong.

This design turns that gap into a concrete implementation plan.

## 2. Goal

Give users a complete, safe AI provider settings workflow:

1. Edit API key, model, base URL, and provider.
2. Save configuration with explicit confirmation.
3. Save or replace API key without exposing it to the renderer.
4. See the currently active provider settings after save.
5. Test the active provider configuration and receive actionable feedback.
6. Avoid accidental confusion between unsaved draft values and active runtime values.

## 3. Non-Goals

- Do not move API keys into renderer state beyond the password draft typed by the user.
- Do not store API key values in `settings.json`, logs, plugin config, or chat history.
- Do not add multiple provider families beyond the existing `openai-compatible` path in this phase.
- Do not implement streaming chat responses in this phase.
- Do not redesign the whole AI pane visual system.
- Do not expose provider settings to ordinary plugins.

## 4. Current Implementation Snapshot

### Renderer

- `src/control-center/src/hooks/useAiPane.ts`
  - loads config with `api.getAiConfig()`;
  - stores editable config in `config`;
  - stores password draft in `apiKeyDraft`;
  - saves non-secret config with `api.saveAiConfig(configWithoutBehavior)`;
  - saves API key with `api.saveAiApiKey(apiKeyDraft)`;
  - tests active provider through `api.testAiConnection()`;
  - uses one shared `status` string for provider, image generation, chat, and behavior actions.

- `src/control-center/src/panes/AiPane.tsx`
  - renders Provider, Base URL, Model, API Key, System Prompt, and Memory fields;
  - shows `已保存` / `未保存` for API key;
  - has header buttons `测试` and `保存`;
  - has a separate `保存密钥` button beside the API key field.

### Preload and IPC

- `control-center-preload.js`
  - exposes `getAiConfig`, `saveAiConfig`, `saveAiApiKey`, `testAiConnection`, and `chat`.

- `src/main/ipc.js`
  - `AI_GET_CONFIG` returns `aiService.getConfig()`;
  - `AI_SAVE_CONFIG` delegates to `aiService.saveConfig(config)`;
  - `AI_SAVE_API_KEY` delegates to `aiService.saveApiKey(apiKey)`;
  - `AI_TEST_CONNECTION` delegates to `aiService.testConnection()`;
  - `AI_CHAT` delegates to `AiTalkService` when available.

### Main service

- `src/main/services/ai-service.js`
  - normalizes `provider`, `baseUrl`, `model`, `apiKeyRef`, `systemPrompt`, `memory`, and `behavior`;
  - returns `hasApiKey` but not the secret value;
  - stores secrets through `SecretService`;
  - uses the saved config for `testConnection()` and `complete()`.

## 5. UX Problems To Fix

### 5.1 Draft versus active config is unclear

Users can edit Base URL and Model, then press Test without knowing Test still uses the saved main-process config unless Save happened first.

### 5.2 API key save is separate but not strongly confirmed

The UI says `已保存`, but it does not show when the key was last changed, which key ref is active, or whether the following test used that newly saved key.

### 5.3 One status line is overloaded

The same `status` string is shared by:

- AI provider save/test;
- image generation save/test;
- chat send;
- behavior dry run/replay/export.

This causes important provider failures to be overwritten by unrelated actions.

### 5.4 Test result lacks enough context

A success message such as `连接正常：ok` does not say which endpoint/model was tested. A failure message may not guide the user to check base URL, model, key, or provider availability.

### 5.5 There is no explicit validation before save

Malformed base URLs, empty model names, and accidental whitespace should be caught before or during save with clear messages.

## 6. Proposed User Flow

### 6.1 Initial load

The AI pane should display two concepts:

- `Active provider config`: the sanitized config currently loaded from main process.
- `Draft changes`: current edits not yet saved.

Visible active summary:

```text
Active: OpenAI compatible · http://127.0.0.1:8317/v1 · gpt-5.5 · API key saved
```

If there are unsaved changes:

```text
Unsaved changes: Base URL, Model
```

### 6.2 Edit config

When the user edits provider, base URL, model, or system prompt:

- mark the form dirty;
- enable `保存配置`;
- show that `测试连接` will test active saved config unless the draft is saved first.

Recommended button labels:

- `保存配置`
- `保存密钥`
- `保存并测试`
- `测试当前已保存配置`

### 6.3 Save config

On `保存配置`:

1. Renderer validates obvious local input:
   - `baseUrl` is non-empty and parseable as `http:` or `https:`;
   - `model` is non-empty after trim;
   - `provider` is supported.
2. Renderer calls `saveAiConfig`.
3. Main process normalizes and persists non-secret fields.
4. Renderer reloads `getAiConfig()` or uses the returned sanitized config.
5. UI updates active summary and clears dirty state.
6. Status says exactly what changed:

```text
AI 配置已保存：Base URL / Model
```

### 6.4 Save API key

On `保存密钥`:

1. Renderer keeps key only in `apiKeyDraft`.
2. Renderer calls `saveAiApiKey(apiKeyDraft)`.
3. Main process stores the key through `SecretService`.
4. Renderer clears `apiKeyDraft`.
5. Renderer updates only `hasApiKey` and optional key metadata if added.

The renderer must never receive the key value back.

Recommended returned view:

```ts
type AiApiKeySaveResult = {
  apiKeyRef: string
  hasApiKey: boolean
  updatedAt?: string
}
```

`updatedAt` is optional. If implemented, it must be generated by main process and must not reveal the key.

### 6.5 Save and test

`保存并测试` should run:

1. save non-secret config if dirty;
2. save API key if `apiKeyDraft` is non-empty;
3. reload active config;
4. call `testAiConnection`;
5. display a structured result.

This is the safest primary action because it matches user intent: "use these values and tell me if they work".

### 6.6 Test active config

`测试当前已保存配置` should clearly state it ignores unsaved draft fields:

- if dirty, show a small warning:

```text
当前有未保存修改；本次测试使用已保存配置。
```

- result should include sanitized context:

```text
连接正常：openai-compatible · http://127.0.0.1:8317/v1 · gpt-5.5 · 1842ms
```

Failure examples:

```text
连接失败：未保存 API Key
连接失败：Provider 请求超时，请检查本地服务是否启动
连接失败：模型不可用，请检查 model 名称
连接失败：HTTP 401，请检查 API Key
连接失败：无法连接 base URL，请检查地址和端口
```

## 7. UI Layout Proposal

Keep this inside the existing AI pane. Do not create a new settings window.

### 7.1 Provider card

Fields:

- Enable chat toggle
- Provider select
- Base URL input
- Model input
- API Key password input
- System Prompt textarea
- Memory toggle

Header or footer actions:

- `保存配置`
- `保存密钥`
- `保存并测试`
- `测试当前已保存配置`

### 7.2 Active summary

Add a compact summary block above fields:

```text
当前生效
Provider: openai-compatible
Base URL: http://127.0.0.1:8317/v1
Model: gpt-5.5
API Key: 已保存
最后测试: 成功，2026-06-22 01:24，耗时 1842ms
```

Do not show API key previews for chat keys unless there is a strong product need. `hasApiKey` is enough for phase one.

### 7.3 Status separation

Split the single `status` into scoped statuses:

```ts
type AiPaneStatusState = {
  provider: string
  imageGeneration: string
  chat: string
  behavior: string
}
```

This prevents a chat send error from overwriting provider test feedback.

## 8. Main-Process API Design

### 8.1 Keep existing IPC where possible

Existing IPC can support phase one:

- `AI_GET_CONFIG`
- `AI_SAVE_CONFIG`
- `AI_SAVE_API_KEY`
- `AI_TEST_CONNECTION`

But `AI_TEST_CONNECTION` should return richer metadata.

### 8.2 Proposed test result shape

```ts
type AiConnectionTestResult = {
  ok: boolean
  provider: string
  baseUrl: string
  model: string
  hasApiKey: boolean
  elapsedMs: number
  reply?: string
  code?: string
  message?: string
}
```

Rules:

- `baseUrl` is sanitized normalized config, not user draft.
- `reply` is short and bounded.
- `message` must not include API key, prompt, or full provider response body.
- Provider-specific raw error can still be logged in sanitized app diagnostics if safe.

### 8.3 Proposed save result shape

`saveAiConfig` can continue returning sanitized `AiConfigViewState`.

`saveAiApiKey` can continue returning:

```ts
{
  apiKeyRef: string
  hasApiKey: boolean
}
```

Optional addition:

```ts
{
  updatedAt: string
}
```

This is useful for UI confirmation but not required for the first implementation.

## 9. Data And Security Boundaries

### 9.1 Allowed in renderer

- provider id;
- normalized base URL;
- model name;
- `hasApiKey`;
- optional key updated timestamp;
- current password draft while user is typing;
- connection test status and bounded result metadata.

### 9.2 Forbidden in renderer persistence

- saved API key value;
- Authorization header;
- raw provider request body;
- full system prompt in logs;
- chat content in provider diagnostics;
- provider error bodies that might echo prompts or secrets.

### 9.3 Logging

Provider settings actions should record app logs:

- `ai.settings.config.save.started`
- `ai.settings.config.save.completed`
- `ai.settings.config.save.failed`
- `ai.settings.api-key.save.completed`
- `ai.settings.connection-test.started`
- `ai.settings.connection-test.completed`
- `ai.settings.connection-test.failed`

Details may include:

- provider;
- base URL origin/path;
- model;
- elapsedMs;
- status code;
- hasApiKey;
- error code.

Details must not include:

- key value;
- user prompt;
- system prompt;
- Authorization header.

## 10. Implementation Phases

### Phase A: Provider form state and confirmation

Scope:

- Add active config snapshot and dirty-field detection in `useAiPane`.
- Add active summary UI in `AiPane`.
- Add local validation for base URL/model.
- Update save status to name saved fields.

Acceptance:

- Editing base URL/model marks form as dirty.
- Saving clears dirty state and updates active summary.
- Invalid base URL does not call IPC and shows a clear error.
- API key remains write-only.

Likely files:

- `src/control-center/src/hooks/useAiPane.ts`
- `src/control-center/src/panes/AiPane.tsx`
- `src/control-center/src/lib/defaults.ts`
- `src/shared/openpet-contracts.ts`
- `tests/control-center/control-center-smoke.spec.js`

### Phase B: Save-and-test workflow

Scope:

- Add `onSaveAndTest` handler.
- Save dirty non-secret config first.
- Save API key draft when present.
- Reload active config.
- Run connection test.
- Show sanitized tested provider/baseUrl/model/elapsedMs.

Acceptance:

- User can change base URL/model/key and press one button to make it active and test it.
- Test result clearly states which saved values were tested.
- Unsaved draft warning appears when using "test active config" while dirty.

Likely files:

- `src/control-center/src/hooks/useAiPane.ts`
- `src/control-center/src/panes/AiPane.tsx`
- `tests/control-center/control-center-smoke.spec.js`
- `tests/services/ai-service.test.js`

### Phase C: Rich connection test contract and diagnostics

Scope:

- Extend `AiService.testConnection()` result shape with provider/baseUrl/model/elapsedMs/code/message.
- Add settings-specific logs around save/test paths.
- Add tests that provider failures do not leak key or prompt.

Acceptance:

- `testAiConnection()` returns structured metadata.
- Failed connection reports actionable codes such as `missing_api_key`, `timeout`, `provider_http_error`, `network_error`, or `empty_response`.
- App logs show enough to debug without reading user prompts.

Likely files:

- `src/main/services/ai-service.js`
- `src/main/ipc.js`
- `src/shared/openpet-contracts.ts`
- `src/control-center/src/api/control-center-api.ts`
- `tests/services/ai-service.test.js`
- `tests/main/ipc-plugin-install.test.js`

## 11. Test Plan

### Unit tests

- `AiService.testConnection()` returns success metadata.
- Missing API key returns or throws a classified `missing_api_key` failure without logging secrets.
- Provider HTTP error is classified without logging raw prompt text.
- Base URL normalization preserves expected request URL.
- `saveAiConfig()` still does not persist derived fields like `hasApiKey`.

### Control Center tests

- Editing Base URL enables save and shows unsaved state.
- Invalid Base URL blocks save with a clear status.
- Saving config updates active summary.
- Saving API key clears password input and switches API key state to saved.
- Save-and-test displays tested provider/baseUrl/model.
- Test-active-config warns when draft changes are unsaved.

### Manual smoke

Use local provider:

```text
Base URL: http://127.0.0.1:8317/v1
Model: gpt-5.5
Image model: gpt-image-2, if the provider supports that exact image model name
```

Steps:

1. Open Control Center > AI.
2. Enter Base URL, Model, and API key.
3. Press `保存并测试`.
4. Confirm success status includes endpoint/model/latency.
5. Send a pet chat message.
6. Confirm `ai-chat.ipc.completed`, `ai-talk.chat.completed`, and `ai.provider.request.completed` appear in app logs.

## 12. Acceptance Checklist

- Users can save API key, model, and base URL from the AI pane.
- Users can confirm what provider settings are currently active.
- Users can run a connection test and see which active values were tested.
- Users are warned when testing active config while draft changes are unsaved.
- API key never appears in renderer responses, app logs, plugin config, or settings.
- Provider failures produce actionable UI messages.
- `npm run check:syntax` passes.
- Relevant service, IPC, and Control Center tests pass.

## 13. Backlog After This Design

- Provider presets for common OpenAI-compatible endpoints.
- Per-provider model discovery from `/models` where supported.
- Connection test history with last success/failure timestamp.
- Separate persona prompt editor with pet-pack override preview.
- Streaming chat response once the non-streaming provider settings flow is stable.
- Desktop floating-window chat integration after Control Center settings are reliable.
