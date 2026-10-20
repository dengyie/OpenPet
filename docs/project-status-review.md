# OpenPet Project Status Review

> Last updated: 2026-10-17
> Branch: `main`

This is the compact product and release snapshot. Use [`TODO.md`](./TODO.md) for the active queue and `docs/release-evidence/` for archived proof.

The current engineering baseline is a Shell plus Backend sidecar migration. The executable path is `main.js` -> `createOpenPetRuntime()` -> `createSidecarRuntimeCoordinator()` -> `spawnSidecar()` -> `services/backend/index.js`; the current API contract check reconciles 87 IPC channels, 136 registered REST routes, and 149 documented route rows. This migration status is separate from the release-evidence status below.

Latest code-only verification (2026-10-15): Backend **424/424**, Tools **683/683**, changed Settings/AI/Pet Pack suites **68/68**, typecheck/syntax, contracts and route/channel gates, docs drift, and the Control Center production build pass. `test:core` reports **2180 passed, 26 browser-launch failures, and 1 skipped** because the pinned Playwright Chromium headless shell is absent. No Electron or desktop UI acceptance was performed.

## Executive Summary

OpenPet already has the intended platform shape: desktop pet runtime, Control Center, pet packs, AI settings, local extensions, local HTTP/MCP, and release evidence tooling. The main remaining gap is not architecture. It is evidence, release proof, and ecosystem maturity.

Current archived proof also includes real-provider smoke paths for AI gateway verification, Bubble Chat acceptance telemetry, Creator Studio provider-path validation, and Creator Workflow host acceptance at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`, `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/`, `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`, `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance/`, and `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z-main-acceptance/`. The operational entrypoints are `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>`, `npm run smoke:creator-studio-provider -- --prompt "<prompt>"`, `npm run smoke:creator-workflow-host -- --reference-image <file>`, and `npm run run-ai-talk-local-smoke -- --message "<message>"`. The archived OpenPet gateway smoke confirms `gpt-5.5`, `gpt-image-2`, chat completion smoke success, and that image generation was intentionally opt-in and was skipped in that run; it does not prove image generation output quality or asset readiness. The AI Talk smoke carries `bubbleAcceptance`, `providerLatencyMs`, and `manualAcceptanceTemplate` fields for later human review and does not by itself prove full desktop feel. The Creator Workflow host smoke now proves the narrowed one-click chain on both `codex/dev8` and `main`. Those archives improve operator confidence, but they do not upgrade desktop release readiness by themselves.

The current Pet character-generation authority is [`pet-character-generation.md`](./pet-character-generation.md). The branch has technical atlas packaging/import plus Provider row-generation and QA infrastructure, but those capabilities and archived smoke runs do not prove official-quality production art. The normal input is one clean reference image and each Provider request must carry at most one image attachment. Current orchestration still requests both directional rows; the required target generates `running-right` once and derives `running-left` through the QA-gated `approved-mirror` path.

Current common provider presets such as OpenRouter and Together remain endpoint templates rather than verified integrations; only the OpenPet gateway preset is tied to the archived smoke baseline. The archived signed closure is not-ready under the previous paid-signing policy. OpenPet's current distribution direction is self-managed signing without paid certificates or notarization; release tooling and target-OS evidence still need to be adapted to that policy.

The archived closure records `not-ready` for official desktop, macOS, and Windows claims under its previous paid-signing workflow. It remains a historical finding; current acceptance uses self-managed signatures, integrity checks, and target-OS runtime evidence without requiring platform trust.

Agent Awareness has a real local smoke archive at `docs/release-evidence/agent-awareness-local-smoke/2026-10-08T22-40-35-815Z/`. It records 19 sanitized sessions and 515 events with automated redaction checks passing; dashboard usefulness and pet speech/noise still require human desktop acceptance.

## Release Truth

| Platform | Current truth | Public wording |
| --- | --- | --- |
| macOS | Historical public assets fail the previous signed/notarized gate; current demo package is unsigned and the self-managed path still needs workflow adaptation. | Use ad-hoc/local signing; do not claim notarization or Gatekeeper trust |
| Windows | Packaging/evidence tooling exists; self-signed packaging and target-OS smoke remain open. | Use a locally generated certificate; do not claim SmartScreen reputation or publisher trust |
| Linux | Not in current release scope. | No support claim |
| Mobile | Out of scope. | No support claim |

## Strongest Current Areas

- Clear service boundaries and a stable `PetService` ownership model.
- Control Center as the main user-facing configuration surface.
- Conservative handling of secrets and local extension permissions.
- Broad automated regression coverage plus release-evidence tooling.
- Additional real-provider smoke entrypoints for AI and Creator Studio validation.
- A landed technical atlas packaging and QA path for Creator Studio full-pet output backed by `source-image-validation.json` and `atlas-validation.json`; this is not yet proof of official-quality generated action rows.
- A host review path for Creator Studio trigger proposals through the Actions pane Trigger Proposal Inbox, plus active host-owned durable trigger rules for `random`, `state`, and `event`.
- Imported action success follow-up now routes reviewers to `Actions -> Trigger Proposal Inbox`, imported action handoff failure follow-up routes to `Control Center -> Plugins`, and imported pet follow-up stays in `OpenPet` through `Import Approved Pet`.
- Creator Studio imported review surfaces are phase-aware imported review guidance: once imported, they do not mix approval-only QA, pre-import QA, repair controls, or retry generation cues into the imported state.
- Typed plugin view config schema/storage/signature payloads plus plugin lifecycle/runtime IPC payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads normalized at the TypeScript adapter boundary.
- The current plugin host bridge keeps `trigger-proposals:write` and `model:image-generate` narrow, and plugin-managed provider credentials are unsupported for host-managed generation.

## Main Remaining Gaps

1. The release workflow still implements parts of the previous paid-signing policy. Adapt macOS packaging/evidence to self-managed signing without notarization; the archived `v1.0.1-rc.3` parser rerun at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T17-32-13Z-v1.0.1-rc.3-authenticated-artifact-current-parser-rerun/` remains historical and records codesign, Gatekeeper, and notarization failures under that old workflow.
2. Adapt Windows packaging and evidence to a locally generated self-signed certificate, then run actual Windows installer/runtime smoke. The old public release metadata at `docs/release-evidence/release-public-assets/2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-metadata.json` records unsigned assets; it does not create a paid-signing requirement.
3. The latest fresh-build unsigned packaged-runtime smoke at `docs/release-evidence/packaged-runtime/2026-10-09T02-18-20-646Z-darwin-arm64/` passes **11/14** using isolated temporary user data. The three incomplete checks need picker-linked evidence; the 2026-10-08 picker report at `docs/release-evidence/desktop-picker/2026-10-08T21-01-48Z-darwin-arm64/` predates the HTTP picker cutover and remains **8/9**, with `plugin-install-disabled` pending. The earlier 14/14 runtime report is historical for its earlier build. The fresh Backend HTTP/reverse-channel picker smoke passed accept, cancel, and path-injection rejection without opening desktop UI. These unsigned reports do not establish release readiness.
4. The extension ecosystem still needs a compatible third-party package path backed by evidence rather than intent; the newest GitHub-topic, npm-package, and direct GitHub code-search reruns still found only adjacent or incompatible sources.

## Reference Docs

- Maintainer snapshot: [`HANDOFF.md`](./HANDOFF.md)
- Active queue: [`TODO.md`](./TODO.md)
- Run/build workflow: [`development-workflow.md`](./development-workflow.md)
- Release gates: [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md)
- The archived closure at `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/` records prerequisites from the previous policy. Current manual evidence needs are real target-OS runtime/install validation and human review; paid signing credentials and notarization are explicitly out of scope.
