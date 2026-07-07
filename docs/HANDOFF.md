# OpenPet Handoff

> Last updated: 2026-07-07
> Canonical active queue: [`TODO.md`](./TODO.md)
> Branch: `codex/dev7`

This file is the compact maintainer continuation note. Historical phase-level detail lives in `docs/phases/`, `docs/reviews/`, and older planning docs.

## Read First

1. [`../README.md`](../README.md)
2. [`TODO.md`](./TODO.md)
3. [`development-workflow.md`](./development-workflow.md)
4. [`testing-strategy.md`](./testing-strategy.md)
5. [`release-evidence/README.md`](./release-evidence/README.md)
6. [`project-context.json`](./project-context.json)

## Current State

- OpenPet is an Electron desktop pet platform with a React Control Center, pet packs, AI configuration, local extensions, and loopback-only local HTTP/MCP.
- `PetService` remains the single source of truth for pet state, actions, and events.
- User-facing configuration belongs in Control Center.
- API keys and provider credentials stay in the main process.
- Real-provider smoke entrypoints now exist for AI provider verification, Bubble Chat acceptance, and Creator Studio provider-path verification: `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>`, `npm run smoke:creator-studio-provider -- --prompt "<prompt>"`, and `npm run run-ai-talk-local-smoke -- --message "<message>"`.
- Archived proof currently lives at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`, `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/`, `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`, historical launched packaged-runtime evidence at `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/`, current `rc.3` packaged-runtime pending evidence at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/`, and the current release closure at `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/`.
- The archived OpenPet gateway smoke confirms `gpt-5.5`, `gpt-image-2`, chat completion smoke success, and that image generation was intentionally opt-in and was skipped in that smoke run; it does not prove image generation output quality or asset readiness.
- The AI Talk Bubble Chat smoke path records `bubbleAcceptance`, `providerLatencyMs`, and `manualAcceptanceTemplate`, and the archived `ai-talk-local-smoke/2026-06-28T15-35-59-210Z/` result does not by itself prove full desktop feel or later human desktop validation.
- Agent-awareness tooling now also has a synthetic end-to-end rehearsal under `tests/scripts/mock-agent-awareness-flow.test.js` that drives mock Codex rollout data through local smoke generation, release-evidence archive creation, and manual-acceptance write-back; this proves tooling/data flow only and does not replace real Codex signal collection or human desktop acceptance.
- Creator Studio full-pet review now uses a landed real-atlas QA/import path backed by `source-image-validation.json` and `atlas-validation.json`.
- Provider smoke and frame/atlas QA prove command/data flow and structural import readiness, not final visual fidelity proof; production-quality generated pets still require human review or a future explicit gate showing the output stays highly consistent with the user's original image.
- The current one-click full-pet policy requires real `idle` and `waving` coverage at QA/import time, while host-side extra pose generation is intentionally limited to `waving`; other rows may fall back from the base pose.
- The current stable shortest path is a single clean front-facing reference image on the saved `gpt-image-2` gateway path; multi-view collage inputs remain less stable and should not be treated as the default success path.
- `random`, `state`, and `event` trigger proposals now create active host-owned durable trigger rules, the Actions pane can minimally edit those saved host rules inline, and Creator Studio follow-up review still goes through the Trigger Proposal Inbox.
- Imported action success follow-up now routes reviewers to `Actions -> Trigger Proposal Inbox`, imported action handoff failure follow-up routes to `Control Center -> Plugins`, and imported pet follow-up stays in `OpenPet` through `Import Approved Pet`.
- Creator Studio imported review surfaces are phase-aware imported review guidance: after import they no longer mix pre-import QA, repair controls, or retry generation cues into the imported state.
- The typed plugin view config schema/storage/signature payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads are already normalized through the TypeScript adapter boundary.
- The current plugin host bridge keeps `trigger-proposals:write` and `model:image-generate` as the narrow generation/review permissions, and plugin-managed provider credentials are unsupported for host-managed generation.
- The current public posture is macOS-first release track; the archived signed closure keeps official desktop, macOS, and Windows in a not-ready state until signed evidence is archived.
- A real public macOS release-asset check now lives at `docs/release-evidence/macos-release-evidence/2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-asset-check/`; it verifies the public `v1.0.1-rc.3` ZIP and DMG without launching the app and both currently fail local `codesign`/`spctl` verification with `code has no resources but signature indicates they must be present`.
- An authenticated import of the `openpet-macos-release-evidence-v1.0.1-rc.3` workflow artifact from release run `28060966745` now lives at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`; it confirms the same negative release truth as the public asset check. A companion current-parser rerun now also lives at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T17-32-13Z-v1.0.1-rc.3-authenticated-artifact-current-parser-rerun/` and makes the current local interpretation explicit: the archived codesign, Gatekeeper, and notarization texts now classify as `fail` / `fail` / `fail` rather than generic `pending`.
- An authenticated import of the `openpet-windows-smoke-evidence-v1.0.1-rc.3` workflow artifact now also lives at `docs/release-evidence/windows-smoke/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`; it confirms the release run produced an unsigned pending smoke report (`artifact.signed=false`, `0/13` checks passed), not a reviewed Windows smoke archive.
- A reconstructed Windows smoke archive now lives at `docs/release-evidence/windows-smoke/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-artifact-archive-rerun/`; it copies the authenticated imported report/runbook/collector, adds explicitly structural placeholder evidence files required by the archive tooling, and preserves the honest result `ok=false`, `releaseReady=false` under `--require-signed`.
- A reconstructed Windows desktop-picker archive now lives at `docs/release-evidence/desktop-picker/2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun/`; it keeps the pending report shape, corrects the cross-platform metadata back to `platform=win32`, `arch=x64`, and records structure-only evidence notes without claiming a real picker run.
- A current packaged-runtime pending report now also lives at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/`; it was generated from the current `v1.0.1-rc.3` macOS release assets without launching the app, records `artifact.signed=false`, preserves the same broken signature text under `artifact.signatureEvidence`, and keeps every packaged-runtime check pending until a real packaged-app run is observed.
- A current `rc.3` signed-closure rerun now lives at `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/`; it consolidates the authenticated macOS release artifact, the authenticated Windows smoke import, the reconstructed Windows smoke/picker archives, and the current packaged-runtime report. It still lands at `releaseReady: false`, but it now blocks on archived-but-not-ready Windows smoke and desktop-picker manifests instead of missing archive files.
- The latest community-source GitHub rerun still lives at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T15-46-14Z-openpets-model-divergence-rerun/`, the npm-package rerun lives at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-17-27Z-npm-package-model-rerun/`, and a direct GitHub code-search rerun now lives at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-45-00Z-github-code-search-rerun/`; together they show the ecosystem split on topic-listed repos, published packages, and public code search.
- Community-source intake is now resilient to foreign `plugin.json` schemas that use incompatible field shapes: structurally invalid candidates are archived as `incompatible-package-model` with `plugin-json-invalid` evidence instead of terminating the intake flow with raw validator exceptions.
- Community-source tooling now also has a synthetic end-to-end rehearsal under `tests/scripts/mock-plugin-community-source-flow.test.js` that drives a compatible archive through Phase 100 intake, the Phase 103 bridge, Phase 99 evidence, and discovery rollup, while separately proving the foreign `plugin.json` downgrade path. That rehearsal now also includes a CLI-level pass through the shipped intake, bridge, and discovery commands against a synthetic compatible archive by faking the HTTPS download boundary locally; this validates tooling/data flow and command-chain integrity only and does not replace a real compatible third-party package.
- A concrete outreach draft now exists at `docs/release-evidence/plugin-community-source-invitation-kit/2026-07-06T15-46-14Z-openpets-plugin-starter-outreach/` for `alvinunreal/openpets-plugin-starter` maintainers, so the next external move is no longer abstract: send or adapt that invitation and wait for an actual compatible `plugin.json` package.
- Packaged provider-path tooling now also has a synthetic rehearsal under `tests/release/mock-packaged-provider-flow.test.js` that records provider-ready Create gating plus provider-backed packaged Creator Studio runtime and packaged UI evidence, and the packaged Creator Studio smoke CLIs can now carry an explicit `fixture` or `provider` backend request into archived artifacts. That rehearsal now also includes a CLI-level pass through the shipped packaged Create, Creator Studio runtime, and Creator Studio UI smoke commands against a synthetic provider-ready app shim; this proves tooling/data flow and command-chain integrity only and does not replace a real configured packaged provider session.
- Release tooling now also has a synthetic dual-platform picker/runtime rehearsal under `tests/release/mock-picker-runtime-flow.test.js` that drives pending picker reports into signed-ready mock picker archives, linked packaged-runtime readiness for both `darwin` and `win32`, and a mock signed release-closure chain that combines generated Windows smoke evidence, Windows picker evidence, macOS runtime evidence, and imported macOS signing artifacts. That rehearsal now also includes a CLI-level pass through the shipped `create-macos-release-evidence`, `create-macos-release-evidence-archive`, `create-release-evidence-archive-manifest`, and `create-signed-release-closure-report` commands against synthetic signed fixtures; this proves tool wiring and command-chain integrity, not real signed or manually observed release evidence.

## Current Priorities

1. Produce passing macOS release evidence; both the public `v1.0.1-rc.3` macOS assets and the authenticated imported workflow artifact currently fail signed-readiness proof, and the current `rc.3` closure rerun now records macOS codesign/notarization/Gatekeeper as explicit `fail`, so the remaining move is fixed or republished macOS assets plus fresh passing evidence.
2. Collect real signed Windows smoke evidence; the reconstructed Windows smoke archive is useful bookkeeping, but it is intentionally structural and still not valid under the signed gate.
3. Collect packaged native picker evidence from real app runs; the historical launched packaged runtime smoke at `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` still shows `plugin-picker-evidence-linked` pending, `pet-picker-evidence-linked` pending, and `invalid-package-feedback` blocked, the current `rc.3` packaged-runtime pending report at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/` keeps every runtime check pending while also recording the current broken signature text, and the reconstructed Windows picker archive is still structure-only.
4. Keep extension-community proof moving without overstating trust; the latest GitHub-topic, npm-package, and GitHub code-search discovery reruns still end at `find-or-invite-compatible-plugin-json-package`, and the latest draft invitation kit narrows the operator next step to sending targeted outreach and waiting for a real compatible package.

## Guardrails

- Keep `cat_anime/` structure intact.
- Keep extension capability wording honest and conservative.
- Keep local HTTP/MCP loopback-only and off by default.
- Keep trigger proposal ownership on the host side; `random`, `state`, and `event` already create active host-owned durable trigger rules with minimal inline host editing in the Actions pane, while Creator Studio still submits reviewable proposals through the Trigger Proposal Inbox instead of mutating rules directly.

## High-Signal Commands

```bash
npm start
npm run dev:control-center
npm run test:core
npm run test:tools
npm run test:control-center
npm test
npm run check:syntax
npm run check:docs-drift
npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>
npm run smoke:creator-studio-provider -- --prompt "<prompt>"
npm run run-ai-talk-local-smoke -- --message "<message>"
npm run pack
```

## Where To Look Next

- Active queue: [`TODO.md`](./TODO.md)
- Engineering snapshot: [`development-summary.md`](./development-summary.md)
- Product/release snapshot: [`project-status-review.md`](./project-status-review.md)
- AI Talk and runtime TODO map: [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md)
- Extension authoring: [`plugin-development.md`](./plugin-development.md)
- Release evidence index: [`release-evidence/README.md`](./release-evidence/README.md)
- Release evidence and gates: [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md)
- Release blockers remain explicit in the current archived signed closure at `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/`: macOS evidence now classifies as fail, Windows smoke remains unsigned/pending, the reconstructed Windows smoke and desktop-picker archives are still not valid under the signed gate, and packaged picker/runtime evidence is still unobserved. Apple signing/notarization credentials and real Windows signed artifact execution remain Manual-required.
