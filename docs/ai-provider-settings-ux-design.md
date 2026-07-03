# AI Provider Settings UX Design

> Date: 2026-07-04
> Status: implemented baseline, next-phase redesign planned
> Owner surface: Control Center AI pane + main-process AI / image-generation / creator workflow services
> Priority: P1

## Implementation Update: 2026-07-04

This document now also covers the next Provider UX redesign pass that was confirmed after the first unified Provider hub landed.

The current implemented baseline remains true:

- one default-open `模型 Provider` section;
- two capability cards:
  - `聊天模型`
  - `图片模型`
- host-owned config shape:
  - `Base URL`
  - `API Key`
  - `Model`
- save/test and save/health flows stay separate;
- `/models` discovery exists and is already visible in diagnostics;
- logs are structured and redacted for Provider and Creator flows.

The newly confirmed next-phase goals are:

1. Keep `模型 Provider` as one unified page.
2. Turn `聊天模型` and `图片模型` into summary-first collapsible capability cards.
3. Replace plain model text inputs with a searchable model selector.
4. Distinguish model sources as:
   - `推荐模型`
   - `缓存模型`
   - `手动输入`
5. Persist discovered model lists locally with bounded cache rules instead of keeping them only in page memory.
6. Preserve OpenAI-compatible flexibility: model selection must never depend on `/models` being available.

This next phase is a product and interaction redesign on top of the already-landed host-owned security boundary. It is not a rollback to multiple provider pages, and it does not reintroduce `local` versus `cloud` form splits.

## Implementation Update: 2026-07-03

This document is now the active design-and-development note for the current AI Provider work, not only the original save/test split.

The current landed slice includes:

- one default-open `模型 Provider` section in the AI pane, with two capability cards:
  - `聊天模型`
  - `图片模型`
- chat and image provider settings both using the same host-owned contract shape:
  - `Base URL`
  - `API Key`
  - `Model`
- no renderer-side distinction between `local` and `cloud`; environment switching is done by changing the saved endpoint/model/key.
- disclosure-based secondary UI for:
  - provider boundary copy
  - provider presets
  - advanced settings
- compact active summaries that surface:
  - active host
  - active model
  - key saved state
  - dirty-draft state
- structured diagnostics for:
  - chat saved-config test
  - image provider health check
  - optional `/models` discovery
  - image compatibility hints
- main-process safe logs for:
  - chat provider config save
  - chat provider API key save
  - image provider config save
  - image provider API key save / clear
  - Creator Studio default-flow lifecycle
  - Creator workflow lifecycle
- hardened app-log redaction for prompt-like and reply-like fields so provider/Creator diagnostics can be retained without leaking user prompts or provider replies.

## Implementation Update: 2026-06-23

This design is implemented for the chat provider path:

- `useAiPane` keeps an active provider snapshot separate from editable drafts.
- `保存聊天 Provider` validates Base URL and model before calling IPC, saves regardless of whether a later test succeeds, and refreshes the active provider view.
- `测试已保存配置` reports when unsaved drafts exist and still tests only the active saved config.
- `AiService.testConnection()` returns structured `ok`, `provider`, sanitized `baseUrl`, `model`, `hasApiKey`, `elapsedMs`, `code`, and `message` fields.
- Provider errors are classified into actionable failures such as auth, timeout, model/endpoint, empty response, and network/provider errors.
- Credentialed Base URLs are sanitized for renderer display, and save logic protects against replacing a credentialed stored URL with a display-only downgraded URL.
- Provider logs intentionally avoid API keys, Authorization headers, prompts, and raw provider response bodies.

The same AI pane now also exposes host-owned Creator Studio image-generation settings. That surface belongs to `ImageGenerationModelService`, not `AiService`: it manages the unified OpenAI-compatible image Provider config, API key storage, health checks, provider invocation, and generated output writes. Creator Studio may still use `fixture` / `cloud` / `local` as run backend vocabulary, but Provider credentials and calls stay host-owned. Future UI work should likely split this into a clearer model-settings card, but the security boundary is already host-owned.

## 0. Current Design Summary

The current design direction is:

1. Put all model-provider settings in one place: `Control Center -> AI -> 模型 Provider`.
2. Keep one host-owned configuration model for chat and image generation.
3. Make “saved active config” and “unsaved local draft” visually different.
4. Keep trust boundaries visible in the UI instead of assuming users understand host/plugin separation.
5. Add enough structured logging and regression tests that provider failures are diagnosable without leaking secrets or prompt bodies.

In practice, this means the page is no longer “a flat long form”. It is a layered page:

- top summary hub;
- one chat capability card;
- one image capability card;
- diagnostics and compatibility feedback near the card that owns it;
- secondary/rare settings hidden under disclosures.

## 0B. Next-Phase Redesign Summary

The next phase should move the current page from “two long cards with internal disclosures” to “two compact operational panels”:

- each capability card keeps a permanent summary header;
- only the editable body is collapsed/expanded;
- the most common actions stay visible in the header;
- model selection becomes assisted instead of input-only;
- model discovery becomes reusable cached data instead of one-off transient diagnostics.

This is not a major architecture rewrite. It is an interaction-system upgrade over the existing Provider hub.

Confirmed product decisions for this redesign:

1. `模型 Provider` remains one page and one ownership boundary.
2. Capability cards do not disappear completely when collapsed.
3. `Model` keeps free-text compatibility through fallback manual entry.
4. Discovered model lists should survive page reloads and app restarts.
5. Cached model lists must be visibly marked as cached, not treated as authoritative truth.

## 0C. Single Source Of Truth Rules

The Provider redesign is not only a UI consolidation. It is also a hard architecture rule.

1. All text-model consumers must use the saved `聊天模型` Provider configuration as their only persisted model source.
2. All image-generation consumers must use the saved `图片模型` Provider configuration as their only persisted model source.
3. No feature, workflow, plugin, renderer pane, or background job may persist an independent host-managed `baseUrl` / `apiKey` / `model` setting outside the Provider ownership boundary.
4. Renderer state may hold temporary drafts for editing, but drafts do not become runtime truth until the host Provider save path persists them.
5. Workflow payloads, plugin payloads, task snapshots, run artifacts, and imported pack metadata may record which model was used for a specific run, but they must never become a separate persisted override source for future host-managed runs.
6. If a future capability needs different routing or more than two capability owners, that must be added by extending the Provider ownership model explicitly rather than creating a side-channel setting.

This means “one Provider page” is only considered complete when it is also “one persisted source of model truth”.

## 0D. Model Consumer Ownership Matrix

Every current and future model-consuming path must map back to one of the two Provider capability owners.

### `聊天模型` Provider owns

- pet chat replies;
- bubble chat replies;
- desktop chat replies;
- Control Center chat sends;
- pet-pack persona draft generation;
- memory extraction and other text-side background AI tasks;
- behavior or tool-orchestration text reasoning that depends on the host chat model;
- any future text, conversation, summarization, classification, drafting, or reasoning feature.

### `图片模型` Provider owns

- Creator Studio image generation;
- action-frame generation;
- pet or pet-pack image generation;
- provider-backed asset regeneration or repair flows;
- any future host-owned image-generation feature.

### Explicitly forbidden persistence patterns

- feature-specific saved model settings in persona, memory, behavior, chat, Creator Studio, Actions, or plugin panes;
- renderer-owned persisted provider or model settings;
- plugin-owned persisted provider, API key, or model settings for host-managed chat or image capabilities;
- workflow or task payloads becoming the next-run persisted model override;
- separate “Creator model setting”, “memory model setting”, or “chat window model setting” storage paths that bypass Provider management.

## 0A. Current Code Boundaries

### Renderer / Control Center

- `src/control-center/src/panes/AiPane.tsx`
  - provider page structure
  - disclosure layout
  - active summary and diagnostics rendering
- `src/control-center/src/styles.css`
  - provider card layout, status strips, disclosures, compact summaries
- `src/control-center/src/hooks/useAiPane.ts`
  - draft state
  - active state refresh
  - save/test/health/discovery interaction wiring

### Main process services

- `src/main/services/ai-service.js`
  - chat provider config save
  - API key storage via secret service
  - saved-config connection test
  - safe settings logs
- `src/main/services/image-generation-model-service.js`
  - image provider config save
  - image API key save/clear
  - health check and `/models` discovery
  - host-owned generation settings logs
- `src/main/services/creator-studio-default-flow-service.js`
  - host-owned default generate-and-import flow
  - structured lifecycle logging
- `src/main/services/creator-workflow-service.js`
  - workflow orchestration across draft / confirm / generate / approve / import
  - structured lifecycle logging
- `src/main/services/app-log-service.js`
  - safe app-log storage
  - detail-key redaction and secret-pattern redaction

### Provider ownership enforcement

- `AiService` is the persisted owner for chat-model configuration and chat-model discovery cache.
- `ImageGenerationModelService` is the persisted owner for image-model configuration and image-model discovery cache.
- `AiTalkService`, creator workflows, plugin bridges, and renderer hooks are consumers of those saved views, not owners of parallel model settings.

### Regression boundaries

- `tests/control-center/control-center-smoke.spec.js`
  - AI provider pane structure and interaction regression
- `tests/services/ai-service.test.js`
  - safe save/test logging
- `tests/services/image-generation-model-service.test.js`
  - image provider safe save/clear logging
- `tests/services/creator-studio-default-flow-service.test.js`
  - default-flow lifecycle logging
- `tests/services/creator-workflow-service.test.js`
  - workflow lifecycle logging
- `tests/services/app-log-service.test.js`
  - prompt/reply/reference-path redaction

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

And for maintainers:

7. Diagnose provider and Creator workflow failures from sanitized logs.
8. Evolve the provider pane without reintroducing long-form UI sprawl.

For the next phase specifically:

9. Make the Provider page shorter without hiding the active runtime state.
10. Let users choose models from cached/provider-discovered lists instead of always typing exact model ids manually.
11. Preserve compatibility with providers that do not expose `/models`.
12. Guarantee that all host-managed model configuration and model discovery flows converge on the current Provider management boundary.

## 3. Non-Goals

- Do not move API keys into renderer state beyond the password draft typed by the user.
- Do not store API key values in `settings.json`, logs, plugin config, or chat history.
- Do not add arbitrary provider-family-specific forms in the renderer. The current UX intentionally stays on one OpenAI-compatible contract shape.
- Do not implement streaming chat responses in this phase.
- Do not turn the AI pane into a giant provider marketplace/catalog.
- Do not expose provider settings to ordinary plugins.
- Do not make `/models` discovery a required precondition for saving or testing a Provider.
- Do not replace the final persisted model string with provider-specific object schemas.
- Do not create separate AI settings pages for chat and image generation.
- Do not let non-Provider features persist their own model config for host-managed chat or image capabilities.
- Do not introduce generic cache-write IPC that allows renderer or plugins to mutate provider discovery cache directly.

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
  - renders one `模型 Provider` section with `聊天模型` and `图片模型` capability cards;
  - renders compact active summaries and provider status strips;
  - keeps boundary copy, presets, and advanced settings behind `details.provider-disclosure`;
  - shows separate diagnostics for chat test, image health, model discovery, and compatibility hints;
  - keeps chat save/test and image save/health flows card-local instead of one shared flat form.

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
  - uses the saved config for `testConnection()` and `complete()`;
  - records sanitized settings-save and api-key-save logs.

- `src/main/services/image-generation-model-service.js`
  - owns host-side image provider config;
  - stores image API key through `SecretService`;
  - performs health checks and optional `/models` discovery;
  - records sanitized settings-save and api-key mutation logs.

- `src/main/services/creator-studio-default-flow-service.js`
  - records started/stage/blocked/needs-details/completed/failed events with request correlation ids.

- `src/main/services/creator-workflow-service.js`
  - records workflow lifecycle and stage completion events with request correlation ids.

- `src/main/services/app-log-service.js`
  - redacts prompt-like, reply-like, path-like, and token-like fields before they can hit disk.

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

This was partially reduced by card-local provider feedback, but full status isolation across all AI sub-surfaces is still only partially solved.

### 5.4 Test result lacks enough context

A success message such as `连接正常：ok` does not say which endpoint/model was tested. A failure message may not guide the user to check base URL, model, key, or provider availability.

### 5.5 There is no explicit validation before save

Malformed base URLs, empty model names, and accidental whitespace should be caught before or during save with clear messages.

### 5.6 Capability cards are still visually long

Even after moving secondary material behind disclosures, both capability cards still read as large forms. The current layout improves trust and grouping, but it still asks users to visually parse too much content before reaching the fields or action they need.

### 5.7 Model selection is still input-only

Users can already probe `/models`, but they still have to manually type the final model string into the form. This creates three issues:

- users cannot easily reuse discovered models;
- users cannot easily tell whether a value is recommended, discovered, or custom;
- users can save a typo even when the provider already returned a usable model list.

### 5.8 Discovery state is not yet treated as a reusable asset

The current implementation already stores discovery state in page-level React state for diagnostics, but that state is currently:

- local to the AI pane session;
- reset when the app restarts;
- not explicitly modeled as cache;
- not presented as a selector source.

That is sufficient for diagnostics, but not sufficient for a selection-first Provider UX.

### 5.9 Cache ownership is too implicit

The redesign already assumes persisted model discovery cache, but without a hard ownership rule it is too easy for renderer code, Creator workflows, or plugin-facing adapters to grow their own cache-write paths. That would recreate the same configuration drift this Provider unification is trying to remove.

## 6. Current User Flow

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

- `保存聊天 Provider`
- `测试已保存配置`

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

Original design note: this used to propose a combined save/test action. The current product decision is to keep save and test separate:

- `保存聊天 Provider` persists the draft and succeeds or fails independently from provider reachability.
- `测试已保存配置` tests only the active saved config and warns when local drafts are unsaved.
- A failed test must not roll back a successful save.

This avoids hiding two different operations behind one button and makes it clear whether the app is saving configuration or contacting a provider.

### 6.6 Image provider path

Image provider follows the same saved-config mental model:

- edit Base URL / Model / Timeout / Max concurrent jobs;
- save `图片 Provider`;
- save or clear `图片 API Key`;
- run `检查图片健康` against the saved config only;
- use `/models` discovery and compatibility hints as diagnostics, not as implicit save behavior.

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

## 7. Current UI Layout

Keep this inside the existing AI pane. Do not create a new settings window.

### 7.1 Provider hub

Top-of-section summary now shows:

- chat model saved state
- image model saved state
- latest chat connection state
- latest image health state

### 7.2 Capability cards

Fields:

- Enable chat toggle
- Provider select
- Base URL input
- Model input
- API Key password input
- System Prompt textarea
- Memory toggle

Header or footer actions:

- `保存聊天 Provider`
- `保存密钥`
- `测试已保存配置`
- `保存图片 Provider`
- `保存图片密钥`
- `检查图片健康`

### 7.3 Active summary

Add a compact summary block above fields:

```text
当前生效
Provider: openai-compatible
Base URL: http://127.0.0.1:8317/v1
Model: gpt-5.5
API Key: 已保存
最后测试: 成功，2026-06-22 01:24，耗时 1842ms
```

Chat keeps `hasApiKey` only. Image may show a bounded preview token like `••••1234` because that was already part of the existing product behavior and helps distinguish “saved vs replaced” in the image flow.

### 7.4 Disclosure strategy

Rarely needed content is intentionally hidden by default:

- boundary copy
- preset cards
- advanced settings such as system prompt and image timeout/concurrency

This keeps the AI pane short enough to avoid the original “very long page” problem while still preserving one-place configuration.

### 7.5 Status separation

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

## 7B. Next-Phase UI Layout

### 7B.1 Page shape

The page should keep this top-level structure:

1. `模型 Provider` section
2. top hub summary
3. `聊天模型` capability card
4. `图片模型` capability card

The hub summary still exists because it helps users understand both capabilities at once. The main redesign happens inside each capability card.

### 7B.2 Capability card structure

Each capability card should be split into:

- persistent summary header;
- collapsible editable body.

#### Persistent header

The header stays visible whether the body is expanded or collapsed.

Header content:

- card title:
  - `聊天模型`
  - `图片模型`
- current active host summary;
- current active model;
- key saved/missing state;
- latest test/health state;
- main actions:
  - chat:
    - `测试已保存配置`
    - `刷新聊天模型`
    - expand/collapse
  - image:
    - `检查图片健康`
    - `刷新图片模型`
    - expand/collapse

This turns each card into an operational status block first and a form second.

#### Collapsible body

The body contains:

- basic editable fields;
- key save controls;
- preset content;
- advanced settings;
- detailed compatibility and diagnostics sections if they are not already visible in the header.

Recommended default behavior:

- cards are collapsed by default after the first successful load;
- if validation fails or no config exists yet, keep the relevant card expanded;
- if the user just clicked a preset, keep the edited card expanded.

### 7B.3 Why not fully collapse the whole card

The card should not fully disappear behind a title-only row because users still need immediate visibility into:

- which host is active;
- which model is active;
- whether a key exists;
- whether the last test/health probe failed.

That information is critical operator state and should remain visible even when the long form is hidden.

### 7B.4 Model selector layout

Replace the current plain `input` for `Model` with a searchable combobox-like selector.

The selector must support three sources:

1. `推荐模型`
2. `缓存模型`
3. `手动输入`

#### Recommended models

These come from OpenPet-owned defaults and presets, for example:

- chat:
  - `gpt-4o-mini`
  - `gpt-5.5` for the OpenPet 8317 gateway preset
- image:
  - `gpt-image-2`

These are not proof that the current provider supports the model. They are safe starting points or known OpenPet defaults.

#### Cached models

These come from the most recent `/models` discovery for the specific capability and endpoint.

The UI should show:

- cache age, for example `10 分钟前探测`;
- source scope, for example `来自当前聊天 Provider`;
- whether the current saved model appears in that list.

#### Manual input

Users must still be able to type any model string.

If the typed value is not in `推荐模型` or `缓存模型`, the selector should still accept it and render it as:

- `自定义模型名`

This preserves compatibility for:

- provider aliases;
- self-hosted gateways;
- providers without `/models`;
- models created after the last cache refresh.

### 7B.5 Model selector interaction rules

Rules:

1. Selecting a recommended or cached model updates the draft field value exactly as if it had been typed manually.
2. Saving persists only the final string value, not the model-source metadata.
3. Diagnostics may still compare the saved string against the discovered cache.
4. If discovery is unavailable, the selector still works with:
   - recommended models;
   - manual input.
5. The selector must never block `保存聊天 Provider` or `保存图片 Provider`.

### 7B.6 Discovery affordance

The `刷新模型` action should no longer feel diagnostic-only.

It should:

- update the local cache;
- refresh the cache-backed selector group;
- refresh the discovery diagnostic block;
- update the visible “cache age” label.

This makes model discovery part of the configuration workflow, not just a debug output.

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

### 8.4 Model discovery cache contract

The next phase should add an explicit persisted cache contract.

Recommended logical shape:

```ts
type ProviderCapabilityKey = 'chat' | 'image'

type ProviderDiscoveryCacheEntry = {
  provider: string
  baseUrl: string
  models: string[]
  code: string
  message: string
  discoveredAt: string
}

type ProviderDiscoveryCacheState = {
  chat: Record<string, ProviderDiscoveryCacheEntry>
  image: Record<string, ProviderDiscoveryCacheEntry>
}
```

Recommended cache key:

```ts
`${provider}::${normalizedBaseUrl}`
```

For example:

- `openai-compatible::http://127.0.0.1:8317/v1`
- `openai-compatible::https://api.openai.com/v1`

This key should be separated by capability:

- `chat` cache is distinct from `image` cache;
- even when host and provider are the same, the two capability caches may differ.

### 8.5 Persistence boundary

The cache belongs in host-owned settings, not in ordinary renderer local state and not in plugin storage.

Why:

- it survives restart;
- it respects the existing settings ownership model;
- it avoids per-plugin duplication or leakage;
- it can be TTL-managed centrally.

What is safe to persist:

- provider id;
- normalized base URL;
- discovered models;
- discovered timestamp;
- probe code/message.

What must not be persisted as part of cache:

- API keys;
- request bodies;
- prompt text;
- raw provider responses.

### 8.6 Discovery cache write ownership

Cache persistence must have explicit write owners.

Write ownership rules:

1. `AiService` is the only write owner for `chat` discovery cache entries.
2. `ImageGenerationModelService` is the only write owner for `image` discovery cache entries.
3. Renderer code, `useAiPane`, `AiPane`, `AiTalkService`, Creator workflows, preload adapters, and plugin bridges are read-only consumers of persisted discovery cache.
4. There must be no generic “save provider cache” IPC exposed to renderer or plugins.
5. If a future shared cache utility is introduced, it must remain host-internal and preserve the same single-writer ownership by capability.

Operationally, this means:

- chat `/models` refresh writes flow through `AiService`;
- image `/models` refresh writes flow through `ImageGenerationModelService`;
- UI-triggered refresh actions may request discovery, but they do not write cache directly;
- workflow runs may read the current saved config and current cached hints, but they must not mutate cache as an independent side effect unless routed through the owning service.

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

Provider settings and Creator workflow actions now record app logs such as:

- `ai.settings.saved`
- `ai.settings.api-key.saved`
- `imageGeneration.settings.saved`
- `imageGeneration.settings.api-key.saved`
- `imageGeneration.settings.api-key.cleared`
- `creator.default-flow.started`
- `creator.default-flow.stage.completed`
- `creator.default-flow.completed`
- `creator.default-flow.failed`
- `creator.workflow.started`
- `creator.workflow.stage.completed`
- `creator.workflow.completed`
- `creator.workflow.failed`

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

### 9.4 Cached discovery data

Cached discovery data is allowed to persist because it is not a secret by itself, but it still needs guardrails:

- cache must be namespaced by capability and endpoint;
- cache entries should have TTL and stale labeling;
- renderer should treat cache as hinting data, not guaranteed runtime truth;
- cache should be easy to clear automatically by replacement or expiry.

## 10. Next-Phase Implementation Plan

### 10.1 Scope

This phase covers:

- summary-first collapsible capability cards;
- searchable model selectors;
- provider model discovery persistence cache;
- cache-aware diagnostics and UX copy;
- regression coverage for the new interaction model.

This phase does not cover:

- provider-family-specific field sets;
- streaming responses;
- provider failover/routing;
- extension/plugin exposure of provider caches.

### 10.2 Renderer changes

#### `AiPane.tsx`

Refactor the capability card rendering into a reusable component such as:

```ts
type ProviderCapabilityCardProps = {
  title: string
  summary: ...
  actions: ...
  expanded: boolean
  onToggleExpanded: () => void
  body: ReactNode
}
```

Add a model selector component, likely:

```ts
type ProviderModelSelectorProps = {
  label: string
  value: string
  recommendedModels: string[]
  cachedModels: string[]
  cachedAt?: string
  discoveryStatus?: string
  onChange: (value: string) => void
}
```

#### `useAiPane.ts`

Add:

- expanded/collapsed state per capability card;
- cache-backed model option derivation;
- load and refresh flows for persisted discovery cache;
- cache invalidation rules when provider/baseUrl changes.

Recommended derived helpers:

- `buildProviderCacheKey(capability, provider, baseUrl)`
- `getCachedModelOptions(...)`
- `mergeRecommendedAndCachedModels(...)`
- `isCustomModelValue(...)`

### 10.3 Main process changes

Add host-side cache storage and retrieval in the appropriate settings-backed layer.

The simplest path is:

- extend the host settings schema;
- update AI and image provider discovery save paths to record cache entries;
- expose getter methods for current cache entries through existing Control Center API adapters.

Required ownership rule:

- `AiService` writes and serves `chat` cache entries.
- `ImageGenerationModelService` writes and serves `image` cache entries.
- any helper extracted later, such as a small `ProviderDiscoveryCacheService`, must remain host-internal plumbing under those same capability owners and must not become a generic renderer- or plugin-writable cache surface.

### 10.4 Cache rules

Recommended baseline rules:

1. TTL: 24 hours
2. Scope:
   - `chat` cache separate from `image`
   - cache key includes normalized base URL and provider id
3. Refresh:
   - explicit refresh rewrites cache
   - test/health paths may also refresh cache when `/models` is successfully returned
4. Invalidation:
   - switching to another base URL uses another cache key
   - saving a changed base URL clears in-memory visible cache for the previous active draft
5. Rendering:
   - stale cache may still be shown
   - stale cache must be labeled as cached/stale
   - stale cache must not block save or test

### 10.5 Recommended UI copy

For the selector group labels:

- `推荐模型`
- `缓存模型`
- `自定义输入`

For cache metadata:

- `缓存于 2026-07-04 10:32`
- `24 小时前缓存，建议刷新`
- `当前 Provider 未开放 /models；你仍可手动填写模型名`

For custom value display:

- `自定义模型名：<value>`

### 10.6 Failure modes

#### `/models` unavailable

Expected behavior:

- selector still shows recommended models;
- current saved/custom model still renders;
- manual input remains allowed;
- diagnostics explain that the provider is reachable but model discovery is unavailable.

#### Cache stale

Expected behavior:

- stale cache remains usable as hint data;
- stale label is visible;
- refresh action remains available;
- save/test/health still operate on the final saved string.

#### Cached model missing after provider change

Expected behavior:

- the new provider/baseUrl key starts with empty cache;
- the selector falls back to recommended models plus manual input;
- the old cache stays isolated under the old key and is not reused silently.

#### User types a value not in cache

Expected behavior:

- value is accepted;
- selector shows it as custom input;
- later discovery may show whether it exists in returned `/models`.

### 10.7 Validation and rollout

This phase is low-risk and can be shipped incrementally because:

- persisted config contract for provider/model stays string-based;
- no API key boundary changes are needed;
- existing save/test/health IPC surfaces can be extended rather than replaced;
- the model selector can be introduced without changing how downstream services call providers.

## 11. Historical Implementation Phases

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

### Phase B: Separate saved-config test workflow

Scope:

- Add an explicit saved-config test handler.
- Keep save and test as separate UI actions.
- Reload active config after save.
- Run connection test only against saved config.
- Show sanitized tested provider/baseUrl/model/elapsedMs.

Acceptance:

- User can change base URL/model/key, save it, and then test the saved config.
- A failed test does not undo the saved provider config.
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

## 12. Current Verification Baseline

### Service tests

- `AiService.testConnection()` returns success metadata.
- Missing API key returns or throws a classified `missing_api_key` failure without logging secrets.
- Provider HTTP error is classified without logging raw prompt text.
- Base URL normalization preserves expected request URL.
- `saveAiConfig()` still does not persist derived fields like `hasApiKey`.
- `ImageGenerationModelService` logs only safe host/model/timeout/concurrency metadata on config save.
- `CreatorStudioDefaultFlowService` emits correlated lifecycle logs without prompt leakage.
- `CreatorWorkflowService` emits correlated stage logs without leaking workflow prompt text.
- `AppLogService` redacts prompt/reply/reference-path keys before disk write.

### Control Center tests

- Editing Base URL enables save and shows unsaved state.
- Invalid Base URL blocks save with a clear status.
- Saving config updates active summary.
- Saving API key clears password input and switches API key state to saved.
- Testing the saved config displays tested provider/baseUrl/model.
- Test-active-config warns when draft changes are unsaved.
- Provider disclosures stay collapsed until opened.
- Provider preset interactions still work after the disclosure-based layout change.
- Image provider advanced fields remain reachable and persist correctly.

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
3. Press `保存聊天 Provider`.
4. Press `测试已保存配置`.
5. Confirm success status includes endpoint/model/latency.
6. Send a pet chat message.
7. Confirm `ai-chat.ipc.completed`, `ai-talk.chat.completed`, and `ai.provider.request.completed` appear in app logs.

## 13. Acceptance Checklist

- Users can save API key, model, and base URL from the AI pane.
- Users can confirm what provider settings are currently active.
- Users can run a connection test and see which active values were tested.
- Users are warned when testing active config while draft changes are unsaved.
- API key never appears in renderer responses, app logs, plugin config, or settings.
- Provider failures produce actionable UI messages.
- Users can collapse Provider card bodies without losing visibility into active host/model/key/status.
- Users can choose models from recommended models, cached models, or manual input.
- Cached model lists survive page reload and app restart.
- Cached model lists do not leak across different base URLs.
- `/models` unavailability still leaves the page fully operable through recommended and manual values.
- `npm run check:syntax` passes.
- Relevant service, IPC, and Control Center tests pass.

## 14. Verification Plan For The Next Phase

### Service and contract tests

- cache entry is written after successful chat discovery
- cache entry is written after successful image discovery
- cache key isolates by:
  - capability
  - provider
  - normalized base URL
- stale cache entry is marked stale based on TTL
- cache persistence never stores secrets

### Control Center tests

- provider cards show summary while collapsed
- user can expand/collapse chat and image cards independently
- model selector shows recommended models without discovery
- model selector shows cached models after refresh
- user can still type a custom model not in any list
- saving a changed base URL clears visible stale discovery for the old key
- reloading the page preserves cached model choices and labels

### Manual smoke

1. Save a valid chat provider.
2. Refresh models.
3. Confirm discovered models appear in selector.
4. Reload the app.
5. Confirm cached models still appear.
6. Change to another base URL.
7. Confirm the previous cache is not shown for the new endpoint.
8. Switch back to the original base URL.
9. Confirm the original endpoint cache reappears.
10. Save a custom model not present in `/models`.
11. Confirm save/test still work and the value is rendered as custom input.

## 15. Backlog After This Design

- Provider presets for common OpenAI-compatible endpoints.
- Per-provider model discovery from `/models` where supported.
- Dedicated model-settings presentation for image generation, including clearer host-owned provider trust copy and setup guidance.
- Connection test history with last success/failure timestamp.
- Persona preset/import polish on top of the implemented pet-pack override preview.
- Streaming chat response once the non-streaming provider settings flow is stable.
- Desktop chat UX polish on top of the implemented floating chat window.
