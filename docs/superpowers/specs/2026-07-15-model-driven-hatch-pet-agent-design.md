# Model-Driven Hatch-Pet Agent Design

## Status

- Date: 2026-07-15
- Source branch: `codex/dev8`
- Status: proposed design; implementation has not started
- Product surface: OpenPet AI settings, Creator Studio, host-owned creator workflow
- Approval boundary: generated output always requires human approval before import or activation

## 1. Goal

Evolve OpenPet's `hatch-pet` workflow from a mostly fixed orchestration pipeline into a bounded model-driven agent.

The hatch-pet model should handle work that benefits from visual understanding and creative judgment:

- plan the character and action-generation strategy;
- choose among available image-generation models;
- write and revise prompts;
- inspect generated character and action evidence;
- identify visual defects;
- choose the smallest repair scope;
- iterate automatically within explicit budgets;
- prepare a final result for human approval.

Code remains authoritative for work that is deterministic, security-sensitive, or safety-critical:

- state transitions and durable run persistence;
- credentials, Provider transport, paths, and file writes;
- allowed tools and model capabilities;
- reference-image and output-count limits;
- technical, identity, motion, row, and atlas QA;
- attempt, time, Provider-call, and cost budgets;
- package validation, approval, import, and activation;
- evidence, audit logs, and production-readiness claims.

The governing principle is:

> The model plans, creates, evaluates, and proposes repairs. Code executes, measures, constrains, and enforces gates. Humans approve the final product.

## 2. Confirmed Product Decisions

This design incorporates the following accepted decisions:

1. Use a bounded model agent inside the existing deterministic Creator Studio state machine.
2. Add a separately configurable hatch-pet model.
3. When no hatch-pet model is configured, fall back to the current chat model configuration while still using an isolated hatch-pet session and system prompt.
4. Use the same hatch-pet model configuration for creative planning and visual evaluation.
5. Keep generation and evaluation as separate stateless calls with different role prompts.
6. Allow the hatch-pet model to select any image-generation model that OpenPet reports as configured, healthy, and image-capable.
7. Require both code QA and model visual evaluation to pass before output can advance.
8. Default to three generation attempts per action.
9. Allow one automatic canonical-identity regeneration after the initial identity attempt.
10. Expose total attempt, elapsed-time, Provider-call, and estimated-cost budgets in Control Center.
11. A failed canonical identity or required `idle` action blocks the package.
12. A failed optional action is omitted after its budget is exhausted while later actions continue.
13. Default to one final human approval step, with an optional setting that pauses for canonical-identity approval before action generation.
14. The model cannot approve, import, activate, weaken gates, expand budgets, add Provider endpoints, or access credentials.

## 3. Approaches Considered

### A. Advisory model over a fixed workflow

The model writes prompts and explains failures, while code always chooses the next step.

This is predictable but leaves the difficult visual-repair and model-selection decisions hard-coded. It would add model cost without gaining enough autonomy.

### B. Bounded agent inside a deterministic state machine — selected

Code owns the workflow and exposes a small set of legal decisions at each state. The model receives a bounded state snapshot and selects one legal next action with structured arguments.

This preserves reproducibility, security, budgets, and QA while allowing the model to solve open-ended creative and visual problems.

### C. Fully autonomous general-purpose agent

The model receives general filesystem, Provider, plugin, approval, and import tools.

This is rejected because it makes cost, state recovery, security, evidence, and final claims depend on unconstrained model behavior.

## 4. High-Level Architecture

Introduce a main-process `HatchPetAgentService` as the decision layer for the existing creator workflow.

```text
user request
  -> CreatorWorkflowService creates a durable run and budgets
  -> deterministic state machine prepares a bounded decision snapshot
  -> HatchPetAgentService requests one structured model decision
  -> code validates the decision against state, tools, models, and budgets
  -> Creator Studio / image service executes the approved operation
  -> deterministic QA records objective evidence
  -> HatchPetAgentService performs a separate visual evaluation
  -> code combines both gates
       -> pass: advance
       -> fail: request a bounded repair decision
       -> budget exhausted: block required scope or omit optional scope
  -> final review artifacts
  -> human approval
  -> host-owned import and optional activation
```

### Component ownership

| Component | Responsibility |
| --- | --- |
| `CreatorWorkflowService` | Public workflow entry, run lifecycle, human-facing result, approval/import handoff |
| `HatchPetAgentService` | Model configuration resolution, planning calls, evaluation calls, structured response validation |
| Hatch-pet state machine | Legal state transitions, decision slots, idempotency, budget accounting, recovery |
| `AiService` | Host-owned chat/vision Provider transport reused through a scoped completion interface |
| `ImageGenerationModelService` | Image Provider discovery, health, secrets, request construction, output writes, request evidence |
| Creator Studio host bridge | Canonical identity, keyframes, rows, repair, reference boards, checkpoints, QA, atlas and review artifacts |
| `ProviderModelCatalog` | Bounded list of configured, healthy, capability-compatible model candidates |
| `PetPackService` / `PetService` | Final validation, import, activation, and runtime pet state |

`HatchPetAgentService` does not replace Creator Studio. It chooses among Creator Studio's bounded operations.

## 5. Model Configuration

### Dedicated hatch-pet model

Add a separate AI configuration scope:

```json
{
  "hatchPet": {
    "enabled": false,
    "mode": "follow-chat",
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "apiKeyRef": "ai.hatch-pet",
    "systemPromptVersion": 1
  }
}
```

Supported modes:

- `follow-chat`: resolve Provider, endpoint, model, and API-key reference from the current chat configuration;
- `override`: use the dedicated hatch-pet configuration.

Fallback changes only Provider configuration. Hatch-pet always uses:

- its own system prompt;
- its own conversation identifier;
- no ordinary pet-chat history;
- no ordinary chat memory writes;
- its own timeout and token limits;
- only the hatch-pet decision/evaluation schemas.

If the resolved model lacks required structured-output or vision capability, the workflow stops with `hatch_pet_model_not_capable`; it does not silently degrade to text-only visual approval.

### Same model, separate roles

The same resolved hatch-pet model performs both jobs, but never in the same conversational turn:

1. **Planner call:** receives task state, code QA, prior bounded attempt summaries, model candidates, and legal decisions.
2. **Evaluator call:** receives a locally composed review board plus objective QA evidence and returns a visual-quality verdict.

The evaluator call does not receive the planner's internal rationale or a statement that the current output was generated according to its own plan. This reduces self-confirmation bias while honoring the single-model product decision.

## 6. Image-Generation Model Selection

The hatch-pet model may select any candidate returned by the host model catalog, but cannot invent a Provider, endpoint, or model ID.

A candidate is eligible only when code confirms:

- Provider configuration exists;
- Provider health check passes or has an accepted recent health snapshot;
- the model declares image-generation capability;
- the requested stage supports the model's edit/generation mode;
- model use is allowed by local policy;
- remaining budgets permit another attempt.

The decision snapshot exposes bounded metadata only:

```json
{
  "id": "gpt-image-2",
  "provider": "openai-compatible",
  "capabilities": ["generation", "edit", "transparent-background"],
  "verified": true,
  "recentOutcome": "identity-pass-action-fail",
  "estimatedCostClass": "high"
}
```

It never exposes API keys, authorization headers, raw endpoints containing secrets, or unbounded Provider payloads.

Model switching rules:

- a switch consumes an attempt for the affected scope;
- every request records the selected Provider and model;
- identity and action QA remain unchanged after a switch;
- output from every successful model is recorded in run provenance;
- final `production-art-ready` eligibility requires exact approval coverage for every successful generation model, including fallback and repair models;
- model switching never authorizes cross-model identity drift.

## 7. State Machine

### Top-level states

```text
draft
  -> planning
  -> generating_identity
  -> evaluating_identity
  -> awaiting_identity_review (optional)
  -> generating_actions
  -> evaluating_actions
  -> composing_package
  -> evaluating_package
  -> ready_for_review
  -> approved
  -> imported
  -> activated (optional explicit user action)
```

Terminal or suspended states:

- `failed`;
- `cancelled`;
- `budget_exhausted`;
- `awaiting_user_input`;
- `paused`.

### Identity loop

1. The planner selects an eligible image model and identity strategy.
2. Code executes canonical identity generation.
3. Code runs technical and identity QA.
4. When code QA passes, the evaluator judges visual identity and production suitability.
5. Both gates passing provisionally accept the identity.
6. If configured, the run pauses at `awaiting_identity_review`.
7. Otherwise action generation begins automatically.
8. One automatic identity regeneration is permitted after the initial attempt.
9. Exhausting the identity budget blocks the complete run.

### Action loop

For each official generated action job:

1. Planner reads the canonical identity, action contract, previous attempt summary, available image models, and remaining budget.
2. Planner selects a model and generation/repair strategy.
3. Code executes keyframe and row generation.
4. Code runs existing technical, identity, semantic, motion, direction, alpha, scale, baseline, and row QA.
5. Evaluator judges visual identity, action readability, timing implied by the contact sheet, silhouette quality, and cross-row continuity.
6. Both gates passing accept the row checkpoint.
7. A failed attempt returns to the planner with fixed reason codes and bounded evidence.
8. Each action receives at most three attempts by default.

When attempts are exhausted:

- `idle`: block packaging and move to `budget_exhausted` or `failed`;
- optional action: record omission evidence and continue;
- `running-right`/`running-left`: omit the atomic pair when the source or approved mirror cannot pass.

### Package loop

Code composes only passed `row-real` and `approved-mirror` rows. Package evaluation requires:

- all deterministic atlas and manifest checks to pass;
- the model evaluator to pass the final review board;
- required `idle` availability;
- no unresolved required-scope failure;
- a complete provenance and budget record.

Passing package evaluation moves the run to `ready_for_review`, never directly to `approved`.

## 8. Legal Model Decisions

The model does not receive general tools. At each state, code provides an enum of legal decisions.

Initial decision set:

- `generate-identity`;
- `retry-identity`;
- `generate-action`;
- `retry-action`;
- `switch-image-model`;
- `accept-stage`;
- `omit-optional-action`;
- `request-user-input`;
- `request-human-review`;
- `stop-run`.

Code may expose only a subset for the current state. For example, `omit-optional-action` is never legal for `idle`, and `accept-stage` is illegal when deterministic QA failed.

Example decision:

```json
{
  "schemaVersion": 1,
  "decision": "retry-action",
  "scope": {
    "actionId": "idle"
  },
  "imageModel": {
    "provider": "openai-compatible",
    "model": "gpt-image-2"
  },
  "strategy": {
    "promptStrategyId": "preserve-canonical-pose-v1",
    "referenceStrategyId": "canonical-action-identity-board-v1",
    "requestedChanges": [
      "preserve canonical viewpoint",
      "limit motion to breathing and blink",
      "keep body root fixed"
    ]
  },
  "reasonCodes": [
    "identity-drift",
    "excessive-idle-motion"
  ],
  "confidence": 0.82
}
```

Validation rejects:

- unknown fields when the schema is strict;
- unknown decisions, models, actions, strategies, or reason codes;
- illegal state transitions;
- unavailable models;
- decisions that exceed any budget;
- attempts to approve, import, activate, modify configuration, access secrets, or weaken QA;
- unsafe or unbounded prompt text.

Malformed or illegal decisions receive one schema-repair call that contains validation errors but no new image generation. A second invalid response fails the decision step explicitly.

## 9. Visual Evaluation Contract

### Review input

Code locally composes one bounded review board for each evaluator call. The board may contain:

- validated source identity;
- canonical generated identity;
- the current action contact sheet or keyframes;
- adjacent approved row identity samples when cross-row comparison is necessary;
- fixed layout labels generated by code.

The evaluator receives at most one review-board image attachment per call. Animated previews remain final human-review artifacts; model motion evaluation uses the ordered contact sheet plus deterministic motion metrics.

Embedded text inside a user image or generated image is untrusted content. The evaluator system prompt instructs the model to describe visible text as evidence but never obey it as an instruction.

### Evaluation output

```json
{
  "schemaVersion": 1,
  "verdict": "repair",
  "confidence": 0.88,
  "scores": {
    "identity": 72,
    "actionReadability": 91,
    "crossFrameConsistency": 68,
    "smallScaleReadability": 79,
    "overallVisualQuality": 74
  },
  "defects": [
    {
      "reasonCode": "identity-drift",
      "severity": "blocking",
      "scope": "frames-3-5",
      "evidence": "Ear shape and face marking differ from canonical identity.",
      "repairDirective": "Preserve the canonical head silhouette and left-cheek marking."
    }
  ],
  "summary": "Action reads correctly, but identity consistency is not acceptable."
}
```

Allowed verdicts:

- `pass`;
- `repair`;
- `reject`;
- `cannot-evaluate`.

Rules:

- `pass` cannot contain blocking defects;
- `repair` requires at least one bounded defect and repair directive;
- `reject` means the artifact should not be reused as approved output;
- `cannot-evaluate` fails closed and may trigger one new evaluation call if the evaluation budget permits;
- the model's numeric scores do not replace deterministic metrics;
- model evaluation never sets `artisticApproval`, run approval, Provider approval, import, or activation.

### Combined quality gate

| Code QA | Model evaluation | Result |
| --- | --- | --- |
| pass | pass | advance |
| fail | any | repair or fail according to budget |
| pass | repair/reject | repair or fail according to budget |
| pass | cannot-evaluate | retry evaluation once, then fail closed |

The model cannot override a code failure, even with high confidence.

## 10. Budgets And Cost Control

Default run policy:

```json
{
  "maxIdentityRegenerations": 1,
  "maxActionAttemptsPerAction": 3,
  "maxEvaluationAttemptsPerArtifact": 2,
  "maxProviderCalls": 64,
  "maxElapsedMs": 3600000,
  "maxEstimatedCost": null
}
```

Semantics:

- the initial identity attempt is not counted as a regeneration;
- every image-generation or edit request consumes one Provider call;
- evaluation and planning calls are counted separately in model-usage evidence but do not consume image Provider-call budget;
- a different image model still consumes the same scope attempt;
- retries caused by transient transport errors consume Provider calls but remain subject to the lower-level bounded retry contract;
- `maxEstimatedCost: null` means cost estimation is displayed but no monetary cap is enforced; users may set a positive cap;
- when Provider pricing is unavailable, code enforces attempt, call, and elapsed-time limits and labels cost as unknown;
- the model sees remaining budgets but cannot modify them.

Budget exhaustion is a code-owned state transition. The model may recommend stopping earlier, but cannot continue later without an explicit user action that creates a revised budget snapshot.

## 11. Context And Memory Control

Hatch-pet must remain durable without building one ever-growing model conversation.

### Stateless decision calls

Each planning or evaluation call is constructed from current durable state rather than replaying the complete conversation.

A planning snapshot contains only:

- run and stage identifiers;
- sanitized user intent and character brief;
- canonical identity descriptor;
- current action contract;
- current code QA and latest model evaluation;
- summaries of prior attempts for the active scope;
- eligible image-model metadata;
- remaining budgets;
- legal decisions for the current state.

It excludes:

- ordinary pet chat history;
- raw prior model reasoning;
- raw Provider payloads;
- secrets and authorization material;
- absolute host paths;
- previous image bytes not needed by the current evaluator call;
- completed action details unrelated to the active decision.

### Durable summaries

After every decision, code writes a bounded summary containing:

- decision ID and schema version;
- stage and scope;
- selected model and strategy IDs;
- fixed reason codes;
- budget before and after;
- operation result;
- artifact and evidence relative paths;
- sanitized public summary.

The next call reads summaries, not the original model response. This makes restart and context compaction deterministic.

### Size limits

- no more than the latest three attempt summaries for the active scope;
- no more than one review-board image per evaluation call;
- bounded text lengths for user brief, defects, repair directives, and summaries;
- bounded model candidate list from the host catalog;
- prompt snapshots stored on disk, referenced by hash and relative path rather than repeatedly embedded in later calls.

## 12. Prompt And Strategy Governance

The hatch-pet model may write bounded creative guidance but does not receive unrestricted prompt ownership.

Code composes the final Provider prompt from:

1. fixed output and safety contract;
2. fixed action and atlas contract;
3. canonical identity and reference-board authority;
4. active quality-profile guidance;
5. selected versioned strategy template;
6. model-proposed bounded requested changes;
7. sanitized user creative brief.

The model cannot remove or contradict fixed sections. Requested changes are length-limited and sanitized before composition.

Versioned strategy IDs make behavior inspectable and testable. Initial strategy families should include:

- canonical identity preservation;
- pose and framing correction;
- idle minimal motion;
- action semantic strengthening;
- transparency and edge cleanup by regeneration;
- scale and baseline stabilization;
- cross-row identity repair;
- alternative-model retry.

Unknown strategy IDs are rejected rather than interpreted dynamically.

## 13. Human Approval

### Default flow

The run automatically advances through provisional identity acceptance, action generation, package composition, code QA, and model evaluation. It stops at `ready_for_review`.

The human reviewer sees:

- source beside canonical identity;
- model-selection and attempt history;
- code QA and model evaluation side by side;
- every available action contact sheet and GIF;
- omitted actions and reasons;
- repair history;
- cross-row identity summary;
- transparency, scale, baseline, and atlas evidence;
- budget and estimated-cost summary;
- Provider/model/profile/dataset provenance;
- final atlas and manifest.

Only the human can approve or request another explicit repair cycle.

### Optional identity checkpoint

When `requireIdentityReviewBeforeActions` is enabled, a provisionally passed identity pauses at `awaiting_identity_review`.

The user may:

- approve the identity and continue;
- request identity regeneration within a newly confirmed budget;
- cancel the run.

This setting defaults to `false`.

### Approval boundaries

- model visual pass is not human approval;
- Provider approval registry entries are not per-run human approval;
- run approval does not automatically import or activate unless the user explicitly chooses a separate configured post-approval action;
- no model decision may call `approve-run`, `import-approved-pet`, or activation APIs.

## 14. Control Center Design

### AI settings

Add a Hatch Pet Agent section under AI settings:

- enable model-driven hatch-pet;
- configuration mode: follow chat / dedicated override;
- Provider, endpoint, model, and secret reference for override mode;
- capability status for structured output and vision;
- test connection and model capability check;
- reset to chat-model fallback.

### Creator workflow settings

Expose:

- maximum identity regenerations;
- maximum attempts per action;
- maximum evaluation attempts;
- maximum image Provider calls;
- maximum elapsed time;
- optional estimated-cost cap;
- optional canonical identity checkpoint;
- allowed image Providers/models policy;
- pause, resume, and cancel controls.

All configuration must be stored through `SettingsService` and operable through Control Center. Secrets remain secret references and are never returned to the renderer.

### Run review surface

Show a decision timeline with separate columns for:

- model plan;
- executed operation;
- deterministic QA;
- model visual evaluation;
- budget change;
- resulting state.

The UI must clearly distinguish:

- code failure;
- model visual rejection;
- exhausted budget;
- optional action omission;
- required-scope failure;
- awaiting human approval.

## 15. Persistence And Evidence

Each run should add bounded agent artifacts under its existing data directory:

```text
runs/<runId>/agent/
  config-snapshot.json
  state.json
  budgets.json
  decisions.jsonl
  evaluations/
    identity-<attempt>.json
    <actionId>-<attempt>.json
    package.json
  prompts/
    planner-<decisionId>.json
    evaluator-<evaluationId>.json
  review-boards/
    identity-<attempt>.png
    <actionId>-<attempt>.png
    package.png
```

Public evidence contains only safe relative paths. Logs and dashboard responses must remove:

- API keys and secret references that reveal credentials;
- authorization headers;
- raw Provider responses;
- arbitrary absolute paths;
- unbounded prompt or model output;
- hidden model reasoning.

Decision records should include prompt/evaluator schema versions, model snapshots, artifact hashes, and idempotency keys.

## 16. Recovery And Idempotency

Every executable model decision receives a host-generated `decisionId` and idempotency key derived from run, state version, scope, attempt, and operation.

On restart:

1. load the durable run and agent state;
2. verify artifact paths and hashes;
3. detect an already completed idempotent operation;
4. reuse its result rather than issuing another Provider request;
5. resume at the next unresolved decision slot.

If the process stops after the model decision but before execution, code may safely execute the persisted validated decision. If it stops during a Provider call with no complete evidence, the attempt remains failed/unknown and follows the existing bounded retry rules.

Repair continues to use current action-scoped and identity-scoped checkpoint semantics:

- action repair preserves other hash-valid rows;
- identity repair invalidates canonical identity and all dependent action checkpoints;
- all prior evidence is archived;
- repair never auto-approves, imports, or activates.

## 17. Security Model

The hatch-pet model is untrusted input to the workflow.

Required protections:

- strict JSON schemas with enums and length bounds;
- state-specific legal decision lists;
- host-generated model candidate lists;
- host-owned secret resolution and Provider calls;
- path normalization and data-directory confinement;
- prompt-injection warning for text visible inside images;
- no arbitrary shell, filesystem, network, plugin, approval, import, or activation tools;
- no dynamic code generation or execution;
- no renderer access to secrets;
- sanitized logs and public errors;
- explicit user confirmation for budget expansion after exhaustion;
- feature flag defaulting to disabled until independent verification is complete.

## 18. Failure Handling

| Failure | Code-owned result |
| --- | --- |
| Hatch-pet model unavailable | Stop with capability/configuration error; offer fixed Creator Studio workflow |
| Invalid model decision | One schema-repair call, then explicit failure |
| Image model unavailable | Remove candidate and request a new bounded decision if budget remains |
| Transient Provider transport failure | Use existing bounded same-model retry, then return failure evidence to planner |
| Code QA failure | Model may propose repair but cannot accept the artifact |
| Model visual rejection | Repair within scope budget or apply required/optional failure policy |
| Evaluator cannot evaluate | One bounded re-evaluation, then fail closed |
| Canonical identity budget exhausted | Block run |
| `idle` budget exhausted | Block package |
| Optional action budget exhausted | Omit action and continue |
| Total budget exhausted | Stop; require explicit user budget revision |
| Context or response too large | Rebuild from bounded durable summaries; do not replay complete history |
| App restart | Resume from durable state and idempotency evidence |

The workflow must never silently fall back to fixture art, transform-only motion, copied `idle` rows, unreviewed output, or a lower quality profile.

## 19. Testing Strategy

### Unit coverage

- hatch-pet configuration normalization and chat fallback;
- capability rejection for non-vision/non-structured models;
- planner and evaluator schema validation;
- legal decisions per state;
- budget accounting and exhaustion;
- model candidate filtering and arbitrary-model rejection;
- prompt strategy composition and fixed-contract preservation;
- combined code/model quality gate;
- required versus optional failure policy;
- context snapshot bounds and secret removal;
- idempotency and restart recovery.

### Service integration coverage

- `HatchPetAgentService` with scripted fake model decisions;
- malformed and repeated-invalid model responses;
- model switching across attempts;
- identity regeneration and action repair;
- optional action omission;
- fixed Creator Studio fallback when agent is disabled or unavailable;
- final human-review stop with no auto-approval/import/activation;
- exact provenance for every successful generation model.

### Control Center coverage

- dedicated/follow-chat configuration;
- secret-safe renderer contract;
- capability status;
- budget editing and validation;
- identity checkpoint toggle;
- pause/resume/cancel;
- decision/QA/evaluation timeline;
- budget-exhausted and omitted-action states.

### Independent real verification

Real validation belongs to an isolated testing branch and must include:

- at least one successful model-driven full-pet run;
- deliberate code QA failure that the model cannot override;
- deliberate visual defect that code metrics miss but the evaluator rejects;
- automatic retry with prompt strategy change;
- automatic switch between two eligible image models;
- identity regeneration within its one-retry budget;
- optional action omission after three attempts;
- required `idle` failure blocking packaging;
- app restart and durable resume;
- final human approval with contact-sheet, GIF, identity, transparency, scale, baseline, and atlas inspection;
- no Provider approval or `production-art-ready` claim until all successful model tuples receive legitimate human acceptance evidence.

## 20. Rollout Plan

### Phase 1: contracts and shadow planner

- add configuration, schemas, state snapshots, budgets, persistence, and Control Center settings;
- run planner in shadow mode beside the fixed workflow;
- record decisions without executing them;
- compare planner decisions with actual workflow outcomes.

### Phase 2: bounded identity and single-action agent

- allow execution of identity and one action decision loop;
- keep full-pet default on the fixed workflow;
- verify state recovery, budgets, code/model gates, and human review.

### Phase 3: full-pet agent opt-in

- enable all official action loops, optional omission, model switching, package evaluation, and final review;
- retain fixed Creator Studio workflow as an explicit fallback;
- keep the agent feature disabled by default until independent automated and real visual verification passes.

### Phase 4: default eligibility

Consider making the agent the default only after evidence demonstrates that it improves successful human-approved output without unacceptable cost, latency, identity drift, or failure rates.

## 21. Success Criteria

The design is successful when:

- users can configure or inherit a hatch-pet model through Control Center;
- the model can plan, select image models, evaluate visuals, and repair within bounded legal actions;
- code remains authoritative for QA, budgets, security, state, approval, import, and activation;
- no ordinary chat history enters hatch-pet runs;
- context size remains bounded across long runs and restarts;
- every decision, model, attempt, artifact, and budget change is auditable;
- canonical identity and `idle` failures block packaging;
- optional failures are omitted rather than replaced with low-quality art;
- the final run always stops for human approval;
- model autonomy improves real human-approved results without weakening existing quality gates.

## 22. Non-Goals

- Letting the model edit arbitrary project or pet-pack files.
- Letting the model add Provider endpoints or read credentials.
- Letting the model approve, import, activate, or publish a pet.
- Replacing deterministic image processing, QA, atlas composition, or manifest validation with model opinion.
- Allowing model evaluation to override code QA.
- Reusing ordinary pet conversation memory for creator decisions.
- Infinite self-improvement loops or unlimited model switching.
- Treating a model visual pass as Provider approval or production-art readiness.
- Removing the existing non-agent Creator Studio workflow.

## 23. Implementation Boundary

This document defines product and architecture behavior only. No implementation is complete until a separate plan maps the design into focused changes across:

- AI configuration and `AiService` scoped completion/vision interfaces;
- new `HatchPetAgentService` and decision schemas;
- Creator workflow state, budgets, persistence, and recovery;
- Creator Studio strategy, evaluation-board, repair, and provenance interfaces;
- Control Center settings and run-review UI;
- automated tests and isolated real Provider/human verification.

Implementation planning must be decomposed into four sequential, independently reviewable plans matching the rollout phases:

1. agent contracts, configuration, persistence, budgets, and shadow decisions;
2. bounded canonical-identity and single-action execution;
3. full-pet action orchestration, model switching, package evaluation, and human review;
4. independent real verification, rollout evidence, and default-eligibility decision.

Each plan must preserve a working non-agent Creator Studio fallback and define its own migration, automated verification, and rollback boundary. Do not combine all four phases into one implementation batch.

Implementation must preserve the current code-owned single-reference generation contract, output-count gates, QA thresholds, human approval boundary, plugin isolation, and host-owned secret handling.
