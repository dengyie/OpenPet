# Creator Studio Example Extension

Creator Studio is OpenPet's hybrid extension for drafting, generating, reviewing, and importing pet characters and actions. The extension owns bounded task, prompt, artifact, QA, and dashboard workflows; the host owns Provider credentials, model calls, output writes, final imports, activation, and trigger-proposal persistence.

The current character/action contract, one-image Provider rule, Codex Pet atlas layout, directional mirror policy, quality-governance profiles, repair scopes, QA gates, and claim boundaries are defined only in [`docs/pet-character-generation.md`](../../../docs/pet-character-generation.md).

## Hatch Pet Agent Phase 1

Phase 1 adds host-owned Hatch Pet Agent settings and text-only shadow decisions beside Creator Studio. It is disabled by default and runtime execution is fixed to `shadow`: suggestions may be persisted under `runs/<runId>/agent/` and shown as sanitized diagnostics, but they are never passed into Creator Studio commands. A shadow failure does not block the fixed workflow.

- QA/import requires real `idle` and `waving` coverage.
- Host-side extra pose generation is intentionally limited to `waving`.
- Other atlas rows may fall back from the validated base pose.
- The currently verified shortest real-user path is one clean front-facing reference image on the saved `gpt-image-2` gateway path.
- The default one-click path now blocks collage or multi-view references and asks for one clean front-facing image instead.
- Future optional real-action expansion is queued, not active by default, in this order: `waiting`, `running-right`, `running-left`.
- Current action classes are explicit:
  - required real: `idle`, `waving`
  - queued optional attempted real, still disabled in the default path: `waiting`, `running-right`, `running-left`
  - fallback-only today: `jumping`, `failed`, `running`, `review`

Phase 1 does not change image Provider selection, prompts, retries, QA, approval, import, activation, or Provider art-readiness rules. Its budget and identity-checkpoint settings are future bounded-execution inputs, not Phase 1 execution controls. The implementation remains **implemented but unverified** pending [`docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase1-test-handoff.md`](../../../docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase1-test-handoff.md); it adds no Provider approval or `production-art-ready` claim.

## Backends

- `fixture` creates deterministic local output for development and UI regression tests.
- `provider` uses the host-owned image-generation bridge.
- Legacy `cloud` and `local` values normalize to `provider`.

Missing host settings or bridge access fails explicitly. Creator Studio never silently falls back from a Provider run to fixture output.

Fixture output and compatibility fallbacks are not official-quality or production art. Provider success and deterministic QA also do not replace human visual review.

## Commands

- `draft-task`: create a structured generation task from a user request.
- `answer-question`: provide a bounded missing task answer.
- `confirm-task`: freeze the task before generation.
- `run-step`: generate full-pet or single-action output and QA artifacts.
- `retry-action`: invalidate and regenerate one supported full-pet action while reusing other hash-valid checkpoints.
- `retry-identity`: archive prior evidence, invalidate the generated identity and all action checkpoints, and run a full regeneration.
- `approve-run`: mark a reviewable run approved.
- `import-approved-pet`: inspect and import an approved pet package through the host bridge.
- `import-approved-action`: import approved action frames and submit the trigger proposal to the host inbox.
- `export-bundle`: return the generated `.codex-pet.zip` details.

## Runtime And Review

Runs live under `OPENPET_DATA_DIR/runs`. The loopback-only dashboard exposes data-relative preview URLs and sanitized review state rather than raw filesystem paths. Approval is invalidated when generated files no longer match their QA hashes.

Use the dashboard for task details, contact sheets, animated previews, repair, approval, and import handoff. Use the host smoke commands listed in the canonical generation document when Provider-path behavior or support claims change.

Scoped repair is also available through the loopback service:

```text
POST /api/runs/:runId/actions/:actionId/retry
POST /api/runs/:runId/identity/retry
```

`running-left` is derived from `running-right` and cannot be retried independently. Repair stops at review-required or failed state and never auto-approves or imports the result. Prior active evidence is archived under `runs/<runId>/repairs/`.

## Quality Governance

The default profile is `pet-generation-default-v1`. Prompts use bounded guidance from the active human-example dataset; profile evidence is recorded in reference boards, Provider stages, keyframe QA, row QA, and atlas QA. The default empty human-example registry adds no prompt guidance.

Registry locations:

```text
quality/pet-generation-human-examples.json
quality/provider-art-approvals.json
```

Optional development overrides are `OPENPET_PET_HUMAN_EXAMPLES_PATH`, `OPENPET_PET_QUALITY_PROFILE_PATH`, and `OPENPET_PROVIDER_ART_APPROVALS_PATH`. Registries and profiles fail closed on malformed records, unsafe paths, duplicate identities, unsupported values, or dataset mismatches.

Provider support claims are structured as `technical-chain-ready` or `production-art-ready`. Production-art readiness requires a human-approved exact match for the current Provider, every successful generation model, the active quality profile, and the loaded human-review dataset. It does not approve an individual run or bypass deterministic QA, visual review, import, or activation gates. The shipped approval registry is empty, so this development branch must be described as implemented but unverified and technical-chain-ready only.
