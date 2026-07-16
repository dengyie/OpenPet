# IM Gateway Telegram Hardening Design

> Date: 2026-07-16
> Status: Implemented and non-signing verified on `dev9`
> Scope: Telegram code closure and simulated protocol verification only

## 1. Goal

Finish the Telegram-first IM Gateway path so OpenPet can be configured, started,
diagnosed, and exercised reliably without a real Telegram account during normal
development.

This milestone closes the remaining gaps around:

- Telegram readiness and service-health semantics;
- bounded, redacted operator logs;
- conservative AI request rate limiting;
- deterministic simulated Telegram protocol coverage;
- accurate active TODO and operator documentation;
- compatibility with the latest host-owned Provider runtime on `main`.

## 2. Non-Goals

This milestone does not implement or validate:

- a real Telegram Bot Token end-to-end session;
- Telegram webhook mode;
- QQ, OneBot, official QQ Bot, WeChat, WeCom, or personal-client bridges;
- signing, notarization, release packaging, or signed-runtime evidence;
- a generic third-party IM adapter framework;
- renderer or plugin access to provider credentials.

## 3. Existing Architecture

The current architecture remains unchanged:

```text
Telegram adapter
  -> plugin-local allowlist and routing
  -> permission-gated service bridge
  -> host AiTalkService or PetService
```

The bundled `openpet.im-gateway` plugin owns Telegram transport, message
normalization, allowlist policy, command parsing, reply delivery, backpressure,
and redacted adapter diagnostics.

The OpenPet host owns:

- the Telegram Bot Token through `SecretService`;
- provider settings and API keys;
- AI conversations, persona, memory, and traces through `AiTalkService`;
- pet state mutations through `PetService`;
- plugin process lifecycle and operator-facing service health.

No Telegram or Provider SDK moves into the renderer. The plugin receives the
Telegram token only in its service-process environment, and it never receives
provider credentials.

## 4. Telegram Runtime State

OpenPet must distinguish process state from Telegram readiness.

- `runtime.status` describes the plugin service process: starting, running,
  stopping, stopped, or failed.
- `runtime.health.status` describes whether the configured Telegram path is
  ready to perform its job.

The IM Gateway health body remains HTTP 200 while the process can answer health
requests. The host interprets the bounded adapter state in that body:

| Telegram configuration/state | Process state | Health state | Operator meaning |
| --- | --- | --- | --- |
| Telegram disabled | running | healthy | Service is available; Telegram is intentionally disabled |
| Enabled and connected | running | healthy | Telegram polling is ready |
| Enabled without token | running | unhealthy | Save a Bot Token before expecting Telegram traffic |
| Polling conflict | running | unhealthy | Another poller is using the same bot |
| Authentication/start failure | running | unhealthy | Telegram could not become ready |
| Recent allowlist miss | running | healthy | Telegram is ready; a recent message was rejected by policy |
| Health endpoint timeout/non-2xx | running or failed | unhealthy | The service cannot currently be inspected |

Stable adapter error codes, not free-form external errors, control readiness.
Unknown adapter failures map to a bounded generic failure summary.

## 5. Logging And Privacy

Health logs use the same process/readiness distinction:

- connected or intentionally disabled: `info`;
- allowlist and policy diagnostics: `warn`;
- missing token, polling conflict, startup failure, timeout, and non-2xx: `error`.

Examples:

```text
Service health healthy: Telegram connected
IM Gateway diagnostic: Recent Telegram message blocked by allowlist
Service health unhealthy: Telegram polling conflict
```

Operator-facing health, logs, and renderer state must not contain:

- Bot Tokens or provider credentials;
- raw Telegram message text;
- raw chat ids, user ids, usernames, or message ids;
- Telegram API response bodies or stack traces;
- unbounded exception messages.

Allowed values are stable status/error codes, bounded summaries, timestamps,
counters, and existing hashed peer identifiers.

## 6. AI Request Rate Limiting

The existing per-conversation queue remains in place:

- one running AI request;
- one queued follow-up;
- additional concurrent messages are dropped.

A plugin-local sliding-window limiter is added before enqueueing AI work:

- private conversation: 6 accepted AI requests per 30 seconds;
- group conversation/user pair: 3 accepted AI requests per 30 seconds;
- the conversation key already includes platform, chat type, chat id, and user
  id, preventing unrelated peers from sharing a quota;
- command handling and `pet-say` routing do not consume AI quota;
- the limiter clock and policy are injectable for deterministic tests;
- expired entries are pruned, and tracked keys are capped to prevent unbounded
  memory growth.

When the limit is exceeded:

- private chats receive a short retry-later notice;
- group chats remain silent;
- health records `lastAiErrorCode = "ai-rate-limited"` and increments a bounded
  rate-limit counter;
- logs and health never include the raw conversation key.

The fixed limits remain internal for this milestone. Adding user-configurable
rate controls would enlarge the configuration and migration surface without
being needed to prove the Telegram flow.

## 7. Configuration And Onboarding

The existing Plugins-pane IM Gateway card remains the only configuration
surface. No new page is introduced.

The onboarding ladder is:

1. enable the bundled IM Gateway plugin;
2. save the Telegram Bot Token through the host-owned secret control;
3. approve native execution;
4. start the IM Gateway service;
5. inspect Telegram readiness and bounded diagnostics;
6. use `/openpet whoami` and `/openpet chatid` in a future real session;
7. save `allowedUsers` and `allowedChats`;
8. select private text mode and optionally enable direct-mention group AI.

Control Center messaging must not describe a running process as a working
Telegram connection when readiness is unhealthy.

## 8. Simulated Protocol Tests

No live Telegram credentials are required. Tests use fake adapters, fake grammY
bot factories, deterministic clocks, and mocked host bridge calls.

Required coverage:

### Telegram Adapter

- disabled state without Telegram enablement;
- enabled state with missing token;
- simulated polling startup success;
- polling conflict classification;
- authentication/start failure classification;
- stop and restart state cleanup;
- no token or external error body in health output.

### Gateway Routing

- helper commands before allowlist configuration;
- private and group allowlist behavior;
- command priority over AI routing;
- private `command-only`, `pet-say`, and `ai-chat` modes;
- direct-mention-only group AI;
- one-running plus one-queued backpressure;
- private and group rate-limit behavior;
- bounded private failure/busy/rate-limit notices;
- silent group failure/drop behavior;
- reply-send failure diagnostics.

### Host Integration

- token storage and service-only environment injection;
- `ai:chat` permission enforcement;
- conversation isolation through host-owned `AiTalkService`;
- HTTP liveness plus adapter-readiness health mapping;
- bounded log level and summary mapping;
- raw identifier and token redaction;
- compatibility with host-owned Provider selection and request ids.

### Control Center

- token missing, native approval missing, stopped, running/ready, and
  running/unhealthy onboarding states;
- config persistence for private and group routing policy;
- warning and error log rendering after rebasing the latest `main` log-level
  changes;
- no secret value returned to renderer fixtures.

## 9. Documentation And Integration

`docs/TODO.md` must stop describing the existing Telegram AI bridge as wholly
unimplemented. It should record the core Phase 2 path as complete and retain
only honest follow-ups such as real-account smoke validation.

Implementation stays on `dev9`. Before integration, rebase `dev9` onto the
latest local `main`, resolve conflicts in this worktree, and rerun the complete
non-signing verification set.

## 10. Verification And Review

The completion gate is:

- focused failing tests exist before each behavior fix;
- all IM Gateway, AI Talk, PluginService, secret, and Control Center Node tests
  pass;
- IM Gateway Control Center Playwright coverage passes;
- `npm run check:syntax` passes;
- `npm run test:core:all` passes unless an unrelated pre-existing failure is
  documented with evidence;
- `git diff --check` passes;
- no signing, notarization, or live Telegram tests are required;
- a final deep production review finds no unresolved P0/P1 issue and records
  any non-blocking follow-up in `docs/TODO.md`.

## 11. Acceptance Criteria

The milestone is complete when:

1. OpenPet separately reports IM Gateway process state and Telegram readiness.
2. Missing-token and polling failures cannot be logged as healthy Telegram
   operation.
3. Telegram AI requests have bounded queueing, rate, input, reply, and tracking
   memory behavior.
4. Configuration and diagnostics remain usable without exposing secrets or raw
   Telegram identifiers.
5. The complete Telegram flow is proven through simulated protocol and host
   integration tests.
6. The branch is rebased onto the latest `main` and passes the non-signing
   verification and deep-review gates.

## 12. Implementation Record

The implementation keeps the plugin Telegram-only and removes the unused
OneBot, Weixin, legacy private-policy, and trigger-policy shells. It also adds:

- host rejection and Control Center locking for runtime token/config changes;
- pseudonymous Telegram conversation keys and host-owned bridge metadata;
- grammY `onStart` readiness, structured host health interpretation, and
  bounded operator log messages;
- non-blocking tracked Telegram handler tasks, a grammY error guard, and
  AbortController-backed 45-second bridge timeouts;
- fixed 6/30s private and 3/30s group AI ingress limits with bounded key state;
- a 500-entry non-main AI conversation cap with message cleanup and session
  reference repair.

No live Telegram credential, webhook, QQ, WeChat, signing, notarization, or
release-packaging validation was added. A real-account Telegram smoke remains
the explicit manual follow-up.
