# Phase 59 Production Code Quality Review

> Date: 2026-06-17
> Branch: `codex/plugin-service-health-checks`
> Scope: Plugin service health checks, IPC/preload/contracts, Control Center UI, tests, and documentation.

## Scope

- Base: `origin/main`
- Scope mode: working tree
- Risk level: high
- Risk flags: plugin network boundary, observability change, renderer-to-main IPC contract
- Review skill: `$production-code-quality-review`

## Findings

### P1: Service health checks must not fetch arbitrary hosts

- Location: `src/main/services/plugin-service.js`
- Problem: Health URL validation initially allowed any HTTP/HTTPS host declared by a plugin.
- Impact: A plugin could turn a health check into a main-process network request to arbitrary hosts, bypassing the ordinary plugin network allowlist and creating an SSRF-like local host capability.
- Evidence: `normalizeServiceHealthUrl()` accepted `https://api.example.com/health` before fetch.
- Suggested fix: Restrict health URLs to loopback hosts because this feature observes local service entries, not external APIs.
- Resolution: Added loopback host validation and a regression test proving non-loopback hosts are rejected before fetch.
- Confidence: High
- New or pre-existing: Introduced by Phase 59 draft.

### P2: Control Center status message ignored unhealthy results

- Location: `src/control-center/src/hooks/usePluginsPane.ts`
- Problem: The health check action displayed `Service health healthy` after every successful IPC call, even when the returned health status was `unhealthy`.
- Impact: Users could be told a service is healthy while the row state and logs show otherwise, making troubleshooting confusing.
- Evidence: `onCheckServiceHealth()` discarded the returned health status and used a constant success message.
- Suggested fix: Set the status message based on `result.health.status`.
- Resolution: The hook now reports `Service health healthy` only for healthy results and `Service health unhealthy` otherwise.
- Confidence: High
- New or pre-existing: Introduced by Phase 59 draft.

## Architecture Assessment

Health checks live in `PluginService`, which is the right layer because it already owns plugin policy checks, service runtime state, and plugin logs. Renderer access stays constrained to a single explicit IPC method exposed through preload and shared contracts.

## Robustness Assessment

The final implementation handles disabled plugins, unknown services, missing health declarations, unsafe protocols, non-loopback hosts, non-2xx responses, thrown fetch errors, and slow endpoints. Health checks are timeout-protected and log healthy/unhealthy outcomes without exposing response bodies.

## Test Assessment

Strongest coverage is in `tests/services/plugin-service.test.js`, which exercises both happy path and security/failure boundaries. IPC and Control Center smoke tests cover the renderer path. The most important deferred scenario is a future background health polling policy, which is intentionally out of scope.

## Meaningful Strengths

- Health checks are explicit user actions and do not auto-start services.
- Health URLs are loopback-only, keeping the feature aligned with local service observability.
- Runtime health state is included in shared contracts instead of being inferred in the renderer.

## Final Recommendation

Safe to merge after full verification passes.

## Final Verification

```bash
npm run check:syntax                         # pass
npm test                                     # 443/443 pass
npm run test:control-center                  # 10/10 pass
git diff --check                             # pass
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')" # pass
```
