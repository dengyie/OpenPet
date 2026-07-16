# Hatch Pet Scope Conformance Remediation Design

## Status

- Date: 2026-07-16
- Source branch: `codex/dev8`
- Status: approved repair direction, pending implementation
- Source evidence: deep static review of `606f2a26..da565c4f`
- Verification boundary: production implementation occurs on `codex/dev8`; automated and real-image verification occurs only on the existing isolated test assignment

## 1. Goal

Bring the current Creator Studio, Provider-neutral image generation, and Hatch Pet foundation into conformance with the approved development contracts.

The remediation closes seven concrete gaps:

1. generation must stop for explicit human visual approval;
2. `idle` is the only required official action and optional failures remain importable omissions;
3. a user-supplied new-character style request must influence the real Provider prompt through a typed bounded field;
4. Creator run state and heartbeat persistence must survive process termination without leaving unreadable state;
5. Provider prompts must reject local, relative, URI, and platform path syntax;
6. documentation and UI evidence must describe the exact-one-reference/edit-only contract truthfully;
7. the independent test handoff must verify the final integrated development HEAD rather than an obsolete partial commit list.

This remediation does not implement Hatch Pet Phase 2 or Phase 3 bounded execution. The Agent remains disabled by default and fixed to `shadow` until those later plans are implemented and independently verified.

## 2. Confirmed Product Decisions

1. `ready_for_review` is a terminal state for automatic generation orchestration.
2. Automatic code paths may not call `approve-run`, import commands, or activation after generation.
3. Human approval must be an explicit host-owned operation with auditable approval metadata.
4. Approval, import, and activation are separate user actions. Approval never implies import or activation.
5. Full-pet packaging requires canonical identity and `idle`. Other official actions are optional.
6. `running-right` and its `running-left` mirror remain one optional atomic pair.
7. A failed optional action is recorded in `omittedActionIds`; it does not turn a valid partial package into preview-only output.
8. User text never becomes an unrestricted Provider prompt. A bounded typed appearance intent is compiled between fixed identity locks and fixed output constraints.
9. Reference-image authority wins when a written appearance request conflicts with visible identity, unless the product later introduces a separately reviewed transformation mode.
10. Every run-state write used by generation, heartbeat, recovery, repair, approval, and import uses atomic replacement.
11. Missing or malformed prompt provenance is displayed as unknown/not recorded. UI code never invents `/images/generations`, `text-to-image`, or provider-neutral evidence.
12. No development-branch test, build, Provider call, image generation, browser check, or visual inspection is authorized by this remediation.

## 3. Human Approval Boundary

### 3.1 Automatic workflow

The fixed Creator Workflow may automatically perform:

```text
draft -> confirm -> generate -> deterministic QA -> ready_for_review
```

At `ready_for_review`, it returns a `review-required` result containing the run ID and bounded review diagnostics. It performs no approval, import, activation, or trigger mutation.

### 3.2 Explicit human approval

`approve-run` requires a host-created approval payload:

```js
{
  runId,
  humanApproval: {
    approved: true,
    source: 'control-center' | 'creator-studio-dashboard',
    approvedAt,
    evidenceVersion: 1
  }
}
```

The command rejects missing, malformed, false, unsupported-source, or unbounded approval evidence before changing run state. It continues to enforce deterministic action/full-pet QA.

The persisted run stores bounded approval metadata under `humanApproval`. It stores no free-form reviewer prose, image bytes, absolute paths, credentials, or raw model output.

### 3.3 Import and activation

Import commands continue to require `status='approved'`, but approval does not invoke them. Control Center or the dashboard must issue a separate explicit import request. Activation is a separate explicit boolean selected by the user at import time and defaults to `false`.

Hatch Pet model decisions cannot create human approval evidence or invoke approval/import/activation operations.

## 4. Quality-First Partial Packaging

The host must consume authoritative coverage fields produced by Creator Studio:

```js
{
  requiredActionIds: ['idle'],
  availableActionIds: ['idle', 'waving'],
  omittedActionIds: ['jumping', 'failed'],
  actionAvailability: { ... }
}
```

Compatibility handling:

- use `requiredActionIds` when present;
- otherwise use `requiredOfficialActionIds` only for legacy complete-package evidence;
- for new partial evidence without an explicit required list, default to `['idle']`;
- never derive the required set from every `CODEX_ROWS` entry;
- require `idle` in `availableActionIds`/real coverage;
- validate the directional pair atomically;
- preserve transparent atlas slots for omitted actions.

The Host returns `review-required` for a technically valid partial package. It returns preview-only only when required identity/`idle` evidence is missing or the output is explicitly classified as preview fallback.

## 5. Typed Appearance Intent

### 5.1 Contract

Add a bounded field to `ProviderImageTask`:

```js
appearanceIntent: []
```

Rules:

- array only;
- maximum 6 entries;
- maximum 240 characters per entry;
- ordinary visual language only;
- no secrets, URLs, paths, file URIs, project terms, transport terms, identifiers, runtime instructions, or prompt-control language;
- empty after sanitization is allowed and omitted from the prompt.

This field is distinct from future Hatch Pet `requestedChanges` strategy output. Fixed Creator Workflow derives it from the explicit `stylePrompt`/`characterBrief`; future Agent execution may only populate it through registered strategies.

### 5.2 Compiler placement

The Provider prompt order becomes:

1. exact output count, dimensions, and aspect ratio;
2. deliverable type;
3. attached-reference interpretation;
4. fixed identity and style locks;
5. bounded appearance intent;
6. action/motion requirements;
7. framing, transparency, and layout requirements;
8. fixed exclusions.

Fixed requirements appear after any bounded user intent as well, so user text cannot remove the exact-one-character, reference-authority, canvas, transparency, or exclusion contracts.

`buildCharacterAnchorPrompt` explicitly accepts `appearanceIntent`. `buildOpenPetImagePrompt` passes the normalized style request into the typed task used for the actual `providerPrompt`. The project-specific dashboard prompt may retain richer local explanation but is never sent upstream.

### 5.3 Conflict behavior

The prompt states that the reference image controls visible identity. Appearance intent may adjust mood, palette emphasis, material finish, or an explicitly requested visual treatment only when it does not contradict visible identity locks.

## 6. Prompt Path And Injection Safety

The visual-directive sanitizer and final compiler assertion reject or remove:

- `file://`, `file:///`, and other local-file URI forms;
- `../`, `..\\`, and path traversal segments;
- project-relative asset paths such as `runs/...`, `inputs/...`, `outputs/...`, `assets/...`, and `cat_anime/...`;
- POSIX absolute paths;
- Windows drive paths;
- UNC paths;
- HTTP(S) URLs;
- prompt-control phrases that attempt to ignore, replace, reveal, or override the fixed instructions;
- existing forbidden product, Provider, backend, run/action ID, checkpoint, multipart, and reference-role terms.

Sanitization happens when constructing the typed task. The final compiled prompt is checked again and fails closed with `image_prompt_internal_term` or `image_prompt_contract_invalid` when forbidden material remains.

## 7. Atomic Creator Run Persistence

Replace direct `run.json` overwrites with same-directory atomic replacement:

```text
serialize bounded run
  -> write unique temporary file
  -> flush/close
  -> rename temporary file over run.json
  -> best-effort temporary cleanup
```

All `createRun`, `writeRun`, heartbeat, recovery, repair, approval, and import status writes use the same helper.

Recovery behavior for an unreadable current file:

- retain the corrupted file for diagnostics using a bounded `.corrupt-<timestamp>` name;
- restore the last valid backup when available;
- otherwise expose a deterministic failed recovery record instead of silently dropping the run from `listRuns`;
- never fabricate successful checkpoints or approval state.

The heartbeat keeps the existing 30-second interval and five-minute stale threshold. Atomic persistence changes durability only; it does not expand budgets or timeouts.

## 8. Evidence And UI Truthfulness

Current documentation is updated from “at most one” to “exactly one” reference for every real image request. Stable error codes remain:

- `reference_image_required`;
- `reference_image_count_invalid`;
- `reference_image_invalid`;
- `reference_image_unusable`.

Control Center and Creator Studio dashboard display:

- `image-edit via /images/edits` only when recorded evidence contains those values;
- `not recorded` when evidence is absent;
- the actual recorded reference/output counts;
- `provider-neutral` only when compiler evidence explicitly records it.

They never default missing evidence to `text-to-image`, `/images/generations`, reference count `1`, output count `1`, or provider-neutral safety.

The current truth document distinguishes:

- Hatch Pet Phase 1 automated verification: passed on its isolated test task;
- final integrated Provider-neutral/timeout remediation: implemented but not independently verified;
- real Provider, visual, repair, human-label, calibration, approval, import, activation, and production-art readiness: not proven.

## 9. Error Handling

- Missing reference before run creation returns the public workflow code `reference_image_required`.
- A run that loses its reference after creation fails closed with `reference_image_required` and stays recoverable; automatic approval/import is impossible.
- Invalid appearance intent fails before Provider transport and consumes no Provider-call budget.
- A partial package missing `idle` remains review-blocked and unimportable.
- Missing optional actions are explicit omissions, not failures and not preview substitutes.
- Missing human approval leaves the run at `ready_for_review`.
- Import without approved state fails closed.
- Atomic write failure preserves the previous valid `run.json` and reports a bounded error.

## 10. Architecture Ownership

| Responsibility | Owner |
| --- | --- |
| Required/optional action interpretation | `CreatorWorkflowService`, consuming Creator Studio coverage evidence |
| Deterministic row and atlas QA | Creator Studio QA modules |
| Human approval validation | `approve-run` plus Host-owned UI action |
| Import and activation choice | Host Control Center / Creator Studio dashboard |
| Typed appearance intent | `provider-image-task.js` |
| Provider-neutral rendering | `provider-image-prompt-compiler.js` |
| Reference/output/transport gates | Creator bridge and `image-generation-model-service.js` |
| Durable Creator run writes | `run-store.js` |
| Public evidence projection | `studio-service.js`, `CreatorPane.tsx`, dashboard |
| Hatch Pet Phase 1 shadow planning | `HatchPetAgentService`; unchanged by this remediation |

## 11. Independent Verification Requirements

The existing isolated test task must be updated from the final remediation HEAD and must not rely on the obsolete six-commit list.

Required automated regression evidence includes:

1. ready-for-review generation never invokes approval, import, activation, or trigger mutation;
2. explicit approval rejects missing/false/model-created evidence and accepts bounded host-created human evidence;
3. import remains separate and activation defaults false;
4. `idle`-only and `idle` plus optional-action packages remain reviewable/importable after human approval;
5. missing `idle` blocks;
6. running directional-pair inconsistency blocks only that optional pair;
7. a safe Style Prompt appears in the real `providerPrompt` and character-anchor prompt;
8. secrets, internal terms, relative paths, traversal, file URIs, Windows paths, UNC paths, and prompt-control text do not appear upstream;
9. interrupted/torn run writes preserve or recover a valid run record;
10. heartbeat and stale recovery preserve completed checkpoints and record `generation-command-terminated`;
11. UI and dashboard show `not recorded` rather than fabricated generations-path evidence;
12. exact-one-reference, `/images/edits`, multipart `image`, and `n=1` remain unchanged;
13. focused suites and all required repository commands pass on the isolated test branch.

Real Provider and visual verification remains subject to fresh one-shot image subagents and separate human approval. No automated result creates Provider approval or `production-art-ready` status.

## 12. Acceptance Criteria

This remediation is implemented when:

1. no supported automatic path approves, imports, or activates a generated run;
2. explicit human approval is required and auditable;
3. valid partial packages containing approved identity and `idle` are not blocked by omitted optional actions;
4. user appearance intent reaches the actual Provider prompt through the typed compiler without raw prompt passthrough;
5. forbidden paths, URIs, internal terms, secrets, and prompt-control instructions cannot reach the Provider prompt;
6. Creator run persistence remains readable across heartbeat writes and process termination;
7. docs and UI no longer advertise at-most-one or generations-path behavior;
8. the independent test handoff targets the final integrated HEAD and passes every automated gate;
9. the final workflow still stops for human review and makes no unsupported visual or production-readiness claim.

## 13. Non-Goals

- Implementing Hatch Pet Phase 2 identity or single-action execution.
- Implementing Hatch Pet Phase 3 full-pet orchestration.
- Allowing arbitrary model-written image prompts.
- Lowering deterministic identity, motion, row, atlas, or output-count thresholds.
- Generating images, reviewing visual quality, or writing Provider approval records on `codex/dev8`.
- Automatically importing or activating immediately after human approval.
