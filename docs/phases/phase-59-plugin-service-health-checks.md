# Phase 59: Plugin Service Health Checks

> Date: 2026-06-17
> Branch: `codex/plugin-service-health-checks`

## Goal

Add explicit, user-triggered health checks for declared plugin service entries without expanding ordinary plugin network authority.

## Implemented

- Added `PluginService.checkServiceHealth(pluginId, serviceId)`.
- Added runtime health state on service entries:
  - `not-configured`
  - `unknown`
  - `checking`
  - `healthy`
  - `unhealthy`
- Added timeout-protected HTTP health checks with `AbortController`.
- Restricted service health URLs to HTTP/HTTPS loopback hosts.
- Exposed `plugins:check-service-health` through shared IPC, main IPC, preload, and typed Control Center API contracts.
- Added Control Center health state text and a manual Check Health button for service entries.
- Added demo API health behavior and Playwright smoke coverage.

## Boundaries

- Health checks are explicit Control Center actions only.
- Health checks do not auto-start services.
- Health checks do not run in the background.
- Health checks do not grant arbitrary network access; URLs must be loopback.
- Setup commands, bridge token injection, generic shell command execution, and full process-tree cleanup remain future work.

## Tests

- `tests/services/plugin-service.test.js`
  - healthy responses
  - non-2xx unhealthy responses
  - timeout handling
  - disabled plugin rejection
  - missing health declaration rejection
  - unsafe protocol rejection
  - non-loopback host rejection before fetch
- `tests/main/ipc-plugin-install.test.js`
  - IPC delegation for `plugins:check-service-health`
- `tests/control-center/control-center-smoke.spec.js`
  - disabled health button
  - enabled manual health check
  - health state rendering
  - health log rendering

## Review Notes

The production review found two issues and both were fixed before full verification:

- Health URLs initially allowed arbitrary HTTP/HTTPS hosts; they are now loopback-only to avoid turning health checks into a host-level SSRF path.
- Control Center initially reported `Service health healthy` regardless of returned health status; it now reflects the actual health result.

## Verification

Final verification was run after review fixes:

```bash
npm run typecheck
node --test tests/main/ipc-plugin-install.test.js
node --test tests/services/plugin-service.test.js
npm run test:control-center
```

Full-suite verification is recorded in the phase review document.
