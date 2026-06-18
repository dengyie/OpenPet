# Phase 63: Plugin Command Result UX

> Date: 2026-06-17
> Branch: `codex/plugin-bridge-phase63`
> Status: completed locally

## Goal

Let Control Center show useful immediate feedback after a plugin command finishes, instead of only surfacing a generic success line and relying on users to inspect logs manually.

## What Changed

- Control Center now keeps a per-session preview of the most recent plugin command result.
- After `runPluginCommand()` resolves, the Plugins pane now shows a compact result block on the matching plugin card with:
  - command id,
  - exit code,
  - a human-readable message derived from `result.message`, `result.petSay`, or the exit code,
  - parsed JSON result preview when present,
  - stdout/stderr snippets when returned.
- The status line now reuses the command result summary instead of always saying only `命令已运行`.
- The demo Control Center API now returns a structured `PluginCommandRunResultViewState`, so Playwright smoke can validate the UI result path without requiring the real host runtime.
- A small result-formatting helper now owns the preview shaping logic, keeping the hook simple and directly testable.

## Boundaries Preserved

- This phase does not change command execution policy, sandbox wording, or bridge availability.
- Commands are still explicit user actions only.
- No install-time or enable-time command execution was added.
- No bridge token injection, arbitrary shell console, or hard process-tree cleanup guarantee was added.
- Result UX is intentionally compact and in-memory for the current session; it is not a historical audit log replacement.

## Tests

```bash
node --test tests/control-center/plugin-command-result.test.js
# 1/1 pass

npm run typecheck
# pass

npm run test:control-center
# 10/10 pass
```

Full verification before commit:

```bash
npm run check:syntax
# pass

npm test
# 468/468 pass

npm run test:control-center
# 10/10 pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Acceptance

- Command success feedback is visible on the plugin card without reading the log panel.
- The preview reflects structured command return data when available.
- Smoke coverage proves the demo/manual plugin path shows the result card and summary.
- Docs stay honest that this is a UX improvement on top of the Phase 62 command runtime, not a bridge phase or a broader command orchestration layer.
