# Plugin Service Process Tree Hardening Design

> Date: 2026-06-17
> Phase target: Phase 72

## Goal

Phase 72 strengthens the host cleanup path for declaration-only plugin `entries.services` when the existing process-group signal path is unavailable or unsupported.

OpenPet already does three useful things for service entries:

- it starts services as detached process-group roots where supported;
- it keeps stop state at `stopping` until exit confirmation arrives;
- it escalates stubborn services from `SIGTERM` to one bounded `SIGKILL` attempt.

The remaining gap is narrower: when process-group signalling fails, OpenPet currently falls straight back to `child.kill(signal)`. That keeps stop intent visible, but it throws away the chance to clean up known descendants through a stronger host-owned tree path.

## Current State

Today `PluginService` stop logic is:

1. try `process.kill(-pid, signal)` for the service process group;
2. if that throws, fall back to `runtime.child.kill(signal)`.

That is still a useful baseline, but it leaves two holes:

- platforms or runtimes that do not honor negative-PID signalling do not get any descendant-aware cleanup attempt;
- docs still have to describe hard process-tree cleanup as entirely future work even though the host can close part of that gap without changing renderer contracts.

## Scope

In scope:

- add a small host-owned process-tree helper for service cleanup;
- use it only when the process-group signal path fails;
- support deterministic unit tests for the helper and the `PluginService` stop/force-stop fallback path;
- keep setup and declaration-command cleanup out of scope;
- keep runtime state and logs conservative;
- update phase/review/live docs to describe the stronger but still non-absolute cleanup truth.

Out of scope:

- no new renderer UI or new runtime status enum;
- no plugin manifest changes;
- no generic shell/process management API;
- no repeated retry ladder beyond the existing bounded force-stop path;
- no claim that OpenPet can prove every descendant died on every OS.

## Design

### Decision 1: keep tree cleanup behind a host helper

- Problem: descendant-aware cleanup logic does not belong inline inside `PluginService`.
- Choice: move OS-specific process-tree logic into a focused service helper module.
- Reason: `PluginService` should remain the owner of lifecycle state, not process-table parsing details.

### Decision 2: only run tree cleanup after process-group failure

- Problem: OpenPet already has a reasonable first stop path on POSIX-capable platforms.
- Choice: keep `process.kill(-pid, signal)` first, then try host tree cleanup, then finally direct child kill.
- Reason: this preserves the tested service contract and limits new behavior to the unsupported/failure branch.

### Decision 3: keep the stronger path honest, not absolute

- Problem: one extra host fallback could tempt the docs to overclaim universal cleanup.
- Choice: describe the new behavior as descendant-aware fallback cleanup, not guaranteed hard termination.
- Reason: Windows task trees, POSIX descendant enumeration, and raced child spawning all remain operationally best-effort.

## Helper Contract

The helper should expose one narrow function:

```js
signalServiceProcessTree(pid, signal)
```

Expected behavior:

- return `false` for invalid or missing PIDs;
- on Windows, invoke `taskkill` for the target PID tree;
- on POSIX-like systems, inspect `ps` output, gather descendants recursively, then signal descendants before the root PID;
- throw if the OS-specific tree operation cannot run so `PluginService` can fall back to `child.kill(signal)`.

The helper should stay internal to the main process service layer.

## PluginService Integration

`PluginService` should own three service stop tiers:

1. process-group signal first;
2. process-tree helper second;
3. direct child kill last.

This ordering should apply to both:

- graceful stop (`SIGTERM`);
- bounded force stop (`SIGKILL`).

No renderer contract changes are required. Existing logs such as `Service stop requested`, `Service stop grace period expired; force stop requested`, `Service stopped`, and `Service exited after force stop` stay valid.

## Testing Strategy

Required coverage:

1. helper signals POSIX descendants before the root PID;
2. helper uses `taskkill` for Windows process trees;
3. `PluginService` uses the tree helper when process-group `SIGTERM` fails;
4. `PluginService` uses the tree helper when process-group `SIGKILL` fails during bounded force stop;
5. `PluginService` still falls back to direct child kill when both process-group and tree cleanup fail.

This phase does not need a real OS smoke run. Deterministic helper tests are enough for the in-repo contract, as long as the docs stay conservative.

## Acceptance

Phase 72 is complete when:

- service stop still prefers process-group signalling;
- service stop now has a host-owned descendant-aware fallback before direct child kill;
- the same fallback path is used for bounded force-stop escalation;
- helper and service tests cover the new fallback order;
- docs describe the stronger cleanup path without upgrading support claims to universal hard guarantees.
