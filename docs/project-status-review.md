# OpenPet Project Status Review

> Last updated: 2026-07-07
> Branch: `codex/dev7`

This is the compact product and release snapshot. Use [`TODO.md`](./TODO.md) for the active queue and `docs/release-evidence/` for archived proof.

## Executive Summary

OpenPet already has the intended platform shape: desktop pet runtime, Control Center, pet packs, AI settings, local extensions, local HTTP/MCP, and release evidence tooling. The main remaining gap is not architecture. It is evidence, release proof, and ecosystem maturity.

The latest public community-source reruns now cover the GitHub topic, the npm registry, and direct GitHub code search. The GitHub-topic rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T15-46-14Z-openpets-model-divergence-rerun/` keeps the full current `openpets` topic plus prior intake-backed candidates in scope, the npm-package rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-17-27Z-npm-package-model-rerun/` inspects 13 published `@openpets/*` tarballs, and the direct code-search rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-45-00Z-github-code-search-rerun/` finds zero public current-model hits for characteristic root `plugin.json` signatures. Together they make the split explicit: the adjacent ecosystem is still centered on `openpets.plugin.json` or package.json-based SDK v3 layouts rather than the current OpenPet root `plugin.json` package model. A targeted invitation draft also now exists at `docs/release-evidence/plugin-community-source-invitation-kit/2026-07-06T15-46-14Z-openpets-plugin-starter-outreach/`, but the ecosystem still ends at `compatible-source-not-found` until a real compatible package arrives.

A real public macOS release-asset verification archive now also exists at `docs/release-evidence/macos-release-evidence/2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-asset-check/`, an authenticated imported workflow-artifact archive now exists at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`, and a companion current-parser rerun now exists at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T17-32-13Z-v1.0.1-rc.3-authenticated-artifact-current-parser-rerun/`. Together they agree on the same negative release truth: the current `v1.0.1-rc.3` macOS evidence fails local `codesign` and `spctl` verification with `code has no resources but signature indicates they must be present`, the imported workflow evidence records notarization as `NotSubmitted`, and the current parser rerun now makes the local interpretation explicit as `fail` / `fail` / `fail`. macOS release truth is therefore no longer blocked on artifact access; it is blocked on actually producing a passing signed release artifact.

Public release metadata at `docs/release-evidence/release-public-assets/2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-metadata.json` also shows the current `v1.0.1-rc.3` Windows assets are explicitly labeled `unsigned`, which keeps Windows squarely outside the signed smoke gate even before runtime validation is considered.

An authenticated packaged-runtime pending report now also lives at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/`. It was generated from the current `v1.0.1-rc.3` macOS release assets without launching the app, records `artifact.signed=false`, preserves the same broken signature text under `artifact.signatureEvidence`, and leaves all packaged-runtime checks pending until a real packaged-app run is observed.

An authenticated import of the `openpet-windows-smoke-evidence-v1.0.1-rc.3` workflow artifact now lives at `docs/release-evidence/windows-smoke/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`. It confirms the release workflow produced a structurally valid pending smoke report and operator runbook for those unsigned assets, not a reviewed Windows smoke pass: `artifact.signed` is `false`, and all `13` required smoke checks remain `pending`.

A reconstructed Windows smoke archive now also exists at `docs/release-evidence/windows-smoke/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-artifact-archive-rerun/`. It keeps the authenticated imported pending report inside a full archive shape, but the added evidence files are explicitly structural placeholders and the signed archive manifest still reports `ok=false`, `releaseReady=false`.

A reconstructed Windows desktop-picker archive now also exists at `docs/release-evidence/desktop-picker/2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun/`. It preserves the pending report shape, corrects the earlier cross-platform metadata drift back to `platform=win32`, `arch=x64`, and still does not claim a real packaged-app picker run.

A current `rc.3` closure rerun now also exists at `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/`. It consolidates the authenticated macOS and Windows release artifacts plus the best available packaged-runtime input, and it still lands at `releaseReady: false`: macOS codesign/notarization/Gatekeeper now classify as `fail`, Windows smoke remains unsigned and unreviewed, and the reconstructed Windows smoke/picker archives remain archived but not valid under the signed gate.

Current archived proof also includes real-provider smoke paths for AI gateway verification, Bubble Chat acceptance telemetry, and Creator Studio provider-path validation at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`, `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/`, and `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`. The operational entrypoints are `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>`, `npm run smoke:creator-studio-provider -- --prompt "<prompt>"`, and `npm run run-ai-talk-local-smoke -- --message "<message>"`. The archived OpenPet gateway smoke confirms `gpt-5.5`, `gpt-image-2`, chat completion smoke success, and that image generation was intentionally opt-in and was skipped in that run; it does not prove image generation output quality or asset readiness. The AI Talk smoke carries `bubbleAcceptance`, `providerLatencyMs`, and `manualAcceptanceTemplate` fields for later human review and does not by itself prove full desktop feel. Those archives improve operator confidence, but they do not upgrade desktop release readiness by themselves.

The current one-click character-generation path is deliberately narrower than older multi-action design notes implied: full-pet QA/import requires real `idle` and `waving`, host-side extra pose generation is intentionally limited to `waving`, and the verified shortest real-user path is a single clean front-facing reference image on the saved `gpt-image-2` gateway path. Multi-view collage inputs remain less stable and should not be described as the default success path.

Current common provider presets such as OpenRouter and Together remain endpoint templates rather than verified integrations; only the OpenPet gateway preset is tied to the archived smoke baseline. The archived signed closure keeps official desktop not-ready, macOS not-ready, and Windows not-ready until signed release evidence replaces the current blockers.

## Release Truth

| Platform | Current truth | Public wording |
| --- | --- | --- |
| macOS | Public assets and imported workflow evidence both currently fail signed readiness. | macOS-first release track |
| Windows | Tooling exists, but signed artifacts and real smoke archives are still missing. | Not release-ready |
| Linux | Not in current release scope. | No support claim |
| Mobile | Out of scope. | No support claim |

## Strongest Current Areas

- Clear service boundaries and a stable `PetService` ownership model.
- Control Center as the main user-facing configuration surface.
- Conservative handling of secrets and local extension permissions.
- Broad automated regression coverage plus release-evidence tooling.
- Additional real-provider smoke entrypoints for AI and Creator Studio validation.
- A landed real-atlas packaging and QA path for Creator Studio full-pet output backed by `source-image-validation.json` and `atlas-validation.json`.
- A host review path for Creator Studio trigger proposals through the Actions pane Trigger Proposal Inbox, plus active host-owned durable trigger rules for `random`, `state`, and `event`.
- Imported action success follow-up now routes reviewers to `Actions -> Trigger Proposal Inbox`, imported action handoff failure follow-up routes to `Control Center -> Plugins`, and imported pet follow-up stays in `OpenPet` through `Import Approved Pet`.
- Creator Studio imported review surfaces are phase-aware imported review guidance: once imported, they do not mix approval-only QA, pre-import QA, repair controls, or retry generation cues into the imported state.
- Typed plugin view config schema/storage/signature payloads plus plugin lifecycle/runtime IPC payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads normalized at the TypeScript adapter boundary.
- The current plugin host bridge keeps `trigger-proposals:write` and `model:image-generate` narrow, and plugin-managed provider credentials are unsupported for host-managed generation.

## Main Remaining Gaps

1. Real passing macOS evidence must still be archived through the release evidence flow; the current public `v1.0.1-rc.3` macOS assets and the imported workflow artifact now both archive failing signed-readiness evidence and therefore do not satisfy that gate.
2. Real signed Windows smoke evidence must exist before support claims move; the reconstructed Windows smoke archive only removes bookkeeping gaps and does not replace observed clean-machine validation.
3. Packaged native picker evidence still needs real archived runs; the historical launched packaged runtime report at `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` still shows pending picker-link checks, `plugin-picker-evidence-linked` pending, `pet-picker-evidence-linked` pending, and `invalid-package-feedback` blocked, the current `rc.3` packaged-runtime pending report at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/` leaves every runtime check pending while also recording the current broken signature text, and the reconstructed Windows picker archive remains structure-only.
4. The extension ecosystem still needs a compatible third-party package path backed by evidence rather than intent; the newest GitHub-topic, npm-package, and direct GitHub code-search reruns still found only adjacent or incompatible sources.

## Reference Docs

- Maintainer snapshot: [`HANDOFF.md`](./HANDOFF.md)
- Active queue: [`TODO.md`](./TODO.md)
- Run/build workflow: [`development-workflow.md`](./development-workflow.md)
- Release gates: [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md)
- Manual-required release prerequisites remain explicit in `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/`: Apple signing/notarization credentials, human review of archived release evidence, and real Windows signed artifact execution.
