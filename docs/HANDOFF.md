# OpenPet Handoff

> Last updated: 2026-06-29
> Current release track: `v1.0.1-rc.3`
> Role: current-state maintainer handoff for the next development session.

## What This File Is For

Read this file when you need to continue work in the repository today.

This file should stay short and operational. It covers only:

- what is true right now,
- what must not be broken,
- which commands to trust,
- and where the next bounded work should start.

It is not the architecture manual, the testing policy, or the roadmap. When it
starts duplicating those documents, move the detail back to the owner doc and
keep this file short again.

For deeper architecture, use `docs/jishuwendang.md`.
For the live gap map, use `docs/openpet-current-todo-architecture.md`.
For the documentation index, use `docs/README.md`.

## Current Snapshot

OpenPet is currently a macOS-first Electron desktop pet platform with:

- a transparent pet window runtime,
- a React + Vite Control Center,
- pet-pack loading/import paths,
- bundled built-in pets,
- host-owned AI provider settings and AI Talk state,
- a permission-gated local plugin runtime,
- optional loopback-only HTTP / MCP surfaces,
- and a shared TypeScript contract layer around Control Center and cross-process payloads.

The repository is beyond toy-demo stage, but some platform claims are still intentionally conservative:

- Windows is not yet release-ready.
- Third-party plugins are constrained and reviewed, not fully sandboxed.
- Creator Studio is functional, but still not the final productized user flow.

## Facts To Preserve

- `PetService` remains the single source of truth for pet runtime state.
- User-facing configuration must stay operable through Control Center.
- API keys and similar secrets must remain in the main process only.
- `npm start` must remain functional.
- `cat_anime/` material structure must not be reworked casually.
- Local HTTP / MCP must remain loopback-only and off by default.
- Creator Studio can prepare prompts, tasks, QA, and import requests, but host services still own model credentials, output writes, final imports, and durable trigger persistence.

## Current Validation Baseline

Use these commands as the default regression path:

```bash
npm start
npm run test:core
npm run test:core:all
npm run test:tools
npm test
npm run test:control-center
npm run check:syntax
```

When changing only one subsystem, run the narrowest relevant suite first, then expand to `test:core` or `check:syntax` before claiming completion.

For the current testing policy and deletion guidance, read `docs/testing-strategy.md`.

## Recommended Reading Order

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/jishuwendang.md`
4. `docs/testing-strategy.md`
5. `docs/development-summary.md`
6. `docs/openpet-current-todo-architecture.md`

## Where To Continue

If you are choosing the next milestone, start from `docs/openpet-current-todo-architecture.md` and pick one bounded P0/P1 slice.

At the current repository level, the most important open engineering gaps are:

1. richer AI Talk diagnostics, legacy upgrade continuity, longer-horizon chat controls, and related chat-state polish
2. Creator Studio UX convergence toward a smoother dashboard-first flow
3. real signed / smoke evidence needed for stronger release claims
4. follow-up refinement on trigger-rule observability and broader policy expansion after the runtime baseline

Recent landed chat-state facts worth preserving:

- `openpet_behavior` now supports `reason`, `displayMode`, and current-pet action candidate hints.
- `AiTalkService` can return `bubbleSegments` while keeping the full assistant reply in the shared transcript.
- Bubble Chat rebuilds segmented pet dialogue from stored conversation messages instead of owning a second transcript.

Recent desktop interaction facts worth preserving:

- The pet context menu now keeps a compact first level and moves manual pet actions behind a click-open cascaded `动作` submenu.
- `散步` lives inside that action submenu, while `和宠物聊天` stays as the single first-level chat entry.
- Context-menu regressions should keep the targeted menu suites green before broader runtime claims are made.

Do not treat this list as a mandate to do everything at once. Pick one milestone, freeze scope, verify, review, then stop.

## Working Rules For The Next Maintainer

- Prefer updating live docs only when facts truly changed.
- Treat the canonical live-doc set as: `README*`, `docs/README.md`,
  `docs/HANDOFF.md`, `docs/jishuwendang.md`, `docs/testing-strategy.md`,
  `docs/development-summary.md`, `docs/openpet-current-todo-architecture.md`,
  `docs/project-context.json`, and `docs/project-documentation-design.md`.
- Do not rewrite historical phase/review documents just to mirror current wording.
- If a roadmap/spec and current code disagree, update the live docs to match reality and leave the roadmap as historical unless it is still actively owned.
- If the worktree is already dirty, understand whether those changes are part of the current milestone before editing nearby files.

## Documentation Map

- `docs/README.md`: canonical documentation index
- `docs/jishuwendang.md`: detailed Chinese developer guide
- `docs/development-summary.md`: short English engineering summary
- `docs/openpet-current-todo-architecture.md`: live TODO map grouped by architecture owner
- `docs/testing-strategy.md`: core-flow and auxiliary test policy
- `docs/phases/` and `docs/reviews/`: historical audit trail
