# codex/dev7 Dirty Worktree Audit

> Date: 2026-07-04
> Worktree: `/Users/mango/.codex/worktrees/ef96/OpenPet`
> Branch: `codex/dev7`
> Main baseline: `1f6ee034c7dcf965f03f4636101e44e68a072a2b`

## Scope

This audit covers only the old dirty `codex/dev7` worktree after the clean Agent Awareness merge had already been integrated into `main`.

The goal is to separate:

1. dirty entries that are already represented in `main`
2. unmerged leftovers worth preserving for later focused work
3. old WIP, regressions, or temporary noise that should not be merged from this worktree

## Baseline

At audit time:

- `main` and `codex/dev7-agent-awareness-merge` point to the same commit
- the bundled Agent Awareness plugin work was already present in `main`
- this document does not recommend cherry-picking the old dirty worktree wholesale

## Method

The audit used the dirty paths from `git status --porcelain=v1` and compared each path against `main`.

Result counts:

- dirty entries in this worktree: `60`
- dirty entries already effectively in `main`: `20`
- dirty entries still different from `main`: `40`

## Conclusion

Agent Awareness itself is already merged. The remaining dirty delta is mostly unrelated AI, IPC, Creator Studio, and documentation WIP.

Recommended handling:

- treat Agent Awareness as complete for this merge line
- keep only the small AI Talk smoke archive follow-up as a future standalone cleanup
- keep the renderer-contract hardening idea as a future milestone, but rebuild it cleanly from `main`
- do not merge the rest from this dirty worktree

## Already In Main

These paths were still dirty in this worktree, but their effective content was already represented in `main`.

### Agent Awareness already merged

- `examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js`
- `src/main/services/plugin-service.js`
- `tests/examples/agent-awareness-plugin.test.js`
- `tests/services/agent-awareness-bundled-integration.test.js`
- `tests/services/agent-awareness-plugin-service.test.js`

### Also already represented in main

- `scripts/check-docs-drift.js`
- `tmp/`

## Keep For Later

These leftovers are not part of Agent Awareness, but they are coherent enough to preserve as future focused work.

### 1. AI Talk smoke archive follow-up

Recommendation: keep as a small standalone cleanup milestone.

Why keep it:

- narrow scope
- clear value
- no need to reopen large runtime architecture
- archive and manual-acceptance boundaries are easier to review in isolation

Paths:

- `scripts/create-ai-talk-local-smoke-archive.js`
- `scripts/update-ai-talk-local-smoke-report.js`
- `tests/scripts/create-ai-talk-local-smoke-archive.test.js`
- `tests/scripts/update-ai-talk-local-smoke-report.test.js`
- `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/README.md`
- `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/ai-talk-local-smoke-archive-result.json`
- `docs/superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md`

Expected scope if revived:

- archive summary output
- README/manual-acceptance writeback alignment
- stronger no-secret / no-local-path archive guardrails

### 2. Renderer contract hardening

Recommendation: keep as a future milestone idea, but do not lift code from this dirty worktree directly.

Why keep the idea:

- there is real value in normalizing IPC payloads before they reach the renderer
- several tests point to a valid direction: sanitization, numeric normalization, and stricter view adapters

Why not merge this copy:

- the scope is too large for a leftover salvage
- it is mixed with unrelated AI and plugin work
- it needs to be re-cut cleanly from current `main`

Representative paths:

- `src/main/control-center-adapters.js`
- `src/main/ipc.js`
- `src/main/ipc/pet-chat-state.js`
- `src/main/ipc/register-ai-ipc.js`
- `src/main/ipc/register-catalog-ipc.js`
- `src/main/ipc/register-creator-ipc.js`
- `src/main/ipc/register-pet-runtime-ipc.js`
- `src/main/ipc/register-plugin-ipc.js`
- `src/main/ipc/register-service-ipc.js`
- `src/main/ipc/register-settings-ipc.js`
- `src/main/plugins/manifest.js`
- `src/control-center/src/lib/defaults.ts`
- `src/control-center/src/lib/plugin-command-result.mjs`
- `tests/main/control-center-adapters.test.js`
- `tests/main/ipc-actions-diagnostics.test.js`
- `tests/main/ipc-cursor-settings.test.js`
- `tests/main/ipc-plugin-install.test.js`
- `tests/main/ipc-registration-groups.test.js`
- `tests/main/pet-chat-facade.test.js`
- `tests/main/pet-chat-ipc.test.js`
- `tests/control-center/plugin-command-result.test.js`
- `docs/renderer-contract-checklist.md`

## Defer Or Drop

These paths should not be treated as pending merge work for the Agent Awareness milestone.

### 1. AI pane and AI service leftovers

Recommendation: defer or drop from this worktree.

Why:

- mixed large refactor
- overlaps current main baseline
- includes behavior that appears to roll back current provider-model UX and state flow

Paths:

- `src/control-center/src/hooks/useAiPane.ts`
- `src/control-center/src/lib/ai-provider-config.ts`
- `src/control-center/src/panes/AiPane.tsx`
- `src/main/services/ai-service.js`
- `src/main/services/image-generation-model-service.js`
- `tests/docs/live-docs-ai-pane.test.js`
- `tests/services/ai-service.test.js`
- `tests/services/image-generation-model-service.test.js`

### 2. Creator Studio rollback-style leftovers

Recommendation: drop from this worktree unless a separate future review reopens the product direction.

Why:

- the remaining changes look like a rollback or capability reduction rather than a clean additive step
- they do not belong to the Agent Awareness line

Paths:

- `examples/plugins/creator-studio/lib/host-model-bridge.js`
- `tests/examples/creator-studio-dashboard-browser.test.js`
- `tests/examples/creator-studio-plugin.test.js`
- `tests/services/plugin-service.test.js`

### 3. Large handoff rewrite

Recommendation: drop from this worktree.

Why:

- useful context exists inside it
- but it is too broad and too coupled to old in-flight planning to merge as-is

Path:

- `docs/HANDOFF.md`

### 4. AI-pane-linked styling leftovers

Recommendation: drop from this worktree.

Why:

- the style delta is tied to an older AI pane structure
- it does not stand on its own as a safe isolated patch

Path:

- `src/control-center/src/styles.css`

### 5. Small files coupled to discarded larger themes

Recommendation: drop from this worktree together with their parent themes.

Why:

- useful only together with the broader AI-pane or renderer-contract changes
- not worth preserving independently on this stale branch

Paths:

- `src/control-center/src/lib/ai-behavior-rules.ts`
- `tests/control-center/ai-behavior-rules.test.js`
- `tests/control-center/ai-provider-config.test.js`
- `tests/control-center/defaults-ai-persona-profile.test.js`
- `tests/control-center/defaults-ai-talk-trace-summary.test.js`
- `tests/control-center/defaults-catalog.test.js`
- `tests/control-center/defaults-creator-state.test.js`
- `tests/control-center/defaults-pet-chat-state.test.js`
- `tests/control-center/defaults-renderer-contract-hardening.test.js`

## Explicitly Reject

The following change should not enter the mainline from this worktree:

- `src/main/services/plugin-command-runner.js`

Reason:

- this leftover makes plugin command runtime context always report `nativeExecutionApproved: true`
- that weakens the original approval boundary and should be treated as an invalid carry-over, not as deferred WIP

## Final Recommendation

For this old dirty `codex/dev7` worktree:

1. do not merge or cherry-pick the branch wholesale
2. consider Agent Awareness complete for the already merged line
3. optionally salvage the AI Talk smoke archive follow-up in a small standalone PR
4. if renderer-contract hardening matters, restart it from current `main` with a dedicated milestone
5. ignore the remaining leftovers unless their product direction is reopened intentionally
