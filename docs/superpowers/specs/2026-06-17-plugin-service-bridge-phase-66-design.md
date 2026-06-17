# Plugin Service Bridge Phase 66 Design

> Date: 2026-06-17
> Phase target: Phase 66

## Goal

Phase 66 gives explicitly started declaration-only plugin services the same narrow pet-aware bridge that Phase 64 added for declaration-only commands.

This is a capability-downshift phase for third-party authors: a service that watches local weather, schedules reminders, or reacts to external state should be able to speak through the pet, trigger pet actions, emit pet events, and read bounded context without needing the legacy JavaScript SDK path.

## Current State

OpenPet already has:

- declaration-only command process execution with JSON stdin context;
- a loopback-only command bridge with `OPENPET_BRIDGE_URL` and `OPENPET_BRIDGE_TOKEN`;
- bridge routes for `GET /context`, `POST /pet/say`, `POST /pet/action`, and `POST /pet/event`;
- permission checks for mutating pet calls;
- service start/stop controls, manual health checks, and exit-confirmed service stop semantics.

The current gap is that `entries.services` can run a long-lived process but cannot interact with the pet except through out-of-band local HTTP or external tricks. That is too limiting for the plugin ecosystem the project is trying to welcome.

## Scope

In scope:

- inject `OPENPET_BRIDGE_URL` and `OPENPET_BRIDGE_TOKEN` into explicitly started `entries.services` processes;
- reuse the existing bridge routes and permission checks;
- keep bridge calls routed through `PetService`;
- keep bridge access tied to a running service runtime and expire it when the service exits, is disabled, or app shutdown cleanup runs;
- log service bridge calls with `service:<serviceId>` command ids;
- update docs and phase records so third-party authors know services can use the bridge.

Out of scope:

- no new bridge routes;
- no file, shell, Electron, renderer, secret, or arbitrary main-process access;
- no service auto-start;
- no background health polling;
- no setup bridge;
- no command orchestration changes;
- no hard descendant-process termination guarantee.

## Design

Phase 66 should turn the command-specific bridge runtime map into a shared plugin entry bridge registry.

Commands and services can both create bridge runtimes:

- command entry id: `announce`
- service entry id: `service:companion`

The URL shape can remain compatible with Phase 64:

```text
http://127.0.0.1:<port>/plugins/bridge/<pluginId>/<entryId>/<runId>
```

For services, `<entryId>` should be `service:<serviceId>`. The bridge server already treats the second path segment as an opaque id, so no public route change is needed.

## Lifecycle

### Service start

`startService(pluginId, serviceId)` should:

1. validate plugin enablement and policy as it does today;
2. resolve the service declaration and cwd as it does today;
3. allocate a bridge run id and token;
4. inject `OPENPET_BRIDGE_URL` and `OPENPET_BRIDGE_TOKEN`;
5. store bridge runtime metadata alongside the service runtime;
6. spawn without shell expansion and without inheriting secrets.

### Service exit

When the child emits `exit`, OpenPet should:

1. update service runtime status using Phase 65 semantics;
2. expire the service bridge runtime;
3. keep logs bounded and token-free.

### Disable and app shutdown

Disable and app shutdown already route through service stop. The bridge runtime must stop authorizing requests as soon as the service runtime leaves `running`, and must be removed when the child exit confirms shutdown.

## Security Boundary

The service bridge is intentionally not a general local API. It remains:

- loopback-only;
- bearer-token gated;
- per-service-run scoped;
- permission checked per route;
- token-free in logs;
- limited to pet mutations and bounded read-only context.

This phase improves author capability without claiming a full process sandbox.

## Testing Strategy

Required coverage:

- service process env includes bridge URL and token;
- service bridge can call `pet.say`, `pet.action`, and `pet.event` through `PetService` when permissions exist;
- service bridge rejects invalid tokens and missing permissions;
- service bridge exposes bounded context;
- service bridge expires after service exit;
- service disable/shutdown stops authorizing bridge calls once runtime is no longer running;
- existing command bridge tests still pass.

## Documentation Impact

Update:

- `docs/plugin-development.md`;
- `docs/plugin-ecosystem-rules.md`;
- `docs/productization-v1.1-todo-design.md`;
- `docs/development-summary.md`;
- `docs/project-status-review.md`;
- `docs/HANDOFF.md`;
- `docs/project-context.json`;
- new phase and review docs.

Docs must make the boundary welcoming but honest: services can build richer third-party pet experiences, but they do not gain unrestricted Node/Electron/main-process access.

## Acceptance

Phase 66 is complete when:

- explicit service starts receive short-lived bridge env vars;
- service bridge calls work while the service is running;
- service bridge calls fail after exit/cleanup;
- permission and token rejection remain enforced;
- docs describe the expanded third-party service capability without overclaiming sandbox strength.
