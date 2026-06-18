# Phase 98 Review: Packaged App UI Cleanup Evidence

> Date: 2026-06-18
> Branch: `codex/plugin-cleanup-evidence-contracts-phase91`
> Mode: deep
> Scope: packaged plugin cleanup evidence runner, mapper, fixture, contracts, and live documentation updates.

## Scope

- Base: Phase 97 head.
- Scope mode: working tree manually narrowed to Phase 98 files.
- Risk level: medium, because the feature launches packaged apps and exercises plugin lifecycle cleanup paths, but it is guarded behind an evidence-only environment variable and does not change normal runtime behavior.

## Findings

No blocking production issues remain in the Phase 98 diff.

## Review Notes

- The evidence hook in `main.js` is inert unless `OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE=1`.
- The runner launches the packaged executable with an output path and plugin fixture source, then waits for the runtime artifact instead of reaching into renderer state.
- The report mapper reuses the existing plugin cleanup report validator and does not introduce a second readiness policy.
- Tree-fallback and force-stop checks are conservative: they stay pending unless explicit evidence is present.

## Review Fixes

- Renamed the default archive session suffix from `packaged-ui` to `packaged-plugin-cleanup`.
- Added optional `error` and `logPath` fields to the shared runtime artifact contract to match actual success and failure outputs.
- Tightened fixture and mapper tests so fallback/force-stop evidence is not inferred from ordinary stop success.
- Hardened the runner so orchestration throws are converted into archived stderr/report/manifest diagnostics instead of aborting before maintainers can inspect failure evidence.

## Architecture Assessment

The orchestration lives in a release/evidence script and a guarded main-process evidence hook, while the real plugin lifecycle behavior remains in `PluginService`. This keeps the normal product path untouched and lets maintainers gather packaged evidence without adding renderer privileges or plugin permissions.

## Robustness Assessment

Failure output is preserved as `packaged-plugin-cleanup-stderr.txt`, runtime artifact `error`, runner `errors`, and archive manifest errors. Existing archive-output collision checks prevent accidental overwrite. The runner returns non-zero when the archive/report/runtime artifact cannot validate.

## Test Assessment

Strongest coverage:

- report mapper tests for complete evidence, explicit fallback evidence, incomplete evidence, and misleading `cleanupReady` rejection;
- runner tests for CLI parsing, default archive naming, transcript/report/manifest persistence, orchestration failure preservation including thrown launch errors, and output collision protection;
- shared type fixtures for the runtime artifact and runner result.

Remaining gap:

- A real packaged app evidence archive still depends on running `npm run pack` and `npm run run-packaged-plugin-cleanup-evidence` against a built app on the host. The phase adds the path and tests the orchestration contract; it does not archive a new real run in this commit.

## Quality Gate

- Result: pass
- Score: 88
- Rationale: the feature is guarded, conservative, and well covered at the script/contract level. The remaining risk is external real packaged-app execution evidence, not the code boundary introduced here.

## Verification

```bash
node --test tests/release/packaged-plugin-cleanup-evidence-report-update.test.js tests/release/packaged-plugin-cleanup-evidence-runner.test.js tests/release/packaged-plugin-cleanup-main-runner.test.js
# pass: 14/14
```

```bash
npm run typecheck
# pass
```

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# all pass
```
