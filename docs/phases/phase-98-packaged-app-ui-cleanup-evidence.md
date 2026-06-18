# Phase 98: Packaged App UI Cleanup Evidence

> Date: 2026-06-18
> Scope: add packaged-app plugin cleanup evidence automation.

## Goal

Phase 98 adds a packaged-app evidence path for plugin setup, declaration-command, and service cleanup behavior.

Earlier cleanup phases proved the report, updater, collector, archive manifest, and local collector runner. This phase connects that evidence chain to a launched OpenPet packaged app session. The runner installs a deterministic local fixture plugin, drives setup / command / service cleanup flows through the app's normal plugin services, records transcripts, maps observed behavior into the existing cleanup evidence report, and archives the result.

This phase does not change plugin runtime cleanup guarantees, sandbox wording, permission scope, or release readiness claims.

## Scope

In scope:

- packaged plugin cleanup report mapper;
- packaged plugin cleanup runner script;
- dedicated fixture plugin with setup, command, and service entries;
- main-process evidence-mode hook guarded by `OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE=1`;
- shared TypeScript contracts for the packaged cleanup runtime artifact and runner result;
- targeted tests and live documentation updates.

Out of scope:

- changing normal plugin setup / command / service cleanup behavior;
- claiming universal process-tree cleanup;
- making packaged cleanup evidence a release-ready signal by itself;
- opening new plugin permissions or raw filesystem grants.

## Implementation

Updated files:

- `main.js`
- `package.json`
- `src/main/packaged-plugin-cleanup-evidence-runner.js`
- `scripts/run-packaged-plugin-cleanup-evidence.js`
- `scripts/update-packaged-plugin-cleanup-evidence-report.js`
- `tests/fixtures/plugins/cleanup-evidence-fixture/`
- `tests/release/packaged-plugin-cleanup-evidence-report-update.test.js`
- `tests/release/packaged-plugin-cleanup-evidence-runner.test.js`
- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior:

1. `npm run update-packaged-plugin-cleanup-evidence-report` maps a packaged runtime artifact into the existing plugin cleanup checklist report.
2. `npm run run-packaged-plugin-cleanup-evidence` launches a packaged app with a guarded evidence-mode environment, waits for `packaged-plugin-cleanup-runtime.json`, updates the cleanup report, and creates the archive manifest.
3. The main process only runs the packaged cleanup evidence flow when `OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE=1`.
4. The mapper only marks a cleanup check `pass` when the runtime artifact proves that specific behavior.
5. Tree-fallback and force-stop checks remain pending unless explicit evidence is present; ordinary stop success is not treated as fallback proof.
6. Packaged app orchestration launch failures and timeouts are preserved as archived stderr/report/manifest diagnostics instead of aborting before evidence files can be inspected.

## Decision Record

### Keep cleanup readiness report-driven

The runner can produce a valid archive while `cleanupReady` remains false. This preserves the existing Phase 86-91 boundary: archive validity proves files and hashes, while strict cleanup readiness comes only from every required report check having real evidence.

### Launch through the packaged app instead of duplicating services in the script

The script launches the packaged OpenPet executable and communicates through environment variables. The main process then uses the existing plugin install and plugin service paths. This keeps evidence closer to the real shipped app and avoids a second cleanup runtime.

### Keep fallback evidence conservative

The existing plugin logs prove stop requests and exit confirmation, but they do not always prove that a tree fallback was attempted. Phase 98 therefore keeps tree fallback and force-stop checks pending unless explicit runtime artifact fields show they were observed.

### Keep release-candidate archive claims separate

The packaged cleanup automation is complete, but this phase does not claim that every release-candidate build already has a reviewed packaged cleanup archive attached. Real packaged cleanup archives still need to be generated against the built app on the host when maintainers want release evidence. This keeps the documentation honest about the difference between "automation exists" and "this specific app build has archived evidence."

## Remaining Limits

- Packaged cleanup evidence remains an observed-session report, not a guarantee that every third-party plugin or descendant process tree can be cleaned up universally.
- Future release-candidate evidence runs should execute `npm run pack` and `npm run run-packaged-plugin-cleanup-evidence` against the built app, then archive the generated evidence directory.

## Validation

Targeted validation:

```bash
node --test tests/release/packaged-plugin-cleanup-evidence-report-update.test.js tests/release/packaged-plugin-cleanup-evidence-runner.test.js tests/release/packaged-plugin-cleanup-main-runner.test.js
```

Result:

- 14/14 targeted packaged cleanup evidence tests passed.

Full validation:

```bash
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Result:

- `npm run typecheck` passed.
- `npm run check:syntax` passed.
- `npm test` passed with 666/666 tests.
- `npm run test:control-center` passed with 10/10 tests.
- `git diff --check` passed.
- `docs/project-context.json` parsed successfully.
