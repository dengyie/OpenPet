# OpenPet Project Status Review

> Last updated: 2026-07-05
> Branch: `main`

This is the compact product and release snapshot. Use [`TODO.md`](./TODO.md) for the active queue and `docs/release-evidence/` for archived proof.

## Executive Summary

OpenPet already has the intended platform shape: desktop pet runtime, Control Center, pet packs, AI settings, local extensions, local HTTP/MCP, and release evidence tooling. The main remaining gap is not architecture. It is evidence, release proof, and ecosystem maturity.

Current archived proof also includes real-provider smoke paths for AI gateway verification, Bubble Chat acceptance telemetry, Creator Studio provider-path validation, and Creator Workflow host acceptance at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`, `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/`, `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`, `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance/`, and `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z-main-acceptance/`. The operational entrypoints are `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>`, `npm run smoke:creator-studio-provider -- --prompt "<prompt>"`, `npm run smoke:creator-workflow-host -- --reference-image <file>`, and `npm run run-ai-talk-local-smoke -- --message "<message>"`. The archived OpenPet gateway smoke confirms `gpt-5.5`, `gpt-image-2`, chat completion smoke success, and that image generation was intentionally opt-in and was skipped in that run; it does not prove image generation output quality or asset readiness. The AI Talk smoke carries `bubbleAcceptance`, `providerLatencyMs`, and `manualAcceptanceTemplate` fields for later human review and does not by itself prove full desktop feel. The Creator Workflow host smoke now proves the narrowed one-click chain on both `codex/dev8` and `main`. Those archives improve operator confidence, but they do not upgrade desktop release readiness by themselves.

The current Pet character-generation authority is [`pet-character-generation.md`](./pet-character-generation.md). The branch has technical atlas packaging/import plus Provider row-generation and QA infrastructure, but those capabilities and archived smoke runs do not prove official-quality production art. The normal input is one clean reference image and each Provider request must carry at most one image attachment. Current orchestration still requests both directional rows; the required target generates `running-right` once and derives `running-left` through the QA-gated `approved-mirror` path.

Current common provider presets such as OpenRouter and Together remain endpoint templates rather than verified integrations; only the OpenPet gateway preset is tied to the archived smoke baseline. The archived signed closure keeps official desktop not-ready, macOS not-ready, and Windows not-ready until signed release evidence replaces the current blockers.

## Release Truth

| Platform | Current truth | Public wording |
| --- | --- | --- |
| macOS | Local and tooling baseline is in place, but official signed evidence still needs final archive completion. | macOS-first release track |
| Windows | Tooling exists, but signed artifacts and real smoke archives are still missing. | Not release-ready |
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
- Typed plugin view config schema/storage/signature payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads normalized at the TypeScript adapter boundary.
- The current plugin host bridge keeps `trigger-proposals:write` and `model:image-generate` narrow, and plugin-managed provider credentials are unsupported for host-managed generation.

## Main Remaining Gaps

1. Real signed macOS evidence must be archived through the release evidence flow.
2. Real signed Windows smoke evidence must exist before support claims move.
3. Packaged native picker evidence still needs real archived runs; the archived packaged runtime report at `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` still shows pending picker-link checks, `plugin-picker-evidence-linked` pending, `pet-picker-evidence-linked` pending, and invalid-package-feedback blocked.
4. The extension ecosystem still needs a compatible third-party package path backed by evidence rather than intent.

## Reference Docs

- Maintainer snapshot: [`HANDOFF.md`](./HANDOFF.md)
- Active queue: [`TODO.md`](./TODO.md)
- Run/build workflow: [`development-workflow.md`](./development-workflow.md)
- Release gates: [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md)
- Manual-required release prerequisites remain explicit in `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/`: Apple signing/notarization credentials, human review of archived release evidence, and real Windows signed artifact execution.
