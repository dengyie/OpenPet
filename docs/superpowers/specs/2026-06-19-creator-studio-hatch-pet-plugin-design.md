# Creator Studio Hatch-Pet Plugin Design

Date: 2026-06-19
Status: Proposed
Scope: OpenPet hybrid Creator Tools extension for end-to-end `codex-pet` generation, review, import, and export

## 1. Goal

Design an OpenPet extension named `Creator Studio` that can:

- create a complete pet generation run from prompts and optional reference images;
- execute a `hatch-pet`-style pipeline that produces a standard `codex-pet` output (`pet.json` + `spritesheet.webp`);
- support both cloud and local model backends behind one plugin-controlled abstraction;
- require human review before OpenPet import;
- import approved outputs into OpenPet through host-owned pet-pack lifecycle APIs instead of direct filesystem mutation;
- preserve reusable artifacts, logs, QA outputs, and exportable `.codex-pet.zip` bundles.

This design is for a plugin-first implementation. It intentionally does not move the full pet-generation workflow into OpenPet core.

## 2. Product Positioning

`Creator Studio` is a hybrid profile extension that turns OpenPet into a creator platform for complete pet production. It is not a simple action importer and not a runtime-only AI companion. Its primary responsibility is pet creation workflow orchestration.

The plugin should feel like a creator workbench:

- multiple runs can exist at once;
- long-running work survives app restarts;
- users can inspect intermediate outputs;
- QA and approval are first-class;
- import into OpenPet is explicit and reversible at the workflow level.

## 3. Non-Goals

This phase does not:

- move the `hatch-pet` pipeline into OpenPet core;
- bypass `PetService` or `PetPackService`;
- auto-import generated pets without user review;
- promise that OpenPet manages third-party model secrets for the plugin;
- require only one backend type;
- redesign the current general plugin system around this single extension.

## 4. Recommended High-Level Architecture

Choose a `Creator Studio` extension built as a hybrid profile package with:

- a dashboard for authoring, monitoring, QA, review, and import actions;
- command entries for explicit user-triggered actions;
- one service entry for long-running orchestration, backend execution, and recovery;
- a run workspace on disk that stores all persistent pipeline state and artifacts;
- a backend adapter layer that normalizes cloud and local image-generation paths;
- a deterministic post-processing layer inspired by the current `hatch-pet` contract.

This is preferred over:

- a thin orchestrator plugin, which would ship too much complexity to ad hoc shell scripts and produce a weak UX;
- a core-integrated implementation, which would expand OpenPet host responsibilities too early and blur extension boundaries.

## 5. Host vs Plugin Boundary

The boundary must stay strict.

OpenPet host owns:

- plugin installation, lifecycle, and process management;
- all pet mutations through `PetService`;
- all pet-pack validation, import, activation, export, provenance, and policy enforcement through `PetPackService`;
- creator bridge routing and permission enforcement;
- the only authoritative write path into OpenPet-managed pet-pack persistence.

Creator Studio plugin owns:

- run creation and run persistence;
- prompt/reference intake;
- backend selection between cloud and local models;
- base-image generation and row generation orchestration;
- deterministic extract / inspect / compose / validate workflow execution;
- review queue and repair loop state;
- export bundle generation;
- user-visible creator logs and pipeline evidence.

The plugin must never directly write into OpenPet's installed pet-pack directories. Approved output becomes importable only by asking the host to perform pet-pack inspection/import on behalf of the plugin.

## 6. Plugin Package Shape

Recommended package structure:

```text
openpet-creator-studio/
├── plugin.json
├── config.schema.json
├── commands/
│   ├── create-run.js
│   ├── run-step.js
│   ├── approve-run.js
│   ├── import-approved-pet.js
│   └── export-bundle.js
├── service/
│   └── studio-service.js
├── web/
│   └── dashboard/
├── hatch-pet/
│   ├── adapters/
│   ├── prompts/
│   ├── scripts/
│   └── templates/
├── assets/
├── models/
└── README.md
```

Role of each area:

- `commands/`: explicit actions initiated by UI.
- `service/`: run queue, orchestration engine, recovery, and backend execution.
- `web/dashboard/`: creator workbench UI.
- `hatch-pet/adapters/`: backend abstraction layer for cloud and local generation.
- `hatch-pet/scripts/`: deterministic raster and packaging steps.
- `models/`: optional backend-specific assets or config helpers, not OpenPet-owned runtime secrets.

## 7. Manifest and Profile

The extension should use:

- `profile: "hybrid"`
- `entries.commands`
- `entries.services`
- `entries.dashboards`

The dashboard is the main user-facing surface.

The service is the workflow engine.

Commands should remain small, explicit entry points such as:

- `create-run`
- `run-step`
- `approve-run`
- `import-approved-pet`
- `export-bundle`

Commands should delegate long-lived behavior to the service rather than re-implement orchestration themselves.

## 8. Model Backend Strategy

The plugin must support both cloud and local backends through the same internal interface.

Use a backend abstraction like:

- `generateBase(run, input)`
- `generateRow(run, state, input)`
- `repairRow(run, state, input)`
- `describeFailure(error)`

Cloud mode:

- first path to make reliable;
- configured through plugin config and extension-managed secret/data locations;
- used to prove the workflow, UX, and artifact boundaries.

Local mode:

- added behind the same adapter contract;
- expected to call a local process or local service endpoint managed by the plugin;
- must not require OpenPet host changes beyond generic extension lifecycle.

The run workspace and state machine must not differ by backend. Backend choice changes only generation implementation, not artifact contract.

## 9. Secret and Runtime Ownership

Cloud API keys, local model endpoints, and related credentials should be treated as extension-managed secrets, not OpenPet-owned secrets.

Rationale:

- current OpenPet plugin ecosystem already allows extension-managed external credentials under explicit disclosure;
- current host-side `network` restrictions are not suitable as the primary path for cloud image generation;
- Creator Studio must be able to talk to model providers or local runtimes using its own execution environment.

OpenPet should manage:

- plugin lifecycle;
- plugin config display/edit flow where appropriate;
- plugin-owned data/cache/log directory provisioning;
- bridge access;
- logs visible to the user.

Creator Studio should manage:

- provider-specific authentication material;
- provider client libraries or HTTP invocation logic;
- local backend process assumptions;
- backend-specific retry semantics.

## 10. Why Existing `network` Permission Is Not Enough

The plugin's main cloud model path should not rely on the current OpenPet `network` permission or old JS SDK compatibility path.

Reason:

- the current host-controlled network helper is intentionally restrictive;
- it disallows sensitive request headers such as `Authorization`;
- it is designed for safe, narrow allowlisted integrations, not as the primary transport for model-generation APIs.

Therefore:

- model generation should run in the plugin's own command/service process;
- OpenPet should not be expected to proxy full model API traffic through the existing bridge.

## 11. Run Workspace

Every pet creation attempt should be a first-class `run` persisted on disk.

Recommended layout:

```text
runs/
  2026-06-19-my-pet-001/
    run.json
    inputs/
      prompt.md
      references/
      config.json
    jobs/
      imagegen-jobs.json
      prompts/
      retry-prompts/
    decoded/
      base.png
      idle.png
      running-right.png
      running-left.png
      waving.png
      jumping.png
      failed.png
      waiting.png
      running.png
      review.png
    frames/
      idle/
      running-right/
      running-left/
      waving/
      jumping/
      failed/
      waiting/
      running/
      review/
      frames-manifest.json
      inspection.json
    outputs/
      spritesheet.png
      spritesheet.webp
      pet.json
      pet.codex-pet.zip
    qa/
      atlas-validation.json
      contact-sheet.png
      motion-preview.gif
      review-notes.md
    logs/
      service.log
      command.log
```

This workspace should be considered durable workflow state, not temporary scratch output.

## 12. `run.json` as the Single Source of Truth

`run.json` should be the primary source of state for each run.

Minimum fields:

- `runId`
- `status`
- `backend`
- `modelProvider`
- `createdAt`
- `updatedAt`
- `currentStep`
- `inputs`
- `artifacts`
- `jobs`
- `reviewStatus`
- `importStatus`
- `error`

Optional but useful fields:

- `backendConfigSnapshot`
- `retryCounts`
- `selectedReferenceSet`
- `approvedAt`
- `approvedBy`
- `importedPackId`

The dashboard and service should both derive visible state from `run.json`, not from inferred directory contents alone.

## 13. Run State Machine

Recommended lifecycle:

1. `draft`
2. `prepared`
3. `base_generated`
4. `rows_generating`
5. `rows_generated`
6. `qa_running`
7. `qa_failed` or `ready_for_review`
8. `approved` or `changes_requested`
9. `importing`
10. `imported`
11. `archived`

State rules:

- failures do not destroy the run;
- `approved` is required before import;
- `changes_requested` must allow partial reruns rather than forcing a full restart;
- `imported` does not remove artifacts or QA evidence;
- backend switching must not require a different state machine shape.

## 14. Golden Workflow

The intended happy path is:

1. create a run from prompt and optional references;
2. prepare generation metadata and pipeline inputs;
3. generate canonical base image;
4. generate required row strips or equivalent row outputs;
5. run deterministic extract / inspect / compose / validate steps;
6. enter review queue;
7. user approves run;
8. plugin requests OpenPet import of the approved result;
9. user may activate imported pet;
10. plugin retains exportable zip and review evidence.

## 15. Review and Approval Model

Review must be a first-class gate. Default behavior should be:

- generated output goes to a review queue;
- import is disabled until review passes;
- approval is explicit;
- the plugin preserves review notes and artifacts;
- rejected runs move to `changes_requested`, not a terminal dead end.

This is essential because `hatch-pet` quality issues are often local to a few rows or a specific atlas validation defect, and the user needs a visible correction loop.

## 16. Dashboard Information Architecture

Do not use a simple one-shot wizard as the primary dashboard shape.

Preferred dashboard layout:

- left rail: run list and run creation;
- main upper area: creation brief, references, backend choice, run controls;
- main middle area: pipeline status timeline;
- main lower area: QA/review preview and approved output actions.

Key UI capabilities:

- create new run;
- switch between existing runs;
- inspect run status at a glance;
- trigger base generation, row generation, QA, approval, import, export;
- view contact sheet, atlas preview, motion preview, and validation warnings;
- see partial progress without losing context.

Reasoning:

- this is a creator workbench, not a one-form action;
- multiple runs and interrupted work are expected;
- partial reruns are common;
- review and import must be visible in the same operational context.

## 17. Current Bridge Capabilities the Plugin Can Reuse

From the current OpenPet codebase, Creator Studio can already rely on host-mediated routes for:

- action reads and writes;
- pack-manifest reads and writes;
- asset inspection and frame import;
- pet speech, action, and event mutation;
- plugin process lifecycle;
- plugin dashboard launch;
- plugin-owned data/cache/log directories.

These routes are useful for:

- status announcements;
- action import sub-flows;
- pack metadata editing on installed user packs;
- host-mediated frame import helpers.

## 18. Missing Host Capability Required for Full Pet Import

Current bridge capabilities are not sufficient to import a complete plugin-generated pet into OpenPet as a pet pack.

The host needs a small new capability surface for approved plugin output import.

Recommended new permission:

- `pet-pack:import`

Recommended bridge routes:

- `POST /creator/pet-pack/inspect-output`
- `POST /creator/pet-pack/import-output`
- optional `POST /creator/pet-pack/activate`

These routes should:

- accept a plugin-owned approved output path or structured reference;
- reuse `PetPackService` inspection/import/activation logic;
- preserve OpenPet provenance, policy, and blocklist behavior;
- avoid giving the plugin direct write access to OpenPet's pet-pack storage.

This permission must remain distinct from `assets:generate`. Generating action frames and installing a full pet are different authority levels.

## 19. Recommended Permission Set

First implementation should request the smallest useful set.

Recommended minimum:

- `assets:inspect`
- `assets:generate`
- `pet-pack:import` (new host capability)

Recommended optional permissions:

- `pet:say`
- `pack-manifest:read`
- `pack-manifest:write`
- `actions:read`
- `actions:write`

Do not require `ai:chat` for the core value path.

## 20. Error Taxonomy

Use four primary failure classes.

### 20.1 `generation_failed`

One or more model-generation jobs fail.

Behavior:

- preserve completed artifacts;
- mark failing jobs explicitly;
- allow rerun of base or specific rows.

### 20.2 `pipeline_failed`

Deterministic steps such as extract / inspect / compose / validate fail.

Behavior:

- persist structured QA outputs;
- surface exact failing step and affected row when applicable;
- allow retry after repair.

### 20.3 `review_rejected`

Human review rejects the run for visual or behavioral quality reasons.

Behavior:

- move to `changes_requested`;
- preserve review notes;
- support partial rerun and re-review.

### 20.4 `import_failed`

Approved output fails host inspection or host policy checks.

Behavior:

- keep approved output intact;
- record import failure separately from generation success;
- allow metadata/version correction or export without rerunning generation.

## 21. Recovery Rules

Recovery rules must be explicit:

- prefer partial rerun over full rerun;
- never discard a run on ordinary failure;
- service restart should reload unresolved runs from disk;
- dashboard should clearly show resumable state;
- imported runs remain exportable and auditable.

This makes the plugin practical for real creator use instead of demo-only use.

## 22. Testing Strategy

Testing should span four layers.

### 22.1 Unit Tests

Test:

- backend adapter contract;
- run state transitions;
- workspace artifact registration;
- approval state transitions;
- import permission gating.

### 22.2 Integration Tests

Test:

- command to service handoff;
- service to run workspace persistence;
- bridge permission enforcement;
- approved output import through host-owned pet-pack path;
- import failure without run corruption.

### 22.3 Fixture Tests

Maintain fixtures for:

- valid `codex-pet` output;
- invalid atlas;
- incomplete run;
- recoverable `changes_requested` run;
- import-ready approved run.

### 22.4 End-to-End Validation

At least one full happy-path test should cover:

- create run;
- generate outputs;
- run QA;
- approve run;
- import into OpenPet;
- optionally activate imported pet.

This path is the most important proof that the product works.

## 23. Why This Design Fits OpenPet

This design aligns with current OpenPet architecture because:

- `PetService` remains the single pet mutation authority;
- `PetPackService` remains the only pet-pack persistence authority;
- the plugin system already supports dashboards, commands, services, creator bridge calls, and plugin-owned working directories;
- the existing `codex-pet` runtime already understands the final output contract;
- the only required host expansion is a narrow, well-scoped import capability for approved plugin outputs.

## 24. Phasing Recommendation

Recommended implementation order:

1. scaffold plugin package and dashboard shell;
2. add run workspace + `run.json` state model;
3. add service orchestration and command entrypoints;
4. integrate cloud backend first;
5. wrap deterministic `hatch-pet`-style post-processing;
6. add review queue and approved output handling;
7. add host-side `pet-pack:import` bridge capability;
8. complete import/activate/export flow;
9. add local backend adapter;
10. add richer repair UX and partial rerun controls.

Cloud-first execution with backend-neutral contracts is the fastest safe route while preserving the final dual-backend goal.

## 25. Acceptance Criteria

This design is satisfied when:

- a hybrid profile plugin can create and persist multiple pet-generation runs;
- one run can execute a full workflow from prompt/reference input to valid `codex-pet` output;
- the user can review output before import;
- import goes through host-managed pet-pack APIs only;
- the plugin can export `.codex-pet.zip`;
- failures preserve state and support targeted retry;
- the architecture supports both cloud and local backends without changing the run contract.
