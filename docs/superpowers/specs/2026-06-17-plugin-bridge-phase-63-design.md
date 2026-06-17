# Plugin Bridge Phase 63 Design

> Date: 2026-06-17
> Phase target: Phase 63

## Goal

Phase 63 adds the first runtime-backed extension bridge for declaration-only local command entries so third-party authors can make the pet speak, play actions, set short-lived status events, and read a small non-sensitive pet context without depending on the legacy JavaScript SDK runner.

This phase is the first bridge slice for the more welcoming extension ecosystem described in `docs/plugin-development.md` and `docs/plugin-ecosystem-rules.md`. It is intentionally small, explicit, and observable.

## Current State

OpenPet already has three adjacent capabilities:

- `PetService` is the single source of truth for `say`, `playAction`, and `setEvent`.
- `local-http-service.js` already exposes token-gated loopback HTTP endpoints for `/api/pet/say`, `/api/pet/action`, and `/api/pet/event`.
- `PluginService.runCommand()` can run declaration-only local `entries.commands` as short-lived child processes with stdin JSON context, plugin-local cwd guards, no shell expansion, timeout handling, and log capture.

What is missing is a plugin-scoped bridge for those declaration-only command processes. Today they can receive stdin JSON and print JSON results, but they cannot trigger pet state changes unless authors fall back to the legacy JavaScript compatibility path.

## Scope

In scope:

- Add an optional plugin-scoped bridge for explicit local `entries.commands` process runs.
- Inject a short-lived loopback bridge URL and bridge token into declaration-only command processes.
- Add bridge endpoints for:
  - `POST /pet/say`
  - `POST /pet/action`
  - `POST /pet/event`
  - `GET /context`
- Keep bridge execution owned by `PluginService`, with all pet mutations forwarded through `PetService`.
- Record bridge requests in plugin logs so users can understand what a command tried to do.
- Extend command result UX/contracts only where needed to surface bridge-backed actions clearly.
- Add tests and live docs for the new boundary.

Out of scope:

- No install-time, update-time, enable-time, setup-time, service-start-time, or background bridge execution.
- No renderer bridge, Electron object exposure, Node object exposure, or direct main-process object sharing.
- No API key exposure to plugins.
- No arbitrary file editing bridge.
- No action-config editing, sprite generation, action asset import, or personality writing APIs in this phase.
- No long-lived bridge sessions for services yet.
- No complete sandbox claim or hard security boundary beyond the existing local-process model.

## Design Overview

When `PluginService.runCommand()` chooses the declaration-only process path, it should create a short-lived in-memory bridge capability bound to that exact command run:

1. Generate a random bridge token for the command run.
2. Register an in-memory bridge runtime keyed by `{ pluginId, commandId, runId }`.
3. Expose `OPENPET_BRIDGE_URL` and `OPENPET_BRIDGE_TOKEN` in the child process environment.
4. Accept only loopback HTTP requests with the exact token and while the command run is still active.
5. Forward accepted bridge calls into `PetService`.
6. Remove the bridge runtime when the command exits, times out, or is stopped because the plugin is disabled or the app quits.

This keeps the bridge:

- explicit;
- short-lived;
- scoped to one command run;
- independent from renderer code;
- and compatible with non-JavaScript extension authors.

## Bridge Surface

### `POST /pet/say`

Request body:

```json
{
  "text": "今天上海有雨，带伞。",
  "ttlMs": 6000
}
```

Behavior:

- requires the plugin manifest to declare `pet:say`;
- calls `petService.say({ text, ttlMs, source: "plugin:<pluginId>:bridge" })`;
- returns `{ ok: true, result }`.

### `POST /pet/action`

Request body:

```json
{
  "actionId": "umbrella"
}
```

Behavior:

- requires `pet:action`;
- validates the action through existing `PetService.playAction()` behavior;
- returns `{ ok: true, result }`.

### `POST /pet/event`

Request body:

```json
{
  "type": "weather",
  "message": "小雨转阴",
  "ttlMs": 10000
}
```

Behavior:

- requires `pet:event`;
- calls `petService.setEvent({ type, message, ttlMs, source: "plugin:<pluginId>:bridge" })`;
- returns `{ ok: true, result }`.

### `GET /context`

Response body:

```json
{
  "ok": true,
  "context": {
    "petName": "OpenPet",
    "selectedPetId": "doro",
    "currentActionId": "idle",
    "personality": {
      "tone": "friendly",
      "tags": ["companion", "playful"]
    }
  }
}
```

Behavior:

- no mutation;
- no plugin permission required beyond the command already being allowed to run;
- returns a small read-only context assembled from current app state.

The context must stay deliberately small and non-sensitive. It should not include:

- API keys;
- AI provider secrets;
- full settings dumps;
- renderer-only state;
- file-system secrets;
- third-party account tokens.

## Context Model

Phase 63 needs a small helper in the main process to compute bridge context from current app state. The bridge context should be shaped for plugin ergonomics, not as a raw dump of `settingsService.get()`.

The first version should expose:

- `petName`: current configured pet display name, or a stable default if unset;
- `selectedPetId`: current pet pack / selected pet identifier when available;
- `currentActionId`: current default or currently selected action id when it can be read reliably;
- `personality.tone`: a simple friendly/default tone string derived from existing AI/pet settings when possible;
- `personality.tags`: a short list of stable, non-sensitive personality tags.

If some fields are not available from current settings without inventing new persistence, OpenPet should return empty-string / empty-array defaults rather than fabricate richer personality state.

This is intentionally labeled as "basic personality context", not a full personality engine.

## Authorization And Lifetime Rules

Bridge access is allowed only when all of these are true:

- the plugin is local;
- the plugin is enabled;
- the plugin is not policy-blocked;
- the command run is currently active;
- the request presents the exact command-run token;
- the request comes through loopback HTTP;
- the command has the permission needed for the specific mutation route.

When the command exits or is stopped:

- bridge access ends immediately;
- the runtime registration is removed;
- later bridge calls return unauthorized or expired.

OpenPet should not reuse bridge tokens across runs.

## Logging And Observability

Bridge activity should be visible in plugin logs with short bounded messages such as:

- `Bridge context requested`
- `Bridge pet.say invoked`
- `Bridge pet.action invoked: umbrella`
- `Bridge pet.event invoked: weather`
- `Bridge request rejected: missing pet:event permission`
- `Bridge request rejected: token expired`

This gives authors and users enough troubleshooting signal without turning logs into raw payload dumps.

OpenPet should not log full request bodies if they may contain long user-generated text.

## UI And Contract Impact

The bridge is mainly a runtime feature, so Control Center does not need a new tab for this phase.

However, the shared contracts and plugin surfaces should reflect the truth that declaration-only command entries may now receive:

- `OPENPET_BRIDGE_URL`
- `OPENPET_BRIDGE_TOKEN`

and may use bridge-backed pet mutations during explicit runs.

Docs and command result summaries should make that boundary visible. If the current command result UI already has pending work on this branch, Phase 63 should integrate carefully without overwriting unrelated in-progress UX edits.

## Error Handling

Bridge responses should use the same basic JSON envelope style as local HTTP:

```json
{
  "ok": false,
  "error": "Plugin openpet.weather does not have pet:event permission"
}
```

Failure cases that must be covered:

- missing or invalid bearer token;
- expired command run;
- disabled plugin after command start;
- blocked plugin after command start;
- missing permission for the requested route;
- invalid JSON body;
- unknown action id;
- invalid event payload;
- unknown bridge route.

## Testing

Required coverage:

- `tests/services/plugin-service.test.js`
  - declaration-only command receives bridge env vars;
  - bridge runtime is created only for explicit command runs;
  - `pet.say`, `pet.action`, and `pet.event` bridge routes call `PetService`;
  - missing permission rejects the specific route;
  - token mismatch rejects;
  - bridge expires after command exit/timeout/forced stop;
  - context route returns bounded non-sensitive data.
- `tests/services/local-http-service.test.js` or a focused bridge test file
  - if bridge routing is extracted into a helper, cover the route handler directly.
- `tests/main/ipc-plugin-install.test.js`
  - only if any IPC-visible contract changes are introduced.
- `npm run typecheck`
  - if shared contracts or Control Center API text changes.

Full verification remains:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
```

## Acceptance

- Declaration-only local command entries can use a short-lived loopback bridge during explicit runs.
- The bridge supports `pet.say`, `pet.action`, `pet.event`, and read-only basic personality context.
- All pet mutations still flow through `PetService`.
- The bridge does not expose renderer APIs, Electron APIs, secrets, or install-time execution.
- Logs, tests, docs, and phase records describe the exact supported boundary without overclaiming.

## Phase Notes

This phase is the first practical step toward the broader third-party scenarios the ecosystem docs already invite:

- weather announcers;
- pet action triggers;
- pet dialogue mood changes;
- light personality-aware companions.

Heavier authoring capabilities such as action-list editing, sprite generation, action-config writing, or deep personality injection should be designed as later explicit phases after this minimal bridge proves stable.
