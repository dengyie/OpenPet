# Phase 71: Plugin Service Periodic Health Policy

> Date: 2026-06-17
> Scope: add a host-managed periodic health policy for declared plugin service entries.

## Goal

Phase 71 adds an opt-in periodic health policy for declared `entries.services` health endpoints.

The policy is owned by OpenPet settings and configured from Control Center. It does not belong to plugin manifests, and it does not let a plugin silently request background polling for itself.

## Scope

In scope:

- per-service periodic health policy stored under host plugin settings;
- Control Center controls for enabling periodic checks and choosing a bounded interval;
- automatic checks only while the declared service runtime is `running`;
- reuse of the existing loopback-only manual service health check path;
- timer cleanup on service stop, service error/exit, disable cleanup, shutdown cleanup, and policy changes;
- shared TypeScript contract, IPC, preload, demo API, and UI smoke coverage.

Out of scope:

- service auto-start;
- remote health checks;
- plugin manifest-owned scheduler policy;
- retries, backoff, alerting, notifications, or failure streak policy;
- broader bridge expansion;
- stronger process-tree cleanup guarantees.

## Implementation

Updated files:

- `src/main/services/plugin-service.js`
- `src/shared/openpet-contracts.ts`
- `src/shared/ipc-channels.js`
- `src/main/ipc.js`
- `control-center-preload.js`
- `src/control-center/src/api/control-center-api.ts`
- `src/control-center/src/hooks/usePluginsPane.ts`
- `src/control-center/src/panes/PluginsPane.tsx`
- `src/control-center/src/components/Toggle.tsx`
- `src/control-center/src/panes/AiPane.tsx`
- `src/control-center/src/panes/PetPane.tsx`
- `src/control-center/src/panes/ServicePane.tsx`
- `src/control-center/src/styles.css`
- `tests/services/plugin-service.test.js`
- `tests/main/ipc-plugin-install.test.js`
- `tests/control-center/control-center-smoke.spec.js`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior changes:

1. `PluginService` now normalizes service health policies to:
   - disabled by default,
   - `30000ms` default interval,
   - `15000ms` minimum interval,
   - `300000ms` maximum interval.

2. `listPlugins()` exposes `healthPolicy` on service entries so Control Center can render the current host policy next to service runtime and health state.

3. `saveServiceHealthPolicy(pluginId, serviceId, policy)` validates that the service exists and declares a health URL, persists the normalized host policy, logs the save/clear event, and reschedules a timer if the service is already running.

4. Periodic checks reuse `checkServiceHealth()` and therefore keep the existing loopback-only URL validation, timeout behavior, health state, and logs.

5. Service health timers are cleared when services stop, fail, exit, or are cleaned up through disable/app shutdown. Timers also reschedule after each automatic check only if the service is still running and the policy remains enabled.

6. Control Center now renders a `Periodic health` toggle and interval selector for services that declare a health URL. The controls are disabled while the plugin is disabled, policy-blocked, or already saving.

7. The shared `Toggle` component now supports `disabled` and `ariaLabel`. Existing toggle call sites were labeled so Playwright and assistive technology can distinguish plugin enablement, periodic health, AI behavior, service API, and pet auto-start switches.

## Decision Record

### Decision 1: host-owned settings, not manifest-owned policy

- Problem: periodic checks could be declared by a plugin manifest or owned by OpenPet.
- Choice: store policy in `settings.plugins.serviceHealthPolicies`.
- Reason: polling cadence is an operator choice. Plugins should declare a health endpoint, but they should not silently opt themselves into recurring host work.
- Risk: plugin authors cannot ship recommended intervals yet. This is acceptable because this phase is about safe host control, not author-managed automation.

### Decision 2: checks only run for active running services

- Problem: OpenPet could poll configured endpoints regardless of service runtime state.
- Choice: schedule only while runtime status is `running`.
- Reason: this preserves the no-auto-start boundary and avoids implying that health policy manages service lifecycle.
- Risk: stopped or crashed services do not continue health polling. Runtime state and logs remain the source of truth for that path.

### Decision 3: malformed persisted policy never enables polling

- Problem: settings files may contain stale or malformed values.
- Choice: `enabled` must be the boolean `true`; strings such as `"false"` sanitize to disabled.
- Reason: bad stored data must not accidentally turn on periodic background checks.
- Risk: hand-edited config with non-boolean truthy values is ignored until saved again through Control Center.

### Decision 4: add accessible labels to all shared toggles

- Problem: the new periodic health switch created multiple unlabeled switches on the plugin card, which made UI tests ambiguous and made the surface weaker for assistive technology.
- Choice: extend the shared `Toggle` with `ariaLabel` and label existing call sites.
- Reason: the fix is small, improves test stability, and matches the richer Control Center surface.
- Risk: none expected; behavior is unchanged except disabled toggles no longer call `onChange`.

## Validation

Targeted verification during implementation:

```bash
node --test tests/services/plugin-service.test.js
node --test tests/main/ipc-plugin-install.test.js
npm run typecheck
npm run test:control-center -- --grep "manual plugin packages"
```

Full verification before commit:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

## Outcome

After Phase 71:

- service health checks can be periodic, but only when a user enables the host policy;
- periodic checks stay loopback-only and reuse the manual health path;
- stopped services are not polled and are never auto-started by health policy;
- plugin manifests remain declarations, not background scheduler authority;
- Control Center is the only user-facing configuration surface for the policy.
