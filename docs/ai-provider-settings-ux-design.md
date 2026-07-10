# AI Provider Settings Simplification Design

> Date: 2026-07-10
> Status: ready for development
> Scope: Control Center AI Provider UI simplification, model selector UX, provider ownership guardrails
> Priority: P1

## 1. Product Decision

The AI Provider page must stop feeling like a developer console.

Normal users only need to understand and operate two provider capabilities:

1. `聊天 Provider`
2. `生图 Provider`

Everything else is support, diagnostics, or advanced operator behavior. It may remain available, but it must not compete with the two core provider cards in the default view.

The page should answer three user questions quickly:

1. Chat uses which `Base URL / API Key / Model`?
2. Image generation uses which `Base URL / API Key / Model`?
3. If `/models` returned a model list, where can I pick one without being forced to read a giant cache dump?

## 2. Current Pain

The current Provider hub is functionally correct, but visually too heavy:

- chat and image cards expose too many status strips, boundary notes, compatibility notes, discovery details, and advanced fields;
- cached model results are rendered as a large always-visible block instead of an optional selection aid;
- developer terms such as provider ownership, model probe, raw diagnostics, compatibility hints, and trust boundaries appear too early;
- Vision, system prompt, timeout, concurrency, presets, and raw health/test details make the default path look larger than the actual task;
- users who only want to set `Base URL`, `API Key`, and `Model` must scan too much surrounding information.

This redesign is a UI simplification pass, not a runtime ownership migration.

## 3. UX Principles

1. Keep the default path boring and short.
2. Put the user-facing provider cards above everything else.
3. Make model discovery helpful, never mandatory.
4. Preserve manual model input at all times.
5. Hide developer/support details behind one explicit `高级 / 诊断` area.
6. Keep chat and image provider ownership separate internally, but visually use the same interaction pattern.
7. Never expose API key values to renderer UI, logs, plugins, or model-list cache.

## 4. Target Information Architecture

```text
AI
└── Provider
    ├── 顶部摘要
    │   ├── 聊天：已配置 / 未配置 / 有未保存修改 / 最近测试失败
    │   └── 生图：已配置 / 未配置 / 有未保存修改 / 最近健康检查失败
    ├── 聊天 Provider
    │   ├── Base URL
    │   ├── API Key
    │   ├── Model
    │   └── 保存 / 测试 / 刷新模型
    ├── 生图 Provider
    │   ├── Base URL
    │   ├── API Key
    │   ├── Model
    │   └── 保存 / 健康检查 / 刷新模型
    └── 高级 / 诊断
        ├── 多模态文本 Vision
        ├── System Prompt
        ├── 生图 Timeout / 最大并发
        ├── Provider 预设
        ├── 最近测试 / 健康检查详情
        ├── 模型发现原始详情
        ├── 兼容性提示
        └── Provider 边界说明
```

Default screen target:

- the user sees exactly two primary provider cards;
- each primary card has at most three fields and three actions;
- no raw model array, raw probe result, long trust boundary copy, or compatibility paragraph is visible by default;
- the whole default Provider area should fit comfortably in a normal settings-page scan, without requiring users to read diagnostics first.

## 5. Default Provider Card Contract

Both cards use the same grammar.

### 5.1 Header

Each card header shows:

- title:
  - `聊天 Provider`
  - `生图 Provider`
- compact state badge:
  - `未配置`
  - `已保存`
  - `有未保存修改`
  - `最近测试通过`
  - `最近测试失败`
  - `最近健康检查通过`
  - `最近健康检查失败`
- optional one-line host/model summary:
  - `127.0.0.1:8317 · gpt-5.5 · API Key 已保存`

The header must not include explanatory paragraphs.

### 5.2 Visible Fields

Each card body shows only:

1. `Base URL`
2. `API Key`
3. `Model`

Use card context for labels. Inside `生图 Provider`, the label is `Model`, not `图片 Model`. Inside `聊天 Provider`, the label is `Model`, not `聊天模型`.

### 5.3 Visible Actions

`聊天 Provider`:

- `保存`
- `测试`
- `刷新模型`

`生图 Provider`:

- `保存`
- `健康检查`
- `刷新模型`

Longer copy may appear in tooltips, inline errors, or diagnostics, not in button labels.

### 5.4 Collapsing Behavior

Provider cards should be stackable and collapsible, but collapsing must not hide the capability state.

Rules:

1. The header is always visible.
2. The body contains only the three fields plus actions.
3. Opening a card must not auto-open model cache details.
4. If a card has validation errors or unsaved changes, it should stay open until the user resolves or manually collapses it.
5. The card open state may be local UI state; it must not become model/provider runtime state.

## 6. Model Selector Redesign

The model selector is the main UX change.

The current cached-model display is too loud. A cached model list is useful, but it should behave like an expandable picker, not a diagnostic dump.

### 6.1 Collapsed State

Default collapsed selector:

```text
Model
[ gpt-5.5                                      ]
当前来源：手动输入 · 已缓存 67 个 · 上次刷新 07/10 14:21
[刷新模型] [查看模型列表]
```

If there is no cache:

```text
Model
[ gpt-5.5                                      ]
未缓存模型；可刷新模型，也可以直接手填。
[刷新模型] [查看模型列表]
```

If `/models` failed:

```text
Model
[ gpt-5.5                                      ]
模型列表不可用；仍可手填并保存。
[刷新模型] [查看模型列表]
```

Collapsed state must never render the full model array.

### 6.2 Expanded State

Only after clicking `查看模型列表`, show a contained picker:

```text
模型列表
[ 搜索模型...                                  ]

推荐
  gpt-5.5
  gpt-4o-mini

缓存
  gpt-5.5
  gpt-4o
  openpet-image-test
```

Expanded behavior:

1. Selecting a row writes that model string into the draft input.
2. The user can still type any custom model after selecting from the list.
3. Recommended and cached models are deduplicated.
4. The current draft model is visibly selected.
5. The list is scroll-contained with a max height; it must not make the whole settings page extremely long.
6. Filtering uses the current search input, not the provider `Base URL`.
7. Refreshing models updates cache, but does not force the list open.
8. `/models` being unavailable never disables the input, save button, or manual model flow.

### 6.3 Component Contract

Replace the current always-expanded picker with a focused component:

```ts
type ProviderModelSelectorProps = {
  ariaLabel: string
  value: string
  cachedCatalog: ProviderModelCatalogViewState
  recommendedModels?: string[]
  disabled?: boolean
  onChange: (model: string) => void
  onRefreshModels: () => void | Promise<void>
}
```

Expected component responsibilities:

- render editable model input;
- render compact cache metadata;
- manage local expanded/collapsed state;
- manage local filter text;
- merge and deduplicate recommended plus cached models;
- call `onChange(model)` when a model is picked;
- avoid storing provider config or cache itself.

Expected non-responsibilities:

- no IPC calls except through the `onRefreshModels` prop;
- no API key handling;
- no runtime provider ownership decisions;
- no direct settings writes.

## 7. Advanced / Diagnostics Contract

One collapsed `高级 / 诊断` section owns everything that is not needed for first-run setup.

Move these out of the default path:

- Vision / 多模态文本模型 override;
- System Prompt;
- image timeout;
- image max concurrency;
- provider presets;
- long provider boundary copy;
- compatibility hints;
- transparent-background notes;
- raw `/models` probe result details;
- full cached model provenance;
- usage summary;
- verbose active config blocks;
- raw connection-test and health-check details.

The default cards may show short summaries:

- `测试通过`
- `测试失败：API Key 未配置`
- `健康检查失败：模型不存在`
- `有未保存修改`

Full details live in `高级 / 诊断`.

## 8. Runtime Ownership Rules

This redesign must preserve the already-landed provider owner architecture.

### 8.1 Chat Provider Owner

`AiService` owns:

- chat provider config;
- chat API key reference;
- chat model cache;
- chat provider test;
- text-side model resolution;
- Vision fallback when Vision override is disabled.

Current and future text consumers must read through `AiService` or its explicit host-owned adapters. They must not persist their own `baseUrl / apiKey / model` tuple.

### 8.2 Image Provider Owner

`ImageGenerationModelService` owns:

- image provider config;
- image API key reference;
- image model cache;
- image health check;
- image generation provider resolution.

Creator Studio, action-frame generation, pet-pack generation, and future host-owned image flows consume this config. They must not save separate image provider settings.

### 8.3 Vision Rule

Vision is not a third default provider card.

Default behavior:

- Vision follows the saved `聊天 Provider`.

Optional advanced behavior:

- an operator may enable a host-owned Vision override under `高级 / 诊断`;
- when override is enabled, host runtime resolves Vision through that override;
- when override is disabled, Vision resolves to the current chat provider at runtime.

Forbidden behavior:

- copying chat config once into Vision and letting it drift silently;
- storing feature-specific Vision model settings in workflows, plugins, or renderer panes.

### 8.4 Cache Ownership

Model cache is owned by the same service that owns the provider capability.

```text
聊天刷新模型
Renderer -> AI_DISCOVER_MODELS -> AiService -> provider /models -> chat modelCatalog

生图刷新模型
Renderer -> IMAGE_GENERATION_DISCOVER_MODELS -> ImageGenerationModelService -> provider /models -> image modelCatalog
```

Renderer may display cache and choose from it. Renderer must not mutate cache directly.

Selecting a model from cache writes only the local draft. It becomes runtime truth only after `保存`.

## 9. Data Flow

### 9.1 Load Page

1. `useAiPane` calls existing config loaders.
2. Main process returns sanitized config views:
   - `baseUrl`
   - `model`
   - `hasApiKey`
   - `apiKeyPreview` when already supported
   - `modelCatalog`
3. Renderer initializes draft fields from active config.
4. Provider cards render compact headers and editable fields.
5. Model selector renders cached count only, not the full list.

### 9.2 Save Provider

1. Renderer validates obvious input:
   - non-empty `Base URL`;
   - valid `http:` or `https:` URL;
   - non-empty `Model`.
2. Renderer calls the existing save IPC for that provider owner.
3. Main process normalizes and persists non-secret config.
4. Renderer refreshes active config.
5. Dirty state clears.
6. API key value is never returned.

### 9.3 Refresh Models

1. User clicks `刷新模型`.
2. Renderer calls the existing discover IPC for the provider owner.
3. Main process probes `/models` using the saved provider config.
4. Main process stores a bounded sanitized model catalog.
5. Renderer updates the selector metadata.
6. The full list remains collapsed unless the user explicitly opens it.

### 9.4 Pick Model

1. User clicks `查看模型列表`.
2. User filters or selects a recommended/cached model.
3. Selector writes the selected model to the draft input.
4. User clicks `保存`.
5. Owner service persists the selected model as provider config.

Manual entry follows the same draft/save path and does not depend on model cache.

## 10. Implementation Plan

### Phase 1: Model Selector

Files:

- `src/control-center/src/panes/AiPane.tsx`
- `src/control-center/src/lib/provider-model-catalog.ts`
- `src/control-center/src/styles.css`
- `tests/control-center/provider-model-catalog.test.js`
- `tests/control-center/control-center-smoke.spec.js`

Tasks:

1. Replace `ProviderModelPicker` with `ProviderModelSelector`.
2. Keep the input always editable.
3. Hide cached/recommended model rows until `查看模型列表` is clicked.
4. Add filter, selected state, dedupe, and scroll containment.
5. Ensure refresh updates cache metadata but does not auto-expand the list.

Acceptance:

- cached models are not visible by default;
- clicking `查看模型列表` expands a bounded list;
- selecting a model updates the draft;
- manual input works without cache;
- `/models` failure does not block save.

### Phase 2: Provider Card Simplification

Files:

- `src/control-center/src/panes/AiPane.tsx`
- `src/control-center/src/styles.css`
- `tests/control-center/control-center-smoke.spec.js`

Tasks:

1. Convert chat and image cards to the shared compact card contract.
2. Rename labels and buttons to short card-local copy.
3. Remove default-visible active config strips and long explanatory copy.
4. Keep validation and save/test/health behavior unchanged.
5. Keep cards stacked vertically and responsive.

Acceptance:

- default UI shows only two primary provider cards plus compact summary;
- each card shows only `Base URL`, `API Key`, `Model`, and actions;
- no horizontal two-column provider card layout remains;
- narrow viewport has no horizontal overflow.

### Phase 3: Advanced / Diagnostics Consolidation

Files:

- `src/control-center/src/panes/AiPane.tsx`
- `src/control-center/src/styles.css`
- `tests/control-center/control-center-smoke.spec.js`

Tasks:

1. Move Vision override under `高级 / 诊断`.
2. Move System Prompt under `高级 / 诊断`.
3. Move image timeout and max concurrency under `高级 / 诊断`.
4. Move provider presets under `高级 / 诊断`.
5. Move compatibility hints, provider boundary copy, and raw model probe details under `高级 / 诊断`.
6. Keep short error/success summaries near the owning provider card.

Acceptance:

- advanced content is hidden by default;
- expanding `高级 / 诊断` exposes all existing advanced controls;
- Vision remains functional and follows chat by default;
- existing owner services and IPC names remain unchanged unless tests prove a bug.

## 11. Testing Requirements

### 11.1 Unit / Logic Tests

Update or add tests for:

- recommended plus cached model dedupe;
- current model source labels;
- compact cache metadata;
- empty cache metadata;
- selector filtering rules if extracted into a pure helper.

Expected command:

```bash
npm run test:core -- tests/control-center/provider-model-catalog.test.js
```

Use the project-correct command if the runner does not support file arguments.

### 11.2 Control Center Smoke Tests

Cover:

- Provider cards are stacked, not side-by-side;
- only chat/image cards are primary by default;
- cached model list is hidden before click;
- `查看模型列表` expands cached/recommended rows;
- selecting a cached model updates the model input;
- manual typing still works;
- `高级 / 诊断` is collapsed by default;
- Vision/System Prompt/image advanced controls are reachable after expanding diagnostics.

Expected command:

```bash
npm run test:control-center
```

### 11.3 Runtime Regression Tests

Keep existing tests proving:

- chat provider config is saved through `AiService`;
- image provider config is saved through `ImageGenerationModelService`;
- API keys are redacted;
- model cache is persisted by the owner service;
- Creator workflows consume image provider config rather than saving their own.

Expected command before merge:

```bash
npm run test:core:all
npm run test:control-center
```

## 12. Manual Acceptance Checklist

1. Open `Control Center -> AI`.
2. Confirm Provider default view is short and shows only:
   - top summary;
   - `聊天 Provider`;
   - `生图 Provider`;
   - collapsed `高级 / 诊断`.
3. Confirm `聊天 Provider` and `生图 Provider` are vertical, not side-by-side.
4. In `聊天 Provider`, edit `Base URL`, `API Key`, and `Model`, then click `保存`.
5. Click `刷新模型`; confirm the model list does not open automatically.
6. Click `查看模型列表`; confirm models appear in a bounded list.
7. Select one cached/recommended model; confirm it fills the `Model` input.
8. Type a custom model manually; confirm it remains accepted even if not in the list.
9. Repeat the same for `生图 Provider`.
10. Expand `高级 / 诊断`; confirm Vision, System Prompt, timeout, max concurrency, presets, diagnostics, compatibility hints, and provider boundary notes are still available.
11. Collapse `高级 / 诊断`; confirm the page returns to the simple provider setup state.

## 13. Non-Goals

This pass must not:

- remove Vision runtime support;
- remove model cache;
- make `/models` required;
- add a provider marketplace;
- split chat and image into separate pages;
- reintroduce local/cloud provider mode forms;
- change API key storage;
- expose API keys to renderer or plugins;
- let plugins persist host provider settings;
- change Creator Studio provider consumption;
- migrate provider ownership away from `AiService` or `ImageGenerationModelService`.

## 14. Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Users cannot find cached models | Keep `查看模型列表 N` near the model input. |
| Users think cache is required | Always keep manual input visible and editable. |
| Support loses diagnostics | Consolidate diagnostics under one stable `高级 / 诊断` disclosure. |
| Advanced users cannot find Vision | Put Vision as the first advanced group and keep smoke coverage. |
| UI tests become brittle after copy changes | Prefer role, label, and stable test-id assertions over long text assertions. |
| Provider ownership drifts again | Add review checklist item: every model consumer maps to chat, image, or explicit Vision override owner. |

## 15. Review Checklist Before Implementation Merge

- Default Provider page contains no raw model array text.
- Default Provider page contains no long provider boundary paragraph.
- Default Provider page contains no always-visible Vision block.
- Chat and image cards both use the same field/action grammar.
- Model selector list is collapsed by default.
- Manual model entry is not blocked by cache or `/models` failure.
- `AiService` remains the chat config and chat cache owner.
- `ImageGenerationModelService` remains the image config and image cache owner.
- Vision default still resolves to chat at runtime.
- API keys remain redacted in renderer, logs, and tests.

## 16. Completion Definition

This redesign is complete when a non-developer can configure OpenPet by only looking at:

- `聊天 Provider`
- `生图 Provider`

and cached model selection is available only as an explicit expandable picker, while all developer/operator details remain reachable under `高级 / 诊断`.
