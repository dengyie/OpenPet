# IM Platform Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the bundled `openpet.im-gateway` plugin from its Telegram-first implementation to a shared, platform-neutral gateway with QQ official robot first and WeCom self-built application second, while keeping secrets and lifecycle host-owned.

**Architecture:** The Electron host remains responsible for plugin enablement, native execution approval, secret storage, configuration persistence, and service lifecycle. The bundled plugin owns platform SDK/client code, adapter lifecycle, normalization, trigger policy, receipts, redacted health, and raw-message non-persistence. QQ OneBot is reserved for a later explicitly experimental compatibility layer; personal WeChat automation and Official Account are outside this plan.

**Tech Stack:** Electron main process (CommonJS), bundled Node plugin services, existing `openpet.im-gateway` bridge, React/TypeScript Control Center, Node native test runner, fake HTTP/WebSocket protocol clients, and existing docs drift checks.

## Global Constraints

- Work only in an isolated branch/worktree; rebase onto the latest `main` before integration.
- Do not add or commit the untracked `node_modules` symlink.
- QQ's first real route is the official QQ robot; OneBot is only a future experimental compatibility layer.
- WeChat's first real route is a WeCom self-built application; do not implement personal-client injection or make Official Account the first route.
- Both adapters live only inside bundled `openpet.im-gateway`; the Electron main process must not import platform SDKs.
- Host-managed secrets and lifecycle are mandatory; both routes are disabled by default and require native execution approval before start.
- Never persist raw messages, attachments, platform payloads, tokens, callback secrets, or raw platform identifiers in plugin logs, health, renderer state, or durable conversation data.
- Keep the `PetService` single-source-of-truth boundary and the existing plugin bridge permission model.
- Add no general plugin secret capability, generic IM adapter marketplace, or renderer-facing normalized message contract.
- Automated tests must use fake protocol clients and must not require QQ or WeCom credentials.
- Real QQ/WeCom account smoke is manual evidence only and is not a current development completion gate.
- Agent Awareness remains a Phase B manual acceptance loop; durable rollups are already implemented and Phase C is deferred.
- Trigger editing remains limited to random mode/interval, state predicate/source, event name/source, summary, enable/disable, and delete until a new runtime semantic requires more fields.
- The scoped TypeScript evidence-summary/report tranche is already landed in `20ef3ebf`: the two selected summary scripts use `// @ts-check` and shared contract JSDoc, with `tsconfig` limited to those files. Do not enable global `checkJs` or rewrite the main process.

## File Map

Files changed together by the implementation tasks:

- Modify `examples/plugins/im-gateway/plugin.json`: advertise adapter ids and non-secret capability metadata while preserving disabled-by-default service behavior.
- Modify `examples/plugins/im-gateway/config.schema.json`: add non-secret QQ official and WeCom routing policy fields; never add credentials.
- Modify `examples/plugins/im-gateway/README.md`: document selected routes, setup boundaries, privacy, and the manual smoke boundary.
- Modify `examples/plugins/im-gateway/service/adapters/registry.js`: register adapter factories without platform-specific branching in the gateway core.
- Modify `examples/plugins/im-gateway/service/core/gateway.js`, `normalize-message.js`, `health.js`, and `log-safety.js`: consume the shared adapter contract and preserve redaction.
- Create `examples/plugins/im-gateway/service/adapters/qq-official.js`: official QQ robot transport and update/receipt mapping.
- Create `examples/plugins/im-gateway/service/adapters/wecom.js`: WeCom self-built application callback/send transport.
- Modify `src/main/services/plugin-service.js`, `src/main/bootstrap/create-plugin-services.js`, and existing plugin IPC/contract files only where the established IM host path needs separate secret/config/lifecycle handling.
- Modify `src/control-center/src/features/plugins/api.ts`, `src/control-center/src/hooks/usePluginsPaneData.ts`, `src/control-center/src/hooks/usePluginsPaneActions.ts`, `src/control-center/src/panes/PluginsPaneTypes.ts`, `src/control-center/src/panes/PluginRow.tsx`, and `src/control-center/src/api/demo-control-center-api.ts`: expose saved-state, non-secret config, capability notes, and service controls for each selected adapter.
- Create `tests/examples/im-gateway-qq-official.test.js` and `tests/examples/im-gateway-wecom.test.js`: deterministic protocol and redaction tests.
- Modify `tests/examples/im-gateway-plugin.test.js`, `tests/services/plugin-service.test.js`, `tests/main/ipc-plugin-install.test.js`, and the existing Control Center smoke spec for shared registration, host secret isolation, disabled defaults, native approval, and UI behavior.
- The selected evidence-summary scripts and their scoped TypeScript/JSDoc boundary are already landed in `20ef3ebf`; do not reopen this tranche or invent a separate `scripts/evidence-summary/` type module.

## Shared Interfaces

Every platform adapter must satisfy the same plugin-local contract:

```js
createAdapter({ config, secrets, bridge, httpClient, websocketFactory, clock }) => {
  start(): Promise<void>
  stop(): Promise<void>
  sendReceipt(receipt): Promise<void>
  health(): RedactedAdapterHealth
  handleUpdate(update): Promise<void>
}
```

`handleUpdate()` may create only this private normalized message shape before calling the existing gateway:

```js
{
  platform: 'qq-official' | 'wecom',
  adapterId: 'qq-official' | 'wecom',
  chatType: 'private' | 'group',
  chatId: 'opaque-local-value',
  userId: 'opaque-local-value',
  text: 'message text held only in memory',
  isCommand: false,
  isMention: false,
  receivedAt: 'ISO-8601 timestamp'
}
```

`health()` returns only `enabled`, `status`, `mode`, bounded timestamps/counters, and stable `lastErrorCode`; it never returns a token, raw payload, raw message, or raw platform identifier.

### Task 1: Remove Telegram-Specific Assumptions From Shared Gateway

**Files:**
- Modify: `examples/plugins/im-gateway/service/adapters/registry.js`
- Modify: `examples/plugins/im-gateway/service/core/gateway.js`
- Modify: `examples/plugins/im-gateway/service/core/normalize-message.js`
- Modify: `examples/plugins/im-gateway/service/health.js`
- Modify: `examples/plugins/im-gateway/service/log-safety.js`
- Modify: `examples/plugins/im-gateway/config.schema.json`
- Modify: `examples/plugins/im-gateway/plugin.json`
- Test: `tests/examples/im-gateway-plugin.test.js`

**Interfaces:**
- Consumes: existing Telegram adapter factory and bridge client.
- Produces: `createAdapter()` registration keyed by adapter id; a platform-neutral `createGateway({ adapters, bridge, config })`; redacted health keyed by adapter id.

- [ ] **Step 1: Capture the current contract in a failing regression.** Add tests that register a fake adapter under `qq-official`, route one normalized message through the gateway, and assert the gateway does not read `telegramEnabled` or `OPENPET_IM_TELEGRAM_BOT_TOKEN` for that adapter.
- [ ] **Step 2: Run the focused test to verify the regression fails.**

Run: `node --test tests/examples/im-gateway-plugin.test.js`

Expected: the new adapter-neutral test fails because the registry and config path currently only describe Telegram.

- [ ] **Step 3: Implement the smallest shared boundary.** Make the registry accept adapter factories, make gateway dispatch by adapter id, and keep each credential lookup inside the adapter factory. Add `qqEnabled` and `wecomEnabled` defaults set to `false`; do not add secret-shaped schema properties.
- [ ] **Step 4: Verify shared behavior and redaction.**

Run: `node --test tests/examples/im-gateway-plugin.test.js tests/plugins/manifest.test.js`

Expected: all focused tests pass and manifest validation still accepts the bundled plugin.

- [ ] **Step 5: Commit the independently reviewable boundary.**

```bash
git add examples/plugins/im-gateway tests/examples/im-gateway-plugin.test.js
git commit -m "refactor(im-gateway): make adapter registry platform neutral"
```

### Task 2: Add QQ Official Robot Adapter And Host-Owned Configuration

**Files:**
- Create: `examples/plugins/im-gateway/service/adapters/qq-official.js`
- Modify: `examples/plugins/im-gateway/service/adapters/registry.js`
- Modify: `examples/plugins/im-gateway/service/core/gateway.js`
- Modify: `examples/plugins/im-gateway/config.schema.json`
- Modify: `examples/plugins/im-gateway/plugin.json`
- Modify: `examples/plugins/im-gateway/README.md`
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/main/bootstrap/create-plugin-services.js`
- Modify: `src/main/ipc/register-plugin-ipc.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/features/plugins/api.ts`
- Modify: `src/control-center/src/hooks/usePluginsPaneData.ts`
- Modify: `src/control-center/src/hooks/usePluginsPaneActions.ts`
- Modify: `src/control-center/src/panes/PluginsPaneTypes.ts`
- Modify: `src/control-center/src/panes/PluginRow.tsx`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Test: `tests/examples/im-gateway-qq-official.test.js`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/main/ipc-plugin-install.test.js`
- Test: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Consumes: Task 1's adapter registry and existing host plugin lifecycle.
- Produces: `createQqOfficialAdapter({ config, secrets, bridge, websocketFactory, clock })`, separate host secret refs `im.qq.appId` and `im.qq.clientSecret`, and renderer-safe `hasQqOfficialCredentials` state.

- [ ] **Step 1: Write failing adapter and host-isolation tests.** Cover official QQ authentication setup, private/group normalization, command receipt, disabled default, native approval requirement, and the invariant that QQ credentials are absent from plugin config, health, logs, and renderer payloads. Add a test that a future OneBot id is rejected by the selected official route.
- [ ] **Step 2: Run the QQ tests and verify failure.**

Run: `node --test tests/examples/im-gateway-qq-official.test.js tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js`

Expected: the new factory, secret state, and adapter behavior are missing.

- [ ] **Step 3: Implement official QQ transport inside the plugin.** Use the official robot transport boundary selected for the supported API (WebSocket/event ingress plus HTTPS send calls where required), map only bounded fields into the private normalized message, use `pet:say`/`pet:action`/`pet:event` through the existing bridge, and emit stable redacted error codes. Do not add OneBot fallback behavior.
- [ ] **Step 4: Implement host secret/config/UI wiring.** Persist only `im.qq.appId` and `im.qq.clientSecret` through the existing host secret service, inject them only when `openpet.im-gateway` starts, expose saved-state booleans only, add non-secret allowlist/policy fields to the plugin schema, and keep the adapter disabled until enablement and native approval are both true.
- [ ] **Step 5: Run focused verification.**

Run: `node --test tests/examples/im-gateway-qq-official.test.js tests/examples/im-gateway-plugin.test.js tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js`

Expected: all QQ and shared plugin tests pass with no real credentials.

- [ ] **Step 6: Run the Control Center regression.**

Run: `npx playwright test tests/control-center/control-center-smoke.spec.js --grep "IM Gateway|QQ"`

Expected: the Plugins pane shows QQ official robot capability, saved-state-only credentials, disabled-by-default state, and service/native-approval controls without a token value.

- [ ] **Step 7: Commit only the QQ implementation scope.**

```bash
git add examples/plugins/im-gateway src/main src/shared/openpet-contracts.ts src/control-center/src tests/examples/im-gateway-qq-official.test.js tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js tests/control-center/control-center-smoke.spec.js
git commit -m "feat(im-gateway): add official QQ robot adapter"
```

### Task 3: Add WeCom Self-Built Application Adapter And Host-Owned Configuration

**Files:**
- Create: `examples/plugins/im-gateway/service/adapters/wecom.js`
- Modify: `examples/plugins/im-gateway/service/adapters/registry.js`
- Modify: `examples/plugins/im-gateway/service/core/gateway.js`
- Modify: `examples/plugins/im-gateway/config.schema.json`
- Modify: `examples/plugins/im-gateway/plugin.json`
- Modify: `examples/plugins/im-gateway/README.md`
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/main/bootstrap/create-plugin-services.js`
- Modify: `src/main/ipc/register-plugin-ipc.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/features/plugins/api.ts`
- Modify: `src/control-center/src/hooks/usePluginsPaneData.ts`
- Modify: `src/control-center/src/hooks/usePluginsPaneActions.ts`
- Modify: `src/control-center/src/panes/PluginsPaneTypes.ts`
- Modify: `src/control-center/src/panes/PluginRow.tsx`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Test: `tests/examples/im-gateway-wecom.test.js`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/main/ipc-plugin-install.test.js`
- Test: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Consumes: Task 1's adapter registry and Task 2's host lifecycle pattern.
- Produces: `createWecomAdapter({ config, secrets, bridge, httpClient, clock })`, separate host secret refs `im.wecom.corpSecret`, `im.wecom.token`, and `im.wecom.encodingAesKey`, and renderer-safe `hasWecomCredentials` state.

- [ ] **Step 1: Write failing WeCom protocol tests.** Cover callback signature verification, XML/JSON normalization, bounded reply delivery, callback failure codes, disabled default, native approval, and the invariant that raw callback bodies and credentials never reach health/logs/renderer state.
- [ ] **Step 2: Run the focused test to verify failure.**

Run: `node --test tests/examples/im-gateway-wecom.test.js`

Expected: the WeCom factory and callback/send implementation are absent.

- [ ] **Step 3: Implement the WeCom adapter.** Keep callback verification and access-token handling within the plugin adapter, use an injected HTTP client for deterministic tests, normalize only in-memory message fields, send bounded receipts, and report stable redacted health/error codes. Do not add Official Account or personal-client transport.
- [ ] **Step 4: Add separate host secret/config/UI paths.** Keep WeCom credentials separate from QQ and Telegram, expose saved-state booleans only, add non-secret callback/listener policy to plugin config, and require plugin enablement plus native approval before starting the route.
- [ ] **Step 5: Run focused verification.**

Run: `node --test tests/examples/im-gateway-wecom.test.js tests/examples/im-gateway-qq-official.test.js tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js`

Expected: QQ, WeCom, and host-isolation tests pass without external network access.

- [ ] **Step 6: Run the Control Center regression.**

Run: `npx playwright test tests/control-center/control-center-smoke.spec.js --grep "IM Gateway|WeCom"`

Expected: the Plugins pane presents WeCom as the selected first WeChat route, keeps Official Account/personal automation out of the supported list, and never renders raw credentials.

- [ ] **Step 7: Commit only the WeCom implementation scope.**

```bash
git add examples/plugins/im-gateway src/main src/shared/openpet-contracts.ts src/control-center/src tests/examples/im-gateway-wecom.test.js tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js tests/control-center/control-center-smoke.spec.js
git commit -m "feat(im-gateway): add WeCom application adapter"
```

### Task 4: Complete Simulated Protocol And Integration Gates

**Files:**
- Modify: `tests/examples/im-gateway-plugin.test.js`
- Modify: `tests/examples/im-gateway-qq-official.test.js`
- Modify: `tests/examples/im-gateway-wecom.test.js`
- Modify: `tests/services/plugin-service.test.js`
- Modify: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Consumes: Tasks 1-3 adapter factories, host gates, and redacted contracts.
- Produces: deterministic fake QQ/WeCom protocol coverage and integration-gate evidence. The scoped TypeScript evidence-summary tranche is already landed in `20ef3ebf` and is not reopened by this plan.

- [ ] **Step 1: Add protocol matrix cases before implementation changes.** The matrix must cover allowed/rejected private and group messages, direct commands, receipts, duplicate callback/update handling, timeout/error paths, shutdown, redaction, and secret non-leakage for both adapters.
- [ ] **Step 2: Run the matrix and record the expected failures.**

Run: `node --test tests/examples/im-gateway-plugin.test.js tests/examples/im-gateway-qq-official.test.js tests/examples/im-gateway-wecom.test.js`

Expected: only unsupported or not-yet-covered matrix cases fail; existing Telegram cases remain green.

- [ ] **Step 3: Complete the protocol matrix and integration gates.** Cover allowed/rejected private and group messages, direct commands, receipts, duplicate callback/update handling, timeout/error paths, shutdown, redaction, secret non-leakage, shared registration, host-owned secret isolation, disabled defaults, native approval, lifecycle start/stop, and Control Center contract behavior for both adapters using fake protocol clients only.

- [ ] **Step 4: Run all simulated protocol and tooling gates.**

Run: `npm run test:tools`

Expected: all tooling tests pass; no real QQ/WeCom credentials or network calls are attempted.

- [ ] **Step 5: Commit the protocol matrix and integration gates.**

```bash
git add tests/examples tests/services/plugin-service.test.js tests/control-center/control-center-smoke.spec.js
git commit -m "test(im-gateway): close simulated adapter protocol gates"
```

### Task 5: Manual Real-Account Smoke Evidence And Product Acceptance Boundary

**Files:**
- Modify: `examples/plugins/im-gateway/README.md`
- Modify: `docs/TODO.md`
- Modify: `docs/HANDOFF.md`
- Create: `docs/release-evidence/im-gateway/README.md`

**Interfaces:**
- Consumes: Tasks 1-4's implemented adapters, Control Center gates, and simulated protocol evidence.
- Produces: operator-run manual evidence records; no automated release/development gate.

- [ ] **Step 1: Verify the desktop prerequisites.** Confirm the bundled plugin is visible, both routes are disabled by default, native execution approval is required, and the Control Center shows only saved-state indicators before entering any credentials.
- [ ] **Step 2: Run the QQ official robot smoke manually.** With a dedicated test bot and allowlisted test account, record startup readiness, one private command, one allowed group/mention case if supported by the official account, one rejected allowlist case, receipt delivery, stop, and restart. Redact app ids, secrets, user ids, chat ids, message text, and platform payloads in the evidence.
- [ ] **Step 3: Run the WeCom self-built application smoke manually.** With a dedicated test tenant/application, record callback verification, one private message, one supported group case if the selected WeCom capability permits it, one rejected sender case, receipt delivery, stop, and restart. Redact corp ids, secrets, user ids, message text, and callback payloads in the evidence.
- [ ] **Step 4: Mark the evidence honestly.** Record the run under `docs/release-evidence/im-gateway/` using the repository's UTC timestamp naming convention. The manual smoke README must say that it is external-account evidence and is not represented by `npm test`, `npm run test:tools`, or the simulated protocol suites. Missing credentials means `not-run`, not pass.
- [ ] **Step 5: Re-run documentation and repository gates.**

Run: `npm run test:tools`

Run: `npm run check:docs-drift`

Run: `git diff --check`

Expected: all commands pass. The manual smoke record is supplementary evidence and does not change the development gate result.

## Verification Checklist

- [ ] `npm run test:tools`
- [ ] `npm run check:docs-drift`
- [ ] `git diff --check`
- [ ] `node --test tests/examples/im-gateway-plugin.test.js tests/examples/im-gateway-qq-official.test.js tests/examples/im-gateway-wecom.test.js`
- [ ] `node --test tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js`
- [ ] `npx playwright test tests/control-center/control-center-smoke.spec.js --grep "IM Gateway|QQ|WeCom"`
- [ ] Confirm `git status --short` lists no staged or committed `node_modules` symlink.

## Deliberate Non-Goals

- QQ OneBot is not implemented as the first route and is not a fallback when official QQ is unavailable.
- Personal WeChat client injection, iLink, and Official Account are not implemented by this plan.
- No claim of QQ or WeChat support is valid before Tasks 2-4 pass; manual smoke in Task 5 is evidence, not a development completion gate.
- Agent Awareness Phase C and richer trigger semantics remain outside this plan.
- Global TypeScript `checkJs` and main-process rewrites remain outside this plan.

## Self-Review

- Spec coverage: the selected QQ/WeCom routes, plugin-only boundary, host-owned secrets/lifecycle, disabled defaults, native approval, raw-message privacy, simulated protocol tests, and manual smoke boundary are covered by Tasks 1-5.
- Placeholder scan: this plan contains no `TBD`, placeholder implementation instructions, or unspecified test commands. Manual evidence uses the repository's existing UTC timestamp naming convention under `docs/release-evidence/im-gateway/`.
- Type consistency: all adapters implement the same `createAdapter()` contract, all host secret state is saved-state-only, and the scoped evidence-summary scripts remain covered by the landed `20ef3ebf` TypeScript/JSDoc boundary.
