# IM Gateway Telegram Ergonomics Design

> Date: 2026-07-09
> Branch: `dev9`
> Status: drafted for user review
> Scope: Telegram onboarding and diagnostics ergonomics for the bundled `openpet.im-gateway` plugin

## 1. Purpose

OpenPet already has a working Telegram-first IM Gateway plugin path:

- the IM transport stays inside the bundled `openpet.im-gateway` plugin;
- Telegram secrets remain host-owned;
- `/openpet` commands and optional AI routing already operate through plugin-service boundaries.

The next milestone should improve setup usability without changing that architecture.

The goal is to let a user self-discover the correct Telegram identity and chat identifiers, and to understand the most common setup failures, before broadening IM scope to QQ or WeChat.

## 2. Milestone Contract

### 2.1 Milestone

`IM Gateway Telegram 接入易用性收口`

### 2.2 Goal

Close the first-use Telegram setup loop while keeping IM integration plugin-local and secrets host-owned.

### 2.3 P0/P1 scope

This milestone includes only:

- `/openpet whoami`
- `/openpet chatid`
- a narrow pre-allowlist exception for those two commands only
- redacted allowlist-miss diagnostics
- redacted Telegram startup diagnostics for missing token and polling/start failures
- clearer IM Gateway onboarding and empty-state guidance inside the Plugins pane
- targeted tests, README updates, spec, and implementation plan

### 2.4 Out of scope

This milestone does not include:

- QQ runtime work
- WeChat runtime work
- generic IM diagnostics framework work
- media, sticker, voice, or image understanding
- broader AI behavior changes
- moving Telegram into the OpenPet main process as a platform feature

### 2.5 Manual-required

These items remain outside code-only acceptance:

- real Telegram bot token validation
- real private-chat and group-chat operator testing
- reproducing real-world Telegram polling conflicts against live infrastructure

The code should still provide concrete validation entry points for those checks.

## 3. Confirmed Product Decisions

- The work remains a core bundled plugin improvement, not a new main-process subsystem.
- This milestone targets Telegram only.
- Helper delivery is `Telegram commands + Control Center diagnostics`.
- Command shape is:
  - `/openpet whoami`
  - `/openpet chatid`
- `whoami` and `chatid` work even when the current sender or chat does not yet pass the normal allowlist.
- That exception applies only to those two commands.
- Raw bot/chat/user identifiers may appear in Telegram chat replies from those helper commands.
- Raw identifiers must not appear in Control Center, plugin health summaries, or plugin logs.

## 4. Why This Milestone Exists

The existing Phase 1 and Phase 2 IM Gateway work assumes operators already know the identifiers needed for `allowedUsers` and `allowedChats`, and can distinguish between:

- token missing
- allowlist mismatch
- service not started
- polling/startup conflict

In practice, those are the first blockers users hit. If OpenPet does not make those states legible, adding more IM platforms would widen confusion instead of widening useful capability.

This milestone therefore focuses on operator clarity rather than protocol expansion.

## 5. Architecture

### 5.1 Boundary choice

Keep all IM-specific behavior inside the bundled plugin and reuse the existing host/plugin boundary:

- host owns secrets, service lifecycle, health polling, and Control Center surfaces
- plugin owns Telegram command parsing, Telegram reply delivery, allowlist policy application, and redacted health data

No new generic IM host subsystem is introduced.

### 5.2 Command parsing

Extend `examples/plugins/im-gateway/service/core/commands.js` so `whoami` and `chatid` are first-class recognized `/openpet` subcommands, alongside:

- `say`
- `action`
- `event`
- `status`

This keeps onboarding commands inside the existing IM Gateway command vocabulary.

### 5.3 Allowlist exception routing

The allowlist rule engine should stay pure.

`examples/plugins/im-gateway/service/core/allowlist.js` should continue to answer only whether a message is allowed under the configured private/group rules.

The special-case behavior belongs in `examples/plugins/im-gateway/service/core/gateway.js`:

1. mark the incoming message
2. parse `/openpet` command if present
3. if the command is `whoami` or `chatid`, handle it immediately and stop
4. otherwise run the normal allowlist gate
5. continue existing command / `pet.say` / AI routing

This keeps the exception narrow and prevents policy creep inside `allowlist.js`.

### 5.4 Helper replies

`/openpet whoami` should reply with the minimum operator-facing identity needed to configure allowlists, for example:

- current Telegram user id
- current Telegram username when available

`/openpet chatid` should reply with the minimum current-chat context needed for setup, for example:

- current chat type
- current chat id

The exact wording can stay concise, but the replies should be explicit enough that an operator can copy values into OpenPet config without extra interpretation.

### 5.5 Diagnostics shape

This milestone should not introduce a new generic diagnostics API.

Instead, the plugin health state should grow a few bounded, non-secret diagnostics fields such as:

- `lastAllowlistReason`
- `lastDiagnosticCode`
- `lastDiagnosticAt`

And Telegram adapter startup status should expose stable error codes such as:

- `missing-token`
- `telegram-polling-conflict`
- `telegram-polling-failed`

These fields should store short codes and timestamps only, never raw message text, raw ids, or token material.

### 5.6 Host health summary behavior

The IM Gateway service already exposes `/health`, and the host already polls plugin service health.

This milestone should keep the `/health` endpoint but allow the host to extract a narrow IM Gateway summary from the JSON body, similar in spirit to the existing special health summarization path for Agent Awareness.

The host-facing summary should translate plugin diagnostics into short operator text such as:

- `Telegram token missing`
- `Telegram polling conflict`
- `Recent Telegram message blocked by allowlist`

The Control Center renderer should receive only those safe summaries and the existing service-health envelope.

### 5.7 Logging and privacy

Raw Telegram values are allowed only in direct Telegram helper replies.

They must not be written into:

- plugin logs
- service health summaries
- Control Center visible health messages
- stored plugin config

Existing redaction behavior for chat/user hashes remains the default for health surfaces.

## 6. Control Center Experience

The IM Gateway card in `src/control-center/src/panes/PluginsPane.tsx` should give the operator a next-step ladder rather than a static config block.

Expected guidance states:

1. **Token missing**
   - explain that Telegram bot token must be saved first

2. **Native execution not approved**
   - explain that Setup / Service controls remain blocked until approval

3. **Service not running**
   - explain that the IM Gateway service must be started after token save and approval

4. **Service running with no recent identifiers**
   - prompt the operator to send:
     - `/openpet whoami`
     - `/openpet chatid`

5. **Recent diagnostics present**
   - show safe operator guidance based on summarized health codes

This should improve usability without surfacing raw ids in the renderer.

## 7. Testing Plan

### 7.1 IM Gateway unit and integration coverage

Extend `tests/examples/im-gateway-plugin.test.js` to cover:

- command parsing for `whoami` and `chatid`
- helper-command replies when allowlist does not pass
- continued rejection of other commands and free text when allowlist does not pass
- raw ids present in Telegram helper replies
- raw ids absent from gateway health JSON
- allowlist diagnostics represented as safe codes
- Telegram startup diagnostics represented as stable codes

### 7.2 Host health summary coverage

Extend `tests/services/plugin-service.test.js` to cover:

- IM Gateway `/health` body summarization into safe `runtime.health.message`
- absence of raw ids or token text in host-visible summaries
- unchanged behavior for non-IM-Gateway plugin health summarization

### 7.3 Control Center demo and UI coverage

Extend:

- `tests/control-center/demo-control-center-api.test.js`
- `tests/control-center/control-center-smoke.spec.js`

to cover:

- IM Gateway onboarding states when token is missing
- guidance when the service is not running
- guidance to use `/openpet whoami` and `/openpet chatid`
- display of redacted diagnostics without raw Telegram identifiers

### 7.4 Manual validation entry points

Document a manual operator check for:

- private chat helper use
- group chat helper use
- allowlist mismatch hint
- missing-token hint
- polling/startup-failure hint

Manual validation remains advisory and is not required for local code-only completion.

## 8. Implementation Phases

This milestone should stay within three phases.

### Phase 1

`Command exception and diagnostics core`

- add helper commands
- add gateway exception flow
- add bounded plugin diagnostics
- add core tests

### Phase 2

`Control Center onboarding and health summaries`

- add host summary path for IM Gateway health
- improve Plugins Pane onboarding states
- add demo and UI coverage

### Phase 3

`Docs, verification, and merge-readiness`

- update README
- update `docs/TODO.md` only if milestone completion changes the active queue wording
- run milestone-scoped verification
- run production-style review
- prepare implementation summary

## 9. Acceptance Criteria

The milestone is accepted when all of the following are true:

1. `/openpet whoami` is implemented.
2. `/openpet chatid` is implemented.
3. Those two commands work even before normal allowlist success.
4. Other commands and non-command traffic still respect the existing allowlist boundary.
5. Telegram helper replies can include raw identifiers in chat.
6. Control Center, plugin health, and plugin logs do not expose those raw identifiers or secrets.
7. Plugins Pane gives the operator concrete next steps for Telegram setup.
8. Relevant Node and Control Center tests pass.
9. README documents the helper commands and privacy boundary accurately.

## 10. Risks and Mitigations

### Risk: accidental privacy regression

Mitigation:

- keep raw identifiers inside direct Telegram replies only
- assert against raw ids in serialized health output
- assert against raw ids in host-visible health summaries

### Risk: allowlist exception widens too far

Mitigation:

- keep exception handling in `gateway.js`
- hardcode it to `whoami` and `chatid` only
- preserve `allowlist.js` as a pure rules module

### Risk: diagnostics become a framework project

Mitigation:

- reuse existing `/health` path
- add only bounded IM Gateway summary logic
- defer generic diagnostics abstractions

## 11. Backlog After This Milestone

Not part of this implementation plan, but still relevant later:

- first real QQ adapter path selection
- first real WeChat adapter path selection
- broader IM onboarding docs once more platforms exist
- richer generalized diagnostics only if multiple plugins need the same abstraction
