# OpenPet TODO

> Last updated: 2026-07-03
> Purpose: this is the single active maintainer work queue.

Use this file for open work and priority changes. Keep phase docs, reviews, and old roadmap files as background only; do not split active planning across multiple TODO documents again.

## How To Use This File

1. Keep only still-open work here.
2. When a task becomes implemented history, move its evidence into `docs/phases/`, `docs/reviews/`, or `docs/release-evidence/` instead of expanding this file forever.
3. When public support claims change, update [`../README.md`](../README.md), [`HANDOFF.md`](./HANDOFF.md), and release docs in the same pass.

## P0 Now

- [ ] Archive a real signed macOS release-evidence artifact with `npm run create-macos-release-evidence-archive`, then feed it through the release archive and signed closure flow.
- [ ] Produce real signed Windows smoke evidence before changing any Windows support wording. Windows stays not release-ready until those artifacts are archived and validated.
- [ ] Collect real packaged native picker evidence for plugin zip, pet zip, cancel, and invalid-package flows so packaged runtime claims are backed by observed app runs.

## P1 Next

- [ ] Find or receive a compatible third-party `plugin.json` package that can pass discovery, intake, and community-source evidence flow without overstating trust.
- [ ] Continue provider-path verification with broader packaged/runtime smoke coverage and only promote additional provider presets when they have honest evidence and operator guidance.
- [ ] Add a host-owned trigger-rule editor/schema for `random`, `state`, and `event` proposals before allowing those trigger bindings to be applied.

## P2 Later

- [ ] Continue TypeScript coverage into remaining high-drift main-process adapters, evidence summaries, and report boundaries.
- [ ] Expand packaged-app evidence where it improves confidence, especially around release smoke, cleanup behavior, and real-host validation gaps.

## Watch Items

- [ ] Keep `PetService` as the single source of truth for pet state and action/event flows.
- [ ] Keep all new user-facing configuration in Control Center rather than manual file edits.
- [ ] Keep API keys and provider credentials out of renderer and ordinary plugin contexts.
- [ ] Keep extension security language conservative: permission-limited and isolated does not mean fully sandboxed or universally safe.

## Current Baseline

These are already true and should not be re-planned as open work:

- [x] Electron desktop pet runtime plus React Control Center.
- [x] Pet pack runtime with built-in packs, Codex pet directory import, and zip import.
- [x] AI provider settings with one `模型 Provider` hub, chat/image capability cards, main-process secret storage, active/draft workflow, structured diagnostics, and Provider/Creator safe-log coverage.
- [x] Local extension runtime with explicit setup/command/service controls, dashboards, health checks, and cleanup evidence tooling.
- [x] Loopback-only local HTTP and MCP endpoints.
- [x] Broad Node test coverage, Playwright Control Center regression coverage, and a TypeScript migration baseline across shared contracts and key UI/service boundaries.

## Reference Docs

- Current snapshot: [`HANDOFF.md`](./HANDOFF.md)
- Local run/build workflow: [`development-workflow.md`](./development-workflow.md)
- Test expectations: [`testing-strategy.md`](./testing-strategy.md)
- Engineering summary: [`development-summary.md`](./development-summary.md)
- Product/release summary: [`project-status-review.md`](./project-status-review.md)
