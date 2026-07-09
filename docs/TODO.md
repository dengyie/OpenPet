# OpenPet TODO

> Last updated: 2026-07-09
> Purpose: this is the single active maintainer work queue.

Use this file for open work and priority changes. Keep phase docs, reviews, and old roadmap files as background only; do not split active planning across multiple TODO documents again.

## How To Use This File

1. Keep only still-open work here.
2. When a task becomes implemented history, move its evidence into `docs/phases/`, `docs/reviews/`, or `docs/release-evidence/` instead of expanding this file forever.
3. When public support claims change, update [`../README.md`](../README.md), [`HANDOFF.md`](./HANDOFF.md), and release docs in the same pass.

## P0 Now

- [ ] Produce a passing signed macOS release-evidence artifact and rerun the signed closure flow. The public-release asset check at `docs/release-evidence/macos-release-evidence/2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-asset-check/`, the authenticated imported workflow artifact at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`, the current packaged-runtime pending report at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/`, and the current closure rerun at `docs/release-evidence/signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/` now agree on the current negative truth: `codesign`/`spctl` fail with `code has no resources but signature indicates they must be present`, the current release parser classifies codesign/Gatekeeper/notarization as `fail` from the imported artifact texts, the current packaged-runtime report keeps `artifact.signed=false` with every runtime check still pending, and the current closure now blocks on unsigned packaged runtime plus archived-but-not-ready Windows smoke and desktop-picker manifests rather than missing archive entries. The remaining gap is therefore fixed or republished macOS assets plus fresh passing evidence, not artifact access. Synthetic tooling/data-flow coverage still exists in `tests/release/mock-picker-runtime-flow.test.js`, which now also rehearses the shipped macOS evidence/archive, release-manifest, and signed-closure CLI chain with synthetic signed fixtures.
- [ ] Produce real signed Windows smoke evidence before changing any Windows support wording. Windows stays not release-ready until those artifacts are archived and validated. Public release metadata at `docs/release-evidence/release-public-assets/2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-metadata.json` shows the current `v1.0.1-rc.3` Windows assets are explicitly labeled `unsigned`, the authenticated imported smoke artifact at `docs/release-evidence/windows-smoke/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/` confirms the release run only produced a structurally valid pending smoke report for those unsigned assets (`0/13` checks passed, `artifact.signed=false`), and the reconstructed archive at `docs/release-evidence/windows-smoke/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-artifact-archive-rerun/` now preserves that report inside a full archive shape without overstating it as real smoke evidence. Synthetic tooling/data-flow coverage now exists in `tests/release/mock-picker-runtime-flow.test.js`; the remaining gap is still a real signed Windows artifact plus observed smoke evidence.
- [ ] Collect real packaged native picker evidence for plugin zip, pet zip, cancel, and invalid-package flows so packaged runtime claims are backed by observed app runs. A structure-only Windows picker archive now exists at `docs/release-evidence/desktop-picker/2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun/` with the corrected `win32/x64` pending report shape, the current `rc.3` packaged-runtime pending report at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/` keeps every runtime check pending while preserving the current broken signature text, and synthetic picker/runtime wiring is covered in `tests/release/mock-picker-runtime-flow.test.js`; the remaining gap is still observed packaged-app behavior.

## P1 Next

- [ ] Close the Agent Awareness post-merge acceptance loop and choose the next bounded Phase B/C milestone. The merged `openpet.agent-awareness` baseline now has official hook install/uninstall commands, hook + polling dual ingestion, trusted opt-in auto-start, richer runtime state, Control Center and pet-side detail entries, usage/git/session-summary foundations, a stats dashboard, the stale-session merge fix that prevents older poller data from downgrading fresher hook approval state, and retained-history hardening that reapplies live bounds on reload while keeping observed event and usage metrics aligned. Remaining open work is human desktop acceptance for dashboard usefulness and pet speech/noise, keeping the smoke/archive chain green against fresh Codex signal shapes, durable longitudinal usage rollups, stronger per-session summary/focus polish, and later companion-product features such as multi-session presentation, semantic pet behavior mapping, persona/settings, and host-level usage stats.
- [ ] Find or receive a compatible third-party `plugin.json` package that can pass discovery, intake, and community-source evidence flow without overstating trust. The latest GitHub-topic rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T15-46-14Z-openpets-model-divergence-rerun/`, the npm-package rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-17-27Z-npm-package-model-rerun/`, and the direct GitHub code-search rerun at `docs/release-evidence/plugin-community-source-discovery-report/2026-07-06T16-45-00Z-github-code-search-rerun/` now show the adjacent ecosystem split across topic-listed repos, published packages, and public code search: the GitHub rerun still ends at `compatible-source-not-found` (8 candidates total: 3 `incompatible-package-model`, 5 `not-found`), the npm rerun inspected 13 published `@openpets/*` tarballs that all lacked a current root `plugin.json` package, and the code-search rerun found zero public current-model hits for characteristic root `plugin.json` signatures. A targeted invitation draft still exists at `docs/release-evidence/plugin-community-source-invitation-kit/2026-07-06T15-46-14Z-openpets-plugin-starter-outreach/`, but the remaining gap is still an actual external compatible package source. Synthetic compatible/incompatible flow coverage now exists in `tests/scripts/mock-plugin-community-source-flow.test.js`, which now also rehearses the shipped intake, bridge, and discovery CLIs against a synthetic compatible archive without relying on real network access.
- [ ] Continue provider-path verification with broader packaged/runtime smoke coverage and only promote additional provider presets when they have honest evidence and operator guidance. Synthetic packaged provider-path coverage now exists in `tests/release/mock-packaged-provider-flow.test.js`, and the packaged Creator Studio smoke tooling can now archive an explicit `fixture` or `provider` backend request without ambiguity. That synthetic coverage now also rehearses the shipped packaged Create, Creator Studio runtime, and Creator Studio UI smoke CLIs against a provider-ready app shim; the remaining gap is still a real configured packaged provider session plus honest operator guidance for any newly promoted preset.

## P2 Later

- [ ] Expand the minimal host-owned trigger-rule editor only after richer random/state/event runtime semantics need more than the current inline `ruleSpec` fields.
- [ ] Continue TypeScript coverage into remaining high-drift main-process adapters, evidence summaries, and report boundaries.
- [ ] Expand packaged-app evidence where it improves confidence, especially around release smoke, cleanup behavior, and real-host validation gaps.

## Watch Items

- [ ] Keep `PetService` as the single source of truth for pet state and action/event flows.
- [ ] Keep all new user-facing configuration in Control Center rather than manual file edits.
- [ ] Keep API keys and provider credentials out of renderer and ordinary plugin contexts.
- [ ] Keep generated-pet quality claims tied to human or future automated review against the user's original image; provider smoke and atlas QA are not production asset-quality approval by themselves.
- [ ] Keep extension security language conservative: permission-limited and isolated does not mean fully sandboxed or universally safe.

## Current Baseline

These are already true and should not be re-planned as open work:

- [x] Electron desktop pet runtime plus React Control Center.
- [x] Pet pack runtime with built-in packs, Codex pet directory import, and zip import.
- [x] AI provider settings with one `模型 Provider` hub, chat/image capability cards, main-process secret storage, active/draft workflow, structured diagnostics, and Provider/Creator safe-log coverage.
- [x] Local extension runtime with explicit setup/command/service controls, dashboards, health checks, and cleanup evidence tooling.
- [x] Loopback-only local HTTP and MCP endpoints.
- [x] Bundled `openpet.agent-awareness` Phase A product skeleton: reversible `install-codex-hooks` / `uninstall-codex-hooks`, hook + polling ingestion, native-approval and opt-in-gated auto-start, sanitized runtime states for session/turn/tool/approval/progress, and Control Center plus Bubble Chat detail entries.
- [x] Agent Awareness Phase B foundation: safe token/context/cost aggregation when metadata exists, best-effort git branch/dirty summaries, usage stats dashboard, per-session detail/focus links, generated summaries/progress hints, notification-policy evidence, and stale-session merge protection.
- [x] Broad Node test coverage, Playwright Control Center regression coverage, and a TypeScript migration baseline across shared contracts and key UI/service boundaries.

## Reference Docs

- Current snapshot: [`HANDOFF.md`](./HANDOFF.md)
- Local run/build workflow: [`development-workflow.md`](./development-workflow.md)
- Test expectations: [`testing-strategy.md`](./testing-strategy.md)
- Engineering summary: [`development-summary.md`](./development-summary.md)
- Product/release summary: [`project-status-review.md`](./project-status-review.md)
