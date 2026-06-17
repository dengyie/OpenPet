# Plugin Service Periodic Health Policy Design

> Date: 2026-06-17
> Phase target: Phase 71

## Goal

Phase 71 adds an explicit host-managed periodic health policy for declared plugin `entries.services` so OpenPet can keep checking loopback health endpoints for running services without widening plugin runtime authority.

The target outcome is narrow:

- keep service health checks loopback-only;
- keep service auto-start disabled;
- keep periodic checks opt-in and user-visible through Control Center;
- keep policy ownership in OpenPet settings, not in third-party manifests;
- avoid background churn when services are stopped, disabled, blocked, or already mid-check.

## Current State

OpenPet already supports:

- declared service entries in `plugin.json`;
- explicit start/stop for enabled local services;
- manual `Check Health` actions;
- loopback-only HTTP/HTTPS validation;
- runtime health states: `not-configured`, `unknown`, `checking`, `healthy`, `unhealthy`;
- health results visible in Control Center and logs.

Current gaps:

- health checks are one-shot only;
- there is no host-managed policy for recurring checks on long-running services;
- Control Center cannot express whether a service should be rechecked automatically;
- future work is already documented as “background health polling”, but there is no scoped design for it yet.

## Decision Record

### Decision 1: keep periodic health policy out of third-party manifests

- Problem: recurring health checks could be described either by plugin manifests or by host-owned settings.
- Choice: store periodic health policy in OpenPet-managed settings and expose it through Control Center, not in `plugin.json`.
- Reason: whether OpenPet polls a loopback endpoint is operational host behavior, not third-party declared capability. Keeping it host-owned preserves the current trust boundary and avoids implying that plugins can silently opt themselves into background execution policy.
- Risk: plugin authors cannot ship a “recommended interval” in the current phase. This is acceptable because Phase 71 is about host control and safe observability, not author-managed automation.

### Decision 2: periodic checks only run for active running services

- Problem: once a service has a health URL, OpenPet could poll all the time or only while the service is actively running.
- Choice: only schedule periodic checks while the service runtime is `running`.
- Reason: this preserves the existing non-goal that health policy must not auto-start services or simulate liveness for stopped processes.
- Risk: a service that exits unexpectedly will stop being checked after the runtime transitions away from `running`. This is acceptable because runtime exit already changes service state and logs.

### Decision 3: start with one bounded interval policy, not a richer scheduler

- Problem: periodic policy could become a general scheduler with retries, backoff, jitter, and alerting.
- Choice: support one simple interval-based policy with bounded interval values and no retries/backoff in this phase.
- Reason: YAGNI. The project needs observable recurring checks, not a scheduling subsystem.
- Risk: later phases may still want jitter, failure streak handling, or notification hooks. That future work remains compatible with this smaller foundation.

## Scope

In scope:

- host-owned per-service periodic health policy persisted in settings;
- Control Center UI to enable/disable periodic health checks and choose a bounded interval;
- automatic scheduling only for declared services with valid loopback health URLs;
- timer lifecycle tied to service start, stop, disable, shutdown, and policy changes;
- non-overlapping health checks;
- targeted tests, live-doc updates, phase doc, and review doc.

Out of scope:

- service auto-start;
- manifest-level health policy declarations;
- retries, backoff, notifications, or alert delivery;
- polling for setup or declaration-only commands;
- arbitrary remote host health checks;
- bridge expansion;
- stronger process-tree guarantees;
- release-evidence or signing flows.

## Design

### 1. Settings model

OpenPet adds a host-owned plugin service health policy store under plugin settings:

```json
{
  "plugins": {
    "serviceHealthPolicies": {
      "weather-declaration": {
        "companion": {
          "enabled": true,
          "intervalMs": 30000
        }
      }
    }
  }
}
```

Rules:

- missing policy means periodic checks are off;
- only `enabled` and `intervalMs` are stored;
- interval is clamped to a bounded safe range;
- malformed persisted policy is sanitized on read.

### 2. Runtime scheduling

`PluginService` becomes the single owner of periodic health scheduling.

For each service runtime with a declared health URL:

- when the service starts and policy is enabled, schedule the next auto-check;
- when a check fires, run the same loopback-safe health path already used by manual checks;
- if a check is already in progress, skip overlap and schedule the next interval;
- after each auto-check completes, schedule the next one only if the service is still `running` and policy remains enabled;
- when the service stops, exits, is disabled, or the app shuts down, clear the timer immediately;
- when the policy is disabled or interval changes, clear and reschedule consistently.

### 3. Control Center surface

Control Center keeps the existing manual `Check Health` button and adds an explicit periodic policy control for each service entry that has a declared health URL.

The initial UI stays conservative:

- a toggle for periodic health checks;
- a small bounded interval selector, for example `15s`, `30s`, `60s`, `5m`;
- disabled state when the plugin is disabled, blocked, or the service has no health declaration.

This is configuration, so it must remain operable through Control Center per project rules.

### 4. Logging and operator truth

Phase 71 should avoid log spam while keeping operator visibility.

Policy lifecycle logs:

- `Service health policy saved`
- `Service health policy cleared` only if needed for explicit disable/reset

Automatic check logs:

- reuse `Service health healthy` / `Service health unhealthy` outcome logging only when an actual check runs;
- optionally add a source tag in memory/runtime if needed internally, but do not require a larger user-facing log schema in this phase.

### 5. Shared contracts

Shared contracts should add a typed view state for service health policy and attach it to service entries so renderer code can consume it directly.

Representative shape:

```ts
export interface PluginServiceHealthPolicyViewState {
  enabled: boolean
  intervalMs: number
}
```

Each `PluginServiceEntryViewState` should then expose:

```ts
healthPolicy?: PluginServiceHealthPolicyViewState
```

## Acceptance

- A running declared service with a loopback health URL can be configured in Control Center for periodic health checks.
- Periodic health policy is stored in OpenPet settings, not in plugin manifests.
- Periodic checks never auto-start stopped services.
- Periodic checks stop when services stop, plugins disable, or app shutdown cleanup runs.
- Manual health checks still behave as before.
- Tests cover policy persistence, auto-check scheduling, timer cleanup, disabled-policy behavior, and non-overlap.
- Docs describe the new capability without implying broader plugin network authority or background execution trust.
