# OpenPet Development Summary

> Last updated: 2026-10-27
> Branch: `main`

This is the compact engineering snapshot for the current repository state. Use [`TODO.md`](./TODO.md) for active work, and use `docs/phases/` plus `docs/reviews/` for detailed implementation history.

The 2026-10-27 release-policy continuation passes the focused release/signing/runtime tooling suites (**80/80** across the changed release tests and Windows asset tests). Typecheck, syntax, contract reconciliation, docs drift, and the Control Center production build remain the code gates; no Electron or desktop UI acceptance was performed. The full Core browser suite remains dependent on the locally absent pinned Chromium headless shell, while GitHub CI remains the browser-regression gate.

## Platform Baseline

OpenPet currently has:

- an Electron pet runtime plus React + Vite Control Center,
- a card-based cursor picker with import, resize, and uploaded custom cursor deletion for pet hover cursors,
- pet-pack import and export flows with bundled built-in packs,
- AI provider settings with main-process secret storage, structured diagnostics, and real-provider smoke entrypoints,
- Common chat/image provider presets such as OpenRouter and Together are endpoint templates rather than verified integrations; only the OpenPet 8317 gateway preset is tied to current archived smoke evidence.
- a developer-first local extension runtime with explicit setup, command, dashboard, and service controls,
- Bubble Chat and Creator Studio host-side provider validation paths, including `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>`, `npm run smoke:creator-studio-provider -- --prompt "<prompt>"`, and `npm run run-ai-talk-local-smoke -- --message "<message>"`,
- Archived smoke evidence currently lives at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`, `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/`, `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`, `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance/`, and `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z-main-acceptance/`; the AI Talk smoke records `bubbleAcceptance`, `providerLatencyMs`, and `manualAcceptanceTemplate` but does not by itself prove full desktop feel or later human desktop validation, the Creator Studio provider smoke keeps the `420000ms` timeout override and technical-chain-not-final-asset-quality claim boundary explicit, and the Creator Workflow host smoke proves the narrowed one-click new-pet and existing-action path with reference conditioning on both `codex/dev8` and `main`,
- a landed technical full-pet atlas QA/import path backed by `source-image-validation.json` and `atlas-validation.json`; this proves packaging/import plumbing, not official-quality action rows. The current single-reference, quality-first contract and directional mirror target live in [`pet-character-generation.md`](./pet-character-generation.md),
- active host-owned durable trigger rules where `random`, `state`, and `event` proposals create active host-owned durable trigger rules and feed the Trigger Proposal Inbox review loop,
- typed plugin view config schema/storage/signature payloads plus plugin lifecycle/runtime IPC payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads normalized at the TypeScript adapter boundary,
- and a narrow plugin host bridge where `trigger-proposals:write` and `model:image-generate` are the current review/generation permissions and plugin-managed provider credentials are unsupported for host-managed generation,
- archived community-source discovery/intake tooling that now includes the 2026-07-06 GitHub-topic rerun under `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T15-46-14Z-openpets-model-divergence-rerun/` plus the npm-package rerun under `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-17-27Z-npm-package-model-rerun/`, which together show the adjacent `openpets.plugin.json` or package.json-based SDK v3 ecosystem split across both public repositories and published `@openpets/*` tarballs while still truthfully ending at `compatible-source-not-found`,
- loopback-only local HTTP/MCP endpoints,
- and a TypeScript migration baseline across shared contracts plus key Control Center and evidence boundaries, including discriminated random/state/event trigger-rule spec contracts plus current smoke report contracts.
- a fresh real local Agent Awareness smoke archive at `docs/release-evidence/agent-awareness-local-smoke/2026-09-11T20-05-34-688Z/` with 19 sanitized sessions and 134 events; dashboard usefulness and pet speech/noise remain manual acceptance checks.

## Architecture Facts

- `main.js` and `src/main/bootstrap/create-openpet-runtime.js` assemble the Electron Shell and inject services.
- The migration is active, not complete: Shell/native services remain in `src/main/`, while `apps/desktop/src/sidecar/runtime-coordinator.js` starts `services/backend/index.js`.
- Backend composition in `services/backend/index.js` wires `createShellClient`, `openDatabase`, `migrate`, `createQueue`, `createRunner`, `recoverJobs`, route modules, and the SSE hub.
- The current route registry contains 117 implemented REST method/path entries; the API document lists 119 target/implemented rows and `check:api-contract` is authoritative for the distinction.
- `packages/contracts` is the contract source; build its `dist/` output before runtime route-contract checks can import `@openpet/contracts`.
- `PetService` is the single source of truth for pet state.
- Control Center owns user-facing configuration.
- Provider credentials cross the Shell/Backend boundary through `shell-client` persistence messages; Backend provider keys remain in memory and never appear in API payloads.
- The OpenPet gateway archive at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/` confirms `gpt-5.5` and `gpt-image-2` discovery, `gpt-5.5` chat completion smoke success, keeps image generation intentionally opt-in and was skipped in that smoke run, and does not prove image generation output quality or asset readiness.
- Imported action success follow-up now routes reviewers to `Actions -> Trigger Proposal Inbox`, imported action handoff failure follow-up routes to `Control Center -> Plugins`, and imported pet follow-up stays in `OpenPet` through `Import Approved Pet`.
- Creator Studio imported review surfaces are phase-aware imported review guidance: after import they no longer mix pre-import QA, repair controls, or retry generation cues into the imported state.
- Archived release-truth evidence remains the source of readiness truth: the historical launched packaged-runtime archive at `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` still shows an unsigned macOS runtime launch with `plugin-picker-evidence-linked` pending, `pet-picker-evidence-linked` pending, and `invalid-package-feedback` blocked; the current `rc.3` packaged-runtime pending report at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/` keeps every packaged-runtime check pending while recording the current broken signature text; and `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/` keeps official desktop, macOS, and Windows release claims in a not-ready state with macOS evidence now classified as explicit `fail` and the reconstructed Windows smoke/picker archives preserved as archived-but-not-ready.
- A real public macOS release-asset verification archive now exists at `docs/release-evidence/macos-release-evidence/2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-asset-check/`, and an authenticated imported workflow-artifact archive now exists at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`; both agree that the current `v1.0.1-rc.3` macOS release evidence is not passing signed readiness.
- An authenticated import of the Windows smoke workflow artifact now also exists at `docs/release-evidence/windows-smoke/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`; it confirms the release workflow produced a structurally valid pending smoke report for explicitly unsigned Windows assets rather than a reviewed signed smoke archive.
- A reconstructed Windows smoke archive now exists at `docs/release-evidence/windows-smoke/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-artifact-archive-rerun/`; it preserves the authenticated imported pending report inside the reviewed archive shape without claiming real smoke evidence.
- A reconstructed Windows desktop-picker archive now exists at `docs/release-evidence/desktop-picker/2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun/`; it corrects the prior cross-platform metadata drift back to `win32/x64` while staying explicitly pending and structure-only.
- A current `rc.3` closure rerun now exists at `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/`; it consolidates the authenticated release artifacts and reconstructed Windows archives, still lands at `releaseReady: false`, now records macOS codesign/notarization/Gatekeeper as explicit `fail`, and replaces earlier missing-archive blockers with explicit archived-but-not-ready Windows smoke and desktop-picker manifests.
- Current distribution uses self-managed signing only: macOS ad-hoc or a locally controlled identity, and a locally generated Windows self-signed certificate. Paid certificates and notarization are out of scope. The release workflow and packaged-runtime validator now use signature-integrity terminology; archive closure helpers still contain legacy notarization/readiness fields and are tracked for migration. Target-OS runtime/picker evidence remains separate, with Gatekeeper and SmartScreen warnings stated plainly.

## Validation Baseline

- Latest fresh-build unsigned packaged-runtime smoke on macOS arm64: [2026-10-09T02-18-20-646Z-darwin-arm64](./release-evidence/packaged-runtime/2026-10-09T02-18-20-646Z-darwin-arm64/) reports **11/14** using isolated temporary user data. Pet rendering, animation, bubble chat, bundled packs, and final state passed. The linked picker report from 2026-10-08 predates the HTTP picker cutover, so two picker links remain pending and invalid-package feedback remains blocked. The earlier 2026-10-08 14/14 run is retained as historical evidence for its earlier build. The fresh code-only HTTP/reverse-channel picker smoke passes; the desktop UI was not used. These artifacts prove only the recorded runtime checks; distribution will use self-managed signing and will not claim OS trust or notarization.

```bash
npm test                     # full Node regression suite
npm run test:core            # core runtime regression suite
npm run test:tools           # tooling and evidence regression suite
npm run test:control-center  # Playwright UI regression baseline
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>
npm run smoke:creator-studio-provider -- --prompt "<prompt>"
npm run run-ai-talk-local-smoke -- --message "你好，请用一句简短中文回复，用于 bubble chat 验收"
npm run update-ai-talk-local-smoke-report -- docs/release-evidence/ai-talk-local-smoke/<session>/ai-talk-local-smoke-result.json --bubble-visible-long-enough true --input-usable true --desktop-feel-notes "Bubble readable and input usable." --validate-complete
npm run run-agent-awareness-local-smoke -- --codex-home ~/.codex
npm run create-agent-awareness-local-smoke-archive -- --session-dir agent-awareness-local-smoke/<session>
npm run update-agent-awareness-local-smoke-report -- docs/release-evidence/agent-awareness-local-smoke/<session>/agent-awareness-local-smoke-result.json --dashboard-useful true --pet-speech-noise-acceptable true --redaction-looks-safe true --notes "Dashboard useful and low-noise." --validate-complete
npm run create-ai-talk-local-smoke-archive -- --session-dir ai-talk-local-smoke/<session>
```

## Open Engineering Themes

- Release evidence tooling now uses self-managed macOS/Windows signature-integrity gates. `--require-signed` and `officialReady` remain historical compatibility fields; Gatekeeper, SmartScreen, and notarization are observations. The archived `v1.0.1-rc.3` reports remain historical evidence of the old workflow's failures. Real target-OS validation remains open.
- Packaged picker evidence for the unsigned demo is archived at [2026-10-08T21-01-48Z-darwin-arm64](./release-evidence/desktop-picker/2026-10-08T21-01-48Z-darwin-arm64/) with **8/9** observed checks; it predates the current HTTP picker cutover and `plugin-install-disabled` remains pending. The latest packaged-runtime smoke passes **11/14**; no desktop UI observation was performed in this continuation.
- Creator Studio image-provider polish remains open product work, but host-owned durable trigger rules are already landed for `random`, `state`, and `event`.
- Creator Studio now has Provider row-generation, extraction, stable-slot, row-QA, and official atlas-package infrastructure, while production art approval remains open and Manual-required. The current code still requests both directional rows; the canonical target generates `running-right` once and derives `running-left` as `approved-mirror`. See [`pet-character-generation.md`](./pet-character-generation.md) for the single-image Provider rule, exact quality gates, and remaining runtime work.
- Extension-community proof still needs a compatible third-party package path without overstating trust or safety.

## Reference Points

- Active backlog: [`TODO.md`](./TODO.md)
- Product/release posture: [`project-status-review.md`](./project-status-review.md)
- Maintainer continuation: [`HANDOFF.md`](./HANDOFF.md)
