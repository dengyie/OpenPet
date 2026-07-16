# Pet Generation Quality Governance Independent Test Handoff

> Source branch: `codex/dev8`
> Required implementation ancestor: `9ad3ee0ac6a0245d71022de0492dd789e7e2a880`
> Testing branch: `codex/dev8-quality-governance-test` in a new isolated worktree
> Development status: implemented but unverified

## Isolation And Starting State

Create a new Codex testing task and an isolated worktree bound to `codex/dev8-quality-governance-test`. Base it on the final `codex/dev8` HEAD that contains this handoff document. The required implementation commit above must be an ancestor of the testing branch.

Do not modify, reset, rewrite, rebase, merge into, push, clean, or switch `codex/dev8`. Do not touch the primary worktree or any other development/testing worktree. All tests, fixtures, real Provider calls, generated evidence, and test fixes belong only to the testing branch.

Before any change, report:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor 9ad3ee0ac6a0245d71022de0492dd789e7e2a880 HEAD
git worktree list --porcelain
```

Continue only when the worktree is isolated, the branch is `codex/dev8-quality-governance-test`, the implementation ancestor check succeeds, and the worktree is clean.

## Testing Objective

Independently verify all five quality-governance changes without relying on the development-task conversation:

1. Every plugin and host image-generation boundary rejects more than one reference image before path resolution, queue acquisition, or Provider work, and multipart edits use `image`, never `image[]`.
2. Human-example and Provider-approval registries reject malformed, duplicate, unsafe, unsupported, or inconsistent records while valid empty registries preserve prior behavior.
3. Prompts, reference boards, keyframe QA, row QA, atlas QA, and generation stages use the active profile and record matching profile evidence.
4. Action repair regenerates only the requested supported action and reuses other hash-valid rows; identity repair invalidates the full generated identity and all action checkpoints; neither path auto-approves or imports.
5. `production-art-ready` is emitted only when every successful generation model, including fallback and reused repair models, has an exact human-approved Provider/model/profile/dataset record. `artisticApproval` remains false until independent per-run human review.

## Automated Test Work

Add or update focused tests for:

- `src/main/services/image-generation-model-service.js`;
- `src/main/services/plugin-service.js`;
- Creator Studio human-example, profile, governance, prompt, reference-board, host-model-bridge, row-QA, atlas, checkpoint, backend-runner, service-route, workflow-service, IPC, preload, Control Center, documentation, and smoke-summary contracts;
- successful single-model claims, missing approvals, duplicate approval tuples, fallback-model mixtures, partial failures, scoped repairs with reused historical models, and empty-registry behavior;
- action retry rejection for `running-left`, unknown actions, non-full-pet runs, and non-repairable states;
- identity repair evidence archiving and approval/import invalidation.

Do not weaken production code merely to satisfy tests. Keep fixtures bounded and never commit credentials, authorization headers, raw Provider payloads, absolute host paths, or fabricated human judgments.

## Required Verification Commands

Run and record the exact command, exit status, and failure output for:

```bash
npm run check:syntax
npm run test:core
npm run test:core:all
npm run test:control-center
```

Also run focused Node suites covering image service, plugin service, Creator Studio bridge, prompts and boards, human registries and profiles, row QA, atlas, checkpoints, backend runner, workflow service, IPC, docs, and the host smoke script. Run relevant Control Center tests for repair controls and API contracts. If the repository provides a broader applicable suite, run it after focused failures are resolved.

## Real Provider And Human Acceptance

Use real Provider credentials only through the host-owned configuration boundary. Never echo or commit secrets.

Run real Provider smoke for both normal full-pet generation and repair paths. Capture bounded evidence proving every image request uses zero or one reference attachment and no multipart request uses `image[]`. Exercise a real action repair and a real identity repair.

Create real human-approved and human-rejected examples only after inspecting actual generated artifacts. Store bounded records in the human-example registry with safe relative evidence paths and fixed reason codes. Do not invent labels to make tests pass.

Calibrate a non-default profile only if the real reviewed labels and recorded metrics support it. The profile must name the exact source dataset and a safe review-evidence path. Compare it against `pet-generation-default-v1`; do not silently replace the default.

Human acceptance must inspect:

- source image beside canonical identity;
- every available action contact sheet;
- every available animated preview or GIF;
- cross-row identity and accessories;
- action semantics and direction;
- transparent-background cleanliness and edge contact;
- scale, centroid, and baseline stability;
- final atlas dimensions, row placement, visible used cells, and fully transparent unused cells.

Add a Provider art approval record only after those checks pass for the exact Provider, every successful model, active profile, and dataset. Re-run the focused claim tests and smoke summary after adding the approval. Confirm the approval changes only `artReadiness`; it must not set per-run `artisticApproval`, approve a run, import a package, or activate a pet.

## Result And Branch Rules

Keep test changes and any necessary fixes in focused commits on `codex/dev8-quality-governance-test`. Do not merge or push unless the user explicitly requests it. Do not rewrite the development commits.

Report:

- the testing branch and starting commit;
- commits created on the testing branch;
- every verification command and result;
- real Provider/model/profile/dataset identifiers without secrets;
- reference-count evidence;
- real human-approved/rejected example IDs and evidence paths;
- action and identity repair outcomes;
- visual acceptance findings and unresolved defects;
- whether `production-art-ready` is justified, with the exact approval record IDs;
- a final pass/fail decision.

Until all required automated, Provider, and human checks pass, report the development result as implemented but unverified and do not make a production-art-ready claim.
