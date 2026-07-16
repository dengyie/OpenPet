# IM Gateway Telegram Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every production-review blocker in the Telegram IM Gateway path while preserving host-owned secrets, AI conversations, Provider selection, and pet state.

**Architecture:** Telegram transport remains inside the bundled `openpet.im-gateway` service. The host continues to own secrets, process lifecycle, health interpretation, AI conversations, and Provider calls; the implementation adds explicit runtime-mutation rules, pseudonymous conversation keys, readiness-aware health, bounded bridge requests, bounded AI ingress, and external-conversation retention.

**Tech Stack:** Electron main process, Node.js CommonJS services, React/TypeScript Control Center, grammY long polling, Node native test runner, Playwright.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/1dc8/OpenPet` on branch `dev9`.
- Do not modify the protected main worktree at `/Users/mango/project/codex/OpenPet`.
- Do not run signing, notarization, release packaging, or live Telegram credential tests.
- Do not implement Telegram webhook, QQ, OneBot, WeChat, WeCom, or personal-client bridges.
- Telegram Bot Token remains host-owned and must never reach renderer state, logs, health, traces, or test snapshots.
- Provider selection and API keys remain host-owned; plugins cannot override Provider owner fields.
- Use failing tests before each behavior change and keep all test clocks/timeouts deterministic.

---

### Task 1: Rebase The Branch And Preserve Shutdown Semantics

**Files:**
- Modify during conflict resolution: `src/main/services/ai-talk-service.js`
- Modify during conflict resolution: `tests/services/ai-talk-service.test.js`
- Preserve unstaged work: `src/main/services/plugin-service.js`
- Preserve unstaged work: `tests/services/plugin-service.test.js`

**Interfaces:**
- Consumes: current `chatFromEntrypoint({ message, conversationId, entrypoint })` named-conversation path.
- Produces: named conversations with the latest `disposed` guards and Provider-owner request-id behavior from `main`.

- [ ] **Step 1: Record and stash only the current unstaged logging patch**

Run:

```bash
git status --short --branch
git diff -- src/main/services/plugin-service.js tests/services/plugin-service.test.js
git stash push -m "dev9-telegram-hardening-pre-rebase" -- src/main/services/plugin-service.js tests/services/plugin-service.test.js
```

Expected: branch remains `dev9`; only the two existing logging files enter the stash.

- [ ] **Step 2: Rebase onto the latest local main**

Run:

```bash
git rebase main
```

Expected: conflict in `src/main/services/ai-talk-service.js` is resolved by retaining both named conversations and all `disposed` checks from `main`.

- [ ] **Step 3: Add an IM-specific dispose regression**

Add a test that queues two non-streaming requests in the same named conversation, disposes the service while the first is active, and proves the second never calls the Provider or writes a user message:

```js
test('ai talk service dispose rejects queued IM named-conversation chat before provider or message writes', async () => {
  // First complete() remains pending, second chat queues on the same conversation.
  // After service.dispose(), release the first request.
  // Assert provider call count is 1 and the second message is absent from the store.
})
```

- [ ] **Step 4: Restore the logging patch and run focused tests**

Run:

```bash
git stash pop
node --test tests/services/ai-talk-service.test.js --test-name-pattern "dispose.*IM named-conversation|routes IM entrypoints"
```

Expected: PASS and no unresolved conflict markers.

- [ ] **Step 5: Commit the rebase-specific regression**

```bash
git add tests/services/ai-talk-service.test.js
git commit -m "test: preserve IM chat shutdown guards"
```

### Task 2: Block Runtime Credential And Configuration Drift

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Produces: `assertImGatewayRuntimeMutationAllowed()` used by token save, token clear, and IM Gateway config save.
- Runtime contract: Telegram token/config mutations are rejected while service status is `starting`, `running`, or `stopping`.

- [ ] **Step 1: Write failing host tests**

Add tests that start `openpet.im-gateway`, then call each mutation:

```js
assert.throws(
  () => service.saveImGatewayTelegramBotToken('replacement-token'),
  /Stop IM Gateway before changing Telegram credentials/
)
assert.throws(
  () => service.clearImGatewayTelegramBotToken(),
  /Stop IM Gateway before changing Telegram credentials/
)
assert.throws(
  () => service.saveConfig('openpet.im-gateway', nextConfig),
  /Stop IM Gateway before changing its configuration/
)
```

Assert the original secret and persisted config remain unchanged after rejection.

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "IM Gateway.*running|Telegram credentials"
```

Expected: FAIL because mutations currently succeed while the child keeps the old environment.

- [ ] **Step 3: Implement the host guard**

Use the existing runtime registry and active-status set:

```js
const assertImGatewayRuntimeMutationAllowed = (message) => {
  const runtime = getPluginServiceRuntime(IM_GATEWAY_PLUGIN_ID, IM_GATEWAY_SERVICE_ID)
  if (ACTIVE_SERVICE_STATUSES.has(runtime?.status)) throw new Error(message)
}
```

Call it before any SecretService or SettingsService write. Do not stop the service asynchronously from these synchronous mutation APIs.

- [ ] **Step 4: Disable misleading UI actions while running**

Derive `imGatewayRuntimeActive` from the service runtime. Disable token input, save/clear token buttons, config fields, and the config save button while active. Render the bounded note:

```text
Stop IM Gateway Service before changing Telegram credentials or routing policy.
```

- [ ] **Step 5: Run host and UI tests**

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "IM Gateway.*running|Telegram credentials"
npm run test:control-center -- --grep "IM Gateway"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/plugin-service.js src/control-center/src/panes/PluginsPane.tsx tests/services/plugin-service.test.js tests/control-center/control-center-smoke.spec.js
git commit -m "fix: prevent live Telegram config drift"
```

### Task 3: Pseudonymize Telegram Conversation Identity And Narrow The Bridge

**Files:**
- Modify: `examples/plugins/im-gateway/service/core/ai-routing.js`
- Modify: `examples/plugins/im-gateway/service/core/gateway.js`
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/main/services/ai-talk-service.js`
- Test: `tests/examples/im-gateway-plugin.test.js`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/services/ai-talk-service.test.js`

**Interfaces:**
- Produces: `buildConversationKey(message)` returning `telegram:<private|group>:<12-char hash>`.
- Host bridge fixes entrypoint to `im-gateway` for `openpet.im-gateway`, otherwise `plugin-service`.
- Removes service-bridge ownership of `entrypoint`, `skipUserAppend`, and `sourceContext`.

- [ ] **Step 1: Write failing privacy tests**

Assert that routing, persisted conversations, trace summary, and trace diagnostics contain neither raw id:

```js
assert.match(route.conversationKey, /^telegram:private:[a-f0-9]{12}$/)
assert.equal(JSON.stringify(store.getState()).includes('1001'), false)
assert.equal(service.exportTraceDiagnostics().includes('-2001'), false)
```

Add a bridge test proving plugin-supplied `entrypoint`, `skipUserAppend`, and `sourceContext` are ignored or rejected.

- [ ] **Step 2: Verify the tests fail**

```bash
node --test tests/examples/im-gateway-plugin.test.js tests/services/plugin-service.test.js tests/services/ai-talk-service.test.js --test-name-pattern "conversation identity|raw Telegram|host-owned entrypoint"
```

Expected: FAIL with raw ids in conversation keys and forwarded bridge fields.

- [ ] **Step 3: Hash the conversation namespace inside the plugin**

Reuse `hashIdentifier` and hash the complete peer scope:

```js
const peerScope = [message.platform, chatKind, message.chatId, message.userId].join(':')
return `telegram:${chatKind}:${hashIdentifier(peerScope)}`
```

Keep the chat kind visible for diagnostics; do not persist the unhashed scope.

- [ ] **Step 4: Make bridge metadata host-owned**

Validate `conversationKey` as a bounded opaque key, then call:

```js
await aiTalkService.chatFromEntrypoint({
  message,
  conversationId: `plugin:${plugin.manifest.id}:service:${serviceId}:${conversationKey}`,
  entrypoint: plugin.manifest.id === IM_GATEWAY_PLUGIN_ID ? 'im-gateway' : 'plugin-service',
  requestId: normalizeBoundedRequestId(payload.requestId)
})
```

Reject keys longer than 160 characters or outside `[A-Za-z0-9:_-]`.

- [ ] **Step 5: Remove dead AI request fields**

Remove `sourceContext` and `skipUserAppend` from the service bridge and `AiTalkService.chat`. Remove `appendUserMessages`, which has no production callers. Normal chat always appends the current user message.

- [ ] **Step 6: Run focused tests and commit**

```bash
node --test tests/examples/im-gateway-plugin.test.js tests/services/plugin-service.test.js tests/services/ai-talk-service.test.js
git add examples/plugins/im-gateway/service/core/ai-routing.js examples/plugins/im-gateway/service/core/gateway.js src/main/services/plugin-service.js src/main/services/ai-talk-service.js tests/examples/im-gateway-plugin.test.js tests/services/plugin-service.test.js tests/services/ai-talk-service.test.js
git commit -m "fix: pseudonymize Telegram AI conversations"
```

### Task 4: Separate Process Liveness From Telegram Readiness

**Files:**
- Modify: `examples/plugins/im-gateway/service/adapters/telegram.js`
- Modify: `examples/plugins/im-gateway/service/health.js`
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Test: `tests/examples/im-gateway-plugin.test.js`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Produces: `summarizeImGatewayHealthBody(body) -> { healthy, level, message }`.
- Readiness rules: disabled/connected are healthy; allowlist miss is healthy+warn; missing-token/connecting/stopped/failed are unhealthy.

- [ ] **Step 1: Replace the existing wrong assertions with failing readiness assertions**

```js
assert.equal(result.health.status, 'unhealthy')
assert.equal(log.level, 'error')
assert.equal(log.message, 'Service health unhealthy: Telegram polling conflict')
```

Add connected, disabled, missing-token, generic polling failure, and allowlist-miss cases.

- [ ] **Step 2: Verify the tests fail**

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "IM Gateway health"
```

Expected: polling failures are still reported healthy.

- [ ] **Step 3: Return structured readiness from health parsing**

Map stable adapter status/error codes without using external exception text. `readServiceHealthResponse` returns optional `healthy` and `logLevel`; `checkServiceHealth` combines HTTP liveness with the override:

```js
const healthy = httpHealthy && healthResponse.healthy !== false
```

Use `warn` only for healthy policy diagnostics.

- [ ] **Step 4: Report connecting accurately**

Set Telegram status to `connecting` before `bot.start`. Use grammY's `onStart` callback to set `connected`; never mark connected before initialization completes.

- [ ] **Step 5: Update onboarding output and tests**

When runtime is running but health is unhealthy, show remediation instead of saying Telegram can be tested immediately.

- [ ] **Step 6: Run and commit**

```bash
node --test tests/examples/im-gateway-plugin.test.js tests/services/plugin-service.test.js
npm run test:control-center -- --grep "IM Gateway"
git add examples/plugins/im-gateway/service/adapters/telegram.js examples/plugins/im-gateway/service/health.js src/main/services/plugin-service.js src/control-center/src/panes/PluginsPane.tsx tests/examples/im-gateway-plugin.test.js tests/services/plugin-service.test.js tests/control-center/control-center-smoke.spec.js
git commit -m "fix: report Telegram readiness accurately"
```

### Task 5: Bound Telegram Handler And Bridge Lifetimes

**Files:**
- Modify: `examples/plugins/im-gateway/service/adapters/telegram.js`
- Modify: `examples/plugins/im-gateway/service/bridge-client.js`
- Test: `tests/examples/im-gateway-plugin.test.js`

**Interfaces:**
- `createBridgeClient({ timeoutMs = 45000, fetchImpl, setTimer, clearTimer })` aborts stalled requests.
- Telegram middleware schedules tracked handler tasks and returns without waiting for AI completion.

- [ ] **Step 1: Write failing timeout and concurrency tests**

Create a fake grammY bot whose registered middleware can be invoked directly. Start one unresolved AI handler, then invoke `whoami` for another update and assert the helper completes before the first AI request.

Add a bridge test whose fetch rejects on `signal.abort` and assert a bounded `Bridge request timed out` error.

- [ ] **Step 2: Verify failure**

```bash
node --test tests/examples/im-gateway-plugin.test.js --test-name-pattern "does not block Telegram updates|bridge timeout|middleware failure"
```

- [ ] **Step 3: Implement bounded asynchronous dispatch**

Track handler promises in a `Set`, attach rejection handling that records only `telegram-handler-failed`, and return from grammY middleware immediately. Register `bot.catch` as a final bounded guard so middleware errors cannot stop polling.

- [ ] **Step 4: Implement bridge timeout cleanup**

Use one AbortController per POST and always clear the timer in `finally`. Preserve the existing response status error contract without returning raw response bodies.

- [ ] **Step 5: Run and commit**

```bash
node --test tests/examples/im-gateway-plugin.test.js
git add examples/plugins/im-gateway/service/adapters/telegram.js examples/plugins/im-gateway/service/bridge-client.js tests/examples/im-gateway-plugin.test.js
git commit -m "fix: bound Telegram bridge work"
```

### Task 6: Add Rate Limits And Bound External Conversation Retention

**Files:**
- Create: `examples/plugins/im-gateway/service/core/rate-limiter.js`
- Modify: `examples/plugins/im-gateway/service/core/gateway.js`
- Modify: `examples/plugins/im-gateway/service/health.js`
- Modify: `src/main/services/ai-talk-store.js`
- Test: `tests/examples/im-gateway-plugin.test.js`
- Test: `tests/services/ai-talk-store.test.js`

**Interfaces:**
- `createSlidingWindowRateLimiter({ nowMs, windowMs, maxKeys, limits })` returns `{ consume(key, kind), clear() }`.
- Private limit: 6 accepted AI requests per 30 seconds.
- Group/user limit: 3 accepted AI requests per 30 seconds.
- AI store retains at most 500 non-main conversations, evicting the oldest updated conversation and its messages.

- [ ] **Step 1: Write deterministic failing limiter tests**

Use an integer clock. Assert the seventh private and fourth group request are rejected, windows reset after 30 seconds, and tracked keys never exceed the configured maximum.

- [ ] **Step 2: Write failing retention tests**

Create 501 external conversations and one main conversation. Assert the oldest external conversation and messages are removed while main and the newest 500 remain.

- [ ] **Step 3: Implement the limiter**

Store timestamp arrays per pseudonymous key, prune timestamps before every consume, and evict the least-recently-used key when `maxKeys` is reached.

- [ ] **Step 4: Integrate gateway behavior**

Rate-limit only `ai-chat` routes before enqueue. Private rejection receives a bounded retry-later notice; group rejection is silent. Record `lastAiErrorCode = "ai-rate-limited"` and increment `aiRateLimitedCount`.

- [ ] **Step 5: Implement external-conversation pruning**

After creating a new non-main conversation, sort non-main conversations by `updatedAt`/`createdAt`, remove overflow entries from both `state.conversations` and `state.messages`, then persist once.

- [ ] **Step 6: Run and commit**

```bash
node --test tests/examples/im-gateway-plugin.test.js tests/services/ai-talk-store.test.js
git add examples/plugins/im-gateway/service/core/rate-limiter.js examples/plugins/im-gateway/service/core/gateway.js examples/plugins/im-gateway/service/health.js src/main/services/ai-talk-store.js tests/examples/im-gateway-plugin.test.js tests/services/ai-talk-store.test.js
git commit -m "fix: bound Telegram AI ingress"
```

### Task 7: Remove Dead Compatibility And Future-Platform Shells

**Files:**
- Delete: `examples/plugins/im-gateway/service/core/trigger-policy.js`
- Delete: `examples/plugins/im-gateway/service/adapters/onebot.js`
- Delete: `examples/plugins/im-gateway/service/adapters/weixin.js`
- Modify: `examples/plugins/im-gateway/service/adapters/registry.js`
- Modify: `examples/plugins/im-gateway/service/config.js`
- Modify: `examples/plugins/im-gateway/config.schema.json`
- Modify: `examples/plugins/im-gateway/service/health.js`
- Modify: `examples/plugins/im-gateway/README.md`
- Test: `tests/examples/im-gateway-plugin.test.js`
- Test: `tests/plugins/manifest.test.js`
- Test: `tests/control-center/demo-control-center-api.test.js`
- Test: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- `privateTextMode` is the only private non-command routing field.
- Default adapters contain Telegram only.

- [ ] **Step 1: Update tests to reject removed surfaces**

Assert the schema has no `privateChatPolicy`, the default health body only declares Telegram, and no test/demo fixture carries QQ/WeChat or legacy private policy fields.

- [ ] **Step 2: Remove files and references**

Delete the three confirmed-unused files. Remove registry imports, disabled health placeholders, `privateChatPolicy` defaults/schema/migration, and related historical fixture assertions.

- [ ] **Step 3: Run and commit**

```bash
node --test tests/examples/im-gateway-plugin.test.js tests/plugins/manifest.test.js tests/control-center/demo-control-center-api.test.js
npm run test:control-center -- --grep "IM Gateway"
git add -A examples/plugins/im-gateway tests/examples/im-gateway-plugin.test.js tests/plugins/manifest.test.js tests/control-center/demo-control-center-api.test.js tests/control-center/control-center-smoke.spec.js
git commit -m "refactor: keep IM Gateway Telegram-only"
```

### Task 8: Update Active Documentation

**Files:**
- Modify: `docs/TODO.md`
- Modify: `examples/plugins/im-gateway/README.md`
- Modify: `docs/superpowers/specs/2026-07-16-im-gateway-telegram-hardening-design.md`

**Interfaces:**
- Documents only implemented behavior and explicitly leaves real-account smoke as manual follow-up.

- [ ] **Step 1: Update status truthfully**

Mark the core Telegram AI bridge complete. Record that simulated protocol coverage, readiness health, runtime mutation guards, pseudonymous conversations, bridge timeout, and fixed rate limits are complete. Leave live Telegram Bot Token validation open.

- [ ] **Step 2: Remove stale QQ/WeChat skeleton claims**

State that other platforms are out of scope and have no runtime implementation, rather than claiming adapter skeleton support.

- [ ] **Step 3: Check and commit**

```bash
git diff --check
rg -n "privateChatPolicy|OneBot adapter|WeChat.*skeleton|healthy: Telegram polling conflict" docs examples/plugins/im-gateway
git add docs/TODO.md examples/plugins/im-gateway/README.md docs/superpowers/specs/2026-07-16-im-gateway-telegram-hardening-design.md
git commit -m "docs: close Telegram gateway hardening"
```

### Task 9: Complete Non-Signing Verification And Final Review

**Files:**
- Review: all files changed by `main...dev9`

**Interfaces:**
- Produces a merge-readiness verdict with no unresolved P0/P1 finding.

- [ ] **Step 1: Run focused Telegram and host regressions**

```bash
node --test tests/examples/im-gateway-plugin.test.js tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js tests/services/plugin-service.test.js tests/services/secret-service.test.js tests/control-center/demo-control-center-api.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full core and Control Center verification**

```bash
npm run test:core:all
npm run check:syntax
git diff --check
```

Expected: all non-skipped tests pass; the macOS native smoke may remain skipped by platform/test policy.

- [ ] **Step 3: Verify privacy and deletion invariants**

```bash
rg -n "privateChatPolicy|sourceContext|skipUserAppend|appendUserMessages|createOneBotAdapter|createWeixinAdapter|trigger-policy" src examples tests --glob '!dist/**'
rg -n "telegram:private:1001:1001|telegram:group:-2001:1001|Service health healthy: Telegram polling conflict" src examples tests
```

Expected: no production or test matches.

- [ ] **Step 4: Run a final production code review**

Review correctness, shutdown behavior, permission and secret boundaries, state growth, logs, trace exports, and tests. Fix every confirmed P0/P1 issue and rerun the affected verification before declaring completion.

- [ ] **Step 5: Record final branch status**

```bash
git status --short --branch
git rev-list --left-right --count main...dev9
git merge-base --is-ancestor main dev9
```

Expected: no unstaged implementation changes, `main` is an ancestor of `dev9`, and only intentional commits remain ahead.
