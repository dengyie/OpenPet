# AI Talk Production Hardening Design

Date: 2026-07-15
Status: Approved for implementation planning
Scope: AI Talk lifecycle, bounded persistence, orchestration consistency, streaming view contracts, and documentation truth

## 1. Context

OpenPet already has one main-process AI Talk brain with per-pet-pack persona, conversation isolation, long-term memory, provider streaming, cancellation, behavior tools, and two desktop surfaces. The current implementation is functionally complete, but a production review found six hardening gaps:

1. AI Talk is not included in application shutdown cleanup.
2. Messages, memory jobs, and inactive memories can grow without a durable upper bound.
3. Bubble Chat receives and renders the full streaming reply instead of a lightweight preview.
4. `chat()` and `streamChat()` duplicate the same turn preparation and successful-turn finalization logic.
5. The shared renderer contract omits the streaming state already emitted at runtime.
6. AI Talk design and development documents describe obsolete baselines and event/privacy contracts.

This design fixes those gaps without replacing the provider layer, changing the product model, or introducing a second chat state owner.

## 2. Goals

- Stop active AI Talk streams and settle background memory work during application shutdown.
- Prevent `ai-talk-store.json` from growing indefinitely.
- Keep Bubble Chat lightweight while preserving the complete reply in PetChatWindow and durable conversation history.
- Make complete and streaming requests use the same turn preparation and finalization rules.
- Make shared TypeScript contracts match runtime state.
- Bring AI Talk documentation back to the current implementation truth.
- Preserve existing privacy boundaries and successful/canceled/failed side-effect semantics.

## 3. Non-goals

- Replacing the JSON store with SQLite or another database.
- Converting synchronous store writes to an asynchronous persistence queue.
- Adding conversation summarization, embeddings, multiple conversations, or provider routing.
- Changing provider streaming parsing, action-tool policy, persona generation, or memory extraction prompts.
- Exposing AI Talk internals to plugins.
- Redesigning Bubble Chat or PetChatWindow.

The synchronous atomic write contract remains intentionally unchanged. Bounding persisted collections limits worst-case write amplification while avoiding a cross-cutting async storage migration in this hardening change.

## 4. Invariants To Preserve

- `AiTalkService` remains the only AI Talk orchestrator.
- `AiTalkStore` remains the durable source for persona overrides, conversations, memories, jobs, and traces.
- User messages are persisted when a turn starts; assistant messages are persisted only after successful final completion.
- Failed or canceled turns do not schedule memory extraction or behavior side effects.
- Memory extraction remains non-blocking for the main reply.
- Only actions from the active pet-pack are offered to the provider behavior tool.
- Bubble Chat and PetChatWindow observe the same request ID and status transitions.
- API keys, authorization headers, raw provider chunks, and hidden prompt context never reach renderers or ordinary plugins.
- The trusted Control Center may display user-facing compiled persona prompts and saved memory text.

## 5. Approach Selection

### Selected: Targeted production hardening

Add bounded lifecycle and storage policies, extract two narrow orchestration helpers, narrow the Bubble Chat view, complete the shared contract, and update the documents.

This approach has the smallest behavioral surface and directly fixes each review finding.

### Rejected: Rewrite the AI Talk orchestration layer

A new turn engine or state machine could remove more duplication, but it would also reopen provider, memory, behavior, transcript, and IPC semantics that are already working and covered by regression tests.

### Rejected: Independent point patches

Adding only a shutdown call, array slices, and one UI truncation would leave duplicated turn semantics and contract drift in place. The result would remain fragile even if the immediate symptoms disappeared.

## 6. Architecture Changes

### 6.1 Runtime shutdown

`registerRuntimeAppLifecycle()` will receive `aiTalkService` from `create-openpet-runtime.js`.

Shutdown order:

1. Prevent duplicate shutdown handling.
2. Stop trigger-rule intake.
3. Call `aiTalkService.dispose()` synchronously so stream coalescers stop and active provider requests receive abort immediately.
4. Start bounded asynchronous cleanup for AI Talk memory jobs, plugins, and the system cursor.
5. Wait for all cleanup tasks or the existing runtime shutdown deadline.
6. If the deadline wins, mark any persisted AI Talk jobs still in `pending` state as `interrupted` with `errorCode: shutdown_interrupted`.
7. Continue `app.quit()` exactly once.

`dispose()` remains idempotent. `flushMemoryJobs()` continues to settle the in-memory job snapshot. A new service/store interruption method updates only still-pending records, so already completed jobs are not overwritten.

On store load, pending jobs from a previous process are also changed to `interrupted` because no corresponding in-memory task can still exist after restart. If recovery or retention pruning changes loaded state, the constructor performs one atomic write-back so the repaired status is durable.

Failure policy:

- AI Talk cleanup failure is logged under `ai-talk.shutdown.failed` and does not block other cleanup.
- Timeout is still reported by the existing `runtime.shutdown.timed_out` event.
- Shutdown logs contain counts and error codes, never message, prompt, reply, or memory content.

### 6.2 Bounded durable state

The store will enforce explicit limits during normalization and mutation:

| Collection | Limit | Retention rule |
| --- | ---: | --- |
| Messages | 400 per conversation | Keep newest messages; preserve chronological order |
| Memory jobs | 200 total | Keep newest records; prefer dropping oldest terminal records before pending records |
| Active memories | 200 total | Keep current importance/confidence/recency ranking policy |
| Inactive memories | 400 total | Keep newest `superseded`/`deleted` records by `updatedAt` |
| Traces | 200 total | Preserve existing policy |
| Pet utterances | 100 per pet-pack | Preserve existing policy |

Message IDs must remain unique after retention begins. New messages therefore use a monotonic conversation sequence or an equivalently collision-safe ID source rather than deriving identity solely from the retained array length.

Pruning occurs both when loading old data and after affected mutations. One mutation performs at most one `persist()` call after all normalization, index updates, and pruning are complete.

### 6.3 Active-memory indexes

The store will maintain non-persisted indexes rebuilt from normalized state on startup:

- a set of active memory IDs for listing;
- a key index for exact active-memory matching using scope, pet-pack ID, and normalized text.

All memory writes update these indexes through shared store-local helpers. `findActiveMemory()` becomes an indexed lookup and `listMemories()` iterates only active IDs. Inactive audit history no longer increases active-memory query cost.

The indexes are derived state only. `ai-talk-store.json` remains the source of truth, so no migration or recovery path depends on index persistence.

### 6.4 Shared turn orchestration

`chat()` and `streamChat()` will share two narrowly scoped helpers inside `AiTalkService`:

#### `prepareTurn()`

Responsibilities:

- normalize and validate `message` / `messageBatch`;
- resolve provider configuration and active pet-pack;
- compile persona and migrate legacy conversation state;
- ensure and serialize the pet-pack conversation;
- read history, relevant memory, and recent pet activity;
- append only unresolved user messages;
- build provider messages, action candidates, tools, diagnostics, and trace context.

The helper returns data only. It does not call the provider and does not emit stream state.

#### `finalizeSuccessfulTurn()`

Responsibilities:

- normalize and validate the final reply;
- create Bubble Chat segments and bubble metadata;
- append one final assistant message;
- mark injected memories used;
- schedule background memory extraction;
- return the common result and trace fields.

Streaming-only request registry, abort, coalescing, progress events, and canceled/failed traces stay in `streamChat()`. Complete-only provider invocation and failure logging stay in `chat()`.

Both paths use the normalized joined user content for `messageChars`, fixing batched complete requests that currently record zero characters when `message` is empty and `messageBatch` is populated.

### 6.5 Bubble Chat streaming preview

The main process will provide two surface-specific views of the same stream state:

- PetChatWindow keeps up to the existing 12,000 characters of `partialReply`.
- Bubble Chat keeps only the newest safe preview capped at 600 characters.

`partialReplyChars` continues to report the full generated character count, not the preview length. Request ID, conversation ID, status, chunk count, cancel capability, and sanitized error message remain unchanged.

The preview is derived in `pet-bubble-chat-window.js`, before crossing into its renderer. This bounds renderer state and DOM work rather than merely hiding overflow with CSS. Durable assistant history still receives the complete final reply.

### 6.6 Shared contracts

`src/shared/openpet-contracts.ts` will define:

```ts
export type AiTalkStreamingStatus =
  | 'started'
  | 'streaming'
  | 'completed'
  | 'canceled'
  | 'failed'

export interface AiTalkStreamingViewState {
  requestId: string
  conversationId: string
  petPackId: string
  entrypoint: string
  status: AiTalkStreamingStatus
  partialReply: string
  partialReplyChars: number
  chunkCount: number
  canCancel: boolean
  errorMessage: string
}
```

`PetChatStateViewState` will include:

```ts
streaming: AiTalkStreamingViewState | null
```

Defaults, clone helpers, demo APIs, and type fixtures will preserve or initialize this field. No API key, prompt context, memory context, or provider payload is added to the contract.

## 7. Data And Error Semantics

### Completed turn

- Full assistant reply is persisted once.
- Memory usage and extraction run once.
- Behavior metadata is returned once.
- Bubble Chat sees a bounded preview; PetChatWindow and transcript retain the full reply.

### Canceled or failed turn

- User messages remain persisted.
- No assistant final message is persisted.
- No memory extraction or behavior side effect is scheduled.
- Streaming registry and coalescer state are released.

### Interrupted memory job

- Persisted status becomes `interrupted`.
- `errorCode` becomes `shutdown_interrupted`.
- No memory operation is fabricated or replayed on restart.
- A later conversation may naturally extract the same fact again.

### Corrupt or oversized old store

- Existing corrupt-file backup behavior remains unchanged.
- Valid oversized stores are normalized and pruned during load.
- Startup performs one atomic write only when recovery or retention pruning changed the loaded state.
- Startup does not rewrite an already valid, bounded store.

## 8. Observability

Add or retain structured events for:

- `ai-talk.shutdown.started`
- `ai-talk.shutdown.completed`
- `ai-talk.shutdown.failed`
- `ai-talk.memory.jobs.interrupted`
- `ai-talk.stream.progress` for coalesced streaming progress

Allowed details include request/job counts, status, elapsed time, model/provider identifiers already considered safe, and sanitized error codes. Content remains excluded from default logs.

The old `ai-talk.stream.delta` wording is removed from active design documents because production emits bounded `ai-talk.stream.progress` records.

## 9. Test Strategy

Implementation follows failing-test-first development.

### Lifecycle tests

- AI Talk dispose runs before asynchronous shutdown waiting.
- App quit waits for AI Talk memory jobs when they settle within the deadline.
- Timeout marks pending jobs interrupted and still quits once.
- Cleanup failure does not prevent plugin/cursor cleanup or quit.
- Repeated `before-quit` does not run shutdown twice.

### Store tests

- Loading and appending preserve only the newest 400 messages per conversation.
- Message IDs remain unique after repeated append/prune cycles.
- Memory jobs never exceed 200 retained records and terminal records are pruned first.
- Pending jobs loaded from a prior process become interrupted.
- Inactive memories never exceed 400 while active memory ranking remains capped at 200.
- Exact memory matching and listing use the active index and stay correct across create, update, supersede, delete, clear, and reload.
- Each affected public mutation performs one persistence write.

### Service tests

- Complete and streaming turns produce equivalent persona/history/memory/tool preparation.
- Both paths append one final assistant message and schedule successful side effects once.
- Canceled/failed streaming remains side-effect-free.
- Batched complete traces report the joined batch character count.
- Disposing remains idempotent and aborts active streams.

### Window and contract tests

- Bubble Chat exposes at most 600 preview characters while preserving full `partialReplyChars`.
- PetChatWindow still receives longer partial replies.
- Shared defaults and clone helpers preserve `streaming` without sharing mutable references.
- Type checking validates the runtime-compatible streaming contract.

### Regression gates

- `npm run check:syntax`
- focused AI Talk Node tests
- `npm run test:core:all`
- `npm run test:control-center`
- Control Center production build

Real-provider desktop validation after stream coalescing remains Manual-required. Existing July 9 evidence is retained as historical provider evidence, not represented as proof of the post-hardening desktop experience.

## 10. Documentation Updates

After implementation:

- `docs/ai-talk-streaming-cancel-development.md` describes the current branch-neutral architecture, shutdown semantics, retention limits, and `ai-talk.stream.progress` event.
- `docs/superpowers/specs/2026-07-09-ai-talk-streaming-cancel-development-design.md` is marked as the historical streaming/cancel design and corrected where it conflicts with current privacy boundaries.
- `docs/openpet-current-todo-architecture.md` moves these hardening items out of TODO and retains only genuinely unfinished AI Talk work.
- Historical release evidence remains unchanged; its README context states which implementation it validated.

## 11. Acceptance Criteria

- Application shutdown aborts active AI Talk streams and never leaves previous-process memory jobs permanently pending.
- Persisted messages, jobs, active memories, and inactive memories remain within their documented limits.
- Complete and streaming turns share preparation/finalization behavior and correct trace character counts.
- Bubble Chat never receives more than 600 reply-preview characters; PetChatWindow and durable history retain the full reply.
- Shared TypeScript contracts include nullable streaming state and all related fixtures compile.
- Focused tests, core regression tests, syntax checks, Control Center tests, and production build pass.
- A final production review finds no remaining P0/P1/P2 issue in the changed paths.

## 12. Manual-required

- Launch the Electron desktop application against a real streaming provider after the changes.
- Confirm Bubble Chat preview readability, cancellation affordance, auto-hide behavior, and long-reply handoff to PetChatWindow.
- Confirm provider-specific timeout, disconnect, and mid-stream failure behavior in the real desktop environment.
