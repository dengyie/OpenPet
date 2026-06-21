# OpenPet Pet Dialogue Phase 1 Design

Date: 2026-06-20
Status: Draft approved for implementation planning
Reference studied: AstrBotDevs/AstrBot commit `0a0c677`

## Goal

Phase 1 delivers pet dialogue in Control Center / AI. The feature follows the active pet-pack automatically, gives each pet-pack its own persona and main conversation, lets the model produce natural language replies and action suggestions, and adds automatic long-term memory extraction.

The implementation should borrow AstrBot's mature separation of persona, session, conversation, dynamic context, tools, and provider runner, while staying lightweight for OpenPet's Electron local-first runtime.

## Non-Goals

- No desktop floating chat entry in Phase 1.
- No streaming response in Phase 1, but the data model and service API must reserve `responseMode`.
- No multi-conversation UI in Phase 1.
- No vector or embedding-based memory retrieval in Phase 1.
- No third-party AI Talk plugin API in Phase 1.
- No LLM summary compression of old chat history in Phase 1.
- No writing user persona overrides back into `pet.json`.

## AstrBot-Inspired Design Principles

AstrBot's conversation stack separates responsibilities that OpenPet should not collapse into a single `chat()` function:

- Session and conversation are distinct. A session identifies an entry context, while a conversation owns history, title, persona selection, and usage metadata.
- Persona is stable prompt material. Runtime facts, time, retrieved memory, and other dynamic context should not be appended into the stable system prompt each round.
- Tools are capability boundaries. The model may suggest or call capabilities, but the host validates and executes them.
- Context management is explicit. AstrBot uses turn limits, token guards, and optional LLM compression. OpenPet Phase 1 should keep the exact recent turns and compensate with long-term memory retrieval.
- Traceability matters. The chain should expose which persona, tools, memories, model, and action decisions were used without leaking secrets by default.

## Architecture

### AiTalkService

`AiTalkService` becomes the main orchestration layer for dialogue. It owns:

- resolving the active pet-pack talk session;
- resolving or creating the current pet-pack main conversation;
- merging `pet.json.persona` with local field-level persona override;
- compiling structured persona into a stable system prompt;
- selecting recent conversation history for request context;
- retrieving a small set of relevant global and pet-pack memories;
- providing the `openpet_behavior` action tool schema;
- calling `AiService` as provider client;
- saving messages and traces;
- splitting long assistant replies into pet bubble segments;
- scheduling non-blocking memory extraction jobs;
- returning validated action suggestions for execution through `PetService`.

### AiService

`AiService` should be reduced to an OpenAI-compatible provider client:

- reads provider settings and API key references;
- sends non-streaming chat completion requests in Phase 1;
- handles timeouts and provider errors;
- parses assistant text and tool calls;
- later supports streaming behind the same provider boundary.

It should not own persona, memory, pet-pack conversation routing, or action execution.

### AiTalkStore

Dialogue state moves out of `settings.json` into an independent local store, `ai-talk-store.json`, written atomically and normalized on load.

`settings.ai` remains for provider and feature configuration:

- enabled;
- provider;
- baseUrl;
- model;
- apiKeyRef;
- behavior config;
- automatic memory toggle;
- future model role overrides.

`ai-talk-store.json` owns:

- sessions;
- conversations;
- messages;
- personaOverrides;
- memories;
- memoryJobs;
- traces;
- schema version and migration metadata.

### PetService

`PetService` remains the only source of truth for pet state. Dialogue code may request speech or action, but final execution still goes through:

- `petService.say()`;
- `petService.playAction()`;
- `petService.setEvent()`.

### IPC

IPC should call `AiTalkService.chat()` rather than assembling dialogue behavior directly. IPC may execute the returned host-validated speech/action through `PetService`, but should not build prompts, inspect memories, or mutate conversation history itself.

## Pet-Pack Persona

`pet.json.persona` is optional for backward compatibility. If missing, OpenPet uses a built-in fallback persona. If present, it is strictly normalized.

Phase 1 persona fields:

- `name`;
- `identity`;
- `tone`;
- `coreTraits`;
- `speakingStyle`;
- `relationshipToUser`;
- `actionStyle`;
- `boundaries`.

The effective persona is:

`compiledPersona = fieldMerge(packDefaultPersona, localPersonaOverride || {})`

Local overrides are stored in `ai-talk-store.json`, not in the pet-pack manifest.

Control Center should show the persona source:

- package default persona;
- local override;
- built-in fallback persona.

Persona generation is explicit: user enters generate-persona mode, model produces a draft, UI previews it, and only user confirmation writes a local override.

## Session And Conversation Model

Phase 1 uses an AstrBot-style internal model while keeping UI simple.

`sessionId = control-center:{activePackId}`

Each active pet-pack gets one default main conversation in Phase 1. Internally the conversation may use `main` or a generated UUID, but the store must keep room for multiple conversations later.

Conversation metadata should include:

- `id`;
- `sessionId`;
- `petPackId`;
- `title`;
- `personaPackId`;
- `personaHash`;
- `responseMode`;
- `summary`;
- `summaryUpdatedAt`;
- `contextPolicy`;
- `createdAt`;
- `updatedAt`;

The full transcript is stored locally, but each model request only receives recent exact history according to `contextPolicy`.

## Memory Model

Phase 1 supports two memory scopes:

- global user memory;
- pet-pack relationship memory.

Automatic memory extraction runs in the background after the main reply is returned. It must not block the user-facing response or pet action.

Each memory item should include:

- `id`;
- `scope`: `global` or `petPack`;
- `petPackId`, required for pet-pack memory;
- `text`;
- `tags`;
- `confidence`;
- `importance`;
- `sourceConversationId`;
- `sourceMessageIds`;
- `createdAt`;
- `updatedAt`;
- `lastUsedAt`;
- `lastEvidenceAt`;
- `useCount`;
- `status`: `active`, `superseded`, or `deleted`;
- `supersedes`;
- `reason`;

The memory extractor returns candidate operations:

- `create`;
- `update`;
- `reinforce`;
- `ignore`.

The host applies conservative upsert rules. The model cannot physically delete memory. Conflicts should mark old memory as `superseded`, preserving auditability.

## Memory Retrieval

Phase 1 does not use embeddings. It uses lightweight relevance scoring based on:

- current user message;
- recent dialogue text;
- current `petPackId`;
- memory tags;
- confidence;
- importance;
- recency and usage.

Each request injects only a small top set, typically 5 to 8 items, as temporary dynamic context. Retrieved memory must not be compiled into the stable persona system prompt.

## Sensitive Memory Filtering

Because memory is automatic, Phase 1 must include conservative host-side filtering. The system should not save:

- API keys, tokens, passwords, or one-time codes;
- complete addresses;
- identity card, bank card, or similar high-risk identifiers;
- detailed medical or financial information;
- third-party private information;
- obviously transient jokes or one-off statements.

Filtered candidates are recorded in diagnostic trace without storing the sensitive text by default.

## Action Orchestration

Phase 1 continues to use the existing `openpet_behavior` tool-call approach, aligned with AstrBot's tool boundary model.

Tool parameters should support:

- `intent`;
- `actionId`;
- `confidence`;
- `bubbleText`;
- `reason`;
- `displayMode`.

Only actions from the current active pet-pack are valid. The host must validate action existence before executing through `PetService`.

The natural-language assistant reply remains the primary chat text. `bubbleText` is only a fallback if the provider returns an action tool call without assistant text.

## Reply Display

The transcript stores the full assistant reply. The pet bubble can split long replies into multiple segments automatically.

Bubble segmentation is display behavior, not transcript mutation.

## Trace And Diagnostics

Phase 1 records default redacted structured traces:

- `traceId`;
- `petPackId`;
- `conversationId`;
- `personaHash`;
- `memoryIdsInjected`;
- `actionCandidates`;
- `chosenAction`;
- `provider`;
- `model`;
- `latencyMs`;
- `tokenUsage`;
- `memoryJobStatus`;
- `errorCode`.

Default logs must not include API keys, full prompts, full memory text, or full private transcript content.

Control Center should provide a diagnostic export. A future detailed diagnostic mode may include prompt and response content, but it must be explicit and warn that private data may be included.

## Control Center Phase 1 UX

The AI pane follows the current active pet-pack automatically.

Required UI capabilities:

- chat with the current pet;
- show current pet-pack identity and persona source;
- edit local persona override fields;
- generate persona draft and confirm apply;
- list global user memories;
- list current pet-pack memories;
- delete individual memories;
- clear current pet-pack memory;
- pause or resume automatic memory;
- export redacted diagnostics.

The UI should not expose multi-conversation management in Phase 1.

## Data Flow

1. User sends a message in Control Center / AI.
2. IPC calls `AiTalkService.chat({ message, entrypoint: 'control-center' })`.
3. `AiTalkService` resolves active pet-pack, session, main conversation, effective persona, recent history, relevant memory, and available action list.
4. `AiTalkService` builds a stable system prompt from persona and dynamic context from retrieved memory.
5. `AiService` sends the OpenAI-compatible non-streaming chat completion request with the `openpet_behavior` tool when enabled.
6. `AiTalkService` parses provider output, persists user and assistant messages, validates action suggestion, records trace, and schedules memory extraction.
7. IPC displays assistant text through `PetService.say()` and executes validated action through `PetService.playAction()` when applicable.
8. Background memory extraction classifies new facts into global or pet-pack memory, filters sensitive candidates, applies conservative upsert, and updates memory job trace.

## Failure Handling

- Provider failure returns a user-visible chat error and records redacted trace.
- Missing API key keeps current AI disabled behavior.
- Missing pet-pack persona falls back to built-in persona.
- Invalid or unknown action suggestion is ignored or downgraded to speech only.
- Memory extraction failure never fails the chat response.
- Store write failure should surface as an app-level diagnostic error and preserve in-memory response where possible.
- Corrupt store should be backed up and normalized to a safe empty store.

## Phase Plan

### Phase 1: Talk Agent Core

Deliver:

- `AiTalkService`;
- `AiTalkStore`;
- pet-pack `persona` normalization;
- per-pet-pack main conversation;
- persona compiler;
- recent-history context policy;
- fallback persona.

Validation:

- core tests for store normalization and atomic persistence;
- tests for pet-pack conversation isolation;
- tests for persona field merge and hash stability;
- old pet-pack manifests still load.

### Phase 2: Control Center AI UX

Deliver:

- current pet-pack chat UI wiring;
- persona source display;
- local override editor;
- persona generation draft/confirm flow;
- memory list basics;
- diagnostic export entry.

Validation:

- UI state follows active pet-pack;
- switching pet-pack isolates chat and persona;
- override writes local store only.

### Phase 3: Memory And Action Orchestration

Deliver:

- non-blocking memory extraction jobs;
- global and pet-pack memory classification;
- sensitive memory filtering;
- lightweight memory retrieval injection;
- `openpet_behavior` schema expansion;
- action whitelist validation.

Validation:

- chat reply is returned even when memory extraction fails;
- extracted memory is scoped correctly;
- sensitive candidates are filtered;
- only current pet-pack actions can execute.

### Phase 4: Production Hardening

Deliver:

- redacted structured trace;
- migrations from existing `settings.ai.conversations`;
- robust error handling;
- diagnostic export;
- regression coverage and smoke checklist.

Validation:

- `npm run test:core:all`;
- targeted AI provider mock tests;
- syntax check;
- manual AI chat smoke with configured provider if available.

## Backlog

- Desktop floating pet chat using the same `AiTalkService`.
- Streaming reply support.
- Multi-conversation UI per pet-pack.
- Vector or embedding-based memory retrieval.
- LLM history summary compression.
- Third-party AI Talk plugin extension API with explicit permissions.
- Advanced model-role settings for memory, persona generation, and action planning.
- User-configurable privacy rules for automatic memory.

## Acceptance Criteria

- Control Center / AI can chat with the currently active pet-pack.
- Each pet-pack has isolated main conversation history.
- Each pet-pack can provide optional default `pet.json.persona`.
- User persona override is local and field-merged.
- Long-term memory is automatically extracted in the background.
- Global and pet-pack relationship memories are stored separately.
- Relevant memory is injected as temporary context, not stable persona prompt.
- Current pet-pack actions can be suggested by the model and host-validated before execution.
- Memory extraction and action failure do not break chat response.
- Default diagnostics are useful and redacted.
