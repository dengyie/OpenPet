# Phase 60 Production Code Quality Review

> Date: 2026-06-17
> Branch: `codex/plugin-setup-status`
> Scope: plugin setup declaration visibility and best-effort service process-group cleanup

## Scope

- Base: `HEAD` on `codex/plugin-setup-status`
- Scope mode: working tree
- Changed files: manifest normalization, plugin service runtime decoration, Control Center entry details and demo fixtures, shared contracts, targeted tests, and live docs
- Risk level: medium-high because the change touches extension declarations, local process lifecycle, and user-facing security wording
- Assumptions: setup declarations are intentionally read-only in this phase; service cleanup remains best-effort and does not claim full sandboxing

## Findings

### P2: Setup declarations were visible without an explicit non-execution reminder

- Location: `src/control-center/src/components/PluginEntryDetails.tsx`
- Problem: The entry details footer explained that services and dashboards require explicit Control Center actions, but did not explicitly say setup entries are not executed.
- Impact: A reviewer or extension author could misread an `entries.setup` command such as `npm install` as an install-time action rather than metadata with `not-run` status.
- Evidence: Phase 60 adds setup declarations to review and installed plugin rows while deliberately keeping setup execution out of scope.
- Suggested fix: State directly in the entry details footer that setup entries are not executed, and cover that wording in the Control Center smoke test.
- Confidence: High
- New or pre-existing: Introduced by the setup status change.
- Resolution: Fixed. The footer now says `Setup entries are not executed`, and the Control Center smoke test asserts that copy.

## Architecture Assessment

The behavior stays in the right layers. Manifest parsing owns declaration normalization, `PluginService` owns runtime decoration and process lifecycle, shared contracts describe renderer payloads, and Control Center only renders review/status state. The change does not add setup execution or a new command runner.

## Robustness Assessment

Setup declarations are validated but not executed, which keeps the blast radius low. Service stop now attempts process-group `SIGTERM` and falls back to the previous child kill path if group signalling is unsupported or fails. The runtime wording remains best-effort rather than a hard cleanup guarantee.

## Test Assessment

Strong coverage:

- manifest tests cover setup normalization and unsafe setup id/cwd rejection;
- service tests cover `not-run` setup runtime, non-runnable setup entries, detached service spawn, group stop, and child kill fallback;
- UI smoke covers setup visibility and non-execution wording.

No blocking missing scenario remains for this phase. A real OS-level descendant process smoke test would belong to a later hard cleanup guarantee phase.

## Verification

Checks run during review:

```bash
node --test tests/plugins/manifest.test.js tests/services/plugin-service.test.js
# 75/75 pass

npm run typecheck
# pass

npm run test:control-center
# 10/10 pass

npm run check:syntax
# pass

npm test
# 446/446 pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Final Recommendation

Safe to merge.
