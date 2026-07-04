# OpenPet Project Status Review

> Last updated: 2026-07-16
> Branch: `main`

This is the compact product and release snapshot. Use [`TODO.md`](./TODO.md) for the active queue and `docs/release-evidence/` for archived proof.

## Executive Summary

OpenPet already has the intended platform shape: desktop pet runtime, Control Center, pet packs, AI settings, local extensions, local HTTP/MCP, and release evidence tooling. The main remaining gap is not architecture. It is evidence, release proof, and ecosystem maturity.

The latest public community-source reruns now cover the GitHub topic, the npm registry, and direct GitHub code search. The GitHub-topic rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T15-46-14Z-openpets-model-divergence-rerun/` keeps the full current `openpets` topic plus prior intake-backed candidates in scope, the npm-package rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-17-27Z-npm-package-model-rerun/` inspects 13 published `@openpets/*` tarballs, and the direct code-search rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-45-00Z-github-code-search-rerun/` finds zero public current-model hits for characteristic root `plugin.json` signatures. Together they make the split explicit: the adjacent ecosystem is still centered on `openpets.plugin.json` or package.json-based SDK v3 layouts rather than the current OpenPet root `plugin.json` package model. A targeted invitation draft also now exists at `docs/release-evidence/plugin-community-source-invitation-kit/2026-07-06T15-46-14Z-openpets-plugin-starter-outreach/`, but the ecosystem still ends at `compatible-source-not-found` until a real compatible package arrives.

The current one-click character-generation path is deliberately narrower than older multi-action design notes implied: full-pet QA/import requires real `idle` and `waving`, host-side extra pose generation is intentionally limited to `waving`, and the verified shortest real-user path is a single clean front-facing reference image on the saved `gpt-image-2` gateway path. The default one-click path now blocks collage or multi-view references instead of describing them as a normal supported success path.

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
- A landed technical atlas packaging and QA path for Creator Studio full-pet output backed by `source-image-validation.json` and `atlas-validation.json`; this is not yet proof of official-quality generated action rows.
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
