# OpenPet Project Status Review

> Last updated: 2026-07-03
> Branch: `main`

This is the compact product and release snapshot. Use [`TODO.md`](./TODO.md) for the active queue and `docs/release-evidence/` for archived proof.

## Executive Summary

OpenPet already has the intended platform shape: desktop pet runtime, Control Center, pet packs, AI settings, local extensions, local HTTP/MCP, and release evidence tooling. The main remaining gap is not architecture. It is evidence, release proof, and ecosystem maturity.

Current archived proof also includes real-provider smoke paths for AI gateway verification, Bubble Chat acceptance telemetry, and Creator Studio provider-path validation. Those archives improve operator confidence, but they do not upgrade desktop release readiness by themselves.

## Current Proof Notes

- OpenRouter and Together provider presets are endpoint templates; only the OpenPet 8317 gateway preset is tied to current archived smoke evidence.
- AI provider smoke uses `npm run smoke:ai-provider`; archived evidence at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/` verified `gpt-5.5`, discovered `gpt-image-2`, passed chat smoke, and intentionally skipped image generation, so it does not prove image output quality or asset readiness.
- AI Talk Bubble Chat smoke uses `npm run run-ai-talk-local-smoke -- --message <text>` and records `bubbleAcceptance`, `providerLatencyMs`, `bubbleDispatch`, and `manualAcceptanceTemplate`; the `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/` archive keeps the telemetry boundary and does not by itself prove desktop feel.
- Creator Studio provider smoke uses `npm run smoke:creator-studio-provider`; `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/` records a long `gpt-image-2` run with `420000ms` timeout override, not a production asset-quality approval.
- Creator Studio provider-backed full-pet import now uses a real generated atlas plus `source-image-validation.json` and `atlas-validation.json`; imported action success routes to `Actions -> Trigger Proposal Inbox`, import handoff failure routes to `Control Center -> Plugins`, imported pet follow-up remains `OpenPet`, and imported review surfaces keep phase-aware imported review guidance without pre-import QA or repair controls.
- TypeScript baseline coverage includes typed plugin view config schema/storage/signature payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads.
- Creator-tools bridge permissions include `trigger-proposals:write` and `model:image-generate`; plugin-managed provider credentials are unsupported for host-managed generation.
- Packaged runtime archive `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` shows unsigned macOS packaged runtime launched, with pending picker-link checks for `plugin-picker-evidence-linked` and `pet-picker-evidence-linked`, and `invalid-package-feedback` blocked.
- Signed release closure archive `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/` keeps official desktop not-ready: missing signed macOS evidence, missing desktop picker evidence, and missing signed Windows smoke evidence still require Apple signing/notarization credentials, real Windows signed artifact execution, and human evidence review.

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

## Main Remaining Gaps

1. Real signed macOS evidence must be archived through the release evidence flow.
2. Real signed Windows smoke evidence must exist before support claims move.
3. Packaged native picker evidence still needs real archived runs.
4. The extension ecosystem still needs a compatible third-party package path backed by evidence rather than intent.

## Reference Docs

- Maintainer snapshot: [`HANDOFF.md`](./HANDOFF.md)
- Active queue: [`TODO.md`](./TODO.md)
- Run/build workflow: [`development-workflow.md`](./development-workflow.md)
- Release gates: [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md)
