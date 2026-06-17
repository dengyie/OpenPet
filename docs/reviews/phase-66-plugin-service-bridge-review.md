# Phase 66 Production Code Quality Review

> Date: 2026-06-17
> Branch: `codex/plugin-service-bridge-phase66`
> Scope: shared bridge runtime helpers, explicit service bridge injection, service bridge expiry semantics, targeted tests, and live docs

## Scope

- Base: current working tree on `codex/plugin-service-bridge-phase66`
- Scope mode: Phase 66 diff
- Risk level: high because the change touches local HTTP authorization, service lifecycle cleanup, and shared plugin process runtime state
- Assumption: bridge scope stays intentionally narrow and service auto-start, setup bridge access, background health polling, renderer bridge access, and hard process-tree guarantees remain out of scope

## Findings

No blocking production findings remain after review.

## Review Optimizations Applied

- `src/main/services/plugin-service.js`: shared bridge runtime ownership was generalized from command-only naming to per-entry naming so command and service flows use the same narrow policy surface.
- `src/main/services/plugin-service.js`: bridge runtimes now stop authorizing immediately when service stop is requested and are released on child exit, child error, spawn failure, and global cleanup.
- `src/main/services/plugin-service.js`: bridge server startup was made concurrency-safe so parallel service starts reuse one loopback bridge server instead of racing on initialization.
- `tests/services/plugin-service.test.js`: service bridge coverage now proves env injection, bounded context, pet mutation routing, invalid token rejection, missing permission rejection, stop-request expiry, and concurrent start safety.
- Live docs were updated so README, handoff, status, ecosystem rules, and author guidance all describe service bridge support without overclaiming sandbox or host privilege.

## Architecture Assessment

The behavior remains in the right layer. `PluginService` already owns plugin process lifecycle, loopback bridge handling, runtime maps, and policy enforcement, so extending the existing bridge there keeps service integration local to the current runtime boundary. `PetService` remains the single source of truth because all pet mutations still flow through its APIs.

## Robustness Assessment

The main failure paths are covered: spawn failure releases the bridge, stop requests revoke authorization before exit, exit/error paths release runtime state, and full shutdown clears residual bridge state. The main remaining limitation is intentional: this is still a narrow loopback integration channel rather than a complete local sandbox or descendant-process supervision system.

## Test Assessment

Strong coverage:

- explicit service bridge env injection is asserted directly;
- bridge-backed service `pet.say`, `pet.action`, `pet.event`, and `GET /context` flows are covered end-to-end against the loopback HTTP handler;
- invalid token, missing permission, and expired bridge requests are rejected;
- stop requests now prove service bridge expiry happens before child exit;
- concurrent service starts prove the shared bridge server does not hang under parallel initialization;
- command-bridge regressions remain covered by the existing declaration-only command bridge tests.

The next useful future test would be a real-process integration scenario that exercises a service using the bridge from an actual child runtime, but current service-level and bridge-level coverage is sufficient for this phase.

## Verification

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service bridge|plugin service entries receive bridge env vars when started explicitly|plugin service bridge server is shared safely across concurrent service starts|declaration-only command bridge|plugin service rejects non-json declaration command payloads before spawning processes"
# pass

npm run check:syntax
# pass

npm test
# pass

npm run test:control-center
# pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Final Recommendation

Safe to merge.
