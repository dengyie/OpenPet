# Creator Provider Health Coordination Design

## Problem

Creator currently treats one three-second `/models` probe as authoritative Provider readiness. The image service and Creator wrapper both apply the same short deadline, concurrent Creator state and generation calls launch duplicate probes, and a slower timeout can reject generation even when another request to the same Provider has just succeeded.

The production log demonstrates the failure: one request completed in 683 ms, a concurrent request timed out at 3018 ms, and the full-pet workflow immediately stopped with `health_check_timeout`. A separate probe using the saved 120-second Provider timeout completed successfully in 3578 ms.

## Goal

Prevent transient or concurrent `/models` latency from falsely disabling Create or blocking generation while retaining bounded network checks, accurate configuration failures, and fail-closed real image generation.

## Readiness Policy

- Increase the default Creator health deadline from 3000 ms to 10000 ms.
- Cache only successful Creator health results for 30000 ms.
- Key cached and in-flight health state by the current Provider configuration: provider, normalized base URL, model, API key reference, organization, and project.
- Concurrent calls for the same key share one in-flight health promise.
- A configuration-key change bypasses and replaces the prior key's cached result.
- Health failures and timeouts are never cached as success.
- A recent successful result may satisfy both Create panel state and generation preflight. The subsequent real image request remains authoritative and retains its existing timeout, retry, and error handling.

The Creator Studio Service runtime remains unrelated to image Provider readiness.

## Architecture

Coordination belongs in `creator-workflow-service.js`, not in the renderer. That service owns both `getState()` and `runWorkflow()`, which are the conflicting consumers observed in the log. The shared image-generation service remains responsible for one physical `/models` request, request cancellation, response-body timeout coverage, logging, and safe Provider configuration.

The Creator workflow service will maintain:

- one successful health cache record `{ key, result, expiresAt }`;
- one in-flight record `{ key, promise }`;
- an injected clock for deterministic expiry tests.

`getProviderHealth()` will compute the current configuration key, return a fresh matching success, join a matching in-flight request, or start one new check. Completion stores a success only when the current configuration key still matches. The in-flight record is cleared only by the promise that installed it.

The existing outer watchdog remains as defense against a non-conforming or mocked image service that ignores its requested timeout. Its deadline is slightly greater than the inner 10-second deadline so the image service normally owns cancellation and emits the authoritative health failure log.

## User-Facing Semantics

- A successful recent probe keeps `Image Provider ready` during short gateway latency spikes.
- A cold-start probe that exceeds 10 seconds remains `health_check_timeout`, but its message must state that the check timed out rather than instructing the user that the Provider is necessarily unconfigured.
- Missing key, invalid URL, explicit unhealthy response, and unsupported Creator model policy remain hard blockers.
- No stale success survives a Provider configuration change.

No renderer contract or secret-bearing field is added.

## Testing

Focused service tests will prove:

1. Two concurrent `getState()` calls issue exactly one physical health check and both receive the same ready result.
2. A successful `getState()` followed by generation within 30 seconds does not issue a second preflight request.
3. Cache expiry triggers a new health check.
4. Provider configuration change invalidates both success reuse and same-key assumptions.
5. A timeout or failed result is not cached as success.
6. The default Creator call passes 10000 ms to the image service.
7. A stalled image service still returns bounded `health_check_timeout` through the outer watchdog.
8. Existing Provider, Creator workflow, syntax/type/build, and Control Center regressions remain green.

No real Provider request or image generation is required for this coordination fix.

## Out Of Scope

- Changing real image generation deadlines or retry policy.
- Treating an old persisted model catalog as proof of current network reachability.
- Persisting health cache state across application restarts.
- Changing AI settings connection-test behavior.
